import test from 'node:test';
import assert from 'node:assert/strict';
import { SentenceSplitter, SpeechQueue, withCursor } from '../web/src/core/stream.js';

test('splitter emits sentences on Thai/English enders', () => {
  const sp = new SentenceSplitter();
  const out = [...sp.push('สวัสดีครับ'), ...sp.push('. วันนี้อากาศดีมาก'), ...sp.push('! '), ...sp.push('จบแล้ว')];
  assert.deepEqual(out, ['สวัสดีครับ.', 'วันนี้อากาศดีมาก!']);
  assert.deepEqual(sp.flush(), ['จบแล้ว']);
});

test('splitter keeps incomplete tail buffered', () => {
  const sp = new SentenceSplitter();
  assert.deepEqual(sp.push('กำลังคิด'), []);
  assert.deepEqual(sp.flush(), ['กำลังคิด']);
});

test('splitter breaks very long Thai text without punctuation', () => {
  const sp = new SentenceSplitter({ maxLen: 40 });
  const long = 'ก'.repeat(100);
  const out = sp.push(long);
  assert.ok(out.length >= 2, `got ${out.length}`);
  for (const s of out) assert.ok(s.length <= 45);
});

test('splitter ignores tiny fragments', () => {
  const sp = new SentenceSplitter({ minLen: 10 });
  assert.deepEqual(sp.push('อ่า. '), []);
});

const waitFor = async (cond, ms = 1500) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
  return true;
};

test('speech queue speaks sentences in order', async () => {
  const spoken = [];
  const voice = { speak: async (t) => { spoken.push(t); await new Promise((r) => setTimeout(r, 5)); }, stopSpeaking() {} };
  const q = new SpeechQueue(voice);
  q.enqueue(['หนึ่ง', 'สอง']);
  q.enqueue('สาม');
  await waitFor(() => spoken.length === 3);
  assert.deepEqual(spoken, ['หนึ่ง', 'สอง', 'สาม']);
});

test('speech queue stop clears pending sentences', async () => {
  const spoken = [];
  const voice = { speak: async (t) => { spoken.push(t); await new Promise((r) => setTimeout(r, 20)); }, stopSpeaking() {} };
  const q = new SpeechQueue(voice);
  q.enqueue(['หนึ่ง', 'สอง', 'สาม']);
  await waitFor(() => spoken.length === 1);
  q.stop();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(spoken, ['หนึ่ง']);
});

test('withCursor adds and removes the caret', () => {
  assert.equal(withCursor('abc'), 'abc▍');
  assert.equal(withCursor('abc', false), 'abc');
  assert.equal(withCursor(''), '▍');
});
