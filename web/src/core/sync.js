// ซิงก์ข้ามเครื่อง (มือถือ ↔ PC) ผ่าน companion server ที่คุณรันเอง
// หลักการ: ไม่มีบัญชี ไม่มีคลาวด์ — ใช้ URL + token ที่คุณตั้ง และ merge แบบไม่ทับข้อมูลกัน

export const SYNC_VERSION = 1;

/** เก็บเฉพาะข้อมูลที่ย้ายข้ามเครื่องได้ (ตัด API key ออกเสมอ) */
import { TaskStore } from './tasks.js';

export function collectBundle({ memory, personas = [], calendar = [], tasks = null, settings = {} }) {
  const safeSettings = { ...settings };
  delete safeSettings.apiKey;
  delete safeSettings.syncToken;
  return {
    version: SYNC_VERSION,
    updatedAt: new Date().toISOString(),
    memory: memory?.exportData?.() || { facts: [], log: [] },
    personas,
    calendar,
    settings: safeSettings,
    todos: safeJson('no7.todos.v1', []),
    notes: safeJson('no7.notes.v1', []),
    reminders: safeJson('no7.reminders.v1', []),
    tasks: Array.isArray(tasks) ? tasks : new TaskStore().exportData().tasks,
  };
}

function safeJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function headers(token) {
  return { 'Content-Type': 'application/json', ...(token ? { 'X-No7-Sync': token } : {}) };
}

export async function pushBundle(serverUrl, token, bundle) {
  const url = `${String(serverUrl).replace(/\/$/, '')}/api/sync`;
  const res = await fetch(url, { method: 'PUT', headers: headers(token), body: JSON.stringify(bundle) });
  if (res.status === 401) throw new Error('token ไม่ถูกต้อง — ตรวจ NO7_SYNC_TOKEN ที่ server');
  if (!res.ok) throw new Error(`อัปโหลดไม่สำเร็จ (${res.status})`);
  return res.json();
}

export async function pullBundle(serverUrl, token) {
  const url = `${String(serverUrl).replace(/\/$/, '')}/api/sync`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error('token ไม่ถูกต้อง');
  if (!res.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${res.status})`);
  return res.json();
}

/**
 * รวมข้อมูลจากอีกเครื่องเข้ามาแบบ additive
 * @returns {{facts:number, personas:number, events:number, tasks:number}}
 */
export function mergeBundle(bundle, { memory, createPersona, getPersona, listPersonas, calendar }) {
  const out = { facts: 0, personas: 0, events: 0, tasks: 0 };
  if (!bundle) return out;

  if (bundle.memory?.facts?.length && memory) {
    const res = memory.importData({ facts: bundle.memory.facts }, { merge: true });
    out.facts = res.added;
  }

  const known = (listPersonas?.() || (getPersona ? [getPersona('no7')] : [])) || [];
  for (const p of bundle.personas || []) {
    if (!p?.system || !p?.name) continue;
    const exists = known.some((k) => k && (k.id === p.id || (k.name === p.name && k.system === p.system)));
    if (exists) continue;
    const created = createPersona({ ...p, name: `${p.name}`.slice(0, 24) });
    if (created) { out.personas++; known.push(created); }
  }

  if (calendar?.replaceAll) {
    const existing = new Set(calendar.all().map((e) => e.uid));
    const merged = calendar.all();
    for (const e of bundle.calendar || []) {
      if (!e?.start || existing.has(e.uid)) continue;
      merged.push(e);
      out.events++;
    }
    calendar.replaceAll(merged);
  }

  // todo/note: รวมแบบไม่ซ้ำ
  for (const [key, field] of [['no7.todos.v1', 'text'], ['no7.notes.v1', 'text']]) {
    const local = safeJson(key, []);
    const incoming = bundle[key === 'no7.todos.v1' ? 'todos' : 'notes'] || [];
    const seen = new Set(local.map((x) => `${x[field]}|${x.ts}`));
    const add = incoming.filter((x) => x?.[field] && !seen.has(`${x[field]}|${x.ts}`));
    if (add.length) {
      try { globalThis.localStorage?.setItem(key, JSON.stringify([...local, ...add])); } catch {}
    }
  }

  if (Array.isArray(bundle.tasks) && bundle.tasks.length) {
    out.tasks = new TaskStore().merge(bundle.tasks).changed;
  }

  return out;
}
