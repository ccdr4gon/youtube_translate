import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { probeHost } from '../scripts/doctor-host.mjs';
const fixture = fileURLToPath(new URL('./fixtures/fake-native-host.mjs', import.meta.url));
const probe = mode => probeHost({command:process.execPath,args:[fixture,mode],timeoutMs:mode==='timeout'?300:3000});

test('本地连接诊断发送真实通信格式，等待回复后才关闭输入', async () => {
  const result=await probe('ok');
  assert.equal(result.response.result.loggedIn,true);
  assert.equal(result.exitCode,0); assert.equal(result.failure,'');
});

test('本地连接诊断区分启动错误、无回复退出和超时', async () => {
  const failed=await probe('exit'); assert.equal(failed.exitCode,7); assert.match(failed.stderr,/could not read host/);
  const quiet=await probe('quiet'); assert.equal(quiet.exitCode,0); assert.equal(quiet.response,undefined);
  const timeout=await probe('timeout'); assert.match(timeout.failure,/超时/);
});
