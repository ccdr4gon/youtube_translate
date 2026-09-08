(() => {
  if (window.__youtubeLunaBridge) return;
  window.__youtubeLunaBridge = true;
  let latestRequest = '';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isEnglish = language => /^en(?:-|$)/i.test(language || '');
  const displayedLanguage = track => track?.translationLanguage?.languageCode || track?.languageCode || '';

  const videoId = () => new URL(location.href).searchParams.get('v') || location.pathname.match(/^\/shorts\/([\w-]+)/)?.[1] || '';
  function playerData() {
    const player = document.getElementById('movie_player');
    const current = player?.getPlayerResponse?.();
    if (current?.videoDetails?.videoId === videoId()) return current;
    if (window.ytInitialPlayerResponse?.videoDetails?.videoId === videoId()) return window.ytInitialPlayerResponse;
    return null;
  }

  async function enableEnglishCaptions(isCurrent) {
    let track, selected, foundEnglish = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!isCurrent()) return null;
      const player = document.getElementById('movie_player');
      try {
        // YouTube loads the captions module lazily. The player methods here are
        // undocumented, so verify the actual selection and CC button afterward.
        if (attempt === 0) player?.loadModule?.('captions');
        const data = playerData();
        if (!data) { await delay(250); continue; }
        const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const runtimeTracks = player?.getOption?.('captions', 'tracklist') || [];
        selected = player?.getOption?.('captions', 'track');
        const english = [...tracks, ...(Array.isArray(runtimeTracks) ? runtimeTracks : [])].filter(t => isEnglish(t.languageCode));
        track = english.find(t => t.kind !== 'asr') || english[0];
        if (!track && isEnglish(selected?.languageCode)) track = selected;
        if (track) {
          foundEnglish = true;
          const cc = player?.querySelector('.ytp-subtitles-button');
          if (cc?.getAttribute('aria-pressed') === 'false') cc.click();
          else if (!cc) player?.toggleSubtitlesOn?.();
          // Explicitly clear auto-translation, even when its source is English.
          if (selected?.languageCode !== track.languageCode || selected?.translationLanguage ||
              (selected?.kind || '') !== (track.kind || '') ||
              (track.vssId && selected?.vss_id !== track.vssId)) {
            player?.setOption?.('captions', 'track', {
              languageCode: track.languageCode, kind: track.kind || '',
              ...(track.vssId || track.vss_id ? { vss_id: track.vssId || track.vss_id } : {}),
              translationLanguage: null
            });
          }
          await delay(250);
          if (!isCurrent()) return null;
          selected = player?.getOption?.('captions', 'track');
          if (isEnglish(selected?.languageCode) && !selected.translationLanguage &&
              (!cc || cc.getAttribute('aria-pressed') === 'true')) {
            return { track, selectedLanguage: selected.languageCode, captionsReady: true };
          }
        }
      } catch { /* A newly navigated player may not expose its captions module yet. */ }
      await delay(250);
    }
    return { track, selectedLanguage: displayedLanguage(selected), captionsReady: false,
      captionWarning: foundEnglish ? '自动切换英文字幕未成功，请在播放器选择 English，再点击「重新读取字幕」。' :
        '这个视频未找到英文字幕，暂时无法开始学习。' };
  }

  function parseCaptions(text) {
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json.events)) return json.events.filter(e => e.segs?.length).map((e, index) => ({
        id: `track-${index}`, start: e.tStartMs / 1000,
        end: (e.tStartMs + (e.dDurationMs || 3000)) / 1000,
        text: e.segs.map(s => s.utf8 || '').join('')
      }));
    } catch { /* A track may use the XML subtitle format. */ }
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) return [];
    const nodes = [...xml.querySelectorAll('text, p[t]')];
    return nodes.map((node, index) => {
      const seconds = node.hasAttribute('start');
      const start = Number(node.getAttribute(seconds ? 'start' : 't')) / (seconds ? 1 : 1000);
      const duration = Number(node.getAttribute(seconds ? 'dur' : 'd')) / (seconds ? 1 : 1000);
      return { id: `track-${index}`, start, end: start + (duration || 3), text: node.textContent };
    });
  }

  let captured = null;
  let publishCaptured = null;
  function capture(urlString, body) {
    try {
      const url = new URL(urlString, location.origin);
      if (url.origin !== location.origin || url.pathname !== '/api/timedtext' ||
          !isEnglish(url.searchParams.get('lang')) || url.searchParams.has('tlang') || body.length > 3000000) return;
      const id = url.searchParams.get('v');
      if (!id || id !== videoId()) return;
      const cues = parseCaptions(body).slice(0, 12000);
      if (!cues.length) return;
      captured = { id, cues, language: url.searchParams.get('lang') };
      publishCaptured?.();
    } catch { /* Ignore responses outside this video's English caption track. */ }
  }
  // Observe the player's successful caption response, including its current signed URL.
  // No additional requests, cookies or tokens are forwarded to the extension or Codex.
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const result = originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    if (url?.includes('/api/timedtext')) void result.then(response => response.clone().text().then(body => capture(url, body))).catch(() => {});
    return result;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    if (String(url).includes('/api/timedtext')) this.addEventListener('load', () => {
      try { if (!this.responseType || this.responseType === 'text') capture(String(url), this.responseText); } catch { /* Non-text response. */ }
    }, { once: true });
    return originalOpen.call(this, method, url, ...args);
  };

  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source === 'youtube-luna-cancel') { latestRequest = ''; publishCaptured = null; return; }
    if (event.data?.source !== 'youtube-luna-request') return;
    const { requestId, id } = event.data;
    if (typeof requestId !== 'string' || id !== videoId()) return;
    latestRequest = requestId;
    const isCurrent = () => latestRequest === requestId && id === videoId();
    const response = { source: 'youtube-luna-response', requestId, id, cues: [], language: '', live: false, captionsReady: false };
    try {
      const selection = await enableEnglishCaptions(isCurrent);
      if (!selection || !isCurrent()) return;
      const { track, ...state } = selection;
      Object.assign(response, state);
      if (!selection.captionsReady) throw new Error(selection.captionWarning);
      const data = playerData();
      response.live = Boolean(data?.videoDetails?.isLiveContent && !data?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.endTimestamp);
      response.language = track.languageCode;
      let lastPublished = null;
      publishCaptured = () => {
        if (!isCurrent() || response.live || captured?.id !== id || captured === lastPublished) return;
        lastPublished = captured;
        response.cues = captured.cues;
        window.postMessage({ ...response, captured: true }, location.origin);
      };
      if (captured?.id === id && !response.live) { publishCaptured(); return; }
      // Start live analysis immediately; don't block it on a failed full-track request.
      window.postMessage({ ...response, pendingTrack: true }, location.origin);
      if (!track.baseUrl) throw new Error('英文字幕已开启，将读取当前字幕。');
      const url = new URL(track.baseUrl, location.origin);
      if (url.origin !== location.origin || url.pathname !== '/api/timedtext') throw new Error('字幕地址暂不支持，将读取当前字幕。');
      // Use the viewer's already available caption URL; no cookies leave the browser.
      for (const jsonFormat of [true]) {
        const attempt = new URL(url);
        if (jsonFormat) attempt.searchParams.set('fmt', 'json3');
        const result = await fetch(attempt, { credentials: 'include', signal: AbortSignal.timeout(3000) });
        if (!result.ok) continue;
        const body = await result.text();
        if (body.length > 3000000) throw new Error('字幕过长，将读取当前字幕。');
        response.cues = parseCaptions(body).slice(0, 12000);
        if (response.cues.length) break;
      }
      if (!response.cues.length) response.error = '暂时无法提前读取字幕，已切换为当前字幕模式。';
    } catch (error) { response.error = error.message; }
    if (isCurrent()) window.postMessage(response, location.origin);
  });
})();
