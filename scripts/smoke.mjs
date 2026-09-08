import { createAppServerRunner } from '../native/app-server.mjs';
const runner = createAppServerRunner();
const started = Date.now();
console.log('正在使用 ChatGPT 订阅调用 gpt-5.6-luna（会消耗少量订阅额度）…');
try {
  const result = await runner.analyze({ videoId: 'local-smoke', cues: [
    { id: '1', start: 0, end: 6, text: "Don't take it for granted. We need to get the ball rolling." },
    { id: '2', start: 6, end: 12, text: 'The evidence is compelling, but the outcome remains ambiguous.' }
  ], context: [] });
  console.log(JSON.stringify(result, null, 2));
  console.log(`完成，耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒。`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { runner.close(); }
