import { DEFAULT_SETTINGS } from './core.js';
const $ = id => document.getElementById(id);
const stored = await chrome.storage.local.get('settings');
let settings = { ...DEFAULT_SETTINGS, ...stored.settings };
$('level').value = settings.level;
$('level').addEventListener('change', async () => {
  settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get('settings')).settings, level: $('level').value };
  await chrome.storage.local.set({ settings });
});
$('check').addEventListener('click', async () => {
  $('check').disabled = true; $('status').className = ''; $('status').textContent = '正在检测…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ytl:status' });
    if (!response?.ok) throw new Error(response?.error || '本地程序未连接。');
    $('status').textContent = response.result.message;
    $('status').className = response.result.loggedIn ? '' : 'error';
  } catch (error) { $('status').textContent = error.message; $('status').className = 'error'; }
  finally { $('check').disabled = false; }
});
$('reset-known').addEventListener('click', async () => {
  settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get('settings')).settings, known: [] };
  await chrome.storage.local.set({ settings }); $('notice').textContent = '已清空「已掌握」名单。';
});
$('clear-cache').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'ytl:clear-cache' });
  $('notice').textContent = response?.ok ? '已清空分析记录。请刷新视频页面后重新分析。' : response?.error || '清空失败。';
});

$('reload').addEventListener('click', () => chrome.runtime.reload());
