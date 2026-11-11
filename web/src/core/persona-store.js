// Persona Studio — built-ins + personas ที่ผู้ใช้สร้างเอง (เก็บในเครื่อง)
import { PERSONAS } from './personas.js';

const KEY = 'no7.personas.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export const PERSONA_LIMITS = { name: 24, desc: 90, system: 1500, greeting: 200, banned: 12, count: 100 };

export function builtinPersonas() {
  return PERSONAS.map((p) => ({ ...p, builtin: true, emoji: p.emoji || '🤖' }));
}

export function normalizeImportedPersonas(input) {
  if (!Array.isArray(input)) return [];
  const builtins = new Set(PERSONAS.map((p) => p.id));
  const byId = new Map();
  for (const raw of input.slice(0, PERSONA_LIMITS.count)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = String(raw.id || '');
    if (!/^p-[a-z0-9-]{2,80}$/i.test(id) || builtins.has(id)) continue;
    const name = String(raw.name || '').trim().slice(0, PERSONA_LIMITS.name);
    const system = String(raw.system || '').slice(0, PERSONA_LIMITS.system);
    if (!name || !system) continue;
    const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Math.trunc(Number(raw.createdAt)) : 0;
    const updatedAt = Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0 ? Math.trunc(Number(raw.updatedAt)) : createdAt;
    const clean = {
      id, createdAt, updatedAt,
      ...normalize({
        name, system, emoji: raw.emoji, desc: raw.desc, gender: raw.gender, greeting: raw.greeting,
        banned: Array.isArray(raw.banned) ? raw.banned.slice(0, PERSONA_LIMITS.banned).map((item) => String(item).slice(0, 80)) : [],
        style: { ...raw.style, voiceName: String(raw.style?.voiceName || '').slice(0, 80) },
      }),
      builtin: false,
    };
    const previous = byId.get(id);
    if (!previous || clean.updatedAt >= previous.updatedAt) byId.set(id, clean);
  }
  return [...byId.values()].slice(0, PERSONA_LIMITS.count);
}

export function customPersonas() {
  return normalizeImportedPersonas(read());
}

export function restoreCustomPersonas(input, selectedId = 'no7') {
  const clean = normalizeImportedPersonas(input);
  if (!write(clean)) return 'no7';
  return [...builtinPersonas(), ...clean].some((persona) => persona.id === selectedId) ? selectedId : 'no7';
}

export function allPersonas() {
  return [...builtinPersonas(), ...customPersonas()];
}

export function getPersona(id) {
  return allPersonas().find((p) => p.id === id) || builtinPersonas()[0];
}

function normalize(data, base = {}) {
  const clamp = (s, n) => String(s ?? '').slice(0, n);
  const gender = ['male', 'female', 'neutral'].includes(data.gender) ? data.gender : 'neutral';
  return {
    ...base,
    name: clamp(data.name || base.name || 'No7', PERSONA_LIMITS.name),
    emoji: clamp(data.emoji || base.emoji || '🤖', 4),
    desc: clamp(data.desc ?? base.desc ?? '', PERSONA_LIMITS.desc),
    gender,
    system: clamp(data.system || base.system || '', PERSONA_LIMITS.system),
    greeting: clamp(data.greeting ?? base.greeting ?? '', PERSONA_LIMITS.greeting),
    banned: (Array.isArray(data.banned) ? data.banned : [])
      .map((b) => String(b).trim()).filter(Boolean).slice(0, PERSONA_LIMITS.banned),
    style: {
      rate: clampNum(data.style?.rate ?? base.style?.rate ?? 1, 0.6, 1.6),
      pitch: clampNum(data.style?.pitch ?? base.style?.pitch ?? 1, 0.6, 1.6),
      voiceName: String(data.style?.voiceName ?? base.style?.voiceName ?? ''),
    },
  };
}
function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(min, +n.toFixed(2)));
}

export function createPersona(data = {}) {
  const list = customPersonas();
  if (list.length >= PERSONA_LIMITS.count) return null;
  const now = Date.now();
  const persona = {
    id: `p-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    createdAt: now,
    updatedAt: now,
    ...normalize(data, { name: 'No7 ใหม่', desc: ' persona ที่ฉันสร้างเอง' }),
  };
  list.push(persona);
  write(list);
  return { ...persona, builtin: false };
}

export function updatePersona(id, patch = {}) {
  const list = customPersonas();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...normalize({ ...list[idx], ...patch }, list[idx]), id, updatedAt: Date.now(), builtin: false };
  write(list);
  return list[idx];
}

export function deletePersona(id) {
  const list = read();
  const next = list.filter((p) => p.id !== id);
  write(next);
  return next.length !== list.length;
}

export function duplicatePersona(id) {
  const src = allPersonas().find((p) => p.id === id);
  if (!src) return null;
  return createPersona({
    ...src,
    name: `${src.name} (สำเนา)`.slice(0, PERSONA_LIMITS.name),
    desc: src.desc,
  });
}

/** ข้อความ persona ที่จะส่งเข้า system prompt (รวมหัวข้อต้องห้าม) */
export function personaPrompt(p) {
  const bans = (p.banned || []).filter(Boolean);
  if (!bans.length) return p.system || '';
  return `${p.system || ''}\n\nหัวข้อที่ต้องหลีกเลี่ยงโดยเด็ดขาด: ${bans.join(', ')}\n`
    + 'ถ้าผู้ใช้ถามเรื่องเหล่านี้ ให้บอกอย่างสุภาพว่าไม่สะดวกตอบ แล้วชวนคุยเรื่องอื่น';
}

/** ค่าเสียงเริ่มต้นของ persona (ใช้เมื่อผู้ใช้ยังไม่ได้ตั้งค่าเฉพาะ) */
export function personaVoice(p) {
  return {
    rate: p?.style?.rate ?? 1,
    pitch: p?.style?.pitch ?? 1,
    voiceName: p?.style?.voiceName || undefined,
  };
}
