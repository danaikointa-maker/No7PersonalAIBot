// Diagnostics — สร้างรายงานปัญหาที่ "ปิดข้อมูลอ่อนไหว" ก่อนให้ผู้ใช้คัดลอก/ดาวน์โหลด
// หลักการ: บอกเท่าที่ช่างจำเป็นต้องรู้ แต่ไม่หลุด key / อีเมล / เบอร์โทร / token

import { METRIC_KINDS, formatMs } from './metrics.js';
import { MCP_CACHE_KEY } from './mcp.js';

const KEY_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***'],
  [/gh[pousr]_[A-Za-z0-9]{10,}/g, 'gh***'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***'],
  [/\b[a-f0-9]{32,}\b/gi, '***hex***'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '***@***'],
  [/\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/g, '0*-***-****'],
  [/\b\+?\d{10,15}\b/g, '***num***'],
  [/((?:api[_-]?)?key|token|secret|password|authorization)\s*[:=]\s*["']?[^"'\s,}]{6,}/gi, '$1=***'],
];

/** ลบข้อมูลอ่อนไหวออกจากข้อความ (ใช้กับ error, url, รายงาน) */
export function redact(text = '') {
  let out = String(text ?? '');
  for (const [re, rep] of KEY_PATTERNS) out = out.replace(re, rep);
  return out;
}

/** แสดง URL แบบปลอดภัย: เก็บ origin + path แต่ตัด query/hash */
export function redactUrl(url = '') {
  try {
    const u = new URL(String(url));
    const safe = `${u.protocol}//${u.host}${u.pathname}`;
    return redact(u.search || u.hash ? `${safe}?…` : safe);
  } catch {
    return redact(url);
  }
}

function fmtPct(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

/**
 * @param {{app?: object, settings?: object, capabilities?: Array|object, metrics?: object,
 *          mcp?: object, storage?: object, errors?: Array, now?: number}} input
 * @returns {string} markdown ที่ปลอดภัยต่อการแชร์
 */
export function buildDiagnosticsReport(input = {}) {
  const now = input.now || Date.now();
  const app = input.app || {};
  const s = input.settings || {};
  const caps = Array.isArray(input.capabilities) ? input.capabilities : (input.capabilities?.items || []);
  const metrics = input.metrics || {};
  const mcp = input.mcp || {};
  const storage = input.storage || {};
  const errors = Array.isArray(input.errors) ? input.errors.slice(-8) : [];

  const lines = [];
  lines.push('# No7 Diagnostics');
  lines.push('');
  lines.push(`- เวลา: ${new Date(now).toISOString()}`);
  lines.push(`- แอป: ${app.name || 'No7 Personal AI'} ${app.version || ''}`.trim());
  if (app.platform) lines.push(`- แพลตฟอร์ม: ${app.platform}`);
  if (app.userAgent) lines.push(`- UA: ${redact(app.userAgent).slice(0, 160)}`);
  lines.push('');

  lines.push('## ตั้งค่า (ไม่รวมความลับ)');
  lines.push(`- ผู้ให้บริการ AI: ${s.provider || '—'} · โมเดล: ${s.model || '—'}`);
  lines.push(`- โหมด: ${s.mode || 'auto'} · persona: ${s.persona || 'no7'} · ภาษา: ${s.language || 'th'}`);
  lines.push(`- อิสระ: ${s.permissions?.autonomy || 'ask-risky'} · หมวดที่ปิด: ${
    Object.entries(s.permissions?.allow || {}).filter(([, v]) => v === false).map(([k]) => k).join(', ') || 'ไม่มี'}`);
  lines.push(`- เสียง: TTS ${s.ttsProvider || 'system'} · barge-in ${s.bargeIn || 'keyword'} · สตรีมมิ่ง ${s.streaming !== false ? 'เปิด' : 'ปิด'}`);
  lines.push(`- server: ${s.serverUrl ? redactUrl(s.serverUrl) : '—'} · sync token: ${s.syncToken ? 'มี' : 'ไม่มี'}`);
  lines.push('');

  lines.push('## ความสามารถของเครื่อง');
  if (caps.length) {
    const on = caps.filter((c) => c.ok !== false && c.supported !== false);
    lines.push(`- รองรับ ${on.length}/${caps.length}: ${on.map((c) => c.id || c.name).join(', ')}`);
  } else {
    lines.push('- ไม่มีข้อมูล');
  }
  lines.push('');

  lines.push('## สถิติ');
  for (const [kind, meta] of Object.entries(METRIC_KINDS)) {
    const k = metrics?.kinds?.[kind];
    if (!k?.count) { lines.push(`- ${meta.emoji} ${meta.label}: ยังไม่มีข้อมูล`); continue; }
    lines.push(`- ${meta.emoji} ${meta.label}: ${k.count} ครั้ง · เฉลี่ย ${formatMs(k.avg)} · p95 ${formatMs(k.p95)}`
      + `${k.firstTokenAvg ? ` · token แรก ${formatMs(k.firstTokenAvg)}` : ''} · สำเร็จ ${fmtPct(k.okRate)}`);
  }
  lines.push('');

  lines.push('## MCP');
  const servers = mcp?.servers || [];
  if (!servers.length) lines.push('- ยังไม่มี server');
  for (const row of servers) {
    lines.push(`- ${row.name}: ${redactUrl(row.url)} · ${row.transport || 'proxy'} · ${row.tools || 0} เครื่องมือ${row.error ? ` · ⚠️ ${redact(row.error)}` : ''}`);
  }
  lines.push('');

  lines.push('## พื้นที่เก็บข้อมูล');
  if (storage?.rows?.length) {
    for (const row of storage.rows) lines.push(`- ${row.label}: ${row.pretty || row.bytes}`);
  } else {
    lines.push(`- ใช้ไป ${storage?.total || '—'} · persisted: ${storage?.persisted ? 'yes' : 'no'}`);
  }
  lines.push('');

  if (errors.length) {
    lines.push('## ข้อผิดพลาดล่าสุด');
    for (const e of errors) {
      lines.push(`- ${new Date(e.at || now).toISOString()} · ${redact(e.message || String(e)).slice(0, 200)}`);
    }
    const cacheKey = (() => { try { return Object.keys(JSON.parse(globalThis.localStorage?.getItem?.(MCP_CACHE_KEY) || '{}')).length; } catch { return 0; } })();
    lines.push('');
    lines.push(`_MCP cache: ${cacheKey} server_`);
    lines.push('');
  }

  lines.push('---');
  lines.push('_ข้อมูลอ่อนไหวถูกปิด (key, token, อีเมล, เบอร์โทร) — ตรวจซ้ำก่อนแชร์เสมอ_');
  return lines.join('\n');
}

/** ชื่อไฟล์รายงาน */
export function diagnosticsFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `no7-diagnostics-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.md`;
}
