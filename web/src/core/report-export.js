// ส่งออกรายงาน (สรุปวันนี้ / รายงานสัปดาห์) เป็น Markdown หรือ CSV
//
// เป้าหมาย: เอาไปเปิดใน Excel/Google Sheets ได้ทันที (มี BOM + escape ถูกต้อง)
// และมีชื่อไฟล์ที่บอกวันที่ เพื่อไม่ให้ไฟล์ทับกันเมื่อโหลดหลายครั้ง

export const BOM = '\ufeff';

/** escape ค่าเดียวสำหรับ CSV (ใส่ quote เมื่อจำเป็น + กัน formula injection) */
export function escapeCsv(value) {
  if (value == null) return '';
  let text = String(value);
  // กัน Excel ตีความเป็นสูตรเมื่อขึ้นต้นด้วยอักขระเหล่านี้
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * แปลงตารางเป็น CSV
 * @param {object[]|any[][]} rows
 * @param {{columns?: string[], header?: string[]}} opts
 */
export function toCsv(rows = [], { columns = null, header = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = columns || (list.length && !Array.isArray(list[0]) ? Object.keys(list[0]) : null);
  const lines = [];
  if (header) lines.push(header.map(escapeCsv).join(','));
  else if (cols) lines.push(cols.map(escapeCsv).join(','));
  for (const row of list) {
    const cells = Array.isArray(row) ? row : (cols || Object.keys(row)).map((c) => row[c]);
    lines.push(cells.map(escapeCsv).join(','));
  }
  return lines.join('\r\n');
}

/** วันที่แบบ YYYY-MM-DD (timezone เครื่อง) */
export function dateStamp(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ชื่อไฟล์มีวันที่ เช่น no7-weekly-2026-11-10.csv */
export function datedFilename(base, ext, now = Date.now()) {
  const clean = String(base || 'report').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'report';
  const suffix = String(ext || 'txt').replace(/^\./, '').toLowerCase();
  return `${clean}-${dateStamp(now)}.${suffix}`;
}

const toRows = (sections = []) => sections.flatMap((sec) => (sec.items || []).map((it) => ({
  section: sec.title || '',
  item: it.label || '',
  detail: it.meta || '',
})));

/** CSV ของรายงานสัปดาห์: ตัวเลขสรุป + รายการในแต่ละหัวข้อ */
export function weeklyCsv(weekly = {}) {
  const counts = weekly.counts || {};
  const metrics = [
    ['งานที่ทำเสร็จ', counts.completed, counts.completedPrev],
    ['งานที่สร้างใหม่', counts.created, ''],
    ['งานเลยกำหนด', counts.overdue, ''],
    ['งานครบกำหนดสัปดาห์หน้า', counts.dueNextWeek, ''],
    ['นัดหมายในสัปดาห์', counts.events, ''],
    ['ความจำใหม่', counts.newFacts, ''],
    ['เครื่องมือที่ใช้', counts.toolRuns, counts.toolRunsPrev],
    ['บทสนทนา', counts.chats, ''],
    ['ข้อผิดพลาด', counts.failures, ''],
  ];
  const rows = [
    ...metrics.map(([label, value, prev]) => ({ section: 'สรุปตัวเลข', item: label, detail: prev === '' || prev == null ? String(value ?? '') : `${value ?? ''} (สัปดาห์ก่อน ${prev})` })),
    ...toRows(weekly.sections),
  ];
  return `${BOM}${toCsv(rows, { columns: ['section', 'item', 'detail'], header: ['หมวด', 'รายการ', 'รายละเอียด'] })}\r\n`;
}

/** CSV ของสรุปประจำวัน */
export function digestCsv(digest = {}) {
  const rows = [
    { section: 'ภาพรวม', item: 'หัวข้อ', detail: digest.headline || '' },
    ...toRows(digest.sections),
  ];
  return `${BOM}${toCsv(rows, { columns: ['section', 'item', 'detail'], header: ['หมวด', 'รายการ', 'รายละเอียด'] })}\r\n`;
}

const wi = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/**
 * Markdown ของรายงาน (weekly | digest)
 * @param {object} report
 * @param {{kind?: 'weekly'|'digest', lang?: 'th'|'en', now?: number}} opts
 */
export function reportMarkdown(report = {}, { kind = 'weekly', lang = 'th', now = Date.now() } = {}) {
  const en = lang === 'en';
  const weekly = kind === 'weekly';
  const title = weekly
    ? (en ? 'Weekly review' : 'รายงานสัปดาห์')
    : (en ? 'Today' : 'สรุปวันนี้');
  const range = report.range?.label ? ` — ${report.range.label}` : '';
  const out = [`# ${title}${range}`, '', `_${dateStamp(now)}_`, ''];
  if (report.headline) out.push(`**${report.headline}**`, '');

  if (weekly && report.counts) {
    const c = report.counts;
    const rows = [
      [en ? 'Completed' : 'เสร็จแล้ว', wi(c.completed)],
      [en ? 'Created' : 'สร้างใหม่', wi(c.created)],
      [en ? 'Overdue' : 'เลยกำหนด', wi(c.overdue)],
      [en ? 'Due next week' : 'ครบกำหนดสัปดาห์หน้า', wi(c.dueNextWeek)],
      [en ? 'Events' : 'นัดหมาย', wi(c.events)],
      [en ? 'New memories' : 'ความจำใหม่', wi(c.newFacts)],
      [en ? 'Tool runs' : 'ใช้เครื่องมือ', wi(c.toolRuns)],
      [en ? 'Chats' : 'บทสนทนา', wi(c.chats)],
      [en ? 'Failures' : 'ข้อผิดพลาด', wi(c.failures)],
      [en ? 'Avg first token (ms)' : 'เวลาแรกตอบ (ms)', wi(c.avgFirstTokenMs)],
    ];
    out.push(`| ${en ? 'Metric' : 'ตัวชี้วัด'} | ${en ? 'Value' : 'ค่า'} |`, '| --- | --- |');
    for (const [k, v] of rows) out.push(`| ${k} | ${v} |`);
    out.push('');
  }

  for (const sec of report.sections || []) {
    out.push(`## ${sec.emoji ? `${sec.emoji} ` : ''}${sec.title || ''}`, '');
    const items = sec.items || [];
    if (!items.length) out.push(en ? '_Nothing._' : '_ไม่มีรายการ_', '');
    for (const it of items) out.push(`- ${it.label || ''}${it.meta ? ` (${it.meta})` : ''}`);
    if (sec.more) out.push(`- …${en ? `${sec.more} more` : `อีก ${sec.more}`}`);
    out.push('');
  }

  const hasFocusSection = (report.sections || []).some((sec) => sec.id === 'focus');
  if (weekly && Array.isArray(report.focus) && report.focus.length && !hasFocusSection) {
    out.push(`## ${en ? 'Focus' : 'โฟกัส'}`, '');
    for (const f of report.focus) out.push(`- ${f.text || f.label || f.id || ''}`);
    out.push('');
  }

  out.push('---', `_No7 · ${en ? 'generated' : 'สร้างเมื่อ'} ${new Date(now).toLocaleString(en ? 'en-GB' : 'th-TH')}_`);
  return out.join('\n');
}

/** ดาวน์โหลดข้อความในเบราว์เซอร์ (คืน false เมื่อไม่มี Blob/URL) */
export function downloadText(filename, text, { type = 'text/plain;charset=utf-8' } = {}) {
  try {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL?.(url), 0);
    return true;
  } catch {
    return false;
  }
}
