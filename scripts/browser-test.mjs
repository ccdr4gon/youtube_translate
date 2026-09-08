// Optional browser QA: PLAYWRIGHT_MODULE_PATH may point to an existing Playwright installation.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const extension = path.resolve('extension');
const id = 'aeofkpgbodbdljhlibnnhbjkalpjenid';
const native = process.argv.includes('--native');
const folder = path.resolve('.local', `browser-${native ? 'native' : 'ui'}-${Date.now()}`);
const context = await chromium.launchPersistentContext(folder, {
  executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  ignoreDefaultArgs: ['--disable-extensions']
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  assert.ok(worker.url().includes(id), 'Extension must actually be loaded');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (native) {
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.getByRole('button', { name: '检测 Codex 连接' }).click();
    await page.getByText('已通过 ChatGPT 订阅登录。', { exact: true }).waitFor({ timeout: 25000 });
    console.log('PASS: Edge extension -> registered Windows native host -> real Codex subscription login.');
  } else {
    // A real media timeline is shared across Chrome's isolated worlds. JS property
    // overrides on a fake video are visible only to the page, not to the extension.
    const media = Buffer.alloc(44 + 8000 * 2 * 180);
    media.write('RIFF', 0); media.writeUInt32LE(media.length - 8, 4); media.write('WAVEfmt ', 8);
    media.writeUInt32LE(16, 16); media.writeUInt16LE(1, 20); media.writeUInt16LE(1, 22);
    media.writeUInt32LE(8000, 24); media.writeUInt32LE(16000, 28); media.writeUInt16LE(2, 32); media.writeUInt16LE(16, 34);
    media.write('data', 36); media.writeUInt32LE(media.length - 44, 40);
    await context.route('https://www.youtube.com/fixture.wav', route => {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Number(range[2]) : media.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav',
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}) },
        body: media.subarray(start, end + 1) });
    });
    await worker.evaluate(() => {
      globalThis.__analysisCalls = [];
      globalThis.__delayMs = 40;
      chrome.runtime.connectNative = () => {
        const listeners = [];
        return {
          onMessage: { addListener: callback => listeners.push(callback) },
          onDisconnect: { addListener() {} },
          postMessage(message) {
            let result = {};
            if (message.type === 'status') result = { loggedIn: true, message: '已通过 ChatGPT 订阅登录。' };
            if (message.type === 'analyze') {
              globalThis.__analysisCalls.push(message.payload);
              const cue = message.payload.cues[0];
              result = { terms: [{ term: cue.text.includes('granted') ? 'take it for granted' : 'ambiguous',
                lemma: cue.text.includes('granted') ? 'take for granted' : 'ambiguous',
                level: cue.text.includes('granted') ? 'B2' : 'C1', kind: cue.text.includes('granted') ? 'phrase' : 'word',
                meaning: cue.text.includes('granted') ? '把它视为理所当然' : '模棱两可的', note: '根据当前句子理解这个表达。',
                quote: cue.text, start: cue.start, end: cue.end, example: 'Never take kindness for granted.', example_zh: '不要把善意视为理所当然。' }] };
            }
            setTimeout(() => listeners.forEach(fn => fn({ id: message.id, ok: true, result })), message.type === 'analyze' ? globalThis.__delayMs : 5);
          }
        };
      };
    });
    await context.route('https://www.youtube.com/api/timedtext*', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ events: [
        { tStartMs: 1000, dDurationMs: 8000, segs: [{ utf8: "Don't take it for granted." }] },
        { tStartMs: 25000, dDurationMs: 7000, segs: [{ utf8: 'The outcome is ambiguous.' }] },
        { tStartMs: 65000, dDurationMs: 7000, segs: [{ utf8: 'That explanation is ambiguous.' }] }
      ] })
    }));
    await context.route('https://www.youtube.com/watch*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><title>YouTube fixture · browser QA</title></head><body style="margin:0;background:#111b18;color:#dce7da;font-family:Segoe UI"><div style="padding:55px"><div style="font-size:14px;letter-spacing:3px;color:#a1b39e">YOUTUBE / ENGLISH PRACTICE</div><h1 style="font-size:44px;max-width:700px">Small expressions.<br>Different meanings.</h1><p style="color:#99ad98">Browser test fixture · 模拟视频与模型回复</p><div id="movie_player" style="margin-top:60px;width:850px;height:440px;border:1px solid #49604f;background:linear-gradient(150deg,#243a30,#13211b);border-radius:16px;display:grid;place-items:center"><video></video><div class="ytp-caption-segment" style="font-size:25px">Don't take it for granted.</div></div></div><script>
      const v = document.querySelector('video'); v.muted = true; v.src = '/fixture.wav';
      v.addEventListener('loadedmetadata', () => { v.currentTime = 4; v.play(); }, {once:true});
      window.fixtureTime = n => v.currentTime = n;
      const player = document.getElementById('movie_player');
      const cc = document.createElement('button'); cc.className = 'ytp-subtitles-button'; cc.textContent = 'CC';
      cc.setAttribute('aria-pressed', location.href.includes('EnglishFixture') ? 'true' : 'false'); player.append(cc);
      let selected = location.href.includes('TranslatedFixture') ? {languageCode:'en',vss_id:'.en',translationLanguage:{languageCode:'zh-Hans'}} :
        location.href.includes('EnglishFixture') ? {languageCode:'en',vss_id:'.en'} : {languageCode:'zh-Hans'};
      let toggles = 0, selections = 0;
      const tracks = () => location.href.includes('MissingFixture') ? [{languageCode:'zh-Hans'}] : [
        {languageCode:'en',kind:'asr',vssId:'a.en',baseUrl:location.origin+'/api/timedtext?v=fixture'},
        ...location.href.includes('AutoFixture') ? [] : [{languageCode:'en',vssId:'.en',baseUrl:location.origin+'/api/timedtext?v=fixture'}]
      ];
      cc.onclick = () => { toggles++; cc.setAttribute('aria-pressed', cc.getAttribute('aria-pressed') !== 'true' ? 'true' : 'false'); };
      player.getPlayerResponse = () => ({ videoDetails: { videoId: new URL(location.href).searchParams.get('v') }, captions: { playerCaptionsTracklistRenderer: { captionTracks: location.href.includes('LiveFixture') ? [] : tracks() } } });
      player.getOption = (module, option) => option === 'tracklist' ? tracks().map(({baseUrl,...track})=>track) : selected;
      player.setOption = (module, option, value) => { selections++; selected = value; };
      player.loadModule = () => {};
      window.fixtureCaptions = () => ({selected,toggles,selections,enabled:cc.getAttribute('aria-pressed')==='true'});
    </script></body></html>` }));
    await page.goto('https://www.youtube.com/watch?v=LunaFixture');
    await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 4);
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.getByText('把它视为理所当然', { exact: true }).waitFor({ timeout: 15000 });
    const captions = await page.evaluate(() => window.fixtureCaptions());
    assert.equal(captions.enabled, true, 'Start learning must turn CC on');
    assert.equal(captions.selected.languageCode, 'en', 'Chinese default must switch to English');
    assert.equal(captions.selected.vss_id, '.en', 'Prefer human English over automatic English');
    assert.equal(await page.locator('.card').count(), 1, 'Future explanations must not appear early');
    await page.getByLabel('我的英语水平').selectOption('B2');
    assert.equal(await page.locator('.card').count(), 0);
    await page.getByLabel('我的英语水平').selectOption('A2');
    await page.getByText('把它视为理所当然', { exact: true }).waitFor();
    await page.getByRole('button', { name: '✓ 已掌握', exact: true }).click();
    assert.equal(await page.locator('.card').count(), 0);
    const learned = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.known);
    assert.deepEqual(learned, ['take for granted']);
    await worker.evaluate(async () => chrome.storage.local.set({ settings: { level: 'B1', known: [] } }));
    await page.evaluate(() => window.fixtureTime(27));
    await page.getByText('模棱两可的', { exact: true }).waitFor();
    await page.getByRole('button', { name: '↺ 0:25 重听', exact: true }).click();
    assert.ok(await page.evaluate(() => document.querySelector('video').currentTime) < 25);
    await page.getByRole('button', { name: '停止学习', exact: true }).click();
    const before = await worker.evaluate(() => globalThis.__analysisCalls.length);
    await page.reload();
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.getByText('把它视为理所当然', { exact: true }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.__analysisCalls.length), before, 'Replay should reuse saved results');
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/extension-panel.png', fullPage: true });
    await page.getByRole('button', { name: '停止学习', exact: true }).click();
    await page.goto('https://www.youtube.com/watch?v=LiveFixture');
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.getByText('把它视为理所当然', { exact: true }).waitFor({ timeout: 15000 });
    assert.ok((await page.locator('.status').getAttribute('title')).includes('当前字幕模式'));
    await page.getByRole('button', { name: '停止学习', exact: true }).click();
    for (const scenario of ['EnglishFixture', 'TranslatedFixture', 'AutoFixture']) {
      await page.goto(`https://www.youtube.com/watch?v=${scenario}`);
      await page.getByRole('button', { name: '开始学习', exact: true }).click();
      await page.getByText('把它视为理所当然', { exact: true }).waitFor({ timeout: 15000 });
      const selection = await page.evaluate(() => window.fixtureCaptions());
      assert.equal(selection.enabled, true);
      assert.equal(selection.selected.languageCode, 'en');
      assert.ok(!selection.selected.translationLanguage, 'Clear auto-translation');
      if (scenario === 'EnglishFixture') {
        assert.equal(selection.toggles, 0, 'Do not toggle already enabled English captions off');
        assert.equal(selection.selections, 0, 'Do not reset an already correct track');
      }
      if (scenario === 'AutoFixture') assert.equal(selection.selected.kind, 'asr');
      await page.getByRole('button', { name: '停止学习', exact: true }).click();
    }
    const callsBeforeMissing = await worker.evaluate(() => globalThis.__analysisCalls.length);
    await page.goto('https://www.youtube.com/watch?v=MissingFixture');
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.getByText('这个视频未找到英文字幕，暂时无法开始学习。', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await worker.evaluate(() => globalThis.__analysisCalls.length), callsBeforeMissing, 'Do not analyze the wrong language');
    console.log('PASS: real extension UI with simulated captions/model: automatic English CC, manual/automatic tracks, translation clearing, missing English, levels, replay, cache, live-caption fallback.');
  }
  assert.deepEqual(errors, [], 'No page JavaScript errors');
} catch (error) {
  mkdirSync('test-results', { recursive: true });
  const page = context.pages().at(-1);
  if (page) {
    await page.screenshot({ path: 'test-results/browser-failure.png', fullPage: true }).catch(() => {});
    console.error(await page.locator('#youtube-luna-assistant').evaluate(node => node.shadowRoot.textContent).catch(() => 'Panel missing'));
  }
  console.error(await context.serviceWorkers()[0]?.evaluate(async () => ({ calls: globalThis.__analysisCalls, storage: await chrome.storage.local.get(null) })).catch(() => 'Worker unavailable'));
  throw error;
} finally { await context.close(); }
