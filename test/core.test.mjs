import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveCaptions, liveBatch, normalizeCues, transcriptBatch, visibleTerms, validateResult, validateRequest } from '../extension/core.js';

test('滚动字幕保留完整短语和起始时间，相邻重复不新增', () => {
  const live = new LiveCaptions();
  live.add('I take it', 1); live.add('I take it for granted', 1.5); live.add('I take it for granted', 2);
  assert.equal(live.cues.length, 1); assert.equal(live.cues[0].start, 1);
  assert.equal(live.cues[0].text, 'I take it for granted');
  live.add('Here is why.', 3);
  assert.equal(live.cues.length, 2);
  live.add('I take it for granted', 80);
  assert.equal(live.cues.length, 3, '不同播放位置的重复句应可分析');
});

test('跳转后优先处理当前位置，并保留前句作为语境', () => {
  const cues = normalizeCues([{ id: 'a', start: 1, text: 'first' }, { id: 'b', start: 57, text: 'context' }, { id: 'c', start: 62, text: 'target' }]);
  const done = new Set(['track-0']);
  const batch = transcriptBatch(cues, 63, done);
  assert.equal(batch.key, 'track-3'); assert.equal(batch.cues[0].text, 'target');
  assert.equal(batch.context[0].text, 'context');
  done.add(batch.key); assert.equal(transcriptBatch(cues, 63, done), null);
});

test('等级严格高于设定值；短语、已掌握、未来结果正确筛选，旧词保留', () => {
  const terms = [
    { term: 'take for granted', level: 'B2', kind: 'phrase', start: 10 },
    { term: 'easy', level: 'B1', start: 10 },
    { term: 'compelling', level: 'C1', start: 11 },
    { term: 'future', level: 'C2', start: 90 },
    { term: 'old', level: 'C2', start: 0 }
  ];
  assert.deepEqual(visibleTerms(terms, 'B1', ['COMPELLING'], 60).map(t => t.term), ['take for granted', 'old']);
  assert.equal(visibleTerms(terms, 'C2', [], 60).length, 0);
  assert.equal(visibleTerms(terms, 'A2', [], 12).length, 4);
});

test('模型结果必须对应真实字幕中的表达，保留中文解释', () => {
  const cues = [{ id: '1', start: 2, end: 5, text: 'We take it for granted.' }];
  const result = validateResult({ terms: [
    { cue_id: '1', term: 'take it for granted', kind: 'phrase', level: 'B2', meaning: '认为理所当然' },
    { cue_id: '1', term: 'invented', kind: 'word', level: 'C1', meaning: '伪造词' },
    { cue_id: 'missing', term: 'take', kind: 'word', level: 'A2', meaning: '拿' }
  ] }, cues);
  assert.equal(result.terms.length, 1); assert.equal(result.terms[0].start, 2);
  assert.equal(result.terms[0].meaning, '认为理所当然');
  assert.throws(() => validateResult({ text: 'wrong format' }, cues));
  assert.deepEqual(validateResult({ terms: [] }, cues), { terms: [] });
});

test('字幕请求拒绝无效时间、重复编号和过大的内容', () => {
  assert.throws(() => validateRequest({ videoId: '../bad', cues: [] }));
  assert.throws(() => validateRequest({ videoId: 'valid', cues: [{ id: '1', start: -1, text: 'bad' }] }));
  assert.throws(() => validateRequest({ videoId: 'valid', cues: [{ id: '1', start: 1, text: 'one' }, { id: '1', start: 2, text: 'two' }] }));
});


test('慢回复期间字幕扩写：只标记已发送版本，新版仍排队', () => {
  const live = new LiveCaptions();
  const done = new Set();
  live.add('We take it', 1);
  const sent = liveBatch(live.cues, 2, done, true);
  live.add('We take it for granted.', 2);
  live.add('The next sentence.', 3);
  assert.equal(sent.cues[0].text, 'We take it');
  for (const cue of sent.cues) done.add(`${cue.id}:${cue.text}`);
  const next = liveBatch(live.cues, 95, done, true);
  assert.deepEqual(next.cues.map(c => c.text), ['We take it for granted.', 'The next sentence.']);
});

test('快速字幕积压超过 50 秒和 500 条后仍逐批处理', () => {
  const live = new LiveCaptions();
  const done = new Set();
  for (let i = 0; i < 510; i++) live.add(`Sentence ${i}.`, i);
  let total = 0, batch;
  while ((batch = liveBatch(live.cues, 600, done, true))) {
    assert.ok(batch.cues.length <= 12);
    total += batch.cues.length;
    for (const cue of batch.cues) done.add(`${cue.id}:${cue.text}`);
  }
  assert.equal(total, 510);
});

test('延迟回复的讲解不会过期，第七个新词不会挤掉前面的待学习词', () => {
  const terms = Array.from({length: 8}, (_, i) => ({term: `word${i}`, level: 'C2', start: i}));
  assert.deepEqual(visibleTerms(terms, 'B1', [], 120), terms);
  assert.equal(visibleTerms(terms, 'B1', ['word0'], 120).length, 7);
});
