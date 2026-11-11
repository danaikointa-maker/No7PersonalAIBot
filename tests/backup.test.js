// Backup & restore: create, redact, validate, migrate legacy, merge, plan
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKUP_APP, BACKUP_SCHEMA, COLLECTIONS, redactSettings, hasSecrets, createBackup,
  migrateBackup, validateBackup, summarizeBackup, mergeRecords, planRestore, describePlan,
} from '../web/src/core/backup.js';

const state = {
  settings: { language: 'th', apiKey: 'sk-secret', ttsApiKey: 'ek-1', syncToken: 'tok', mcpServers: [{ id: 'm', apiKey: 'mk' }] },
  facts: [{ id: 'f1', text: 'ชอบกาแฟ', ts: 1000 }],
  log: [{ role: 'user', text: 'สวัสดี', ts: 1000 }],
  notes: [{ text: 'ซื้อนม', ts: 2000 }],
  todos: [{ text: 'ส่งเมล', ts: 3000 }],
  tasks: [{ id: 't1', title: 'งาน', due: '2026-12-01T09:00:00', updatedAt: '2026-11-01T00:00:00' }],
  events: [{ uid: 'e1', title: 'นัด', start: 5000 }],
  personas: [{ id: 'p1', name: 'ของฉัน' }],
};

test('redactSettings removes every secret and keeps the rest', () => {
  const out = redactSettings(state.settings);
  assert.equal(out.apiKey, '');
  assert.equal(out.ttsApiKey, '');
  assert.equal(out.syncToken, '');
  assert.equal(out.mcpServers[0].apiKey, '');
  assert.equal(out.mcpServers[0].id, 'm');
  assert.equal(out.language, 'th');
  assert.equal(hasSecrets(state.settings), true);
  assert.equal(hasSecrets({ language: 'th', mcpServers: [] }), false);
});

test('createBackup produces a checksummed schema-2 payload without secrets', () => {
  const b = createBackup(state, { now: Date.parse('2026-11-10T00:00:00Z'), version: '2.2.0' });
  assert.equal(b.app, BACKUP_APP);
  assert.equal(b.schema, BACKUP_SCHEMA);
  assert.equal(b.createdAt, '2026-11-10T00:00:00.000Z');
  assert.equal(b.version, '2.2.0');
  assert.equal(b.includeSecrets, false);
  assert.equal(b.data.settings.apiKey, '');
  assert.ok(b.checksum);
  assert.deepEqual(b.counts, { facts: 1, log: 1, notes: 1, todos: 1, tasks: 1, events: 1, personas: 1 });
});

test('includeSecrets keeps keys but marks the file', () => {
  const b = createBackup(state, { includeSecrets: true });
  assert.equal(b.data.settings.apiKey, 'sk-secret');
  assert.equal(b.includeSecrets, true);
  const v = validateBackup(b);
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => /ความลับ/.test(w)));
});

test('log is capped at the newest 500 entries', () => {
  const big = Array.from({ length: 700 }, (_, i) => ({ role: 'user', text: `m${i}`, ts: i }));
  const b = createBackup({ log: big });
  assert.equal(b.data.log.length, 500);
  assert.equal(b.data.log.at(-1).text, 'm699');
});

test('validateBackup accepts objects and strings, rejects broken input', () => {
  const b = createBackup(state);
  assert.equal(validateBackup(b).ok, true);
  assert.equal(validateBackup(JSON.stringify(b)).ok, true);

  const empty = validateBackup('');
  assert.equal(empty.ok, false);
  assert.match(empty.errors[0], /ไฟล์ว่าง/);

  const broken = validateBackup('{nope');
  assert.equal(broken.ok, false);
  assert.match(broken.errors[0], /JSON ไม่ถูกต้อง/);

  const wrongApp = validateBackup({ ...b, app: 'other' });
  assert.equal(wrongApp.ok, false);
  assert.match(wrongApp.errors.join(' '), /ไม่ใช่ไฟล์ของ No7/);

  const future = validateBackup({ ...b, schema: BACKUP_SCHEMA + 1 });
  assert.equal(future.ok, false);
  assert.match(future.errors.join(' '), /ใหม่เกินไป/);

  const noData = validateBackup({ app: BACKUP_APP, schema: 2 });
  assert.equal(noData.ok, false);
  assert.match(noData.errors.join(' '), /ไม่มีข้อมูล/);
});

test('a tampered file yields a checksum warning but still validates', () => {
  const b = createBackup(state);
  b.data.facts[0].text = 'ถูกแก้';
  const v = validateBackup(b);
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => /checksum/.test(w)));
});

test('legacy export (pre-schema) is migrated', () => {
  const legacy = {
    exportedAt: '2026-01-01T00:00:00.000Z',
    settings: { language: 'th' },
    facts: [{ text: 'เก่า' }],
    log: [],
    todos: [],
    notes: [],
  };
  const migrated = migrateBackup(legacy);
  assert.equal(migrated.app, BACKUP_APP);
  assert.equal(migrated.schema, 1);
  assert.equal(migrated.migratedFrom, 'legacy-export');

  const v = validateBackup(legacy);
  assert.equal(v.ok, true);
  assert.equal(v.migrated, true);
  assert.ok(v.warnings.some((w) => /รุ่นเก่า/.test(w)));
  assert.equal(v.backup.data.facts.length, 1);
});

test('summarizeBackup reports per-collection counts and totals', () => {
  const b = createBackup(state);
  const sum = summarizeBackup(b);
  assert.equal(sum.total, 7);
  assert.equal(sum.counts.facts.count, 1);
  assert.equal(sum.counts.facts.label, 'ความจำ');
  assert.equal(sum.includeSecrets, false);
  assert.equal(sum.schema, BACKUP_SCHEMA);
});

test('mergeRecords does last-write-wins and counts outcomes', () => {
  const local = [
    { id: 'a', text: 'เก่าในเครื่อง', ts: 2000 },
    { id: 'b', text: 'ของเดิม', ts: 5000 },
  ];
  const incoming = [
    { id: 'a', text: 'ใหม่จากไฟล์', ts: 3000 },
    { id: 'b', text: 'ไฟล์เก่ากว่า', ts: 1000 },
    { id: 'c', text: 'มีแต่ในไฟล์', ts: 100 },
  ];
  const res = mergeRecords(local, incoming, COLLECTIONS.facts);
  assert.equal(res.list.length, 3);
  assert.equal(res.added, 1);
  assert.equal(res.updated, 1);
  assert.equal(res.kept, 1);
  const a = res.list.find((f) => f.id === 'a');
  assert.equal(a.text, 'ใหม่จากไฟล์');
  const b = res.list.find((f) => f.id === 'b');
  assert.equal(b.text, 'ของเดิม', 'ของในเครื่องใหม่กว่า → เก็บไว้');
});

test('mergeRecords handles notes without ids', () => {
  const res = mergeRecords([{ text: 'เดิม', ts: 1 }], [{ text: 'เดิม', ts: 1 }, { text: 'ใหม่', ts: 2 }], COLLECTIONS.notes);
  assert.equal(res.list.length, 2);
  assert.equal(res.added, 1);
  assert.equal(res.updated, 1);
});

test('planRestore merge mode reports per-collection actions', () => {
  const b = createBackup(state);
  const plan = planRestore(b, { facts: [{ id: 'f1', text: 'ในเครื่อง', ts: 2000 }] }, { mode: 'merge' });
  assert.equal(plan.mode, 'merge');
  assert.equal(plan.actions.length, Object.keys(COLLECTIONS).length);
  const facts = plan.actions.find((a) => a.key === 'facts');
  assert.equal(facts.incoming, 1);
  assert.equal(facts.existing, 1);
  assert.equal(facts.updated, 0, 'ไฟล์เก่ากว่า → ไม่ทับ');
  assert.equal(facts.kept, 1);
  assert.equal(plan.values.facts.length, 1);
  assert.equal(plan.values.notes.length, 1);
  assert.equal(plan.totals.added, 6);
});

test('planRestore replace mode clears existing data', () => {
  const b = createBackup(state);
  const plan = planRestore(b, { facts: [{ id: 'x', text: 'จะหายไป', ts: 1 }], notes: [] }, { mode: 'replace' });
  assert.equal(plan.mode, 'replace');
  assert.equal(plan.values.facts.length, 1);
  assert.equal(plan.values.facts[0].id, 'f1');
  assert.equal(plan.totals.removed, 1);
  assert.equal(describePlan(plan).includes('แทนที่ทั้งหมด'), true);
});

test('planRestore falls back to merge for unknown modes and warns about settings', () => {
  const b = createBackup({ settings: { language: 'en', apiKey: '' } });
  const plan = planRestore(b, {}, { mode: 'weird' });
  assert.equal(plan.mode, 'merge');
  assert.ok(plan.warnings.some((w) => /คีย์ว่าง/.test(w)));

  const noSettings = planRestore({ data: { facts: [] } }, {});
  assert.equal(noSettings.settings, null);
  assert.ok(noSettings.warnings.some((w) => /ไม่มี settings/.test(w)));
});

test('describePlan summarises both modes', () => {
  const b = createBackup(state);
  const merge = describePlan(planRestore(b, {}, { mode: 'merge' }));
  assert.match(merge, /รวมข้อมูล/);
  assert.match(merge, /ความจำ: เพิ่ม 1/);
  assert.match(merge, /รวม: \+7 ใหม่/);
});
