import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createDecoder, encodeMessage } from '../native/protocol.mjs';
import { createCodexRunner } from '../native/codex.mjs';
import { startHost } from '../native/host.mjs';
const fixture = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const runner = (mode = 'normal', timeoutMs = 3000) => createCodexRunner({ command: process.execPath, prefixArgs: [fixture, mode], timeoutMs });
const request = { videoId: 'test-video', cues: [{ id: '1', start: 0, end: 5, text: 'We take it for granted.' }], context: [] };

test('本机通信正确处理 UTF-8、拆包和连续消息', () => {
  const received = []; const decode = createDecoder(value => received.push(value));
  const wire = Buffer.concat([encodeMessage({ text: '中文字幕' }), encodeMessage({ id: 'second' })]);
  for (let i = 0; i < wire.length; i += 3) decode(wire.subarray(i, i + 3));
  assert.deepEqual(received, [{ text: '中文字幕' }, { id: 'second' }]);
  assert.throws(() => createDecoder(() => {})(Buffer.from([255, 255, 255, 255])));
});

test('真实子进程接口传入字幕、指定 Luna，并解析解释（模拟模型回复）', async () => {
  const result = await runner().analyze(request);
  assert.equal(result.terms[0].meaning, '认为理所当然');
  assert.equal(result.terms[0].quote, request.cues[0].text);
});

test('未登录、额度不足、坏回复和超时可区分', async () => {
  assert.equal((await runner('logged-out').status()).loggedIn, false);
  await assert.rejects(runner('logged-out').analyze(request), /codex login/);
  await assert.rejects(runner('quota').analyze(request), /额度/);
  await assert.rejects(runner('broken').analyze(request), /有效/);
  await assert.rejects(runner('slow', 150).analyze(request), /已停止/);
});

test('停止学习可终止正在等待的 Codex 子进程', async () => {
  const controller = new AbortController();
  const result = runner('slow').analyze(request, controller.signal);
  setTimeout(() => controller.abort(), 250);
  await assert.rejects(result, /已取消/);
});

test('多个标签页串行分析；取消排队请求后不再启动它', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const received = [], calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  output.on('data', createDecoder(message => received.push(message)));
  startHost({ status: async () => ({ loggedIn: true }), analyze: async value => { calls.push(value); await gate; return { terms: [] }; } }, input, output);
  input.write(encodeMessage({ id: '1', type: 'analyze', payload: 'first' }));
  input.write(encodeMessage({ id: '2', type: 'analyze', payload: 'second' }));
  input.write(encodeMessage({ id: '3', type: 'cancel', requestId: '2' }));
  release(); await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(calls, ['first']);
  assert.equal(received.find(m => m.id === '2').ok, false);
  assert.equal(received.find(m => m.id === '1').ok, true);
  input.end(); output.end();
});
