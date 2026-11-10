import test from 'node:test';
import assert from 'node:assert/strict';

// fake SpeechRecognition on a fake window
const instances = [];
class FakeSR {
  constructor() { this.started = false; this.aborted = false; instances.push(this); }
  start() { this.started = true; }
  abort() { this.aborted = true; this.onend?.(); }
  emit(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
}
globalThis.window = { SpeechRecognition: FakeSR };

const { WakeWord } = await import('../web/src/core/wake.js');

test('wake word detects Thai and English variants', () => {
  for (const phrase of ['โน เซเว่น เปิดไฟ', 'นัมเบอร์เซเวน', 'hey no7', 'NO SEVEN']) {
    const woken = [];
    const w = new WakeWord({ onWake: () => woken.push(1) });
    assert.equal(w.supported, true);
    w.start();
    instances.at(-1).emit(phrase);
    assert.equal(woken.length, 1, `ไม่ตรวจพบ: ${phrase}`);
    w.stop();
  }
});

test('unrelated speech does not trigger', () => {
  const woken = [];
  const w = new WakeWord({ onWake: () => woken.push(1) });
  w.start();
  instances.at(-1).emit('วันนี้อากาศเป็นอย่างไร');
  assert.equal(woken.length, 0);
  w.stop();
});

test('cooldown prevents double triggers', () => {
  const woken = [];
  const w = new WakeWord({ onWake: () => woken.push(1) });
  w.start();
  const rec = instances.at(-1);
  rec.emit('โน เซเว่น');
  rec.emit('โน เซเว่น');
  assert.equal(woken.length, 1);
  w.stop();
});

test('pause aborts the recognizer and stops firing', () => {
  const woken = [];
  const w = new WakeWord({ onWake: () => woken.push(1) });
  w.start();
  const rec = instances.at(-1);
  w.pause();
  assert.equal(rec.aborted, true);
  rec.emit('โน เซเว่น');
  assert.equal(woken.length, 0);
  assert.equal(w.paused, true);
  w.stop();
});

test('resume creates a fresh recognizer', () => {
  const w = new WakeWord({});
  w.start();
  const first = instances.at(-1);
  w.pause();
  const before = instances.length;
  w.resume();
  assert.ok(instances.length > before);
  assert.notEqual(instances.at(-1), first);
  w.stop();
});

test('state reporting follows start/pause/stop', () => {
  const states = [];
  const w = new WakeWord({ onState: (s) => states.push(s) });
  w.start();
  w.pause();
  w.resume();
  w.stop();
  assert.deepEqual(states, ['listening', 'paused', 'listening', 'off']);
});

test('unsupported environment reports supported=false', () => {
  globalThis.window = {};
  const w = new WakeWord({});
  assert.equal(w.supported, false);
  globalThis.window = { SpeechRecognition: FakeSR };
});
