import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const mode = args.shift();
if (args.includes('status')) {
  console.error(mode === 'logged-out' ? 'Not logged in' : 'Logged in using ChatGPT');
  process.exit(mode === 'logged-out' ? 1 : 0);
}
let input = '';
for await (const chunk of process.stdin) input += chunk;
if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 10000));
if (mode === 'quota') { console.error('usage_limit_reached'); process.exit(1); }
if (mode === 'broken') { console.log('not-json'); process.exit(0); }
if (args[0] !== 'exec' || args[args.indexOf('--model') + 1] !== 'gpt-5.6-luna') throw new Error('Wrong CLI arguments');
if (!args.includes('--ignore-user-config') || !args.includes('read-only')) throw new Error('Missing execution limits');
JSON.parse(readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
const data = JSON.parse(input.split('SUBTITLE_DATA=')[1]);
const cue = data.TARGET[0];
const term = { cue_id: cue.id, term: 'take it for granted', lemma: 'take for granted', kind: 'phrase', level: 'B2', meaning: '认为理所当然', note: '结合语境理解', example: 'Never take kindness for granted.', example_zh: '不要把善意视为理所当然。' };
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ terms: [term] }) } }));
