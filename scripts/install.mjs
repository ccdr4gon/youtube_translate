import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { checkCodex, findMacCodex, installMac, uninstallMac, EXTENSION_ID } from './install-macos.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const { values } = parseArgs({ options: {
    uninstall: { type: 'boolean' }, 'prepare-only': { type: 'boolean' },
    'codex-path': { type: 'string' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) {
    console.log('node scripts/install.mjs [--uninstall] [--prepare-only] [--codex-path /path/to/codex]');
  } else if (process.platform === 'win32') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'install.ps1')];
    if (values.uninstall) args.push('-Uninstall');
    if (values['prepare-only']) args.push('-PrepareOnly');
    if (values['codex-path']) args.push('-CodexPath', values['codex-path']);
    const result = spawnSync('powershell.exe', args, { stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else if (process.platform === 'darwin') {
    if (values.uninstall) {
      const removed = uninstallMac({ root });
      console.log(`已移除 ${removed.length} 个浏览器注册项。项目、本地文件和登录信息均保留。`);
    } else {
      if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更新版本。');
      const codexPath = findMacCodex({ specified: values['codex-path'] });
      console.log(`Codex: ${checkCodex(codexPath)}`);
      const { launcher, targets } = installMac({ root, codexPath, prepareOnly: values['prepare-only'] });
      console.log(`本地程序：${launcher}`);
      for (const target of targets) console.log(`已注册：${target}`);
      if (!targets.length) console.log('仅生成本地文件，未注册浏览器（--prepare-only）。');
      console.log(`加载插件文件夹：${path.join(root, 'extension')}`);
      console.log(`插件 ID：${EXTENSION_ID}`);
      console.log('在本机执行 codex login，使用 ChatGPT 订阅账户登录，然后在插件中检测连接。');
    }
  } else {
    throw new Error('当前安装脚本支持 Windows 和 macOS。');
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
