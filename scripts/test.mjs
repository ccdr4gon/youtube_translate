import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Node 20 on Windows does not expand test/*.test.mjs. Pass explicit files so
// only this project's tests run, without discovering ignored backup checkouts.
const root = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(new URL('../test/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort();
if (!tests.length) throw new Error('No test files found.');
const result = spawnSync(process.execPath, ['--test', ...tests.map(name => `test/${name}`)],
  { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
