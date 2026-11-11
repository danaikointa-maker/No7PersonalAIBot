// Tasks + cross-device reminders — "งานที่ต้องทำ" ที่ตามข้ามเครื่องได้
// เก็บในเครื่อง (localStorage) แล้วซิงก์ผ่าน /api/sync แบบ last-write-wins + tombstone
//
// หลักการเดียวกับความจำ: ไม่มีบัญชี ไม่มีคลาวด์ และการลบต้องเดินทางข้ามเครื่องได้จริง

export const TASKS_KEY = 'no7.tasks.v1';

export const PRIORITIES = {
  0: { label: 'ปกติ', emoji: '⚪' },
  1: { label: 'สำคัญ', emoji: '🔵' },
  2: { label: 'ด่วน', emoji: '🟠' },
  3: { label: 'ด่วนมาก', emoji: '🔴' },
};

export const RECURRENCE_FREQS = {
  hourly: 'ทุกชั่วโมง',
  daily: 'ทุกวัน',
  weekdays: 'วันจันทร์–ศุกร์',
  weekly: 'ทุกสัปดาห์',
  monthly: 'ทุกเดือน',
};

export const WEEKDAYS_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function normalizePriority(value) {
  const n = Number(value) || 0;
  return Math.min(3, Math.max(0, Math.round(n)));
}

/**
 * อ่านเวลาที่ผู้ใช้/โมเดลส่งมา
 * รองรับ: ISO string, Date, `+30m` / `+2h` / `+3d`, `วันนี้ 18:00`, `พรุ่งนี้ 09:30`, `18:00`
 * @returns {string|null} ISO string หรือ null
 */
export function parseDue(input, now = Date.now()) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input.toISOString();
  const raw = String(input).trim();
  if (!raw) return null;

  const relative = /^\+(\d+(?:\.\d+)?)\s*(m|min|นาที|h|hr|ชม|ชั่วโมง|d|day|วัน)$/i.exec(raw);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const ms = /^(m|min|นาที)$/.test(unit) ? MINUTE : /^(h|hr|ชม|ชั่วโมง)$/.test(unit) ? HOUR : DAY;
    return new Date(now + n * ms).toISOString();
  }

  const thai = /^(วันนี้|พรุ่งนี้|มะรืน|today|tomorrow)\s*(\d{1,2})[:.](\d{2})?$/i.exec(raw);
  if (thai) {
    const base = new Date(now);
    const dayOffset = /พรุ่งนี้|tomorrow/i.test(thai[1]) ? 1 : /มะรืน/.test(thai[1]) ? 2 : 0;
    base.setDate(base.getDate() + dayOffset);
    base.setHours(Number(thai[2]), Number(thai[3] || 0), 0, 0);
    return base.toISOString();
  }

  const timeOnly = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
  if (timeOnly) {
    const d = new Date(now);
    d.setHours(Number(timeOnly[1]), Number(timeOnly[2]), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return null;
}

/** ทำความสะอาดกติกาการทำซ้ำ — คืน null ถ้าไม่ถูกต้อง/ปิด */
export function normalizeRecurrence(raw) {
  if (!raw) return null;
  if (raw === 'daily' || raw === 'weekdays' || raw === 'weekly' || raw === 'hourly' || raw === 'monthly') {
    return { freq: raw, interval: 1, weekday: null, at: '' };
  }
  if (typeof raw !== 'object') return null;
  const freq = String(raw.freq || raw.type || '').toLowerCase();
  if (!RECURRENCE_FREQS[freq]) return null;
  const interval = Number(raw.interval);
  const weekday = Number(raw.weekday);
  const at = /^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(raw.at || '')) ? String(raw.at) : '';
  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? Math.min(90, Math.round(interval)) : 1,
    weekday: freq === 'weekly' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null,
    at,
  };
}

/**
 * เวลารอบถัดไปของงานที่ทำซ้ำ
 * @param {string|number|Date} from จุดเริ่ม (ปกติคือ due เดิม หรือ now)
 * @param {object|string} recurrence
 */
export function nextOccurrence(from, recurrence, now = Date.now()) {
  const rec = normalizeRecurrence(recurrence);
  if (!rec) return null;
  const base = new Date(from ?? now);
  const start = Number.isNaN(base.getTime()) ? new Date(now) : base;
  const next = new Date(start.getTime());
  const every = rec.interval || 1;
  const [hh, mm] = rec.at ? rec.at.split(':').map(Number) : [start.getHours(), start.getMinutes()];

  if (rec.freq === 'hourly') {
    next.setTime(start.getTime() + every * HOUR);
    return next.toISOString();
  }
  if (rec.freq === 'daily' || rec.freq === 'weekdays' || rec.freq === 'weekly') {
    if (rec.freq === 'weekly') {
      const target = rec.weekday ?? start.getDay();
      // ถ้าอยู่ในวันเป้าหมายแล้ว → ข้ามไปอีก interval สัปดาห์
      const days = rec.weekday != null && start.getDay() !== target
        ? (target - start.getDay() + 7) % 7
        : 7 * every;
      next.setDate(next.getDate() + (days || 7 * every));
    } else {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(hh, mm, 0, 0);
    if (rec.freq === 'weekdays') {
      // ข้ามเสาร์–อาทิตย์
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      if (every > 1) {
        // ทุก N วันทำการ: นับเฉพาะวันจันทร์–ศุกร์
        let remaining = every - 1;
        while (remaining > 0) {
          next.setDate(next.getDate() + 1);
          if (next.getDay() !== 0 && next.getDay() !== 6) remaining -= 1;
        }
      }
    }
    return next.toISOString();
  }
  if (rec.freq === 'monthly') {
    next.setMonth(next.getMonth() + every);
    next.setHours(hh, mm, 0, 0);
    return next.toISOString();
  }
  return null;
}

export function describeRecurrence(recurrence) {
  const rec = normalizeRecurrence(recurrence);
  if (!rec) return '';
  const base = RECURRENCE_FREQS[rec.freq];
  const every = rec.interval > 1 ? `ทุก ${rec.interval} ${rec.freq === 'hourly' ? 'ชั่วโมง' : rec.freq === 'monthly' ? 'เดือน' : 'สัปดาห์'}` : base;
  const weekday = rec.freq === 'weekly' && rec.weekday != null ? ` (${WEEKDAYS_TH[rec.weekday]})` : '';
  return `${every}${weekday}${rec.at ? ` ${rec.at}` : ''}`.trim();
}

export function normalizeTask(raw = {}, now = Date.now()) {
  const title = String(raw.title || raw.text || '').trim().slice(0, 200);
  if (!title) return null;
  const created = Number(raw.createdAt) || now;
  return {
    id: String(raw.id || `t_${created.toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    title,
    notes: String(raw.notes || '').slice(0, 1000),
    due: raw.due ? parseDue(raw.due, created) : null,
    done: raw.done === true,
    doneAt: raw.doneAt ? Number(raw.doneAt) : null,
    priority: normalizePriority(raw.priority),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).slice(0, 24)).slice(0, 8) : [],
    createdAt: created,
    updatedAt: Number(raw.updatedAt) || created,
    notifiedAt: raw.notifiedAt ? Number(raw.notifiedAt) : null,
    deleted: raw.deleted === true,
    recurrence: normalizeRecurrence(raw.recurrence),
    repeatCount: Number(raw.repeatCount) || 0,
    device: raw.device ? String(raw.device).slice(0, 40) : '',
  };
}

export function isOverdue(task, now = Date.now()) {
  return !!task?.due && !task.done && !task.deleted && Date.parse(task.due) < now;
}

export function isDueToday(task, now = Date.now()) {
  if (!task?.due || task.done || task.deleted) return false;
  const d = new Date(task.due);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** รวมงานจากเครื่องอื่น: last-write-wins ต่อ id (รองรับ tombstone) */
export function mergeTaskLists(local = [], remote = []) {
  const map = new Map();
  for (const t of local) {
    const n = normalizeTask(t);
    if (n) map.set(n.id, n);
  }
  let added = 0;
  let updated = 0;
  let removed = 0;
  for (const raw of remote) {
    const incoming = normalizeTask(raw);
    if (!incoming) continue;
    const existing = map.get(incoming.id);
    if (!existing) {
      map.set(incoming.id, incoming);
      added += 1;
      continue;
    }
    if (incoming.updatedAt > existing.updatedAt) {
      map.set(incoming.id, incoming);
      if (incoming.deleted) removed += 1;
      else updated += 1;
    }
  }
  return { tasks: [...map.values()], added, updated, removed };
}

export class TaskStore {
  constructor({ storage = null, key = TASKS_KEY, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.now = now;
    this.tasks = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map((t) => normalizeTask(t, this.now())).filter(Boolean) : [];
    } catch { return []; }
  }

  _save(candidate = this.tasks) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(candidate));
      return true;
    } catch (cause) {
      const error = new Error('บันทึกงานไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม — งานเดิมยังคงอยู่', { cause });
      error.name = 'TaskStorageError';
      throw error;
    }
  }

  _commit(candidate) {
    this._save(candidate);
    this.tasks = candidate;
    return true;
  }

  add({ title, notes = '', due = null, priority = 0, tags = [], device = '', recurrence = null } = {}) {
    const now = this.now();
    const rec = normalizeRecurrence(recurrence);
    const firstDue = due ? parseDue(due, now) : rec ? nextOccurrence(now, rec, now) : null;
    const task = normalizeTask({
      id: `t_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title, notes, due: firstDue, priority, tags, device, recurrence: rec,
      createdAt: now, updatedAt: now,
    }, now);
    if (!task) throw new Error('ต้องมีชื่องาน');
    this._commit([...this.tasks, task]);
    return task;
  }

  get(id) {
    return this.tasks.find((t) => t.id === id && !t.deleted) || null;
  }

  update(id, patch = {}) {
    const current = this.get(id);
    if (!current) return null;
    const task = { ...current, tags: [...current.tags] };
    if (patch.title != null) task.title = String(patch.title).trim().slice(0, 200) || task.title;
    if (patch.notes != null) task.notes = String(patch.notes).slice(0, 1000);
    if (patch.due !== undefined) {
      task.due = patch.due ? parseDue(patch.due, this.now()) : null;
      task.notifiedAt = null;
    }
    if (patch.priority != null) task.priority = normalizePriority(patch.priority);
    if (patch.done != null) {
      task.done = !!patch.done;
      task.doneAt = task.done ? this.now() : null;
    }
    if (Array.isArray(patch.tags)) task.tags = patch.tags.map((t) => String(t).slice(0, 24)).slice(0, 8);
    task.updatedAt = this.now();
    this._commit(this.tasks.map((item) => item.id === id ? task : item));
    return task;
  }

  /**
   * ปิดงาน — ถ้าเป็นงานซ้ำ จะเลื่อนไปรอบถัดไปโดยไม่ปิดจริง
   * @returns {{task: object|null, advanced: boolean}}
   */
  complete(id, done = true) {
    const task = this.get(id);
    if (!task) return { task: null, advanced: false };
    if (!done) { this.update(id, { done: false }); return { task: this.get(id), advanced: false }; }
    const rec = normalizeRecurrence(task.recurrence);
    if (!rec) {
      const updated = this.update(id, { done: true });
      return { task: updated, advanced: false };
    }
    const now = this.now();
    const updated = {
      ...task,
      done: false,
      doneAt: now,
      due: nextOccurrence(task.due || now, rec, now),
      notifiedAt: null,
      repeatCount: (task.repeatCount || 0) + 1,
      updatedAt: now,
    };
    this._commit(this.tasks.map((item) => item.id === id ? updated : item));
    return { task: updated, advanced: true };
  }

  remove(id) {
    const task = this.get(id);
    if (!task) return false;
    const now = this.now();
    const deleted = { ...task, deleted: true, updatedAt: now };
    this._commit(this.tasks.map((item) => item.id === id ? deleted : item));
    return true;
  }

  removeMany(ids = []) {
    const selected = new Set(ids);
    const now = this.now();
    let removed = 0;
    const candidate = this.tasks.map((task) => {
      if (!selected.has(task.id) || task.deleted) return task;
      removed += 1;
      return { ...task, deleted: true, updatedAt: now };
    });
    if (removed) this._commit(candidate);
    return removed;
  }

  clear() {
    this._commit([]);
    return true;
  }

  replaceAll(tasks = []) {
    const candidate = tasks.map((task) => normalizeTask(task, this.now())).filter(Boolean);
    this._commit(candidate);
    return candidate.length;
  }

  /** @param {{done?: boolean|null, dueWithinMs?: number, sort?: 'due'|'priority'|'created'}} opts */
  list({ done = null, dueWithinMs = null, sort = 'due' } = {}) {
    const now = this.now();
    let list = this.tasks.filter((t) => !t.deleted);
    if (done !== null) list = list.filter((t) => t.done === done);
    if (dueWithinMs != null) {
      list = list.filter((t) => t.due && !t.done && Date.parse(t.due) - now <= dueWithinMs);
    }
    const byDue = (a, b) => (Date.parse(a.due || '') || Infinity) - (Date.parse(b.due || '') || Infinity);
    if (sort === 'priority') list = [...list].sort((a, b) => b.priority - a.priority || byDue(a, b));
    else if (sort === 'created') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    else list = [...list].sort((a, b) => (a.done === b.done ? byDue(a, b) : a.done ? 1 : -1));
    return list;
  }

  /** งานที่ถึงเวลาและยังไม่เคยแจ้ง */
  dueNow(now = this.now(), graceMs = 5 * MINUTE) {
    return this.tasks.filter((t) => {
      if (t.deleted || t.done || !t.due) return false;
      const at = Date.parse(t.due);
      return at <= now && now - at <= graceMs * 12 && !t.notifiedAt;
    });
  }

  markNotified(id, now = this.now()) {
    const task = this.get(id);
    if (!task) return null;
    const updated = { ...task, notifiedAt: now };
    this._commit(this.tasks.map((item) => item.id === id ? updated : item));
    return updated;
  }

  stats(now = this.now()) {
    const live = this.tasks.filter((t) => !t.deleted);
    const open = live.filter((t) => !t.done);
    return {
      total: live.length,
      open: open.length,
      done: live.length - open.length,
      overdue: open.filter((t) => isOverdue(t, now)).length,
      today: open.filter((t) => isDueToday(t, now)).length,
      upcoming: open.filter((t) => t.due && Date.parse(t.due) > now).length,
    };
  }

  exportData() {
    return { tasks: this.tasks.filter((t) => !t.deleted || t.updatedAt > 0).map((t) => ({ ...t })) };
  }

  merge(remoteTasks = []) {
    const res = mergeTaskLists(this.tasks, remoteTasks);
    this._commit(res.tasks);
    return { ...res, changed: res.added + res.updated + res.removed };
  }
}

/** ตัวตั้งเวลาเตือน — เรียก onDue ครั้งเดียวต่องาน (จำด้วย notifiedAt) */
export class TaskScheduler {
  constructor({
    store, onDue = () => {}, intervalMs = 30_000, now = () => Date.now(),
    setIntervalFn = (fn, ms) => setInterval(fn, ms), clearIntervalFn = (id) => clearInterval(id),
  } = {}) {
    this.store = store;
    this.onDue = onDue;
    this.intervalMs = intervalMs;
    this.now = now;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.timer = null;
  }

  get running() { return this.timer != null; }

  start() {
    if (this.timer != null) return this;
    this.tick();
    this.timer = this.setIntervalFn(() => this.tick(), this.intervalMs);
    return this;
  }

  stop() {
    if (this.timer != null) this.clearIntervalFn(this.timer);
    this.timer = null;
    return this;
  }

  /** @returns {object[]} งานที่แจ้งในรอบนี้ */
  tick() {
    if (!this.store) return [];
    const due = this.store.dueNow(this.now());
    for (const task of due) {
      try { this.store.markNotified(task.id, this.now()); }
      catch { continue; } // ยังไม่เตือนจนกว่าจะบันทึกสถานะได้ เพื่อไม่ให้แจ้งซ้ำทุก tick
      try { this.onDue(task); } catch { /* อย่าให้ callback พังทั้งตัวตั้งเวลา */ }
    }
    return due;
  }
}

export function formatTaskTime(due, now = Date.now()) {
  if (!due) return 'ไม่กำหนดเวลา';
  const at = Date.parse(due);
  if (Number.isNaN(at)) return 'ไม่กำหนดเวลา';
  const d = new Date(at);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `วันนี้ ${hhmm}`;
  const diffDays = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / DAY);
  if (diffDays === 1) return `พรุ่งนี้ ${hhmm}`;
  if (diffDays === -1) return `เมื่อวาน ${hhmm}`;
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${hhmm}`;
}
