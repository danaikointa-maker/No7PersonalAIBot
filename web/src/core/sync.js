// ซิงก์ข้ามเครื่อง (มือถือ ↔ PC) ผ่าน companion server ที่คุณรันเอง
// หลักการ: ไม่มีบัญชี ไม่มีคลาวด์ — ใช้ URL + token ที่คุณตั้ง และ merge แบบไม่ทับข้อมูลกัน

export const SYNC_VERSION = 1;

/** เก็บเฉพาะข้อมูลที่ย้ายข้ามเครื่องได้ (ตัด API key ออกเสมอ) */
import { TaskStore } from './tasks.js';
import { mergeSyncBundle } from './sync-merge.js';

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
export function mergeBundle(bundle, { memory, createPersona, getPersona, listPersonas, calendar, strategy = 'newest' }) {
  const out = { facts: 0, personas: 0, events: 0, tasks: 0, conflicts: [], report: null };
  if (!bundle) return out;

  const taskStore = new TaskStore();
  const local = {
    facts: memory?.listFacts?.() || [],
    notes: safeJson('no7.notes.v1', []),
    todos: safeJson('no7.todos.v1', []),
    tasks: taskStore.list({ done: null }),
    events: calendar?.all?.() || [],
  };
  const remote = {
    facts: bundle.memory?.facts || [],
    notes: bundle.notes || [],
    todos: bundle.todos || [],
    tasks: bundle.tasks || [],
    events: bundle.calendar || [],
  };

  const merged = mergeSyncBundle(local, remote, { strategy });
  out.report = merged;
  out.conflicts = merged.conflicts;

  // facts: เขียนกลับผ่าน memory (merge ตามข้อความ — ไม่สร้างซ้ำ)
  if (merged.data.facts.length && memory?.importData) {
    memory.importData({ facts: merged.data.facts }, { merge: true });
    out.facts = merged.collections.facts.added + merged.collections.facts.updated;
  }

  // notes/todos: เขียนชุดที่รวมแล้วทับ (คีย์มี ts → เป็นการต่อท้าย)
  try {
    if (merged.data.notes.length) globalThis.localStorage?.setItem('no7.notes.v1', JSON.stringify(merged.data.notes));
    if (merged.data.todos.length) globalThis.localStorage?.setItem('no7.todos.v1', JSON.stringify(merged.data.todos));
  } catch { /* พื้นที่เต็ม */ }

  // tasks: ใช้ TaskStore.merge (จัดการ tombstone ให้แล้ว)
  if (merged.data.tasks.length) {
    out.tasks = taskStore.merge(merged.data.tasks).changed;
  }

  // events: เขียนชุดที่รวมแล้ว
  if (calendar?.replaceAll && merged.data.events.length) {
    calendar.replaceAll(merged.data.events);
    out.events = merged.collections.events.added + merged.collections.events.updated;
  }

  // personas: additive เดิม
  const known = (listPersonas?.() || (getPersona ? [getPersona('no7')] : [])) || [];
  for (const p of bundle.personas || []) {
    if (!p?.system || !p?.name) continue;
    const exists = known.some((k) => k && (k.id === p.id || (k.name === p.name && k.system === p.system)));
    if (exists) continue;
    const created = createPersona({ ...p, name: `${p.name}`.slice(0, 24) });
    if (created) { out.personas++; known.push(created); }
  }

  return out;
}
