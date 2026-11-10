import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();

const { MemoryStore } = await import('../web/src/core/memory.js');
const { extractFromLog, mergeDuplicates, extractWithLLM, consolidate, shouldConsolidate } = await import('../web/src/core/consolidate.js');

const fresh = () => { globalThis.localStorage.clear(); return new MemoryStore(); };
const userTurn = (text, ts = Date.now()) => ({ role: 'user', text, ts });

test('extractFromLog picks name, preferences, location, routine', () => {
  const facts = extractFromLog([
    userTurn('สวัสดี ฉันชื่อต้า'),
    userTurn('ฉันชอบกาแฟดำมาก'),
    userTurn('ฉันอาศัยอยู่ที่เชียงใหม่'),
    userTurn('ทุกวันฉันวิ่งตอนเช้า'),
    userTurn('วันนี้อากาศเป็นไง'),   // ต้องไม่ถูกสกัด
  ]);
  const texts = facts.map((f) => f.text);
  assert.ok(texts.some((t) => t.includes('ชื่อผู้ใช้คือ ต้า')));
  assert.ok(texts.some((t) => t.includes('กาแฟดำ')));
  assert.ok(texts.some((t) => t.includes('เชียงใหม่')));
  assert.ok(texts.some((t) => t.includes('กิจวัตร')));
  assert.equal(texts.length, 4);
});

test('extractFromLog ignores assistant turns', () => {
  const facts = extractFromLog([{ role: 'assistant', text: 'ฉันชื่อ No7', ts: Date.now() }]);
  assert.equal(facts.length, 0);
});

test('mergeDuplicates collapses near-identical facts and keeps the richer text', () => {
  const mem = fresh();
  mem.facts.push(
    { id: 'a', text: 'ผู้ใช้ชอบกาแฟดำ', tokens: ['กาแฟ'], importance: 2, ts: Date.now(), pinned: false, used: 0 },
    { id: 'b', text: 'ผู้ใช้ชอบกาแฟดำมาก', tokens: ['กาแฟ'], importance: 3, ts: Date.now(), pinned: false, used: 0 },
  );
  const merged = mergeDuplicates(mem);
  assert.equal(merged, 1);
  assert.equal(mem.facts.length, 1);
  assert.equal(mem.facts[0].importance, 3);
});

test('extractWithLLM parses a JSON array and ignores prose', async () => {
  const chat = async () => 'นี่คือผลลัพธ์:\n["ผู้ใช้ชื่อต้า", "ผู้ใช้ทำงานเป็นวิศวกร", "ไม่เกี่ยวข้อง"]';
  const facts = await extractWithLLM(chat, [userTurn('คุยเล่น')], []);
  assert.equal(facts.length, 3);
  assert.equal(facts[0].text, 'ผู้ใช้ชื่อต้า');
});

test('extractWithLLM returns [] on malformed reply', async () => {
  const facts = await extractWithLLM(async () => 'ขอโทษ ผมตอบไม่ได้', [], []);
  assert.deepEqual(facts, []);
});

test('consolidate: heuristic extracts facts from new turns and marks the run', async () => {
  const mem = fresh();
  mem.logTurn('user', 'ฉันชื่อต้า');
  mem.logTurn('user', 'ฉันชอบกาแฟดำ');
  const res = await consolidate(mem, { now: 1000 });
  assert.ok(res.extracted >= 1);
  assert.equal(res.usedLLM, false);
  assert.equal(mem.meta.lastConsolidated, 1000);
  assert.ok(mem.listFacts().some((f) => f.text.includes('ต้า')));
});

test('consolidate: only looks at turns newer than the last run', async () => {
  const mem = fresh();
  mem.markConsolidated(Date.now() - 1000);
  mem.log.push(userTurn('ฉันชื่อเก่า', Date.now() - 5000));   // เก่ากว่า last run
  mem.logTurn('user', 'ฉันชอบชาเขียว');
  const res = await consolidate(mem);
  const texts = mem.listFacts().map((f) => f.text).join(' ');
  assert.ok(texts.includes('ชาเขียว'));
  assert.ok(!texts.includes('เก่า'));
  assert.ok(res.extracted >= 1);
});

test('consolidate: LLM pass adds facts when enabled', async () => {
  const mem = fresh();
  mem.logTurn('user', 'ฉันทำงานเป็นวิศวกรที่บริษัทใหญ่');
  const res = await consolidate(mem, {
    useLLM: true,
    chat: async () => '["ผู้ใช้ทำงานเป็นวิศวกร"]',
  });
  assert.equal(res.usedLLM, true);
  assert.ok(mem.listFacts().some((f) => f.text.includes('วิศวกร')));
});

test('consolidate: skips when there is nothing new (unless forced)', async () => {
  const mem = fresh();
  mem.markConsolidated(Date.now());
  const skipped = await consolidate(mem);
  assert.equal(skipped.skipped, true);
  const forced = await consolidate(mem, { force: true });
  assert.equal(forced.skipped, false);
});

test('consolidate decays stale facts as part of the run', async () => {
  const mem = fresh();
  const old = mem.addFact('ผู้ใช้เคยชอบฟุตบอล', 3);
  old.ts = Date.now() - 120 * 24 * 60 * 60 * 1000;
  mem.logTurn('user', 'ฉันชื่อต้า');
  const res = await consolidate(mem, { force: true });
  assert.ok(res.decayed >= 1);
  assert.equal(mem.getFact(old.id).importance, 2);
});

test('shouldConsolidate needs both enough new turns and elapsed time', () => {
  const mem = fresh();
  mem.markConsolidated(Date.now());
  for (let i = 0; i < 8; i++) mem.logTurn('user', `ข้อความ ${i}`);
  assert.equal(shouldConsolidate(mem), false, 'ยังไม่ครบ 24 ชม.');
  mem.meta.lastConsolidated = Date.now() - 25 * 60 * 60 * 1000;
  assert.equal(shouldConsolidate(mem), true);
});
