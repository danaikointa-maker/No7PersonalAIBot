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
  const mem = new MemoryStore();
  mem.addFact('โปรดจำว่าต้องจ่ายค่าไฟ');
  mem.addFact('โปรดจำว่าต้องจ่ายค่าไฟ', 5); // merges, raises importance
  assert.equal(mem.listFacts()[0].importance, 5);
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
