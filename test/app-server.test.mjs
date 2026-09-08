import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { completeTerms, createAppServerRunner } from '../native/app-server.mjs';
const fixture = fileURLToPath(new URL('./fixtures/fake-app-server.mjs', import.meta.url));
const runner = (mode = 'normal', timeoutMs = 3000) => createAppServerRunner({ command: process.execPath, prefixArgs: [fixture, mode], timeoutMs });
const request = { videoId: 'stream-test', cues: [{ id: '1', start: 0, end: 5, text: 'The view was sick.' }], context: [] };

test('逐条解析不泄露未完成对象，正确处理引号和括号', () => {
  const first = {term:'sick',meaning:'他说："这景色{太棒了}"'};
  const json = JSON.stringify({terms:[first,{term:'next'}]});
  const end = json.indexOf('},{') + 1;
  assert.deepEqual(completeTerms(json.slice(0,end-1)), []);
  assert.deepEqual(completeTerms(json.slice(0,end)), [first]);
  assert.equal(completeTerms(json).length, 2);
});

test('真实子进程逐条返回俚语讲解，首条早于整段完成且进程可复用', async () => {
  const client = runner();
  try {
    const progress = [];
    const result = await client.analyze(request, undefined, part => progress.push(part));
    assert.deepEqual(progress.map(p=>p.terms.length), [1,2]);
    assert.equal(progress[0].terms[0].kind, 'slang');
    assert.equal(progress[0].terms[0].quote, 'The view was sick.');
    assert.ok(result.firstTermMs < result.elapsedMs);
    assert.equal((await client.analyze(request)).terms.length, 2);
  } finally { client.close(); }
});

test('常驻进程的登录、额度、坏回复、超时与取消', async () => {
  for (const [mode, pattern] of [['logged-out',/codex login/],['quota',/额度/],['broken',/有效/],['slow',/已停止/]]) {
    const client = runner(mode, mode === 'slow' ? 350 : 3000);
    try { await assert.rejects(client.analyze(request), pattern); } finally { client.close(); }
  }
  const client = runner('slow'); const controller = new AbortController();
  const pending = client.analyze(request, controller.signal);
  setTimeout(()=>controller.abort(), 150);
  try { await assert.rejects(pending, /已取消/); } finally { client.close(); }
});
