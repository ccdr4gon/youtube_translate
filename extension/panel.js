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
  const brand = el('div', 'brand', 'Luna');
  brand.append(el('small', '', '英语学习助手'));
  const fab = button('fab', '◔ Luna', () => { fab.hidden = true; panel.hidden = false; });
  fab.hidden = true;
  header.append(el('div', 'mark', '◔'), brand, button('collapse', '−', () => { panel.hidden = true; fab.hidden = false; }));
  const body = el('div', 'body');
  body.append(el('p', 'intro', '看懂这一句，也记住它的表达。'));
  const controls = el('div', 'controls');
  const label = el('label', '', '我的英语水平');
  const select = el('select');
  select.setAttribute('aria-label', '我的英语水平');
  for (const level of LEVELS) {
    const option = el('option', '', `${level} · ${ { A1: '入门', A2: '基础', B1: '中级', B2: '中高级', C1: '高级', C2: '精通' }[level] }`);
    option.value = level; select.append(option);
  }
  select.addEventListener('change', () => onLevel(select.value));
  label.append(select);
  const start = button('start', '开始学习', onToggle);
  controls.append(label, start);
  const status = el('div', 'status');
  status.setAttribute('role', 'status');
  const statusText = el('span', '', '点击开始学习，自动开启英文字幕。');
  status.append(el('span', 'dot'), statusText);
  const source = el('p', 'source');
  const cards = el('div', 'cards');
  const count = el('p', 'source');
  const empty = el('div', 'empty');
  const emptyTitle = el('strong', '', '只讲你需要的词');
  const emptyText = el('span', '', '播放英文视频后点击「开始学习」。讲解会随字幕出现，已掌握的词可以隐藏。');
  empty.append(emptyTitle, emptyText);
  body.append(controls, status, source, count, empty, cards);
  const footer = el('footer');
  const meta = el('span', '', 'gpt-5.6-luna · 订阅额度');
  footer.append(meta, button('textbutton', '重新读取字幕', onRefresh));
  panel.append(header, body, footer);
  root.append(panel, fab);
  // Keep keyboard navigation inside the panel from triggering YouTube shortcuts.
  panel.addEventListener('keydown', event => event.stopPropagation());
  let signature = '';
  const cardNodes = new Map();
  function mount() {
    const parent = document.fullscreenElement || document.body;
    if (parent && host.parentNode !== parent) parent.append(host);
  }
  mount();
  document.addEventListener('fullscreenchange', mount);
  return {
    host,
    update(state) {
      mount();
      select.value = state.level;
      start.textContent = state.active ? '停止学习' : state.starting ? '连接中…' : '开始学习';
      start.disabled = Boolean(state.starting);
      status.className = `status${state.error ? ' error' : state.busy ? ' busy' : ''}`;
      statusText.textContent = state.status;
      source.textContent = state.source;
      meta.textContent = state.meta || 'gpt-5.6-luna · 订阅额度';
      fab.textContent = state.busy ? '◔ Luna · 分析中' : '◔ Luna';
      empty.hidden = state.terms.length > 0;
      count.textContent = state.terms.length ? `待学习 ${state.terms.length} 个 · 新词追加在下方，可滚动查看` : '';
      emptyTitle.textContent = state.emptyTitle || '等待这一句的讲解';
      emptyText.textContent = state.emptyText || '超过当前水平的词和短语会出现在这里。';
      const nextSignature = JSON.stringify(state.terms);
      if (nextSignature === signature) return;
      signature = nextSignature;
      const keys = new Set(state.terms.map(term => wordKey(term.lemma || term.term)));
      for (const [key, node] of cardNodes) {
        if (!keys.has(key)) { node.remove(); cardNodes.delete(key); }
      }
      for (const term of state.terms) {
        const key = wordKey(term.lemma || term.term);
        if (cardNodes.has(key)) continue;
        const card = el('article', 'card');
        card.dataset.delaySeconds = String(term.delaySeconds ?? '');
        const row = el('div', 'wordrow');
        row.append(el('span', 'word', term.term), el('span', 'level', `${term.level} ${term.kind === 'slang' ? '俚语' : term.kind === 'phrase' ? '短语' : '词语'}`));
        card.append(row, el('small', 'context-label', '这句话里'), el('p', 'meaning', term.meaning), el('p', 'note', term.note), el('div', 'quote', term.quote));
        if (term.example) {
          const details = el('details');
          details.append(el('summary', '', '再看一个例句'), el('p', '', term.example), el('p', '', term.example_zh));
          card.append(details);
        }
        const actions = el('div', 'cardfoot');
        actions.append(button('time', `↺ ${formatTime(term.start)} 重听`, () => onSeek(term.start)),
          button('known', '✓ 已掌握', () => onKnown(wordKey(term.lemma || term.term))));
        card.append(actions); cards.append(card); cardNodes.set(key, card);
      }
    }
  };
}
