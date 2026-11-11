// ปฏิทินในเครื่อง — นำเข้า/ส่งออก .ics และให้ AI จัดการนัดหมายได้
const KEY = 'no7.calendar.v1';

/* ------------------------------- ICS parser ------------------------------- */
// รองรับ VEVENT พื้นฐาน: SUMMARY / DTSTART / DTEND / LOCATION / DESCRIPTION / UID
// (ไม่รองรับ RRULE, VTIMEZONE เชิงลึก — แปลงเวลาเป็น local ตามที่ระบุ)

function unfold(text) {
  return String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r/g, '');
}

function unescapeText(s) {
  return String(s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseDate(value) {
  const v = String(value || '').trim();
  // 20261110T090000Z | 20261110T090000 | 20261110
  let m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (m) {
    const [, y, mo, d, hh = '00', mm = '00', ss = '00', z] = m;
    const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${z ? 'Z' : ''}`;
    const ts = Date.parse(iso);
    return Number.isFinite(ts) ? new Date(ts).getTime() : null;
  }
  // VALUE=DATE:2026-11-10
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) {
    const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

export function parseIcs(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.summary) {
        events.push({
          uid: cur.uid || `ics-${events.length}-${cur.start || Date.now()}`,
          title: cur.summary,
          start: cur.start ?? null,
          end: cur.end ?? null,
          allDay: !!cur.allDay,
          location: cur.location || '',
          notes: cur.notes || '',
          source: 'ics',
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const key = rawKey.split(';')[0].toUpperCase();
    const params = rawKey.toUpperCase();

    if (key === 'SUMMARY') cur.summary = unescapeText(value);
    else if (key === 'DTSTART') { cur.start = parseDate(value); cur.allDay = params.includes('VALUE=DATE'); }
    else if (key === 'DTEND') cur.end = parseDate(value);
    else if (key === 'LOCATION') cur.location = unescapeText(value);
    else if (key === 'DESCRIPTION') cur.notes = unescapeText(value);
    else if (key === 'UID') cur.uid = value.trim();
  }
  return events;
}

function pad(n) { return String(n).padStart(2, '0'); }
function icsDate(ts, allDay = false) {
  const d = new Date(ts);
  if (allDay) return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }

export function toIcs(events = []) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//No7 Personal AI Bot//TH//',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid || `no7-${e.start}-${Math.random().toString(36).slice(2, 7)}`}`);
    if (e.start) lines.push(`DTSTART${e.allDay ? ';VALUE=DATE' : ''}:${icsDate(e.start, e.allDay)}`);
    if (e.end) lines.push(`DTEND${e.allDay ? ';VALUE=DATE' : ''}:${icsDate(e.end, e.allDay)}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ------------------------------- calendar -------------------------------- */
export class CalendarStore {
  constructor({ storage = globalThis.localStorage, key = KEY } = {}) {
    this.storage = storage;
    this.key = key;
    this.events = this._read();
  }

  _read() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  _persist(candidate = this.events) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(candidate));
      return true;
    } catch (cause) {
      const error = new Error('บันทึกปฏิทินไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม — นัดหมายเดิมยังคงอยู่', { cause });
      error.name = 'CalendarStorageError';
      throw error;
    }
  }

  _commit(candidate) {
    this._persist(candidate);
    this.events = candidate;
    return true;
  }

  add({ title, start, end = null, allDay = false, location = '', notes = '', uid = null }) {
    const ts = typeof start === 'number' ? start : parseDate(start) ?? Date.parse(start);
    if (!Number.isFinite(ts)) throw new Error('เวลาเริ่มไม่ถูกต้อง');
    // กันซ้ำด้วย uid หรือ (title + start)
    const dup = this.events.find((e) => (uid && e.uid === uid) || (e.title === title && e.start === ts));
    if (dup) return dup;
    const ev = {
      uid: uid || `no7-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      title: String(title || 'นัดหมาย').slice(0, 200),
      start: ts, end: end ? (typeof end === 'number' ? end : Date.parse(end)) : null,
      allDay, location, notes, source: 'app',
    };
    const candidate = [...this.events, ev].sort((a, b) => a.start - b.start);
    this._commit(candidate);
    return ev;
  }

  remove(uid) {
    const candidate = this.events.filter((event) => event.uid !== uid);
    if (candidate.length === this.events.length) return false;
    this._commit(candidate);
    return true;
  }

  /** upcoming({days, limit}) — จาก now เป็นต้นไป */
  upcoming({ days = 7, limit = 10, now = Date.now() } = {}) {
    const until = now + days * 86400000;
    return this.events
      .filter((e) => e.start >= now - 3600000 * 6 && e.start <= until)
      .sort((a, b) => a.start - b.start)
      .slice(0, limit);
  }

  all() { return [...this.events].sort((a, b) => a.start - b.start); }

  importIcs(text) {
    const parsed = parseIcs(text);
    let added = 0;
    const candidate = [...this.events];
    for (const event of parsed) {
      if (event.start == null) continue;
      const dup = candidate.find((existing) => existing.uid === event.uid || (existing.title === event.title && existing.start === event.start));
      if (dup) continue;
      candidate.push(event);
      added++;
    }
    if (added) this._commit(candidate.sort((a, b) => a.start - b.start));
    return { added, total: parsed.length };
  }

  exportIcs() { return toIcs(this.events); }

  toJSON() { return this.all(); }

  replaceAll(list = []) {
    const candidate = list.filter((event) => event && Number.isFinite(event.start)).sort((a, b) => a.start - b.start);
    this._commit(candidate);
    return candidate.length;
  }
}

let singleton = null;
export function getCalendar() {
  if (!singleton) singleton = new CalendarStore();
  return singleton;
}

/** "วันนี้ 14:30" — ใช้ใน UI และการ์ดผลลัพธ์ */
export function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `วันนี้ ${time}`;
  if (tomorrow) return `พรุ่งนี้ ${time}`;
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${time}`;
}
