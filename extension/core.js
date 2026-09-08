export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const MODEL = 'gpt-5.6-luna';
export const PROMPT_VERSION = 3;
export const HOST_NAME = 'com.local.youtube_luna';
export const DEFAULT_SETTINGS = { level: 'B1', known: [] };

export function cleanText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function wordKey(text) {
  return cleanText(text).toLowerCase().replace(/[’‘]/g, "'");
}

export function normalizeCues(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  const seen = new Set();
  for (const cue of input.slice(0, 12000)) {
    const start = Number(cue.start);
    const text = cleanText(cue.text).slice(0, 1500);
    if (!Number.isFinite(start) || start < 0 || !text) continue;
    const key = `${start.toFixed(2)}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const end = Number(cue.end);
    result.push({ id: String(cue.id ?? result.length).slice(0, 80), start,
      end: Number.isFinite(end) && end > start ? Math.min(end, start + 120) : start + 3, text });
  }
  return result.sort((a, b) => a.start - b.start);
}

// Captions often replace "I take it" with "I take it for granted" in place.
// Keep the completed phrase and its original start, without resending every revision.
export class LiveCaptions {
  constructor() { this.cues = []; this.sequence = 0; }
  add(text, time) {
    text = cleanText(text);
    if (!text || !Number.isFinite(time)) return false;
    const previous = this.cues.at(-1);
    if (previous && time >= previous.start && time - previous.end < 2) {
      if (previous.text === text || previous.text.startsWith(text)) {
        previous.end = time + 0.5;
        return false;
      }
      if (text.startsWith(previous.text)) {
        previous.text = text;
        previous.end = time + 0.5;
        return true;
      }
    }
    this.cues.push({ id: `live-${this.sequence++}`, start: time, end: time + 0.5, text });
    return true;
  }
}

export function transcriptBatch(cues, time, completed, lookahead = 40) {
  const first = Math.floor(Math.max(0, time) / 20);
  for (let bucket = first; bucket <= Math.floor((time + lookahead) / 20); bucket++) {
    const key = `track-${bucket}`;
    if (completed.has(key)) continue;
    const from = bucket * 20;
    const targets = cues.filter(c => c.start >= from && c.start < from + 20).slice(0, 35);
    if (!targets.length) { completed.add(key); continue; }
    return { key, cues: targets,
      context: cues.filter(c => c.start >= from - 6 && c.start < from).slice(-4) };
  }
  return null;
}

export function liveBatch(cues, time, done, settled) {
  const pending = cues.filter(c => c.start <= time + 0.5 &&
    !done.has(`${c.id}:${c.text}`) && (c !== cues.at(-1) || settled));
  if (!pending.length) return null;
  // Freeze the submitted revision: rolling captions can still extend the source cue.
  return { cues: pending.slice(0, 4).map(c => ({ ...c })),
    context: cues.filter(c => c.start < pending[0].start).slice(-3).map(c => ({ ...c })), key: null };
}

export function visibleTerms(terms, level, known, time) {
  const learned = new Set(known.map(wordKey));
  const seen = new Set();
  return terms.filter(term => term.start <= time + 0.5)
    .filter(term => {
      const key = wordKey(term.lemma || term.term);
      if (LEVELS.indexOf(term.level) <= LEVELS.indexOf(level) || learned.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Join subtitle fragments into sentences; unpunctuated ASR text falls back to
// short speech groups instead of treating an entire video as one sentence.
export function nearbySentences(cues, time) {
  const sentences = [];
  let current = null;
  const flush = () => {
    if (current) sentences.push({ ...current, id: `pause-${sentences.length}-${current.start}` });
    current = null;
  };
  for (const cue of cues) {
    if (current && (cue.start - current.end > 2 || cue.start - current.start >= 12 || current.text.length + cue.text.length > 800)) flush();
    const parts = cue.text.match(/[^.!?]+(?:[.!?]+["'”’]?|$)/g) || [cue.text];
    for (const part of parts) {
      const text = cleanText(part);
      if (!text) continue;
      if (!current) current = { start: cue.start, end: cue.end, text };
      else { current.text += ` ${text}`; current.end = Math.max(current.end, cue.end); }
      if (/[.!?]["'”’]?$/.test(text)) flush();
    }
  }
  flush();
  if (!sentences.length) return [];
  let index = sentences.findIndex(c => c.end > time);
  if (index < 0) index = sentences.length - 1;
  const from = Math.max(0, Math.min(index - 1, sentences.length - 3));
  return sentences.slice(from, from + 3);
}

export function pauseTerms(terms, cues) {
  const seen = new Set();
  return terms.filter(term => cues.some(cue => term.start <= cue.end && (term.end ?? term.start) >= cue.start &&
    wordKey(cue.text).includes(wordKey(term.term))))
    .filter(term => {
      const key = wordKey(term.lemma || term.term);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
}

export function validateRequest(value) {
  if (!value || !/^[\w-]{1,80}$/.test(value.videoId ?? '')) throw new Error('视频标识无效。');
  if (!Array.isArray(value.cues) || !value.cues.length || value.cues.length > 40) throw new Error('字幕数量无效。');
  const cues = normalizeCues(value.cues);
  const context = normalizeCues(value.context ?? []).slice(-4);
  if (cues.length !== value.cues.length || new Set(cues.map(c => c.id)).size !== cues.length) throw new Error('字幕内容或编号无效。');
  if (JSON.stringify({ cues, context }).length > 16000) throw new Error('这一段字幕过长，请缩短后重试。');
  return { videoId: value.videoId, cues, context, mode: value.mode === 'pause' ? 'pause' : 'play' };
}

export function validateResult(value, cues) {
  if (!value || !Array.isArray(value.terms)) throw new Error('Codex 返回格式不正确，请重试。');
  const byId = new Map(cues.map(c => [c.id, c]));
  const terms = [];
  for (const term of value.terms.slice(0, 40)) {
    const cue = byId.get(String(term.cue_id));
    if (!cue || !LEVELS.includes(term.level) || !['word', 'phrase', 'slang'].includes(term.kind)) continue;
    const text = cleanText(term.term).slice(0, 120);
    // Accept only expressions present in the submitted cue, not invented vocabulary.
    if (!text || !wordKey(cue.text).includes(wordKey(text)) || !cleanText(term.meaning)) continue;
    terms.push({ term: text, lemma: cleanText(term.lemma || text).slice(0, 120), level: term.level,
      kind: term.kind, meaning: cleanText(term.meaning).slice(0, 300),
      note: cleanText(term.note).slice(0, 400),
      words: (Array.isArray(term.words) ? term.words : []).slice(0, 4)
        .filter(word => word && cleanText(word.word) && cleanText(word.meaning) &&
          wordKey(text).split(/[^a-z'-]+/).includes(wordKey(word.word)))
        .map(word => ({ word: cleanText(word.word).slice(0, 60), meaning: cleanText(word.meaning).slice(0, 120) })),
      example: cleanText(term.example).slice(0, 300),
      example_zh: cleanText(term.example_zh).slice(0, 300),
      cue_id: cue.id, quote: cue.text, start: cue.start, end: cue.end });
  }
  if (value.terms.length && !terms.length) throw new Error('返回的词语未能对应原字幕，请重试。');
  return { terms };
}

export function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
