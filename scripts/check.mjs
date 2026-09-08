import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const folders = ['extension', 'native', 'scripts', 'test'];
let count = 0;
function check(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.m?js$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
      if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
      count++;
    } else if (file.endsWith('.json')) JSON.parse(readFileSync(file, 'utf8'));
  }
}
for (const folder of folders) if (existsSync(folder)) check(folder);
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
if (id !== 'aeofkpgbodbdljhlibnnhbjkalpjenid') throw new Error('Extension ID changed; update the native installer.');
for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap(s => s.js), ...manifest.web_accessible_resources.flatMap(s => s.resources)]) {
  if (!existsSync(path.join('extension', file))) throw new Error(`Missing extension file: ${file}`);
}
console.log(`Checked ${count} JavaScript files, JSON files, and extension resources. ID: ${id}`);
