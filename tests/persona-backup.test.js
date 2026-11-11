import test from 'node:test';
import assert from 'node:assert/strict';

const localStorage = (() => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), clear: () => data.clear() };
})();
globalThis.localStorage = localStorage;

const { normalizeImportedPersonas, customPersonas, restoreCustomPersonas, allPersonas } = await import('../web/src/core/persona-store.js');
const { createBackup, planRestore } = await import('../web/src/core/backup.js');

const custom = (id, name, updatedAt, extra = {}) => ({
  id, name, emoji: '✨', desc: 'custom helper', gender: 'neutral', system: `คุณคือ ${name}`,
  greeting: 'ยินดีที่ได้พบ', banned: ['secret topic'], style: { rate: 1.1, pitch: 1, voiceName: 'Test' },
  createdAt: 1000, updatedAt, ...extra,
});

test('persona backup normalization whitelists fields, caps values, and rejects built-in or invalid IDs', () => {
  const [saved] = normalizeImportedPersonas([
    custom('p-valid1', 'N'.repeat(40), 2000, { system: 's'.repeat(2000), privateText: 'strip' }),
    custom('no7', 'Override built-in', 9999),
    custom('bad/id', 'Bad ID', 1000),
    { id: 'p-empty1', name: '', system: 'no name' },
  ]);
  assert.equal(saved.name.length, 24);
  assert.equal(saved.system.length, 1500);
  assert.equal(saved.builtin, false);
  assert.equal('privateText' in saved, false);
  assert.equal(normalizeImportedPersonas([custom('no7', 'built-in', 1)]).length, 0);
  assert.equal(normalizeImportedPersonas(Array.from({ length: 101 }, (_, i) => custom(`p-limit${i}`, `P${i}`, i + 1))).length, 100);
});

test('app backups contain custom personas only; restore merge uses updatedAt and never replaces built-ins', () => {
  localStorage.clear();
  restoreCustomPersonas([custom('p-existing1', 'Local newer', 5000)]);
  const backup = createBackup({ personas: [custom('p-existing1', 'Incoming older', 4000), custom('p-newone1', 'Imported', 3000), custom('no7', 'Built-in spoof', 9999)] });
  assert.equal(backup.data.personas.length, 2);
  assert.equal(JSON.stringify(backup.data.personas).includes('Built-in spoof'), false);
  const plan = planRestore(backup, { personas: customPersonas() });
  assert.equal(plan.values.personas.find((p) => p.id === 'p-existing1').name, 'Local newer');
  assert.equal(plan.values.personas.some((p) => p.id === 'p-newone1'), true);
  assert.equal(allPersonas().find((p) => p.id === 'no7').builtin, true);
});

test('replace restore includes only valid custom personas and legacy backups preserve local ones in merge', () => {
  localStorage.clear();
  const current = [custom('p-current1', 'Local', 1000)];
  const legacyMerge = planRestore({ data: { facts: [] } }, { personas: current });
  assert.equal(legacyMerge.values.personas[0].id, 'p-current1');
  const replace = planRestore({ data: { personas: [custom('p-fromfile1', 'File', 2000), custom('mira', 'Builtin collision', 9999)] } }, { personas: current }, { mode: 'replace' });
  assert.deepEqual(replace.values.personas.map((p) => p.id), ['p-fromfile1']);
});

test('restoreCustomPersonas replaces stored list with sanitized values', () => {
  localStorage.clear();
  assert.equal(restoreCustomPersonas([custom('p-restored1', 'Restored', 10, { admin: true })], 'p-restored1'), 'p-restored1');
  assert.equal(customPersonas().length, 1);
  assert.equal(customPersonas()[0].admin, undefined);
});
