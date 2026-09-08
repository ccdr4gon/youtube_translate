import { LEVELS, formatTime, wordKey } from './core.js';

export function createPanel({ onToggle, onLevel, onKnown, onSeek, onRefresh }) {
  const host = document.createElement('div');
  host.id = 'youtube-luna-assistant';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = chrome.runtime.getURL('panel.css');
  root.append(style);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, action) => {
    const node = el('button', className, text);
    node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const panel = el('section', 'panel');
  panel.setAttribute('aria-label', 'Luna 英语学习助手');
  const header = el('header');
  header.title = '拖动标题栏移动面板';
  const brand = el('div', 'brand', 'Luna');
  const mode = el('small', 'mode', '英语学习');
  const fab = button('fab', 'Luna', () => { fab.hidden = true; panel.hidden = false; clampPosition(); });
  fab.hidden = true;
  const collapse = button('collapse', '−', () => { panel.hidden = true; fab.hidden = false; });
  collapse.setAttribute('aria-label', '收起面板');
  header.append(brand, mode, collapse);
  const controls = el('div', 'controls');
  const select = el('select');
  select.setAttribute('aria-label', '我的英语水平');
  for (const level of LEVELS) {
    const option = el('option', '', `${level} · ${{ A1: '入门', A2: '基础', B1: '中级', B2: '中高级', C1: '高级', C2: '精通' }[level]}`);
    option.value = level; select.append(option);
  }
  select.addEventListener('change', () => onLevel(select.value));
  const start = button('start', '开始学习', onToggle);
  const refresh = button('refresh', '↻', onRefresh);
  refresh.setAttribute('aria-label', '重新读取字幕'); refresh.title = '重新读取字幕';
  controls.append(select, start, refresh);
  const status = el('div', 'status');
  status.setAttribute('role', 'status');
  const body = el('div', 'body');
  const cards = el('div', 'cards');
  const empty = el('div', 'empty');
  const emptyTitle = el('strong');
  const emptyText = el('span');
  empty.append(emptyTitle, emptyText);
  body.append(empty, cards);
  panel.append(header, controls, status, body);
  root.append(panel, fab);
  panel.addEventListener('keydown', event => event.stopPropagation());

  let position = null, drag = null, moved = false;
  function clampPosition() {
    if (!position || panel.hidden || !style.sheet) return;
    const rect = panel.getBoundingClientRect();
    position.x = Math.max(8, Math.min(position.x, Math.max(8, innerWidth - rect.width - 8)));
    position.y = Math.max(8, Math.min(position.y, Math.max(8, innerHeight - rect.height - 8)));
    panel.style.left = `${position.x}px`; panel.style.top = `${position.y}px`;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  }
  style.addEventListener('load', clampPosition);
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    moved = true; header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    position = { x: event.clientX - drag.dx, y: event.clientY - drag.dy };
    clampPosition();
  });
  const finishDrag = () => {
    if (!drag) return;
    drag = null;
    if (position) void chrome.storage.local.set({ panelPosition: position }).catch(() => {});
  };
  header.addEventListener('pointerup', finishDrag);
  header.addEventListener('pointercancel', finishDrag);
  header.addEventListener('lostpointercapture', finishDrag);
  window.addEventListener('resize', clampPosition);
  void chrome.storage.local.get('panelPosition').then(({ panelPosition }) => {
    if (!moved && Number.isFinite(panelPosition?.x) && Number.isFinite(panelPosition?.y)) {
      position = { ...panelPosition }; clampPosition();
    }
  }).catch(() => {});
  new ResizeObserver(clampPosition).observe(panel);
  function mount() {
    const parent = document.fullscreenElement || document.body;
    if (parent && host.parentNode !== parent) { parent.append(host); clampPosition(); }
  }
  mount();
  document.addEventListener('fullscreenchange', mount);
  let view = '', signature = '';
  const cardNodes = new Map();
  return {
    host,
    update(state) {
      mount();
      select.value = state.level;
      select.disabled = Boolean(state.paused);
      mode.textContent = state.paused ? '暂停 · 附近三句 · 全等级' : '英语学习';
      start.textContent = state.active ? '停止学习' : state.starting ? '连接中…' : '开始学习';
      start.disabled = Boolean(state.starting);
      status.className = `status${state.error ? ' error' : state.busy ? ' busy' : ''}`;
      status.textContent = state.status;
      status.title = [state.source, state.meta].filter(Boolean).join('\n');
      fab.textContent = state.busy ? 'Luna · …' : 'Luna';
      empty.hidden = state.terms.length > 0;
      emptyTitle.textContent = state.emptyTitle || '等待字幕';
      emptyText.textContent = state.emptyText || '新词会自动出现在这里。';
      const nextView = state.paused ? `pause:${state.pauseKey}` : 'play';
      if (nextView !== view) { cards.replaceChildren(); cardNodes.clear(); signature = ''; view = nextView; }
      const nextSignature = JSON.stringify(state.terms);
      if (nextSignature === signature) return;
      signature = nextSignature;
      const keys = new Set(state.terms.map(term => wordKey(term.lemma || term.term)));
      for (const [key, entry] of cardNodes) {
        if (!keys.has(key)) { entry.node.remove(); cardNodes.delete(key); }
      }
      let changed = false;
      for (const term of state.terms) {
        const key = wordKey(term.lemma || term.term), data = JSON.stringify(term);
        const previous = cardNodes.get(key);
        if (previous?.data === data) continue;
        const card = el('article', 'card');
        card.dataset.delaySeconds = String(term.delaySeconds ?? '');
        const row = el('div', 'wordrow');
        row.append(el('span', 'word', term.term), el('span', 'level', `${term.level} ${term.kind === 'slang' ? '俚语' : term.kind === 'phrase' ? '短语' : ''}`.trim()));
        card.append(row, el('p', 'meaning', term.meaning));
        if (term.words?.length) {
          const words = el('div', 'words');
          for (const word of term.words) {
            const line = el('p');
            line.append(el('strong', '', word.word), document.createTextNode(` · 本义：${word.meaning}`));
            words.append(line);
          }
          card.append(words);
        }
        if (term.note) card.append(el('p', 'note', term.note));
        card.append(el('div', 'quote', term.quote));
        const actions = el('div', 'cardfoot');
        actions.append(button('time', `↺ ${formatTime(term.start)} 重听`, () => onSeek(term.start)));
        if (!state.paused) actions.append(button('known', '✓ 已掌握', () => onKnown(key)));
        card.append(actions);
        if (previous) previous.node.replaceWith(card); else cards.append(card);
        cardNodes.set(key, { node: card, data }); changed = true;
      }
      if (changed) requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    }
  };
}
