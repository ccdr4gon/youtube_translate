import { HOST_NAME, MODEL, PROMPT_VERSION, validateRequest } from './core.js';

let port;
const pending = new Map();
const cancelled = new Set();
let saveQueue = Promise.resolve();

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener(message => {
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === 'progress') { request.onProgress?.(message.result); return; }
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.ok ? request.resolve(message.result) : request.reject(new Error(message.error));
  });
  port.onDisconnect.addListener(() => {
    const detail = chrome.runtime.lastError?.message ?? '';
    const error = new Error(`本地程序未连接。请先运行 scripts/install.ps1，再重新检测。${detail ? `（${detail}）` : ''}`);
    port = null;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  });
  return port;
}

function nativeRequest(type, payload, session, tabId, onProgress) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const nativePort = connect();
    const timer = setTimeout(() => {
      pending.delete(id);
      nativePort.postMessage({ id: crypto.randomUUID(), type: 'cancel', requestId: id });
      reject(new Error('等待本地程序超时，请停止其他视频的学习后重试。'));
    }, type === 'status' ? 20000 : 180000);
    pending.set(id, { resolve, reject, timer, session, tabId, onProgress });
    nativePort.postMessage({ id, type, payload });
  });
}

function cancelSession(session, tabId) {
  cancelled.add(`${tabId}:${session}`);
  if (cancelled.size > 500) cancelled.delete(cancelled.values().next().value);
  for (const [id, request] of pending) {
    if (request.tabId !== tabId || (session && request.session !== session)) continue;
    port?.postMessage({ id: crypto.randomUUID(), type: 'cancel', requestId: id });
    clearTimeout(request.timer);
    pending.delete(id);
    request.reject(new Error('已取消。'));
  }
}

async function cacheKey(request) {
  const bytes = new TextEncoder().encode(JSON.stringify({ model: MODEL, version: PROMPT_VERSION, ...request }));
  return 'cache:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

async function analyze(payload, session, tabId, analysisId) {
  const request = validateRequest(payload);
  const key = await cacheKey(request);
  if (cancelled.has(`${tabId}:${session}`)) throw new Error('已取消。');
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached) return { ...cached, cached: true };
  const started = Date.now();
  const result = await nativeRequest('analyze', request, session, tabId, partial => {
    if (!cancelled.has(`${tabId}:${session}`)) void chrome.tabs.sendMessage(tabId, { type: 'ytl:progress', session, analysisId, result: partial }).catch(() => {});
  });
  if (cancelled.has(`${tabId}:${session}`)) throw new Error('已取消。');
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const { cacheIndex = [] } = await chrome.storage.local.get('cacheIndex');
    const index = [...cacheIndex.filter(k => k !== key), key];
    const removed = index.splice(0, Math.max(0, index.length - 120));
    await chrome.storage.local.set({ [key]: result, cacheIndex: index });
    if (removed.length) await chrome.storage.local.remove(removed);
  });
  // A full local cache must not discard a successfully generated explanation.
  await saveQueue.catch(() => {});
  return { ...result, elapsedMs: Date.now() - started, cached: false };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message?.type?.startsWith('ytl:')) return;
  const tabId = sender.tab?.id;
  const session = String(message.session ?? '').slice(0, 150);
  const operation = async () => {
    if (message.type === 'ytl:status') return nativeRequest('status');
    if (message.type === 'ytl:cancel') { cancelSession(session, tabId); return {}; }
    if (message.type === 'ytl:analyze' && tabId !== undefined && session) return analyze(message.payload, session, tabId, message.analysisId);
    if (message.type === 'ytl:clear-cache' && tabId === undefined) {
      await saveQueue.catch(() => {});
      const { cacheIndex = [] } = await chrome.storage.local.get('cacheIndex');
      await chrome.storage.local.remove(cacheIndex);
      await chrome.storage.local.set({ cacheIndex: [] });
      return {};
    }
    throw new Error('不支持的请求。');
  };
  operation().then(result => sendResponse({ ok: true, result }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => cancelSession(null, tabId));
