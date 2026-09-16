import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { homedir } from 'node:os';
import { HOST_NAME } from '../extension/core.js';

export const EXTENSION_ID = 'aeofkpgbodbdljhlibnnhbjkalpjenid';
export const MAC_BROWSERS = ['Google/Chrome', 'Microsoft Edge', 'Chromium'];
const manifestName = `${HOST_NAME}.json`;
export const shellQuote = value => `'${String(value).replaceAll("'", "'\"'\"'")}'`;

export function macManifestPaths(home) {
  return MAC_BROWSERS.map(browser => path.join(home, 'Library', 'Application Support', browser, 'NativeMessagingHosts', manifestName));
}

export function launcherText({ root, nodePath, codexPath }) {
  // GUI browsers do not inherit the shell setup used by Homebrew/nvm.
  // Prepending Node also supports the npm Codex executable's /usr/bin/env node.
  const commandPath = [...new Set([path.posix.dirname(nodePath), path.posix.dirname(codexPath),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
  return `#!/bin/sh\nexport PATH=${shellQuote(commandPath)}\nexec ${shellQuote(nodePath)} ${shellQuote(path.posix.join(root, 'native', 'host.mjs'))}\n`;
}

export function findMacCodex({ specified, home = homedir(), searchPath = process.env.PATH || '', executable = file => {
  try { accessSync(file, constants.X_OK); return statSync(file).isFile(); } catch { return false; }
} } = {}) {
  if (specified) {
    const file = path.resolve(specified.startsWith('~/') ? path.join(home, specified.slice(2)) : specified);
    if (!executable(file)) throw new Error(`Codex 路径不存在或不可执行：${file}`);
    return file;
  }
  const directories = [...searchPath.split(path.delimiter).filter(Boolean), '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local', 'bin')];
  const found = directories.map(dir => path.resolve(dir, 'codex')).find(executable);
  if (!found) throw new Error('找不到 Codex CLI。请先安装，或指定 --codex-path /完整路径/codex。');
  return found;
}

export function installMac({ root, home = homedir(), nodePath = process.execPath, codexPath, prepareOnly = false }) {
  const local = path.join(root, '.local');
  const launcher = path.join(local, 'native-host.sh');
  const targets = prepareOnly ? [] : macManifestPaths(home);
  // Validate all registrations before changing files. A second checkout must not
  // silently take over another installed copy of the same personal extension.
  for (const target of targets) {
    if (!existsSync(target)) continue;
    const registered = JSON.parse(readFileSync(target, 'utf8'));
    if (registered.path !== launcher) throw new Error(`另一个项目目录已注册 Luna：${target}。请先从原目录卸载。`);
  }
  mkdirSync(local, { recursive: true });
  writeFileSync(path.join(local, 'runtime.json'), JSON.stringify({ codexPath }, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(launcher, launcherText({ root, nodePath, codexPath }), { mode: 0o700 });
  chmodSync(launcher, 0o700);
  const manifest = { name: HOST_NAME, description: 'Luna YouTube English tutor using local Codex subscription login',
    path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] };
  const json = JSON.stringify(manifest, null, 2) + '\n';
  writeFileSync(path.join(local, manifestName), json, { mode: 0o600 });
  for (const target of targets) {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, json, { mode: 0o600 });
  }
  return { launcher, targets };
}

export function uninstallMac({ root, home = homedir() }) {
  const launcher = path.join(root, '.local', 'native-host.sh');
  const removed = [];
  for (const target of macManifestPaths(home)) {
    if (!existsSync(target)) continue;
    let registered;
    try { registered = JSON.parse(readFileSync(target, 'utf8')); } catch { continue; }
    if (registered.name !== HOST_NAME || registered.path !== launcher) continue;
    unlinkSync(target); removed.push(target);
  }
  return removed;
}

export function checkCodex(codexPath, nodePath = process.execPath) {
  const result = spawnSync(codexPath, ['--version'], { encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PATH: [path.dirname(nodePath), process.env.PATH || ''].join(path.delimiter) } });
  if (result.error || result.status !== 0) throw new Error('Codex CLI 无法运行。请在终端执行 codex --version，修复安装后重试。');
  return result.stdout.trim();
}
