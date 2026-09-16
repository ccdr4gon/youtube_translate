import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findMacCodex, installMac, uninstallMac, macManifestPaths, launcherText, shellQuote, EXTENSION_ID } from '../scripts/install-macos.mjs';

function fixture(t) {
  const parent = path.resolve(tmpdir());
  const scratch = mkdtempSync(path.join(parent, 'ytl-macos-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(scratch)), parent);
    assert.ok(path.basename(scratch).startsWith('ytl-macos-'));
    rmSync(scratch, { recursive: true, force: true });
  });
  const home = path.join(scratch, 'Test User');
  const root = path.join(scratch, 'My project');
  mkdirSync(root, { recursive: true });
  const nodePath = '/opt/homebrew/bin/node', codexPath = '/opt/homebrew/bin/codex';
  return { scratch, home, root, nodePath, codexPath };
}

test('macOS 安装注册三种浏览器，保持插件 ID，重复安装及卸载不删除项目', t => {
  const options = fixture(t);
  const code = path.join(options.root, 'keep.txt'); writeFileSync(code, 'keep');
  const { launcher, targets } = installMac(options);
  assert.equal(targets.length, 3);
  assert.ok(targets[0].includes(path.join('Google', 'Chrome', 'NativeMessagingHosts')));
  assert.ok(targets[1].includes(path.join('Microsoft Edge', 'NativeMessagingHosts')));
  for (const target of targets) {
    const manifest = JSON.parse(readFileSync(target, 'utf8'));
    assert.equal(manifest.path, launcher);
    assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${EXTENSION_ID}/`]);
  }
  assert.equal(JSON.parse(readFileSync(path.join(options.root,'.local','runtime.json'),'utf8')).codexPath,options.codexPath);
  if (process.platform !== 'win32') assert.equal(statSync(launcher).mode & 0o777, 0o700);
  installMac(options);
  assert.equal(uninstallMac(options).length,3);
  assert.equal(uninstallMac(options).length,0);
  assert.equal(readFileSync(code,'utf8'),'keep');
  assert.ok(existsSync(launcher));
});

test('预生成不注册浏览器，卸载跳过其他目录的注册，冲突安装不改运行配置', t => {
  const options = fixture(t);
  installMac({...options,prepareOnly:true});
  const targets=macManifestPaths(options.home);
  assert.ok(targets.every(target=>!existsSync(target)));
  const target=targets[1]; mkdirSync(path.dirname(target),{recursive:true});
  const other=JSON.stringify({name:'com.local.youtube_luna',path:'/other/.local/native-host.sh'});
  writeFileSync(target,other);
  const runtime=path.join(options.root,'.local','runtime.json');
  const before=readFileSync(runtime,'utf8');
  assert.throws(()=>installMac({...options,codexPath:'/different/codex'}),/另一个项目目录/);
  assert.equal(readFileSync(runtime,'utf8'),before);
  assert.deepEqual(uninstallMac(options),[]);
  assert.equal(readFileSync(target,'utf8'),other);
});

test('macOS Codex 优先显式路径和当前 PATH，缺失路径给出安装提示', t => {
  const {scratch,home}=fixture(t);
  const bin=path.join(scratch,'custom bin'), cli=path.resolve(bin,'codex');
  const executable=file=>file===cli;
  assert.equal(findMacCodex({searchPath:bin,home,executable}),cli);
  assert.equal(findMacCodex({specified:cli,home,executable}),cli);
  assert.throws(()=>findMacCodex({specified:path.join(home,'missing'),executable}),/不可执行/);
  assert.throws(()=>findMacCodex({searchPath:'',home,executable:()=>false}),/找不到 Codex CLI/);
});

test('启动脚本为 LF，固定 Node 路径，正确引用空格、单引号及 shell 字符', t => {
  const {scratch}=fixture(t);
  const root="/Users/Test Person/it's a $project";
  const source=launcherText({root,nodePath:'/opt/homebrew/bin/node',codexPath:'/Users/Test Person/.local/bin/codex'});
  assert.ok(source.startsWith('#!/bin/sh\n'));
  assert.ok(!source.includes('\r'));
  assert.ok(source.includes("export PATH='/opt/homebrew/bin:/Users/Test Person/.local/bin:"));
  assert.ok(source.includes(`exec '/opt/homebrew/bin/node' ${shellQuote(root+'/native/host.mjs')}`));
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/sh';
  if (!existsSync(bash)) { t.diagnostic('本机没有 POSIX shell，仅检查生成文本。'); return; }
  const file=path.join(scratch,'launcher.sh');writeFileSync(file,source);
  const syntax=spawnSync(bash,['-n',file],{encoding:'utf8',windowsHide:true});
  assert.equal(syntax.status,0,syntax.stderr);
  const roundTrip=spawnSync(bash,['-c',`printf '%s' ${shellQuote(root)}`],{encoding:'utf8',windowsHide:true});
  assert.equal(roundTrip.status,0,roundTrip.stderr); assert.equal(roundTrip.stdout,root);
});

test('Windows 统一入口仍调用原 PowerShell 安装器，预生成不修改注册表', {skip:process.platform!=='win32'}, t => {
  const {root}=fixture(t);
  const sources=['scripts/install.mjs','scripts/install-macos.mjs','scripts/install.ps1','extension/core.js'];
  for (const file of sources) {
    const destination=path.join(root,file);mkdirSync(path.dirname(destination),{recursive:true});
    writeFileSync(destination,readFileSync(new URL('../'+file,import.meta.url)));
  }
  writeFileSync(path.join(root,'package.json'),JSON.stringify({type:'module'}));
  const result=spawnSync(process.execPath,[path.join(root,'scripts/install.mjs'),'--prepare-only','--codex-path',process.execPath],
    {encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,Path:path.dirname(process.execPath)+path.delimiter+process.env.Path}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Registry registration skipped/);
  const manifest=JSON.parse(readFileSync(path.join(root,'.local','com.local.youtube_luna.json'),'utf8'));
  assert.ok(manifest.path.endsWith('native-host.cmd'));
  assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${EXTENSION_ID}/`]);
});
