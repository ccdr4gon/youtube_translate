import { spawnSync } from 'node:child_process';
import { createCodexRunner, resolveCodex } from '../native/codex.mjs';
console.log(`Node: ${process.version}`);
console.log(`Codex: ${resolveCodex()}`);
const version = spawnSync(resolveCodex(), ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
console.log(version.stdout?.trim() || '无法读取 Codex 版本。请重新运行安装脚本。');
try {
  const status = await createCodexRunner().status();
  console.log(status.message);
  console.log('Model: ' + status.model);
  if (!status.loggedIn) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
