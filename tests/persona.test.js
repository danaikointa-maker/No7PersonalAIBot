import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();

const {
  allPersonas, builtinPersonas, customPersonas, createPersona, updatePersona,
  deletePersona, duplicatePersona, getPersona, personaPrompt,
} = await import('../web/src/core/persona-store.js');
const { buildSystemPrompt } = await import('../web/src/core/prompt.js');

const reset = () => globalThis.localStorage.clear();

test('built-ins are 8 and read-only markers set', () => {
  reset();
  assert.equal(builtinPersonas().length, 8);
  assert.equal(customPersonas().length, 0);
  assert.ok(builtinPersonas().every((p) => p.builtin === true));
});

test('createPersona persists and appears in allPersonas', () => {
  reset();
  const p = createPersona({ name: 'น้องส้ม', emoji: '🍊', system: 'คุณคือน้องส้ม ขี้เล่น', gender: 'female' });
  assert.ok(p.id.startsWith('p-'));
  assert.equal(allPersonas().length, 9);
  assert.equal(getPersona(p.id).name, 'น้องส้ม');
});

test('normalize clamps text lengths and voice range', () => {
  reset();
  const p = createPersona({ name: 'x'.repeat(50), system: 'y'.repeat(3000), style: { rate: 5, pitch: 0.1 } });
  assert.equal(p.name.length, 24);
  assert.equal(p.system.length, 1500);
  assert.equal(p.style.rate, 1.6);
  assert.equal(p.style.pitch, 0.6);
});

test('updatePersona edits only custom personas', () => {
  reset();
  const p = createPersona({ name: 'A', system: 'sys' });
  const updated = updatePersona(p.id, { name: 'B' });
  assert.equal(updated.name, 'B');
  assert.equal(updatePersona('no7', { name: 'hack' }), null);
});

test('duplicatePersona copies content with a new id', () => {
  reset();
  const copy = duplicatePersona('mira');
  assert.ok(copy.id !== 'mira');
  assert.match(copy.name, /สำเนา/);
  assert.equal(getPersona(copy.id).system, getPersona('mira').system);
});

test('deletePersona removes it', () => {
  reset();
  const p = createPersona({ name: 'ชั่วคราว', system: 's' });
  assert.equal(deletePersona(p.id), true);
  assert.equal(customPersonas().length, 0);
  assert.equal(deletePersona('ไม่มียี่ห้อ'), false);
});

test('banned topics land in the system prompt', () => {
  reset();
  const p = createPersona({ name: 'Safe', system: 'คุณคือ Safe', banned: ['การพนัน', 'การเมือง'] });
  const prompt = buildSystemPrompt({ persona: p, memory: [], language: 'th' });
  assert.ok(prompt.includes('การพนัน'));
  assert.ok(prompt.includes('ต้องหลีกเลี่ยง'));
  assert.ok(personaPrompt(p).includes('การเมือง'));
});

test('getPersona falls back to the first built-in for unknown ids', () => {
  reset();
  assert.equal(getPersona('nope').id, 'no7');
});

test('voice style is exposed for TTS', () => {
  reset();
  const p = createPersona({ name: 'V', system: 's', style: { rate: 1.3, pitch: 1.2, voiceName: 'Test' } });
  assert.equal(p.style.rate, 1.3);
  assert.equal(p.style.voiceName, 'Test');
});
