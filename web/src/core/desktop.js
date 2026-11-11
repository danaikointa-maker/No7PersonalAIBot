// Desktop awareness + automation recipes.
// "รู้ว่ามีอะไรเปิดอยู่บนจอ" และ "ทำงานหลายขั้นให้จบในครั้งเดียว" — แต่ทุกขั้นยังวิ่งผ่าน
// allowlist ของ control policy เดิม (ไม่มี shell, ไม่มีคำสั่งลับ) และมี dry-run ให้ลองก่อนเสมอ
//
// ใช้ได้จริงเฉพาะเดสก์ท็อปแอป (Electron bridge) — บนเว็บ/มือถือจะได้ error ที่อ่านรู้เรื่อง

import {
  normalizeControlPolicy, checkControl, runControlAction, controlBridge, matchesGlob,
} from './control.js';

export const DESKTOP_STEP_META = {
  open_app: { emoji: '🖥️', label: 'เปิดโปรแกรม' },
  open_url: { emoji: '🌐', label: 'เปิดลิงก์' },
  focus_window: { emoji: '🪟', label: 'โฟกัสหน้าต่าง' },
  wait: { emoji: '⏳', label: 'รอ' },
  notify: { emoji: '🔔', label: 'แจ้งเตือน' },
};

export const MAX_RECIPE_STEPS = 8;
export const MAX_WAIT_MS = 5000;
export const MAX_TOTAL_WAIT_MS = 15000;
export const MAX_RECIPES = 20;
export const MAX_WINDOWS = 100;
export const RECIPE_STORE_KEY = 'no7.recipes.v1';

export const SAMPLE_RECIPES = [
  {
    name: 'โหมดทำงานเช้า',
    steps: [
      { action: 'open_url', target: 'https://calendar.google.com' },
      { action: 'notify', text: 'เริ่มงานได้เลย — ดูตารางวันนี้ก่อน' },
    ],
  },
  {
    name: 'จดงานเร็ว',
    steps: [
      { action: 'open_app', target: 'notepad' },
      { action: 'wait', ms: 800 },
      { action: 'notify', text: 'เปิดโน้ตให้แล้ว' },
    ],
  },
];

/* ------------------------------------------------------------ windows */

/**
 * แปลงผลลัพธ์ของคำสั่ง list windows (ของแต่ละ OS) เป็นรายชื่อหน้าต่าง
 * - win32: powershell `Get-Process | ... MainWindowTitle` → บรรทัดละชื่อ
 * - darwin: osascript → "Finder, Safari, Terminal" (คั่นด้วยจุลภาค)
 * - linux: `wmctrl -l` → "0x0340000a  0 host title"
 */
export function parseWindowList(raw = '', platform = 'linux') {
  const text = String(raw || '');
  if (!text.trim()) return [];
  const seen = new Set();
  const out = [];
  const push = (title) => {
    const clean = String(title || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!clean || clean === 'N/A') return;
    if (/^(MainWindowTitle|Name|Window Title)$/i.test(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  if (platform === 'darwin') {
    for (const part of text.split(/,\s*|\r?\n/)) push(part);
    return out.slice(0, MAX_WINDOWS);
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const wmctrl = /^0x[0-9a-f]+\s+\S+\s+\S+\s+(.+)$/i.exec(line.trim());
    push(wmctrl ? wmctrl[1] : line);
  }
  return out.slice(0, MAX_WINDOWS);
}

/** ค้นหาหน้าต่างแบบหลวม ๆ: ตรงตัว > ขึ้นต้นด้วย > มีคำอยู่ข้างใน */
export function matchWindows(windows = [], query = '') {
  const list = Array.isArray(windows) ? windows.filter(Boolean) : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...list];
  const scored = list.map((title) => {
    const t = String(title).toLowerCase();
    let score = 0;
    if (t === q) score = 3;
    else if (t.startsWith(q)) score = 2;
    else if (t.includes(q)) score = 1;
    if (!score && matchesGlob(q, t)) score = 1;
    return { title, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.title);
}

/** bridge ของเดสก์ท็อป (ต้องมี listWindows/focusWindow อย่างน้อยหนึ่ง) */
export function desktopBridge(scope = globalThis) {
  const native = scope?.no7?.native;
  if (!native) return null;
  return (native.listWindows || native.focusWindow) ? native : null;
}

export const WINDOW_LIST_HINT = 'เดสก์ท็อปแอปจะใช้ powershell (Windows) / osascript (macOS) / wmctrl (Linux) — ถ้าไม่มีคำสั่งนั้นจะอ่านรายการหน้าต่างไม่ได้';

/** อ่านรายชื่อหน้าต่างที่เปิดอยู่ (คืน ok:false แทน throw เพื่อให้ UI แสดงเหตุผลได้) */
export async function listWindows({ bridge = desktopBridge() } = {}) {
  if (!bridge?.listWindows) {
    return { ok: false, windows: [], reason: 'ดูรายชื่อหน้าต่างได้เฉพาะในเดสก์ท็อปแอป (Electron)', hint: WINDOW_LIST_HINT };
  }
  try {
    const res = await bridge.listWindows();
    const windows = Array.isArray(res) ? res : parseWindowList(res?.stdout || '', res?.platform);
    return { ok: true, windows: windows.slice(0, MAX_WINDOWS), reason: '', hint: '' };
  } catch (err) {
    return { ok: false, windows: [], reason: err?.message || String(err), hint: WINDOW_LIST_HINT };
  }
}

/** โฟกัสหน้าต่าง — รับชื่อเต็มหรือคำค้น */
export async function focusWindow({ target = '', bridge = desktopBridge(), windows = null } = {}) {
  const query = String(target || '').trim();
  if (!query) throw new Error('ต้องระบุชื่อหน้าต่าง');
  if (!bridge?.focusWindow) throw new Error('โฟกัสหน้าต่างได้เฉพาะในเดสก์ท็อปแอป (Electron)');
  let picked = query;
  if (Array.isArray(windows) && windows.length) {
    const found = matchWindows(windows, query);
    if (!found.length) throw new Error(`ไม่พบหน้าต่างที่ตรงกับ "${query}"`);
    picked = found[0];
  }
  await bridge.focusWindow(picked);
  return { title: 'โฟกัสหน้าต่าง', big: picked, lines: [`คำค้น: ${query}`] };
}

/* ------------------------------------------------------------ recipes */

function normalizeStep(raw) {
  const action = String(raw?.action || '').trim().toLowerCase();
  if (!DESKTOP_STEP_META[action]) return null;
  if (action === 'wait') {
    const rawMs = raw?.ms ?? raw?.target;
    if (rawMs === undefined || rawMs === null || String(rawMs).trim() === '') return null;
    const ms = Number(rawMs);
    if (!Number.isFinite(ms) || ms < 0) return null;
    return { action, ms: Math.min(Math.round(ms), MAX_WAIT_MS) };
  }
  if (action === 'notify') {
    const text = String(raw?.text ?? raw?.target ?? '').trim();
    return text ? { action, text: text.slice(0, 200) } : null;
  }
  const target = String(raw?.target ?? '').trim();
  if (!target) return null;
  return { action, target: target.slice(0, 300) };
}

/** แปลง recipe ดิบ → recipe ที่ปลอดภัย (ตัดขั้นเกิน/ขั้นผิดทิ้ง) */
export function normalizeRecipe(raw = {}) {
  const steps = (Array.isArray(raw?.steps) ? raw.steps : [])
    .slice(0, MAX_RECIPE_STEPS)
    .map(normalizeStep)
    .filter(Boolean);
  return {
    id: String(raw?.id || '').trim().slice(0, 40),
    name: String(raw?.name || '').trim().slice(0, 60),
    steps,
    updatedAt: Number(raw?.updatedAt) || 0,
  };
}

/** ตรวจ recipe ก่อนบันทึก/รัน — คืน error ภาษาไทยที่บอกว่าต้องแก้อะไร */
export function validateRecipe(raw = {}) {
  const recipe = normalizeRecipe(raw);
  const errors = [];
  if (!recipe.name) errors.push('ต้องตั้งชื่อสูตร');
  if (!recipe.steps.length) errors.push('ต้องมีอย่างน้อย 1 ขั้น');
  if ((Array.isArray(raw?.steps) ? raw.steps : []).length > MAX_RECIPE_STEPS) {
    errors.push(`เกิน ${MAX_RECIPE_STEPS} ขั้น — แยกเป็นหลายสูตร`);
  }
  const totalWait = recipe.steps.filter((s) => s.action === 'wait').reduce((sum, s) => sum + s.ms, 0);
  if (totalWait > MAX_TOTAL_WAIT_MS) errors.push(`รอรวมกันเกิน ${MAX_TOTAL_WAIT_MS / 1000} วินาที`);
  return { ok: errors.length === 0, errors, recipe };
}

export function describeRecipeStep(step = {}) {
  const meta = DESKTOP_STEP_META[step.action];
  if (!meta) return String(step.action || '?');
  if (step.action === 'wait') return `${meta.emoji} ${meta.label} ${step.ms} ms`;
  if (step.action === 'notify') return `${meta.emoji} ${meta.label}: ${step.text}`;
  return `${meta.emoji} ${meta.label}: ${step.target}`;
}

export function describeRecipe(recipe = {}) {
  const r = normalizeRecipe(recipe);
  return r.steps.map((s, i) => `${i + 1}. ${describeRecipeStep(s)}`).join('\n');
}

/**
 * แปลงข้อความที่ผู้ใช้พิมพ์ใน UI เป็น steps
 * หนึ่งบรรทัด = หนึ่งขั้น: `open_app notepad` / `open_url https://…` / `wait 800` /
 * `notify เริ่มงาน` / `focus_window Chrome`
 */
export function parseRecipeText(text = '') {
  const steps = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    if (steps.length >= MAX_RECIPE_STEPS) return;
    const m = /^([a-z_]+)\s*:?\s*([\s\S]*)$/i.exec(raw);
    const action = (m?.[1] || '').toLowerCase();
    const rest = (m?.[2] || '').trim();
    if (!DESKTOP_STEP_META[action]) {
      errors.push(`บรรทัด ${index + 1}: ไม่รู้จักขั้น "${m?.[1] || raw}"`);
      return;
    }
    const step = normalizeStep(
      action === 'wait' ? { action, ms: rest } : action === 'notify' ? { action, text: rest } : { action, target: rest }
    );
    if (!step) {
      errors.push(`บรรทัด ${index + 1}: ขั้น "${action}" ต้องมีค่าให้ทำ`);
      return;
    }
    steps.push(step);
  });
  return { steps, errors };
}

/** แปลง steps กลับเป็นข้อความสำหรับแก้ใน UI */
export function stringifyRecipeSteps(steps = []) {
  return (Array.isArray(steps) ? steps : []).map((s) => {
    if (s.action === 'wait') return `wait ${s.ms}`;
    if (s.action === 'notify') return `notify ${s.text}`;
    return `${s.action} ${s.target}`;
  }).join('\n');
}

/**
 * Dry-run: บอกว่าจะเกิดอะไรขึ้นและขั้นไหนจะถูกบล็อก โดยไม่ทำอะไรจริง
 * @returns {{ok: boolean, steps: Array<{index:number, action:string, label:string, allowed:boolean, reason:string}>, errors: string[]}}
 */
export function planRecipe(raw = {}, { policy = null, windows = null } = {}) {
  const { ok, errors, recipe } = validateRecipe(raw);
  const p = normalizeControlPolicy(policy || {});
  const steps = recipe.steps.map((step, i) => {
    const label = describeRecipeStep(step);
    if (step.action === 'open_app' || step.action === 'open_url') {
      const check = checkControl({ action: step.action, target: step.target, policy: p });
      return { index: i, action: step.action, label, allowed: check.allowed, reason: check.reason };
    }
    if (step.action === 'focus_window') {
      if (!Array.isArray(windows) || !windows.length) {
        return { index: i, action: step.action, label, allowed: true, reason: 'จะลองโฟกัสด้วยชื่อที่ให้มา' };
      }
      const found = matchWindows(windows, step.target);
      return found.length
        ? { index: i, action: step.action, label: `${DESKTOP_STEP_META.focus_window.emoji} โฟกัสหน้าต่าง: ${found[0]}`, allowed: true, reason: 'พบหน้าต่าง' }
        : { index: i, action: step.action, label, allowed: false, reason: 'ไม่พบหน้าต่างที่ตรงกัน' };
    }
    return { index: i, action: step.action, label, allowed: true, reason: step.action === 'wait' ? 'รอตามเวลา' : 'แจ้งเตือน' };
  });
  return { ok: ok && steps.every((s) => s.allowed), errors, steps };
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * รัน recipe จริง (ทุกขั้นผ่าน policy + audit) — หยุดทันทีเมื่อขั้นใดล้มเหลว
 * @returns {Promise<{ok: boolean, dryRun: boolean, steps: Array<object>, error: string}>}
 */
export async function runRecipe(raw = {}, {
  bridge = null, policy = null, windows = null, dryRun = false, sleep = defaultSleep, onStep = null,
} = {}) {
  const plan = planRecipe(raw, { policy, windows });
  const recipe = validateRecipe(raw).recipe;
  const results = [];
  const emit = (entry) => {
    results.push(entry);
    try { onStep?.(entry); } catch { /* UI error must not break the run */ }
  };

  if (!plan.ok && !dryRun) {
    return { ok: false, dryRun, steps: plan.steps.map((s) => ({ ...s, status: s.allowed ? 'planned' : 'blocked' })), error: plan.errors[0] || plan.steps.find((s) => !s.allowed)?.reason || 'สูตรนี้ยังรันไม่ได้' };
  }
  if (dryRun) {
    for (const step of plan.steps) emit({ ...step, status: step.allowed ? 'planned' : 'blocked' });
    return { ok: plan.ok, dryRun: true, steps: results, error: plan.errors[0] || '' };
  }

  const live = bridge || controlBridge();
  if (!live) return { ok: false, dryRun, steps: [], error: 'สูตรอัตโนมัติใช้ได้เฉพาะในเดสก์ท็อปแอป (Electron)' };

  for (const step of recipe.steps) {
    const meta = DESKTOP_STEP_META[step.action];
    try {
      if (step.action === 'open_app' || step.action === 'open_url') {
        await runControlAction({ action: step.action, target: step.target, policy: policy || {}, bridge: live });
      } else if (step.action === 'focus_window') {
        await focusWindow({ target: step.target, bridge: live, windows });
      } else if (step.action === 'wait') {
        await sleep(step.ms);
      } else if (step.action === 'notify') {
        if (live.notify) await live.notify('No7', step.text);
        else if (typeof Notification !== 'undefined') new Notification('No7', { body: step.text });
      }
      emit({ index: results.length, action: step.action, label: describeRecipeStep(step), allowed: true, status: 'done', reason: '' });
    } catch (err) {
      emit({ index: results.length, action: step.action, label: describeRecipeStep(step), allowed: false, status: 'failed', reason: err?.message || String(err) });
      return { ok: false, dryRun: false, steps: results, error: `${meta?.label || step.action}: ${err?.message || err}` };
    }
  }
  return { ok: true, dryRun: false, steps: results, error: '' };
}

export class RecipeStorageError extends Error {
  constructor(message = 'บันทึกสูตรอัตโนมัติลงในเครื่องไม่สำเร็จ', options = {}) {
    super(message, options);
    this.name = 'RecipeStorageError';
  }
}

/** ที่เก็บสูตรในเครื่อง (localStorage) — 20 สูตรล่าสุด */
export class RecipeStore {
  constructor({ storage = null, key = RECIPE_STORE_KEY, max = MAX_RECIPES, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.max = max;
    this.now = now;
    this.items = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.map((r) => normalizeRecipe(r)).filter((r) => r.name && r.steps.length).slice(-this.max);
    } catch { return []; }
  }

  _save(candidate) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(candidate));
    } catch (cause) {
      throw new RecipeStorageError('บันทึกสูตรอัตโนมัติไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม', { cause });
    }
    this.items = candidate;
  }

  list() { return this.items.map((r) => ({ ...r })); }

  get(id) {
    const found = this.items.find((r) => r.id === id);
    return found ? { ...found } : null;
  }

  find(name = '') {
    const q = String(name || '').trim().toLowerCase();
    if (!q) return null;
    const exact = this.items.find((r) => r.name.toLowerCase() === q);
    if (exact) return { ...exact };
    const loose = this.items.find((r) => r.name.toLowerCase().includes(q));
    return loose ? { ...loose } : null;
  }

  /** เพิ่มหรือทับสูตรที่ชื่อเดียวกัน (คืน recipe ที่บันทึก) */
  save(raw = {}) {
    const { ok, errors, recipe } = validateRecipe(raw);
    if (!ok) throw new Error(errors[0]);
    const at = this.now();
    const exists = this.items.find((r) => r.name.toLowerCase() === recipe.name.toLowerCase());
    const id = recipe.id || exists?.id || `r${at.toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
    const next = { ...recipe, id, updatedAt: at };
    const candidate = exists
      ? this.items.map((r) => (r.id === exists.id ? next : r))
      : [...this.items, next];
    this._save(candidate.slice(-this.max));
    return { ...next };
  }

  remove(id) {
    const candidate = this.items.filter((r) => r.id !== id);
    if (candidate.length === this.items.length) return false;
    this._save(candidate);
    return true;
  }

  clear() {
    if (!this.items.length) return;
    this._save([]);
  }

  /** ใส่สูตรตัวอย่าง (ไม่ทับของเดิม) */
  seedSamples() {
    const candidate = [...this.items];
    let changed = false;
    for (const sample of SAMPLE_RECIPES) {
      if (!candidate.some((r) => r.name.toLowerCase() === sample.name.toLowerCase())) {
        const { ok, recipe } = validateRecipe(sample);
        if (ok) {
          candidate.push({ ...recipe, id: recipe.id || `r${this.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`, updatedAt: this.now() });
          changed = true;
        }
      }
    }
    if (changed) this._save(candidate.slice(-this.max));
    return this.list();
  }
}
