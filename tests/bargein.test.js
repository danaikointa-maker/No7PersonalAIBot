import test from 'node:test';
import assert from 'node:assert/strict';

const instances = [];
class FakeSR {
  constructor() { this.started = false; this.aborted = false; instances.push(this); }
  start() { this.started = true; }
  abort() { this.aborted = true; this.onend?.(); }
  emit(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
}
const win = { SpeechRecognition: FakeSR };

const { BargeIn, isEcho, normalizeSpeech, BARGE_MODES } = await import('../web/src/core/bargein.js');

test('normalizeSpeech strips tone marks and punctuation', () => {
  assert.equal(normalizeSpeech('หยุด!!! ก่อนนะ'), 'หยุดกอนนะ');
  assert.equal(normalizeSpeech('น้ำ ไข่'), 'นำไข');
  assert.equal(normalizeSpeech('Stop, now.'), 'stopnow');
});

test('isEcho detects the assistant quoting its own words', () => {
  assert.equal(isEcho('วันนี้อากาศดีมาก', 'วันนี้อากาศดีมากครับ'), true);
  assert.equal(isEcho('หยุดเดี๋ยว', 'วันนี้อากาศดีมากครับ'), false);
  assert.equal(isEcho('', 'อะไรก็ได้'), false);
});

test('keyword mode interrupts only on stop words', () => {
  const hits = [];
  const b = new BargeIn({ mode: 'keyword', windowRef: win, onInterrupt: (h) => hits.push(h) });
  b.start();
  const rec = instances.at(-1);
  rec.emit('วันนี้อากาศดีมาก');
  assert.equal(hits.length, 0);
  rec.emit('หยุดก่อน');
  assert.equal(hits.length, 1);
  b.stop();
});

test('any mode interrupts on any speech', () => {
  const hits = [];
  const b = new BargeIn({ mode: 'any', windowRef: win, onInterrupt: (h) => hits.push(h) });
  b.start();
  instances.at(-1).emit('เอ่อ คือว่า');
  assert.equal(hits.length, 1);
  b.stop();
});

test('echo of the spoken sentence is ignored even in any mode', () => {
  const hits = [];
  const b = new BargeIn({ mode: 'any', windowRef: win, onInterrupt: (h) => hits.push(h) });
  b.setSpoken('พรุ่งนี้อากาศจะร้อนมาก');
  b.start();
  instances.at(-1).emit('พรุ่งนี้อากาศจะร้อนมาก');
  assert.equal(hits.length, 0);
  b.stop();
});

test('off mode never starts', () => {
  const b = new BargeIn({ mode: 'off', windowRef: win });
  assert.equal(b.start(), false);
  assert.equal(b.active, false);
});

test('stop aborts the recognizer and state is reported', () => {
  const states = [];
  const b = new BargeIn({ mode: 'any', windowRef: win, onState: (s) => states.push(s) });
  b.start();
  const rec = instances.at(-1);
  b.stop();
  assert.equal(rec.aborted, true);
  assert.deepEqual(states, ['listening', 'off']);
});

test('unsupported environment returns false from start', () => {
  const b = new BargeIn({ mode: 'any', windowRef: {} });
  assert.equal(b.supported, false);
  assert.equal(b.start(), false);
});

test('BARGE_MODES exposes three options', () => {
  assert.deepEqual(Object.keys(BARGE_MODES), ['off', 'keyword', 'any']);
});
