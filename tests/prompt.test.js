import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, summarizeToolResult } from '../web/src/core/prompt.js';
import { PERSONAS, getPersona } from '../web/src/core/personas.js';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

test('prompt carries persona, language rule, memory and tool catalog', () => {
  const p = buildSystemPrompt({
    persona: getPersona('mira'),
    memory: [{ text: 'ชื่อผู้ใช้คือ ต้า' }],
    language: 'th',
    polite: true,
    platform: 'mobile',
  });
  assert.ok(p.includes('Mira'));
  assert.ok(p.includes('ตอบเป็นภาษาไทย'));
  assert.ok(p.includes('ค่ะ'));
  assert.ok(p.includes('ชื่อผู้ใช้คือ ต้า'));
  assert.ok(p.includes('weather'));
  assert.ok(p.includes('mobile'));
});

test('male persona uses ครับ, non-polite drops the rule', () => {
  const male = buildSystemPrompt({ persona: getPersona('no7'), memory: [], polite: true });
  assert.ok(male.includes('ครับ'));
  const casual = buildSystemPrompt({ persona: getPersona('no7'), memory: [], polite: false });
  assert.ok(casual.includes('ไม่ต้องลงท้าย'));
});

test('english mode switches instruction', () => {
  const p = buildSystemPrompt({ persona: getPersona('jarvis'), memory: [], language: 'en' });
  assert.ok(p.includes('Always answer in English'));
});

test('summarizeToolResult makes a speakable line', () => {
  const s = summarizeToolResult('weather', { title: 'อากาศ กรุงเทพ', big: '32°C', lines: ['ฟ้าใส', 'ชื้น 60%'] });
  assert.ok(s.includes('32°C'));
  assert.ok(s.includes('ฟ้าใส'));
});

test('all 8 personas have distinct ids + system prompts', () => {
  assert.equal(PERSONAS.length, 8);
  assert.equal(new Set(PERSONAS.map((p) => p.id)).size, 8);
  for (const p of PERSONAS) assert.ok(p.system.length > 20);
});
