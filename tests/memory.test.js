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

const { MemoryStore, tokenize, validateMemoryImportPayload } = await import('../web/src/core/memory.js');

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

test('logTurn preserves all old history after passing the former 800-entry limit', () => {
  const oldLog = Array.from({ length: 800 }, (_, i) => ({ role: 'user', text: `old ${i}`, ts: i + 1 }));
  localStorage.setItem('no7.memory.v2', JSON.stringify({ version: 2, facts: [], log: oldLog, meta: {} }));
  const mem = new MemoryStore();
  mem.logTurn('assistant', 'new message');
  assert.equal(mem.log.length, 801);
  assert.equal(mem.log[0].text, 'old 0');
  assert.equal(mem.exportData().log.length, 801);
  assert.equal(JSON.parse(localStorage.getItem('no7.memory.v2')).log.length, 801);
});

test('adding facts past the former 3000-entry limit never prunes existing memories', () => {
  const facts = Array.from({ length: 3000 }, (_, i) => ({ id: `old-${i}`, text: `old fact ${i}`, tokens: [], importance: 1, ts: i + 1 }));
  localStorage.setItem('no7.memory.v2', JSON.stringify({ version: 2, facts, log: [], meta: {} }));
  const mem = new MemoryStore();
  const added = mem.addFact('new fact beyond old limit');
  assert.ok(added);
  assert.equal(mem.facts.length, 3001);
  assert.equal(mem.facts[0].text, 'old fact 0');
  assert.equal(JSON.parse(localStorage.getItem('no7.memory.v2')).facts.length, 3001);
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

test('memory import validator accepts current/legacy collections and rejects unsupported schemas', () => {
  assert.equal(validateMemoryImportPayload({ kind: 'no7-memory', version: 2, facts: [], log: [] }).valid, true);
  assert.equal(validateMemoryImportPayload({ facts: [{ text: 'legacy export' }] }).valid, true);
  assert.equal(validateMemoryImportPayload({ log: [] }).valid, true);
  for (const invalid of [
    null,
    [],
    {},
    { kind: 'no7-backup', version: 2, facts: [], log: [] },
    { kind: 'no7-memory', version: 3, facts: [], log: [] },
    { kind: 'no7-memory', version: 0, facts: [] },
    { kind: 'no7-memory', facts: 'not an array' },
    { facts: [], log: {} },
  ]) assert.equal(validateMemoryImportPayload(invalid).valid, false, JSON.stringify(invalid));
});

test('import merges duplicates instead of doubling', () => {
  const mem = fresh();
  mem.addFact('ผู้ใช้อยู่กรุงเทพ', 2);
  const res = mem.importData({ facts: [{ text: 'ผู้ใช้อยู่กรุงเทพ', importance: 5 }] });
  assert.equal(res.merged, 1);
  assert.equal(mem.listFacts().length, 1);
  assert.equal(mem.listFacts()[0].importance, 5);
});

test('planImport previews fact/log outcomes without mutating memory or storage until applied', () => {
  const mem = fresh();
  const original = mem.addFact('alpha beta gamma', { importance: 2 });
  mem.logTurn('user', 'already stored');
  const before = localStorage.getItem('no7.memory.v2');
  const existingLog = mem.log[0];
  const plan = mem.planImport({
    facts: [
      { text: 'alpha beta gamma', importance: 5, pinned: true },
      { text: 'alpha beta gamma delta', importance: 4 },
      { text: 'brand new fact', importance: 3 },
      { text: '   ' },
    ],
    log: [
      { ...existingLog },
      { role: 'assistant', text: 'new conversation', ts: existingLog.ts + 1 },
      { role: 'tool', text: 'invalid role', ts: existingLog.ts + 2 },
    ],
  });
  assert.deepEqual(plan.result, { added: 1, merged: 2, skipped: 1, logAdded: 1, logSkipped: 2 });
  assert.equal(localStorage.getItem('no7.memory.v2'), before);
  assert.equal(mem.facts.length, 1);
  assert.equal(mem.getFact(original.id).importance, 2);
  assert.equal(mem.getFact(original.id).pinned, false);
  assert.equal(mem.log.length, 1);

  assert.deepEqual(mem.applyImportPlan(plan), plan.result);
  assert.equal(mem.facts.length, 2);
  assert.equal(mem.getFact(original.id).importance, 5);
  assert.equal(mem.getFact(original.id).pinned, true);
  assert.equal(mem.log.length, 2);
  assert.equal(mem.log.at(-1).text, 'new conversation');
  assert.equal(mem.applyImportPlan(plan), null, 'the same preview cannot be applied twice');
});

test('import plans are private to their store and reject stale state without overwriting it', () => {
  const mem = fresh();
  const plan = mem.planImport({ facts: [{ text: 'planned import' }] });
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.result));
  assert.equal(mem.applyImportPlan({ result: plan.result }), null, 'a lookalike object is not an issued plan');
  const otherStore = new MemoryStore();
  assert.equal(otherStore.applyImportPlan(plan), null, 'plans cannot move between stores');

  mem.logTurn('assistant', 'concurrent local write');
  const afterConcurrentWrite = localStorage.getItem('no7.memory.v2');
  assert.equal(mem.applyImportPlan(plan), null);
  assert.equal(localStorage.getItem('no7.memory.v2'), afterConcurrentWrite, 'stale plan does not write storage');
  assert.equal(mem.facts.some((fact) => fact.text === 'planned import'), false);
  assert.equal(mem.log.at(-1).text, 'concurrent local write');
});

test('failed replace import leaves memory/storage/legacy backups intact and the plan can retry', () => {
  const mem = fresh();
  mem.addFact('existing saved fact');
  mem.logTurn('user', 'existing saved conversation');
  localStorage.setItem('no7.memory.facts.v1', JSON.stringify([{ text: 'legacy fact backup' }]));
  localStorage.setItem('no7.memory.log.v1', JSON.stringify([{ text: 'legacy log backup' }]));
  const beforeStorage = localStorage.getItem('no7.memory.v2');
  const beforeFacts = JSON.stringify(mem.facts);
  const beforeLog = JSON.stringify(mem.log);
  const plan = mem.planImport({ facts: [{ text: 'replacement fact' }], log: [] }, { merge: false });
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === 'no7.memory.v2') throw new Error('QuotaExceededError');
    originalSetItem(key, value);
  };
  try {
    assert.throws(() => mem.applyImportPlan(plan), { code: 'MEMORY_STORAGE_WRITE_FAILED' });
  } finally {
    localStorage.setItem = originalSetItem;
  }
  assert.equal(localStorage.getItem('no7.memory.v2'), beforeStorage);
  assert.equal(localStorage.getItem('no7.memory.facts.v1'), JSON.stringify([{ text: 'legacy fact backup' }]));
  assert.equal(localStorage.getItem('no7.memory.log.v1'), JSON.stringify([{ text: 'legacy log backup' }]));
  assert.equal(JSON.stringify(mem.facts), beforeFacts);
  assert.equal(JSON.stringify(mem.log), beforeLog);

  assert.equal(mem.applyImportPlan(plan).added, 1, 'a failed write leaves the current plan retryable');
  assert.deepEqual(mem.facts.map((fact) => fact.text), ['replacement fact']);
  assert.equal(localStorage.getItem('no7.memory.facts.v1'), null);
  assert.equal(localStorage.getItem('no7.memory.log.v1'), null);
});

test('malformed-only import plans contain no applicable records and remain read-only', () => {
  const mem = fresh();
  mem.addFact('preserved existing fact');
  const before = localStorage.getItem('no7.memory.v2');
  const plan = mem.planImport({
    facts: [{ text: '  ' }],
    log: [{ role: 'tool', text: 'not an importable turn', ts: 10 }],
  });
  assert.deepEqual(plan.result, { added: 0, merged: 0, skipped: 1, logAdded: 0, logSkipped: 1 });
  assert.equal(localStorage.getItem('no7.memory.v2'), before);
  assert.deepEqual(mem.facts.map((fact) => fact.text), ['preserved existing fact']);
  assert.equal(mem.log.length, 0);
});

test('replace import plans stay read-only until explicitly applied', () => {
  const mem = fresh();
  mem.addFact('keep me until replacement is confirmed');
  const before = localStorage.getItem('no7.memory.v2');
  const plan = mem.planImport({ facts: [{ text: 'replacement fact' }], log: [] }, { merge: false });
  assert.deepEqual(plan.result, { added: 1, merged: 0, skipped: 0, logAdded: 0, logSkipped: 0 });
  assert.equal(localStorage.getItem('no7.memory.v2'), before);
  assert.equal(mem.facts.length, 1);
  assert.equal(mem.facts[0].text, 'keep me until replacement is confirmed');
  mem.applyImportPlan(plan);
  assert.deepEqual(mem.facts.map((fact) => fact.text), ['replacement fact']);
});

test('importData merges sanitized chat log by role, timestamp and full text without trimming old history', () => {
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
  assert.equal(mem.recentLog(1000).length, 812);
  assert.equal(mem.recentLog(1)[0].text, 'line 809');
  assert.equal(mem.recentLog(1000)[0].text, 'restored question');
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
