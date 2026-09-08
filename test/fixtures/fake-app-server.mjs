import { createInterface } from 'node:readline';
const mode = process.argv[2];
let threads = 0;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
createInterface({ input: process.stdin }).on('line', async line => {
  const message = JSON.parse(line);
  const { id, method, params } = message;
  const reply = result => send({ id, result });
  if (method === 'initialize') return reply({});
  if (method === 'account/read') return reply({ account: mode === 'logged-out' ? null : { type: 'chatgpt' } });
  if (method === 'thread/start') return reply({ thread: { id: `thread-${++threads}` } });
  if (method === 'thread/unsubscribe') return reply({});
  if (method !== 'turn/start') return;
  reply({ turn: { id: 'turn-test' } });
  if (mode === 'slow') return;
  if (mode === 'quota') return send({ method: 'turn/completed', params: { threadId: params.threadId, turn: { status: 'failed', error: { message: 'usage_limit_reached' } } } });
  const data = JSON.parse(params.input[0].text.split('SUBTITLE_DATA=')[1]);
  const cue = data.TARGET[0];
  const terms = [{ cue_id: cue.id, term: 'sick', lemma: 'sick', level: 'B2', kind: 'slang', meaning: '这里是在夸景色棒极了', note: '俚语，不是生病' },
    { cue_id: cue.id, term: 'view', lemma: 'view', level: 'A2', kind: 'word', meaning: '房间外看到的景色', note: '不是观点' }];
  const text = mode === 'broken' ? 'not JSON' : JSON.stringify({ terms });
  for (let i = 0; i < text.length; i += 17) {
    send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, delta: text.slice(i, i + 17) } });
    await new Promise(resolve => setTimeout(resolve, 3));
  }
  send({ method: 'item/completed', params: { threadId: params.threadId, item: { type: 'agentMessage', text } } });
  send({ method: 'turn/completed', params: { threadId: params.threadId, turn: { status: 'completed' } } });
});
