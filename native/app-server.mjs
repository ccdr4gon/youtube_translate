import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SCHEMA, resolveCodex, TUTOR_INSTRUCTIONS, friendlyError } from './codex.mjs';
import { MODEL, validateRequest, validateResult } from '../extension/core.js';

// Emit only complete JSON objects inside terms, even across escaped quotes/chunk boundaries.
export function completeTerms(text) {
  const start = /"terms"\s*:\s*\[/.exec(text);
  if (!start) return [];
  const terms = [];
  let depth = 0, quoted = false, escaped = false, from = -1;
  for (let i = start.index + start[0].length; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') { if (depth++ === 0) from = i; }
    else if (char === '}' && --depth === 0 && from >= 0) {
      try { terms.push(JSON.parse(text.slice(from, i + 1))); } catch { /* Final validation reports malformed JSON. */ }
    } else if (char === ']' && depth === 0) break;
  }
  return terms;
}

export function createAppServerRunner({ command = resolveCodex(), prefixArgs = [], timeoutMs = 90000 } = {}) {
  const cwd = path.join(ROOT, '.local', 'work');
  mkdirSync(cwd, { recursive: true });
  const env = { ...process.env };
  delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  let child, ready, sequence = 0, thread, videoId, turns = 0, notify = () => {};
  const pending = new Map();
  let rejectTurn;

  function close(error = new Error('已取消。')) {
    const old = child;
    child = null; ready = null; thread = null; turns = 0;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
    const reject = rejectTurn; rejectTurn = null; notify = () => {};
    reject?.(error);
    old?.kill();
  }
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => close(new Error('本机 Codex 响应超时，请重试。')), 15000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  function connect() {
    if (ready) return ready;
    const args = ['app-server', '--listen', 'stdio://', '-c', 'web_search="disabled"', '-c', 'mcp_servers={}'];
    for (const feature of ['shell_tool', 'apps', 'plugins', 'browser_use', 'computer_use', 'multi_agent', 'hooks', 'code_mode_host']) args.push('--disable', feature);
    const processHandle = spawn(command, [...prefixArgs, ...args], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child = processHandle;
    processHandle.stderr.on('data', () => {});
    processHandle.stdin.on('error', () => {});
    processHandle.on('error', () => { if (child === processHandle) close(new Error('无法启动 Codex，请重新运行 scripts/install.ps1。')); });
    processHandle.on('close', () => { if (child === processHandle) close(new Error('Codex 连接已关闭，请重试。')); });
    createInterface({ input: processHandle.stdout }).on('line', line => {
      if (child !== processHandle) return;
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined) {
        const request = pending.get(message.id);
        if (request) {
          pending.delete(message.id); clearTimeout(request.timer);
          message.error ? request.reject(new Error(friendlyError(JSON.stringify(message.error)))) : request.resolve(message.result);
        } else if (message.method) {
          // Unexpected tool/approval requests are never executed by this text-only client.
          child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Tools disabled' } }) + '\n');
        }
      } else notify(message);
    });
    ready = rpc('initialize', { clientInfo: { name: 'youtube_luna', version: '0.1.3' }, capabilities: { experimentalApi: true } })
      .then(() => child.stdin.write('{"method":"initialized"}\n'));
    return ready;
  }
  async function status() {
    await connect();
    const { account } = await rpc('account/read', { refreshToken: false });
    const loggedIn = account?.type === 'chatgpt';
    return { loggedIn, model: MODEL, message: loggedIn ? '已通过 ChatGPT 订阅登录。' :
      account?.type === 'apiKey' ? '当前 CLI 使用 API key。请用 codex login 切换为 ChatGPT 订阅登录。' :
        '请在终端运行 codex login，使用 ChatGPT 账户登录。' };
  }
  return { status, close, async analyze(value, signal, onProgress = () => {}) {
    const request = validateRequest(value);
    if (signal?.aborted) throw new Error('已取消。');
    const started = Date.now();
    const abort = () => close(new Error('已取消。'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => close(new Error('分析超过 90 秒，已停止。请稍后重试。')), timeoutMs);
    let firstTermMs = 0;
    try {
      const account = await status();
      if (!account.loggedIn) throw new Error(account.message);
      if (!thread || videoId !== request.videoId || turns >= 24) {
        if (thread) await rpc('thread/unsubscribe', { threadId: thread.id });
        ({ thread } = await rpc('thread/start', { model: MODEL, ephemeral: true, cwd, approvalPolicy: 'never', sandbox: 'read-only',
          baseInstructions: TUTOR_INSTRUCTIONS, config: { model_reasoning_effort: 'none', web_search: 'disabled' } }));
        videoId = request.videoId; turns = 0;
      }
      let full = '', count = 0;
      const completion = new Promise((resolve, reject) => {
        rejectTurn = reject;
        notify = message => {
          if (message.params?.threadId !== thread?.id) return;
          if (message.method === 'item/agentMessage/delta') {
            full += message.params.delta;
            if (full.length > 200000) return close(new Error('Codex 输出过长。'));
            const selected = completeTerms(full);
            if (selected.length > count) {
              count = selected.length;
              try {
                const result = validateResult({ terms: selected }, request.cues);
                firstTermMs ||= Date.now() - started;
                onProgress({ ...result, firstTermMs, elapsedMs: Date.now() - started });
              } catch { /* Reject invented/unmatched phrases; final output is validated too. */ }
            }
          }
          if (message.method === 'item/completed' && message.params.item?.type === 'agentMessage') full = message.params.item.text;
          if (message.method === 'turn/completed') {
            message.params.turn.status === 'completed' ? resolve(full) : reject(new Error(friendlyError(JSON.stringify(message.params.turn.error))));
          }
        };
      });
      // Attach a handler before the start RPC so a cancellation during setup cannot go unhandled.
      completion.catch(() => {});
      await rpc('turn/start', { threadId: thread.id, effort: 'none', input: [{ type: 'text',
        text: `Analyze only this new batch. SUBTITLE_DATA=${JSON.stringify({ CONTEXT: request.context, TARGET: request.cues })}` }], outputSchema: schema });
      let parsed;
      try { parsed = JSON.parse(await completion); } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new Error('Codex 没有返回有效的词语数据，请重试。');
      }
      turns++;
      const result = validateResult(parsed, request.cues);
      return { ...result, firstTermMs: firstTermMs || Date.now() - started, elapsedMs: Date.now() - started };
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); rejectTurn = null; notify = () => {};
    }
  } };
}
