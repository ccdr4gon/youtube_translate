(async () => {
  if (window.__youtubeLunaContent) return;
  window.__youtubeLunaContent = true;
  const core = await import(chrome.runtime.getURL('core.js'));
  const { createPanel } = await import(chrome.runtime.getURL('panel.js'));
  const { cleanText, normalizeCues, LiveCaptions, liveBatch, transcriptBatch, visibleTerms, DEFAULT_SETTINGS } = core;
  const stored = await chrome.storage.local.get('settings');
  let settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  let id = '', session = crypto.randomUUID(), active = false, starting = false, busy = false;
  let track = [], live = new LiveCaptions(), terms = [], completed = new Set(), liveDone = new Set();
  let source = '', status = '点击开始学习，会自动开启英文字幕。', error = false, meta = '';
  let requestId = '', selectedLanguage = '', lastTime = 0, lastTick = Date.now(), lastChanged = 0;
  let lastAnalysis = 0, analyzedOnce = false, bridgeStarted = 0;
  let inAd = false;
  let captionsReady = false;
  let analyzedCount = 0, analysisId = '';
  let receivedAt = new Map();

  const getId = () => new URL(location.href).searchParams.get('v') || location.pathname.match(/^\/shorts\/([\w-]+)/)?.[1] || '';
  const video = () => document.querySelector('#movie_player video') || document.querySelector('video');
  async function send(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type: `ytl:${type}`, session, ...extra });
    if (!response?.ok) throw new Error(response?.error || '插件连接已断开，请刷新 YouTube 页面。');
    return response.result;
  }
  function newSession() {
    const old = session;
    session = crypto.randomUUID();
    void chrome.runtime.sendMessage({ type: 'ytl:cancel', session: old }).catch(() => {});
    busy = false; analysisId = '';
  }
  function readTrack() {
    if (!id) return;
    requestId = crypto.randomUUID();
    captionsReady = false;
    bridgeStarted = Date.now();
    source = '正在开启并切换为英文字幕…';
    window.postMessage({ source: 'youtube-luna-request', requestId, id }, location.origin);
  }
  async function saveSettings() {
    await chrome.storage.local.set({ settings });
  }
  const panel = createPanel({
    async onToggle() {
      if (active) {
        active = false; window.postMessage({ source: 'youtube-luna-cancel' }, location.origin);
        requestId = ''; bridgeStarted = 0;
        newSession(); status = '已停止。已有讲解仍可查看。'; render(); return;
      }
      if (!video()) { status = '请先打开一个 YouTube 视频。'; error = true; render(); return; }
      const epoch = session;
      starting = true; error = false; status = '正在连接本机 Codex…'; render();
      try {
        const account = await send('status');
        if (epoch !== session) return;
        if (!account.loggedIn) throw new Error(account.message);
        active = true; analyzedOnce = false; lastAnalysis = 0;
        status = '已连接，正在等待英文字幕。'; readTrack();
      } catch (failure) { if (epoch === session) { error = true; status = failure.message; } }
      finally { if (epoch === session) { starting = false; render(); } }
    },
    onLevel(level) { settings.level = level; void saveSettings(); render(); },
    onKnown(key) {
      settings.known = [...new Set([...settings.known, key])].slice(-3000);
      void saveSettings(); render();
    },
    onSeek(time) { const player = video(); if (player) { player.currentTime = Math.max(0, time - 0.3); void player.play().catch(() => {}); } },
    onRefresh() {
      newSession(); track = []; completed.clear(); liveDone.clear(); live = new LiveCaptions();
      analyzedOnce = false; lastAnalysis = 0; error = false; readTrack();
      status = active ? '正在重新读取字幕。' : '字幕读取后，点击开始学习。'; render();
    }
  });

  function render() {
    panel.host.hidden = !id;
    const time = video()?.currentTime || 0;
    const visible = visibleTerms([...terms], settings.level, settings.known, time);
    let emptyTitle = '只讲你需要的词', emptyText = '点击「开始学习」，自动开启并选择英文字幕。建议先用 B1 试试，再按自己的水平调整。';
    if (active || analyzedOnce) {
      emptyTitle = analyzedCount ? '已分析，暂无符合条件的词' : busy ? '正在读懂第一段' : '等待下一段字幕';
      emptyText = analyzedCount ? `已分析 ${analyzedCount} 条字幕，识别 ${terms.length} 个表达。只显示高于 ${settings.level}、尚未掌握且已播放到的词。可降低等级查看已有结果，无须重新分析。` :
        '字幕会排队分析，滚动不会清空待学习词。首次回复需要等待。';
      if (!track.length && !live.cues.length) { emptyTitle = '等待英文字幕'; emptyText = '正在自动开启 English 字幕。也可手动展开英文视频文稿，以便提前分析。'; }
    }
    if (settings.level === 'C2') { emptyTitle = '你已选择最高等级'; emptyText = '本版只显示高于所选等级的词。要查看 C2 词语，请选择 C1。'; }
    const pending = track.length ? 0 : live.cues.filter(c => !liveDone.has(`${c.id}:${c.text}`)).length;
    const progress = busy ? `正在分析 · 已等待 ${Math.floor((Date.now() - lastAnalysis) / 1000)} 秒${pending ? ` · 未完成 ${pending} 条字幕（含处理中）` : ''}` : status;
    panel.update({ level: settings.level, active, starting, busy, error, status: progress, source,
      terms: visible, meta, emptyTitle, emptyText });
  }

  function resetVideo(nextId) {
    newSession(); id = nextId; starting = false;
    track = []; live = new LiveCaptions(); terms = []; completed.clear(); liveDone.clear(); analyzedCount = 0; receivedAt.clear();
    source = ''; selectedLanguage = ''; requestId = ''; captionsReady = false; error = false; analyzedOnce = false; meta = '';
    lastTime = video()?.currentTime || 0; lastAnalysis = 0;
    status = active ? '视频已切换，正在开启英文字幕。' : '点击开始学习，会自动开启英文字幕。';
    if (active) readTrack();
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.source !== 'youtube-luna-response') return;
    if (data.requestId !== requestId || data.id !== id) return;
    if (track.length && !data.cues?.length) return;
    selectedLanguage = data.selectedLanguage || '';
    captionsReady = data.captionsReady === true;
    if (!captionsReady) {
      active = false; error = true; bridgeStarted = 0; newSession();
      status = data.captionWarning || data.error || '自动开启英文字幕未成功，请重试。';
      source = '英文字幕尚未就绪'; render(); return;
    }
    const cues = normalizeCues(data.cues);
    if (cues.length && /^en(?:-|$)/i.test(data.language) && !data.live) {
      if (track.length) return;
      track = cues; completed.clear();
      source = `英文字幕已开启 · 已读取 ${track.length} 条 · 提前分析约 40 秒`;
    } else {
      source = data.live ? '直播字幕 · 出现后分析，会有延迟' : '当前字幕模式 · 出现后分析，会有延迟';
    }
    bridgeStarted = 0; render();
  });

  // Reading the visible transcript is an optional fallback; never clicks the page for the user.
  function readOpenTranscript() {
    const nodes = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (nodes.length < 3 || selectedLanguage && !/^en(?:-|$)/i.test(selectedLanguage)) return;
    const cues = [];
    for (const node of nodes) {
      const stamp = cleanText(node.querySelector('.segment-timestamp')?.textContent);
      const parts = stamp.split(':').map(Number);
      const text = cleanText(node.querySelector('.segment-text')?.textContent);
      if (!/^(\d+:)?\d+:\d+$/.test(stamp) || !text) continue;
      const start = parts.reduce((sum, part) => sum * 60 + part, 0);
      cues.push({ id: `transcript-${cues.length}`, start, end: start + 3, text });
    }
    const letters = cues.map(c => c.text).join('');
    if (cues.length > 3 && (letters.match(/[a-z]/gi)?.length || 0) / letters.length > 0.5) {
      newSession(); track = normalizeCues(cues); completed.clear();
      source = '使用已展开的视频文稿 · 请确认文稿语言为 English';
    }
  }

  function batchForLive(time) {
    return liveBatch(live.cues, time, liveDone, Date.now() - lastChanged > 600);
  }

  async function analyze(batch) {
    const epoch = session;
    analysisId = crypto.randomUUID();
    lastAnalysis = Date.now();
    busy = true; error = false; status = track.length ? '正在准备即将出现的词语…' : '正在分析刚刚出现的字幕…'; render();
    try {
      const result = await send('analyze', { analysisId, payload: { videoId: id, cues: batch.cues, context: batch.context } });
      if (epoch !== session) return;
      if (batch.key) completed.add(batch.key);
      else for (const cue of batch.cues) liveDone.add(`${cue.id}:${cue.text}`);
      analyzedCount += batch.cues.length;
      receiveTerms(result);
      analyzedOnce = true;
      status = `已分析 ${analyzedCount} 条字幕 · 识别 ${terms.length} 个表达`;
      meta = result.cached ? '已复用本地结果 · 未请求模型' : `Luna · 首条 ${((result.firstTermMs || result.elapsedMs || 0) / 1000).toFixed(1)} 秒 · 全段 ${((result.elapsedMs || 0) / 1000).toFixed(1)} 秒`;
    } catch (failure) {
      if (epoch !== session) return;
      active = false; error = true; status = failure.message;
    } finally { if (epoch === session) { busy = false; render(); } }
  }

  function receiveTerms(result) {
    const combined = new Map(terms.map(t => [`${t.start}:${t.term}`, t]));
    for (const term of result.terms) {
      const key = `${term.start}:${term.term}`;
      if (!receivedAt.has(key)) receivedAt.set(key, Math.max(0, (video()?.currentTime || 0) - term.start));
      combined.set(key, { ...term, delaySeconds: receivedAt.get(key) });
    }
    terms = [...combined.values()];
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'ytl:progress' || message.session !== session || message.analysisId !== analysisId || !busy) return;
    receiveTerms(message.result);
    meta = `Luna · 首条 ${(message.result.firstTermMs / 1000).toFixed(1)} 秒 · 其余继续准备`;
    render();
  });

  let ticks = 0;
  setInterval(() => {
    try {
      const nextId = getId();
      if (id !== nextId) resetVideo(nextId);
      const player = video();
      if (!id || !player) { render(); return; }
      const time = player.currentTime;
      const now = Date.now();
      const isAd = document.getElementById('movie_player')?.classList.contains('ad-showing');
      if (isAd) {
        if (!inAd) { newSession(); live = new LiveCaptions(); inAd = true; }
        lastTime = time; lastTick = now;
        if (active) status = '广告播放中，暂停分析。';
        render(); return;
      }
      if (inAd) { inAd = false; newSession(); lastTime = time; analyzedOnce = false; }
      const expectedAdvance = (now - lastTick) / 1000 * Math.max(1, player.playbackRate);
      if (Math.abs(time - lastTime) > Math.max(3, expectedAdvance + 2)) {
        newSession(); live = new LiveCaptions(); liveDone.clear(); lastAnalysis = 0;
        analyzedOnce = false;
        if (active) status = '已跳转，优先分析当前位置。';
      }
      lastTime = time; lastTick = now;
      if (active) {
        if (bridgeStarted && now - bridgeStarted > 20000) {
          bridgeStarted = 0; active = false; error = true;
          status = '开启英文字幕超时，请刷新页面后重试。'; render(); return;
        }
        if (!captionsReady) { render(); return; }
        if (!track.length) {
          if (++ticks % 8 === 0) readOpenTranscript();
          const text = [...document.querySelectorAll('.ytp-caption-segment')].map(n => n.textContent).join(' ');
          if (/[a-z]/i.test(text) && live.add(text, time)) lastChanged = now;
          if (!source && text) source = '当前字幕模式 · 请在播放器选择 English';
        }
        if (!track.length && selectedLanguage && !/^en(?:-|$)/i.test(selectedLanguage)) {
          status = '请将播放器字幕改为 English，再点击「重新读取字幕」。'; render(); return;
        }
        if (!busy) {
          const batch = track.length ? (!player.paused || !analyzedOnce ? transcriptBatch(track, time, completed, player.paused ? 0 : 40) : null) :
            now - lastAnalysis >= 800 ? batchForLive(time) : null;
          if (batch) void analyze(batch);
        }
      }
      render();
    } catch (failure) {
      active = false; error = true; status = '插件已更新或连接失效，请刷新 YouTube 页面。'; render();
    }
  }, 500);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue }; render(); }
  });
  resetVideo(getId()); render();
})().catch(error => console.error('[Luna]', error));
