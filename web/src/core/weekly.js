// รายงานรายสัปดาห์ — มองย้อน 7 วัน: ปิดงานได้กี่อย่าง, สร้างใหม่อะไร, นัดหมาย, ความจำใหม่,
// และเครื่องมือที่ใช้บ่อย พร้อมเทียบกับสัปดาห์ก่อน + ข้อเสนอโฟกัสสัปดาห์หน้า
//
// ฟังก์ชันบริสุทธิ์ (ไม่แตะ DOM/storage) → ใช้ได้ทั้ง UI และ tool ที่ AI เรียก

const DAY = 86_400_000;

export function startOfWeek(ts, weekStart = 1) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();                    // 0 = อาทิตย์
  const diff = (day - weekStart + 7) % 7;
  return d.getTime() - diff * DAY;
}

/**
 * ช่วงสัปดาห์ปัจจุบัน + สัปดาห์ก่อน
 * @returns {{start:number,end:number,prevStart:number,prevEnd:number,label:string}}
 */
export function weekRange(now = Date.now(), { weekStart = 1 } = {}) {
  const start = startOfWeek(now, weekStart);
  const end = start + 7 * DAY;
  return {
    start,
    end,
    prevStart: start - 7 * DAY,
    prevEnd: start,
    label: `${new Date(start).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${new Date(end - DAY).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`,
  };
}

const within = (ts, from, to) => Number.isFinite(Number(ts)) && Number(ts) >= from && Number(ts) < to;
const parse = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {object} input
 * @param {Array<{id?:string,title:string,due?:string|number|null,done?:boolean,createdAt?:string,updatedAt?:string,priority?:number}>} input.tasks
 * @param {Array<{title:string,start?:number|string}>} input.events
 * @param {Array<{id?:string,text:string,ts?:number}>} input.facts
 * @param {Array<{kind:string,label?:string,at:number,ok?:boolean,totalMs?:number,firstTokenMs?:number}>} input.samples  metrics ดิบ
 * @param {number} [input.now]
 * @param {number} [input.weekStart] 0=อาทิตย์, 1=จันทร์ (ค่าเริ่มต้น)
 * @param {string} [input.lang]
 */
export function buildWeekly({ tasks = [], events = [], facts = [], samples = [], now = Date.now(), weekStart = 1, lang = 'th' } = {}) {
  const en = lang === 'en';
  const range = weekRange(now, { weekStart });

  const normalizedTasks = (tasks || []).map((t) => ({
    ...t,
    dueMs: parse(t.due),
    createdMs: parse(t.createdAt),
    updatedMs: parse(t.updatedAt),
  }));
  const eventsMs = (events || []).map((e) => ({ ...e, at: parse(e.start) }));
  const factsTs = (facts || []).map((f) => ({ ...f, at: Number(f.ts) || 0 }));

  const completedIn = (from, to) => normalizedTasks.filter((t) => t.done && within(t.updatedMs ?? t.dueMs, from, to));
  const createdIn = (from, to) => normalizedTasks.filter((t) => within(t.createdMs, from, to));

  const completed = completedIn(range.start, range.end);
  const completedPrev = completedIn(range.prevStart, range.prevEnd);
  const created = createdIn(range.start, range.end);

  const open = normalizedTasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueMs != null && t.dueMs < now);
  const dueNextWeek = open.filter((t) => t.dueMs != null && within(t.dueMs, range.end, parse(range.end) + 7 * DAY));

  const eventsThisWeek = eventsMs.filter((e) => within(e.at, range.start, range.end));
  const newFacts = factsTs.filter((f) => within(f.at, range.start, range.end));

  const weekSamples = (samples || []).filter((s) => within(s.at, range.start, range.end));
  const prevSamples = (samples || []).filter((s) => within(s.at, range.prevStart, range.prevEnd));
  const toolSamples = weekSamples.filter((s) => s.kind === 'tool');
  const chatSamples = weekSamples.filter((s) => s.kind === 'chat');

  const toolMap = new Map();
  for (const s of toolSamples) {
    const key = s.label || 'unknown';
    const row = toolMap.get(key) || { tool: key, count: 0, ms: 0, failures: 0 };
    row.count++;
    row.ms += Number(s.totalMs) || 0;
    if (s.ok === false) row.failures++;
    toolMap.set(key, row);
  }
  const tools = [...toolMap.values()]
    .map((r) => ({ ...r, okRate: r.count ? (r.count - r.failures) / r.count : 1 }))
    .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool))
    .slice(0, 5);

  const failures = weekSamples.filter((s) => s.ok === false).length;
  const avgFirstToken = chatSamples.filter((s) => Number.isFinite(s.firstTokenMs)).map((s) => s.firstTokenMs);

  const counts = {
    completed: completed.length,
    completedPrev: completedPrev.length,
    deltaCompleted: completed.length - completedPrev.length,
    created: created.length,
    overdue: overdue.length,
    dueNextWeek: dueNextWeek.length,
    events: eventsThisWeek.length,
    newFacts: newFacts.length,
    toolRuns: toolSamples.length,
    toolRunsPrev: prevSamples.filter((s) => s.kind === 'tool').length,
    chats: chatSamples.length,
    failures,
    avgFirstTokenMs: avgFirstToken.length ? Math.round(avgFirstToken.reduce((a, b) => a + b, 0) / avgFirstToken.length) : null,
  };

  // ข้อเสนอโฟกัส (เรียงตามความสำคัญ)
  const focus = [];
  if (counts.overdue) focus.push({ id: 'overdue', emoji: '⏰', text: en ? `Clear ${counts.overdue} overdue task(s) first` : `ปิดงานเกินกำหนด ${counts.overdue} อย่างก่อน` });
  if (!counts.completed && counts.created) focus.push({ id: 'start', emoji: '🎯', text: en ? 'No task finished this week — pick one small one' : 'สัปดาห์นี้ยังไม่ปิดงานเลย — เลือกงานเล็ก ๆ สักหนึ่งอย่าง' });
  if (counts.created > counts.completed && counts.created) focus.push({ id: 'intake', emoji: '📥', text: en ? `You added ${counts.created} tasks but finished ${counts.completed}` : `เพิ่มงาน ${counts.created} แต่ปิดได้ ${counts.completed} — ลดรับงานใหม่ก่อน` });
  if (counts.dueNextWeek) focus.push({ id: 'next', emoji: '🗓', text: en ? `${counts.dueNextWeek} task(s) due next week — plan early` : `มี ${counts.dueNextWeek} งานครบกำหนดสัปดาห์หน้า — วางแผนล่วงหน้า` });
  if (!counts.newFacts) focus.push({ id: 'memory', emoji: '🧠', text: en ? 'No new memory — teach one fact about yourself' : 'ยังไม่มีความจำใหม่ — สอนอะไรเกี่ยวกับตัวคุณสักอย่าง' });
  if (counts.failures) focus.push({ id: 'errors', emoji: '⚠️', text: en ? `${counts.failures} failed run(s) — check settings` : `มีงานล้มเหลว ${counts.failures} ครั้ง — ตรวจการตั้งค่า` });
  if (!focus.length) focus.push({ id: 'keep', emoji: '✨', text: en ? 'Solid week — keep the pace' : 'สัปดาห์นี้ทำได้ดี — รักษาจังหวะไว้' });

  const item = (label, meta = '') => ({ label, meta });
  const sections = [
    { id: 'done', emoji: '✅', title: en ? `Finished (${counts.completed})` : `ปิดงานได้ (${counts.completed})`, items: completed.slice(0, 5).map((t) => item(t.title)) },
    { id: 'created', emoji: '➕', title: en ? `Added (${counts.created})` : `งานใหม่ (${counts.created})`, items: created.slice(0, 5).map((t) => item(t.title)) },
    { id: 'events', emoji: '📅', title: en ? `Appointments (${counts.events})` : `นัดหมาย (${counts.events})`, items: eventsThisWeek.slice(0, 5).map((e) => item(e.title, new Date(e.at).toLocaleDateString('th-TH'))) },
    { id: 'tools', emoji: '🧰', title: en ? `Tools used (${counts.toolRuns})` : `เครื่องมือที่ใช้ (${counts.toolRuns})`, items: tools.map((t) => item(t.tool, `${t.count}×`)) },
    { id: 'memory', emoji: '🧠', title: en ? `New memory (${counts.newFacts})` : `ความจำใหม่ (${counts.newFacts})`, items: newFacts.slice(0, 5).map((f) => item(f.text)) },
    { id: 'focus', emoji: '🎯', title: en ? 'Focus next week' : 'โฟกัสสัปดาห์หน้า', items: focus.map((f) => item(`${f.emoji} ${f.text}`)) },
  ].filter((s) => s.items.length > 0);

  const deltaText = counts.deltaCompleted === 0
    ? (en ? 'same as last week' : 'เท่าสัปดาห์ก่อน')
    : (en
      ? `${counts.deltaCompleted > 0 ? '+' : ''}${counts.deltaCompleted} vs last week`
      : `${counts.deltaCompleted > 0 ? '+' : ''}${counts.deltaCompleted} เทียบสัปดาห์ก่อน`);

  const headline = en
    ? `${counts.completed} finished · ${counts.created} added · ${counts.toolRuns} tool runs (${deltaText})`
    : `ปิด ${counts.completed} · เพิ่ม ${counts.created} · ใช้เครื่องมือ ${counts.toolRuns} ครั้ง (${deltaText})`;

  const weekly = {
    range,
    lang,
    headline,
    big: String(counts.completed),
    unit: en ? 'task(s) finished' : 'งานที่ปิดได้',
    counts,
    tools,
    focus,
    sections,
    empty: counts.completed + counts.created + counts.events + counts.toolRuns === 0,
    generatedAt: now,
  };
  return { ...weekly, markdown: weeklyMarkdown(weekly) };
}

export function weeklyMarkdown(weekly) {
  const en = weekly.lang === 'en';
  const lines = [
    `## ${en ? 'Weekly review' : 'รายงานรายสัปดาห์'} — ${weekly.range.label}`,
    '',
    `**${weekly.headline}**`,
  ];
  for (const s of weekly.sections) {
    lines.push('', `### ${s.emoji} ${s.title}`);
    for (const it of s.items) lines.push(`- ${it.label}${it.meta ? ` · ${it.meta}` : ''}`);
  }
  if (weekly.empty) lines.push('', en ? '_No activity in this range._' : '_ยังไม่มีความเคลื่อนไหวในช่วงนี้_');
  return lines.join('\n');
}

/**
 * tool `weekly` ที่ดึงข้อมูลสดตอนถูกเรียก
 * @param {{tasks:object, calendar?:object, memory?:object, samples?:Function, lang?:Function}} deps
 */
export function weeklyTool({ tasks, calendar = null, memory = null, samples = () => [], lang = () => 'th' } = {}) {
  return {
    emoji: '📆',
    label: 'รายงานสัปดาห์',
    desc: 'สรุป 7 วัน: งานที่ปิดได้/เพิ่มใหม่ นัดหมาย ความจำใหม่ และเครื่องมือที่ใช้',
    params: {},
    meta: { category: 'read', risk: 0 },
    async run() {
      const weekly = buildWeekly({
        tasks: typeof tasks?.list === 'function' ? tasks.list({ done: null }) : [],
        events: typeof calendar?.list === 'function' ? calendar.list() : [],
        facts: typeof memory?.list === 'function' ? memory.list() : [],
        samples: typeof samples === 'function' ? samples() : samples,
        lang: typeof lang === 'function' ? lang() : lang,
      });
      return {
        title: weekly.lang === 'en' ? 'Weekly review' : 'รายงานรายสัปดาห์',
        big: weekly.big,
        lines: [weekly.headline, ...weekly.focus.slice(0, 2).map((f) => `${f.emoji} ${f.text}`)],
        sections: weekly.sections,
        markdown: weekly.markdown,
        counts: weekly.counts,
      };
    },
  };
}
