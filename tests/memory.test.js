import test from 'node:test';
import assert from 'node:assert/strict';

// Memory runs in the browser (localStorage). Provide a tiny shim for node tests.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
})();

const { MemoryStore, tokenize } = await import('../web/src/core/memory.js');

test('tokenize produces Thai bigrams and english words', () => {
  const t = tokenize('ฉันชอบกาแฟดำ dark coffee');
  assert.ok(t.includes('ฉั'));
  assert.ok(t.includes('dark'));
  assert.ok(t.includes('coffee'));
});

test('addFact merges near-duplicates', () => {
  const mem = new MemoryStore();
  mem.addFact('ผู้ใช้ชอบกาแฟดำ');
  mem.addFact('ผู้ใช้ชอบกาแฟดำ');
  assert.equal(mem.listFacts().length, 1);
});

test('BM25 search ranks the relevant fact first', () => {
  const mem = new MemoryStore();
  mem.addFact('ผู้ใช้ชอบกาแฟดำ');
  mem.addFact('ผู้ใช้อาศัยอยู่กรุงเทพ');
  mem.addFact('ผู้ใช้มีแมวชื่อมีโจ');
  const hits = mem.search('แมวของฉันชื่ออะไร');
  assert.ok(hits.length >= 1);
  assert.match(hits[0].text, /แมว/);
});

test('importance boosts ranking between otherwise equal matches', () => {
  localStorage.clear();
  const mem = new MemoryStore();
  mem.addFact('โปรดจำว่าต้องจ่ายค่าไฟ');
  mem.addFact('โปรดจำว่าต้องจ่ายค่าไฟ', 5); // merges, raises importance
  const merged = mem.listFacts().filter((f) => f.text.includes('ค่าไฟ'));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].importance, 5);
});

test('logTurn keeps episodic history', () => {
  const mem = new MemoryStore();
  mem.logTurn('user', 'สวัสดี');
  mem.logTurn('assistant', 'สวัสดีครับ');
  assert.equal(mem.recentLog().length, 2);
});

test('clearAll empties facts and log', () => {
  const mem = new MemoryStore();
  mem.addFact('x y z');
  mem.logTurn('user', 'hi');
  mem.clearAll();
  assert.equal(mem.listFacts().length, 0);
  assert.equal(mem.recentLog().length, 0);
});

/* ---------------- Memory 2.0 ---------------- */

const fresh = () => { globalThis.localStorage.clear(); return new MemoryStore(); };

test('pin keeps a fact on top regardless of recency', () => {
  const mem = fresh();
  mem.addFact('ผู้ใช้มีแมวชื่อมีโจ');
  const old = mem.addFact('ชื่อผู้ใช้คือ ต้า');
  mem.togglePin(old.id);
  assert.equal(mem.listFacts()[0].text, 'ชื่อผู้ใช้คือ ต้า');
  assert.equal(mem.stats().pinned, 1);
});

test('updateFact edits text and retokenizes', () => {
  const mem = fresh();
  const f = mem.addFact('ผู้ใช้ชอบกาแฟดำ');
  mem.updateFact(f.id, { text: 'ผู้ใช้ชอบชาเขียว', importance: 4 });
  const hit = mem.search('ชาเขียว');
  assert.equal(hit[0].text, 'ผู้ใช้ชอบชาเขียว');
  assert.equal(hit[0].importance, 4);
  assert.equal(mem.search('กาแฟ').length, 0);
});

test('decay lowers importance of stale unused facts only', () => {
  const mem = fresh();
  const stale = mem.addFact('ผู้ใช้เคยชอบฟุตบอล', 3);
  const pinned = mem.addFact('ชื่อผู้ใช้คือ ต้า', 3);
  mem.togglePin(pinned.id);
  stale.ts = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const changed = mem.decay();
  assert.equal(changed, 1);
  assert.equal(mem.getFact(stale.id).importance, 2);
  assert.equal(mem.getFact(pinned.id).importance, 3);
});

test('export → import round-trips facts', () => {
  const a = fresh();
  a.addFact('ผู้ใช้มีแมวชื่อมีโจ', 3);
  a.addFact('ผู้ใช้อยู่กรุงเทพ');
  const dump = a.exportData();
  localStorage.clear();
  const b = new MemoryStore();
  const res = b.importData(dump);
  assert.equal(res.added, 2);
  assert.equal(b.listFacts().length, 2);
  assert.ok(b.search('แมว').length > 0);
});

test('import merges duplicates instead of doubling', () => {
  const mem = fresh();
  mem.addFact('ผู้ใช้อยู่กรุงเทพ', 2);
  const res = mem.importData({ facts: [{ text: 'ผู้ใช้อยู่กรุงเทพ', importance: 5 }] });
  assert.equal(res.merged, 1);
  assert.equal(mem.listFacts().length, 1);
  assert.equal(mem.listFacts()[0].importance, 5);
});

test('importData merges sanitized chat log by role, timestamp and full text with a hard cap', () => {
  const mem = fresh();
  const entry = { role: 'user', text: 'restored question', ts: 1000, secret: 'strip' };
  const result = mem.importData({ log: [entry, { ...entry, role: 'tool' }, { role: 'assistant', text: 'answer', ts: 2000 }] });
  assert.equal(result.logAdded, 2);
  assert.equal(result.logSkipped, 1);
  assert.deepEqual(mem.recentLog(), [
    { role: 'user', text: 'restored question', ts: 1000 },
    { role: 'assistant', text: 'answer', ts: 2000 },
  ]);
  mem.importData({ log: [entry] });
  assert.equal(mem.recentLog().length, 2, 'same identity does not duplicate');
  const large = Array.from({ length: 810 }, (_, i) => ({ role: 'user', text: `line ${i}`, ts: 3000 + i }));
  mem.importData({ log: large });
  assert.equal(mem.recentLog(1000).length, 800);
  assert.equal(mem.recentLog(1)[0].text, 'line 809');
});

test('stats reports facts, pinned, log and average importance', () => {
  const mem = fresh();
  mem.addFact('a b c', 2);
  mem.addFact('d e f', 4);
  mem.logTurn('user', 'hi');
  const s = mem.stats();
  assert.equal(s.facts, 2);
  assert.equal(s.logTurns, 1);
  assert.equal(s.avgImportance, 3);
});

test('search increments usage counters', () => {
  const mem = fresh();
  const f = mem.addFact('ผู้ใช้ชอบกาแฟดำ');
  mem.search('กาแฟ');
  mem.search('กาแฟ');
  assert.equal(mem.getFact(f.id).used, 2);
});

test('restoreFacts restores exact metadata but skips records recreated after deletion', () => {
  const mem = fresh();
  const fact = mem.addFact('ผู้ใช้ชอบชามะลิ', { importance: 4, pinned: true });
  fact.used = 7;
  const snapshot = JSON.parse(JSON.stringify(fact));
  mem.removeFact(fact.id);
  assert.deepEqual(mem.restoreFacts([snapshot]), { restored: 1, skipped: 0 });
  assert.deepEqual(mem.getFact(fact.id), snapshot);
  mem.removeFact(fact.id);
  mem.addFact('ผู้ใช้ชอบชามะลิ', { importance: 2 });
  assert.deepEqual(mem.restoreFacts([snapshot]), { restored: 0, skipped: 1 });
  assert.equal(mem.listFacts().length, 1);
});
