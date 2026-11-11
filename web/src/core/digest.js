// สรุปประจำวัน (daily digest) — รวมงานค้าง/เกินกำหนด/วันนี้ + นัดหมาย + ความจำใหม่ เป็นสรุปเดียว
//
// ฟังก์ชันบริสุทธิ์ (ไม่แตะ DOM/storage) → เทสต์ง่าย และใช้ได้ทั้ง UI และ tool ที่ AI เรียก

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(a, b) {
  if (a == null || b == null) return false;
  return startOfDay(Number(a)) === startOfDay(Number(b));
}

const fmtTime = (ts) => {
  const d = new Date(Number(ts));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDate = (ts) => {
  const d = new Date(Number(ts));
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const PRIORITY = { 0: '⚪', 1: '🔵', 2: '🟠', 3: '🔴' };

/** รับได้ทั้ง timestamp (number) และ ISO string — คืน null ถ้าไม่มี/อ่านไม่ได้ */
export function toMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dueLabel(ts, now, lang) {
  if (ts == null) return lang === 'en' ? 'no due date' : 'ไม่กำหนด';
  if (isSameDay(ts, now)) return lang === 'en' ? `today ${fmtTime(ts)}` : `วันนี้ ${fmtTime(ts)}`;
  const diffDays = Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
  if (diffDays === 1) return lang === 'en' ? `tomorrow ${fmtTime(ts)}` : `พรุ่งนี้ ${fmtTime(ts)}`;
  if (diffDays === -1) return lang === 'en' ? `yesterday ${fmtTime(ts)}` : `เมื่อวาน ${fmtTime(ts)}`;
  if (diffDays < 0) return lang === 'en' ? `${Math.abs(diffDays)}d late` : `เลย ${Math.abs(diffDays)} วัน`;
  return lang === 'en' ? `in ${diffDays}d (${fmtDate(ts)})` : `อีก ${diffDays} วัน (${fmtDate(ts)})`;
}

/**
 * @param {object} input
 * @param {Array<{id?:string,title:string,due?:number|null,done?:boolean,priority?:number,recurrence?:string}>} input.tasks
 * @param {Array<{id?:string,title:string,start?:number|string,when?:number|string}>} input.events
 * @param {Array<{text:string,createdAt?:number,ts?:number}>} input.memories
 * @param {number} [input.now]
 * @param {string} [input.lang] th | en
 */
export function buildDigest({ tasks = [], events = [], memories = [], now = Date.now(), lang = 'th' } = {}) {
  const en = lang === 'en';
  // task store เก็บ due เป็น ISO string — normalise ให้เป็น ms ก่อนเปรียบเทียบ
  const normalized = (tasks || [])
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({ ...t, due: toMs(t.due) }));
  const open = normalized.filter((t) => !t.done);
  const overdue = open
    .filter((t) => t.due != null && Number(t.due) < now && !isSameDay(t.due, now))
    .sort((a, b) => a.due - b.due);
  const today = open
    .filter((t) => t.due != null && isSameDay(t.due, now))
    .sort((a, b) => a.due - b.due);
  const noDue = open.filter((t) => t.due == null);
  // เสร็จแล้ว: นับเฉพาะที่ยังไม่ถูกลบ
  const soon = open
    .filter((t) => t.due != null && Number(t.due) > now && Number(t.due) - now <= 2 * DAY && !isSameDay(t.due, now))
    .sort((a, b) => a.due - b.due);
  const upcoming = open
    .filter((t) => t.due != null && Number(t.due) > now + 2 * DAY)
    .sort((a, b) => a.due - b.due);
  const dayEvents = (events || [])
    .map((e) => ({ ...e, at: toMs(e.start ?? e.when) ?? 0 }))
    .filter((e) => e.at && isSameDay(e.at, now))
    .sort((a, b) => a.at - b.at);
  const newMemories = (memories || [])
    .map((m) => ({ ...m, at: toMs(m.createdAt ?? m.ts) ?? 0 }))
    .filter((m) => m.at && now - m.at <= DAY && m.text)
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);

  const taskItem = (t) => ({
    label: `${PRIORITY[t.priority] || '⚪'} ${t.title}`,
    meta: [dueLabel(t.due, now, lang), t.recurrence ? (en ? 'repeats' : 'งานซ้ำ') : ''].filter(Boolean).join(' · '),
    kind: 'task',
    id: t.id || '',
  });

  const sections = [
    {
      id: 'overdue',
      emoji: '⏰',
      title: en ? 'Overdue' : 'เกินกำหนด',
      items: overdue.map(taskItem),
    },
    {
      id: 'today',
      emoji: '🎯',
      title: en ? 'Due today' : 'ต้องทำวันนี้',
      items: today.map(taskItem),
    },
    {
      id: 'events',
      emoji: '📅',
      title: en ? 'Appointments today' : 'นัดหมายวันนี้',
      items: dayEvents.map((e) => ({
        label: e.title || (en ? 'Untitled' : 'ไม่มีชื่อ'),
        meta: fmtTime(e.at),
        kind: 'event',
        id: e.id || '',
      })),
    },
    {
      id: 'soon',
      emoji: '🔭',
      title: en ? 'Next 48 hours' : 'ภายใน 48 ชั่วโมง',
      items: soon.map(taskItem),
    },
    {
      id: 'upcoming',
      emoji: '🗓',
      title: en ? 'Coming up' : 'งานถัดไป',
      items: upcoming.slice(0, 5).map(taskItem),
      more: Math.max(0, upcoming.length - 5),
    },
    {
      id: 'memories',
      emoji: '🧠',
      title: en ? 'New memories' : 'ความจำใหม่',
      items: newMemories.map((m) => ({
        label: m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text,
        meta: fmtTime(m.at),
        kind: 'memory',
        id: m.id || '',
      })),
    },
    {
      id: 'later',
      emoji: '📥',
      title: en ? 'Backlog (no due date)' : 'งานที่ยังไม่กำหนดเวลา',
      items: noDue.slice(0, 5).map(taskItem),
      more: Math.max(0, noDue.length - 5),
    },
  ].filter((s) => s.items.length > 0 || s.more);

  const counts = {
    tasks: open.length,
    overdue: overdue.length,
    today: today.length,
    events: dayEvents.length,
    memories: newMemories.length,
    done: normalized.filter((t) => t.done).length,
  };

  const total = counts.overdue + counts.today + counts.events;
  const headline = total
    ? (en
      ? `${counts.today} due today, ${counts.overdue} overdue, ${counts.events} appointment(s)`
      : `วันนี้มี ${counts.today} งาน · เกินกำหนด ${counts.overdue} · นัดหมาย ${counts.events}`)
    : (en ? 'Nothing urgent today — good time to plan' : 'วันนี้ไม่มีอะไรด่วน — เหมาะกับการวางแผน');

  const big = total ? String(total) : (en ? 'ว่าง' : 'ว่าง');
  const digest = {
    date: startOfDay(now),
    lang,
    headline,
    big,
    unit: en ? 'item(s) today' : 'รายการวันนี้',
    sections,
    counts,
    empty: sections.length === 0,
    generatedAt: now,
  };
  return { ...digest, markdown: digestMarkdown(digest) };
}

/** ข้อความ markdown สำหรับ copy/ส่งต่อ/ให้ AI อ่าน */
export function digestMarkdown(digest) {
  const en = digest.lang === 'en';
  const dateStr = new Date(digest.date).toLocaleDateString(en ? 'en-GB' : 'th-TH', { dateStyle: 'full' });
  const lines = [`## ${en ? 'Daily digest' : 'สรุปประจำวัน'} — ${dateStr}`, '', `**${digest.headline}**`];
  for (const s of digest.sections) {
    lines.push('', `### ${s.emoji} ${s.title} (${s.items.length}${s.more ? `+${s.more}` : ''})`);
    for (const it of s.items) lines.push(`- ${it.label}${it.meta ? ` · ${it.meta}` : ''}`);
    if (s.more) lines.push(`- …${en ? ` ${s.more} more` : `อีก ${s.more}`}`);
  }
  if (digest.empty) lines.push('', en ? '_Nothing scheduled or pending._' : '_ไม่มีงานหรือนัดหมายค้างอยู่_');
  return lines.join('\n');
}

/**
 * สร้าง tool `digest` ที่ดึงข้อมูลสดจาก store ตอนถูกเรียก (ไม่ cache)
 * @param {{tasks: object, calendar?: object, memory?: object, lang?: () => string}} deps
 */
export function digestTool({ tasks, calendar = null, memory = null, lang = () => 'th' } = {}) {
  return {
    emoji: '🌅',
    label: 'สรุปวันนี้',
    desc: 'สรุปงานค้าง งานเกินกำหนด นัดหมายวันนี้ และความจำใหม่',
    params: {},
    meta: { category: 'read', risk: 0 },
    async run() {
      const now = Date.now();
      const digest = buildDigest({
        tasks: typeof tasks?.list === 'function' ? tasks.list({ done: null }) : [],
        events: typeof calendar?.list === 'function' ? calendar.list() : [],
        memories: typeof memory?.recent === 'function' ? memory.recent(24) : [],
        now,
        lang: typeof lang === 'function' ? lang() : lang,
      });
      return {
        title: digest.lang === 'en' ? 'Daily digest' : 'สรุปประจำวัน',
        big: digest.big,
        lines: digest.headline ? [digest.headline] : [],
        sections: digest.sections,
        markdown: digest.markdown,
        counts: digest.counts,
      };
    },
  };
}

/** ครั้งแรกของวันหรือยัง (ใช้กับการแจ้งเตือนอัตโนมัติ) */
export function shouldAutoDigest({ lastDate = null, now = Date.now(), hour = 7 } = {}) {
  const today = startOfDay(now);
  if (lastDate === today) return false;
  const currentHour = new Date(now).getHours();
  return currentHour >= Math.min(23, Math.max(0, Number(hour) || 0));
}
