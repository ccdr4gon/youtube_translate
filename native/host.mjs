import { pathToFileURL } from 'node:url';
import { createDecoder, encodeMessage } from './protocol.mjs';
import { createAppServerRunner } from './app-server.mjs';

export function startHost(runner = createAppServerRunner(), input = process.stdin, output = process.stdout) {
  const queue = [];
  let active = null;
  const reply = value => output.write(encodeMessage(value));
  async function pump() {
    if (active || !queue.length) return;
    const job = queue.shift();
    active = job;
    try { reply({ id: job.id, ok: true, result: await runner.analyze(job.payload, job.controller.signal, result => reply({ id: job.id, type: 'progress', result })) }); }
    catch (error) { reply({ id: job.id, ok: false, error: error.message }); }
    finally { active = null; void pump(); }
  }
  const decode = createDecoder(async message => {
    if (!message || typeof message.id !== 'string') return;
    if (message.type === 'status') {
      try { reply({ id: message.id, ok: true, result: await runner.status() }); }
      catch (error) { reply({ id: message.id, ok: false, error: error.message }); }
    } else if (message.type === 'analyze') {
      if (queue.length >= 8) return reply({ id: message.id, ok: false, error: '待处理视频过多，请先停止其他标签页的学习。' });
      queue.push({ ...message, controller: new AbortController() });
      void pump();
    } else if (message.type === 'cancel') {
      if (active?.id === message.requestId) active.controller.abort();
      const index = queue.findIndex(job => job.id === message.requestId);
      if (index >= 0) {
        const [job] = queue.splice(index, 1);
        reply({ id: job.id, ok: false, error: '已取消。' });
      }
      reply({ id: message.id, ok: true, result: {} });
    }
  });
  input.on('data', chunk => {
    try { decode(chunk); }
    catch { active?.controller.abort(); runner.close?.(); input.destroy(); }
  });
  input.on('end', () => { queue.length = 0; active?.controller.abort(); runner.close?.(); });
  output.on('error', () => { queue.length = 0; active?.controller.abort(); runner.close?.(); input.destroy(); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startHost();
