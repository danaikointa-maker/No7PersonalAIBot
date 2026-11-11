import { BOM, toCsv, dateStamp } from './report-export.js';
import { normalizeHealthHistory, healthTrend } from './health-history.js';

const LABELS = {
  th: { title: 'ประวัติสุขภาพข้อมูล', date: 'วันที่', score: 'คะแนน', grade: 'เกรด', high: 'ปัญหาระดับสูง', medium: 'ปัญหาระดับกลาง', low: 'ปัญหาระดับต่ำ', issues: 'ปัญหารวม', trend: 'แนวโน้ม', privacy: 'มีเฉพาะข้อมูลสรุปสุขภาพ ไม่มีข้อความส่วนตัว', empty: 'ยังไม่มีประวัติสุขภาพที่บันทึกไว้' },
  en: { title: 'Data health history', date: 'Date', score: 'Score', grade: 'Grade', high: 'High issues', medium: 'Medium issues', low: 'Low issues', issues: 'Total issues', trend: 'Trend', privacy: 'Summary health metrics only; no personal item text.', empty: 'No saved health history.' },
};
const labels = (lang) => LABELS[lang === 'en' ? 'en' : 'th'];
const total = (row) => row.issues.high + row.issues.medium + row.issues.low;

export function healthHistoryCsv(history, { lang = 'th' } = {}) {
  const l = labels(lang);
  const snapshots = normalizeHealthHistory(history).snapshots;
  const rows = snapshots.map((item) => [item.date, item.score, item.grade, item.issues.high, item.issues.medium, item.issues.low, total(item)]);
  return `${BOM}${toCsv(rows, { header: [l.date, l.score, l.grade, l.high, l.medium, l.low, l.issues] })}\r\n`;
}

export function healthHistoryJson(history, { now = Date.now() } = {}) {
  const normalized = normalizeHealthHistory(history);
  const output = `${JSON.stringify({
    format: 'no7-health-history', schema: 1, exportedAt: new Date(now).toISOString(),
    snapshots: normalized.snapshots.map(({ date, score, grade, issues }) => ({ date, score, grade, issues })),
  }, null, 2)}\n`;
  if (new TextEncoder().encode(output).byteLength > 20 * 1024 * 1024) {
    throw new Error('Health history JSON exceeds 20 MiB; history was kept on this device');
  }
  return output;
}

export function healthHistoryMarkdown(history, { lang = 'th', now = Date.now() } = {}) {
  const en = lang === 'en';
  const l = labels(lang);
  const snapshots = normalizeHealthHistory(history).snapshots;
  const trend = healthTrend({ schema: 1, snapshots }, lang);
  const out = [`# ${l.title}`, '', `_${dateStamp(now)}_`, '', `_${l.privacy}_`, ''];
  if (!snapshots.length) {
    out.push(l.empty);
    return out.join('\n');
  }
  out.push(`**${l.trend}: ${trend.label}**`, '', `| ${l.date} | ${l.score} | ${l.grade} | ${l.high} | ${l.medium} | ${l.low} | ${l.issues} |`, '|---|---:|:---:|---:|---:|---:|---:|');
  for (const item of snapshots) out.push(`| ${item.date} | ${item.score} | ${item.grade} | ${item.issues.high} | ${item.issues.medium} | ${item.issues.low} | ${total(item)} |`);
  out.push('', `_${en ? 'No7 · Exported by user' : 'No7 · ส่งออกโดยผู้ใช้'}_`);
  return out.join('\n');
}
