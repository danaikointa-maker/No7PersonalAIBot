// ปลั๊กอินเครื่องมือ HTTP — ให้ผู้ใช้ประกาศ "เครื่องมือของตัวเอง" ด้วย JSON โดยไม่ต้องแก้โค้ด
//
// ความปลอดภัยเป็นเงื่อนไขแรก:
//   • https เท่านั้น (http ต้องเปิด allowInsecure ชัดเจน)
//   • ห้ามยิงเข้าวงใน (localhost/RFC1918) เว้นแต่เปิด allowPrivate
//   • ใช้ได้เฉพาะพารามิเตอร์ที่ประกาศไว้ — ไม่มี eval, ไม่มี JavaScript ใน URL
//   • timeout 10 วิ + จำกัดขนาด response 64 KB
//   • risk ≥ 1 → ผ่านประตูอนุญาต (ต้องยืนยันก่อนรัน) เสมอ
import { isPrivateHost } from './local-models.js';

export const PLUGIN_LIMITS = {
  maxTools: 20,
  maxParams: 10,
  timeoutMs: 10_000,
  maxBytes: 64 * 1024,
  maxUrlLength: 2000,
};

const ID_RE = /^[a-z][a-z0-9_]{1,30}$/;
const METHODS = ['GET', 'POST'];

/** แทนที่ {{var}} ด้วยค่าที่ผู้ใช้/AI ส่งมา (encode ให้อัตโนมัติ) */
export function renderTemplate(template = '', args = {}, { encode = true } = {}) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = args[key];
    if (value == null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return encode ? encodeURIComponent(text) : text;
  });
}

/** ชื่อพารามิเตอร์ที่ template ต้องใช้ */
export function templateVars(template = '') {
  const out = new Set();
  for (const m of String(template).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

/**
 * ตรวจ/ปรับ definition เดียว → { tool, errors[] }
 * รูปแบบ: { id, label, emoji?, desc, method?, url, headers?, query?, body?, params?, risk? }
 */
export function normalizeCustomTool(raw = {}) {
  const errors = [];
  const id = String(raw.id || '').trim().toLowerCase();
  if (!ID_RE.test(id)) errors.push('id ต้องเป็น a-z/0-9/_ และเริ่มด้วยตัวอักษร (2–31 ตัว)');

  const label = String(raw.label || '').trim();
  if (!label) errors.push('ต้องมี label');

  const url = String(raw.url || '').trim();
  if (!url) errors.push('ต้องมี url');
  else if (url.length > PLUGIN_LIMITS.maxUrlLength) errors.push('url ยาวเกินไป');

  let parsed = null;
  try { parsed = new URL(renderTemplate(url, {}, { encode: false })); } catch { parsed = null; }
  const protocol = parsed?.protocol || '';
  if (url && !parsed) errors.push('url ไม่ถูกต้อง');
  const allowInsecure = raw.allowInsecure === true;
  if (parsed && protocol !== 'https:' && !(allowInsecure && protocol === 'http:')) {
    errors.push('ต้องเป็น https:// (หรือตั้ง allowInsecure: true เพื่อใช้ http)');
  }
  const allowPrivate = raw.allowPrivate === true;
  if (parsed && isPrivateHost(parsed.hostname) && !allowPrivate) {
    errors.push('ไม่อนุญาตให้ยิงเข้า localhost/วง LAN (ตั้ง allowPrivate: true ถ้าจำเป็น)');
  }

  const method = String(raw.method || 'GET').toUpperCase();
  if (!METHODS.includes(method)) errors.push(`method ต้องเป็น ${METHODS.join(' หรือ ')}`);

  const params = {};
  const rawParams = raw.params && typeof raw.params === 'object' ? raw.params : {};
  let count = 0;
  for (const [key, spec] of Object.entries(rawParams)) {
    count++;
    if (count > PLUGIN_LIMITS.maxParams) { errors.push(`params เกิน ${PLUGIN_LIMITS.maxParams} ตัว`); break; }
    if (!/^[a-zA-Z0-9_]+$/.test(key)) { errors.push(`ชื่อพารามิเตอร์ "${key}" ใช้ได้เฉพาะ a-z/0-9/_`); continue; }
    const s = typeof spec === 'string' ? { desc: spec } : (spec || {});
    params[key] = {
      desc: String(s.desc || '').slice(0, 120),
      required: s.required === true,
      default: s.default ?? '',
    };
  }

  const risk = Math.min(3, Math.max(0, Number(raw.risk ?? 1) || 0));
  const category = ['read', 'act', 'message', 'control'].includes(raw.category) ? raw.category : (risk >= 2 ? 'act' : 'read');

  const headers = {};
  for (const [k, v] of Object.entries(raw.headers && typeof raw.headers === 'object' ? raw.headers : {})) {
    if (!/^[a-zA-Z0-9-]{1,40}$/.test(k)) continue;
    headers[k] = String(v).slice(0, 500);
  }

  const tool = {
    id,
    label,
    emoji: String(raw.emoji || '🔌').slice(0, 4),
    desc: String(raw.desc || '').slice(0, 200),
    method,
    url,
    headers,
    query: raw.query && typeof raw.query === 'object' ? { ...raw.query } : {},
    body: raw.body && typeof raw.body === 'object' ? { ...raw.body } : null,
    params,
    risk,
    category,
    allowInsecure,
    allowPrivate,
    timeoutMs: Math.min(PLUGIN_LIMITS.timeoutMs, Math.max(1000, Number(raw.timeoutMs) || PLUGIN_LIMITS.timeoutMs)),
    maxBytes: Math.min(PLUGIN_LIMITS.maxBytes, Math.max(1024, Number(raw.maxBytes) || PLUGIN_LIMITS.maxBytes)),
  };

  return { tool, errors, ok: errors.length === 0 };
}

/**
 * ตรวจทั้งชุด (array หรือ JSON string)
 * @returns {{ ok: boolean, tools: object[], errors: string[] }}
 */
export function validateCustomTools(input) {
  let list = input;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { ok: true, tools: [], errors: [] };
    try {
      list = JSON.parse(text);
    } catch (err) {
      return { ok: false, tools: [], errors: [`JSON ไม่ถูกต้อง: ${err.message}`] };
    }
  }
  if (list && !Array.isArray(list) && Array.isArray(list.tools)) list = list.tools;
  if (!Array.isArray(list)) return { ok: false, tools: [], errors: ['ต้องเป็น JSON array ของเครื่องมือ'] };

  const errors = [];
  const tools = [];
  const seen = new Set();
  if (list.length > PLUGIN_LIMITS.maxTools) errors.push(`ใส่ได้สูงสุด ${PLUGIN_LIMITS.maxTools} เครื่องมือ`);

  list.slice(0, PLUGIN_LIMITS.maxTools).forEach((raw, i) => {
    const { tool, errors: errs } = normalizeCustomTool(raw);
    if (errs.length) {
      errors.push(...errs.map((e) => `#${i + 1} (${tool.id || 'ไม่มี id'}): ${e}`));
      return;
    }
    if (seen.has(tool.id)) {
      errors.push(`#${i + 1}: id ซ้ำ "${tool.id}"`);
      return;
    }
    seen.add(tool.id);
    tools.push(tool);
  });

  return { ok: errors.length === 0, tools, errors };
}

/** แปลง args ที่ AI ส่งมา → ตรวจว่ามีครบและไม่เกินที่ประกาศ */
export function fillArgs(tool, args = {}) {
  const used = {};
  const missing = [];
  for (const [key, spec] of Object.entries(tool.params || {})) {
    const value = args?.[key] ?? spec.default ?? '';
    if (spec.required && (value === '' || value == null)) missing.push(key);
    used[key] = value;
  }
  return { used, missing };
}

/** ตรวจ URL สุดท้ายก่อนยิงจริง (กันการประกอบ URL หลอก) */
export function assertSafeUrl(url, tool) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('url ปลายทางไม่ถูกต้อง'); }
  if (parsed.protocol !== 'https:' && !(tool?.allowInsecure && parsed.protocol === 'http:')) {
    throw new Error('ปลั๊กอินต้องใช้ https');
  }
  if (isPrivateHost(parsed.hostname) && !tool?.allowPrivate) {
    throw new Error('ปลั๊กอินยิงเข้า localhost/วง LAN ไม่ได้');
  }
  return parsed;
}

/**
 * สร้าง tool definition ที่ใช้กับ registry ได้ (`run(args)` + `meta`)
 * @param {object} tool  ผลจาก normalizeCustomTool
 * @param {{fetchImpl?: Function, now?: () => number}} [opts]
 */
export function buildHttpTool(tool, { fetchImpl = null } = {}) {
  const fetchFn = fetchImpl || ((...a) => fetch(...a));
  return {
    emoji: tool.emoji,
    label: tool.label,
    desc: tool.desc || `${tool.method} ${new URL(tool.url).host}`,
    params: Object.fromEntries(Object.entries(tool.params).map(([k, v]) => [k, v.desc || k])),
    meta: { category: tool.category, risk: tool.risk, plugin: true },
    pluginId: tool.id,
    async run(args = {}) {
      const { used, missing } = fillArgs(tool, args);
      if (missing.length) throw new Error(`ขาดพารามิเตอร์: ${missing.join(', ')}`);

      const url = renderTemplate(tool.url, used, { encode: false });
      const target = assertSafeUrl(url, tool);
      for (const [key, value] of Object.entries(tool.query || {})) {
        target.searchParams.set(key, renderTemplate(String(value), used, { encode: false }));
      }
      if (target.href.length > PLUGIN_LIMITS.maxUrlLength) throw new Error('url ยาวเกินกำหนด');

      const headers = { accept: 'application/json, text/plain;q=0.9' };
      for (const [k, v] of Object.entries(tool.headers || {})) headers[k] = renderTemplate(v, used, { encode: false });

      const init = { method: tool.method, headers };
      if (tool.method === 'POST') {
        const payload = tool.body
          ? Object.fromEntries(Object.entries(tool.body).map(([k, v]) => [k, renderTemplate(String(v), used, { encode: false })]))
          : used;
        headers['content-type'] = headers['content-type'] || 'application/json';
        init.body = JSON.stringify(payload);
      }

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), tool.timeoutMs) : null;
      if (controller) init.signal = controller.signal;

      let res;
      try {
        res = await fetchFn(target.href, init);
      } catch (err) {
        const reason = err?.name === 'AbortError' ? `หมดเวลา ${tool.timeoutMs} ms` : (err?.message || 'เชื่อมต่อไม่สำเร็จ');
        throw new Error(`ปลั๊กอิน ${tool.id}: ${reason}`);
      } finally {
        if (timer) clearTimeout(timer);
      }

      const raw = await res.text();
      const text = raw.length > tool.maxBytes ? `${raw.slice(0, tool.maxBytes)}…` : raw;
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }

      const summary = json
        ? (Array.isArray(json) ? `ได้ ${json.length} รายการ` : Object.keys(json).slice(0, 3).map((k) => `${k}: ${String(json[k]).slice(0, 40)}`).join(' · '))
        : text.slice(0, 160);

      return {
        title: tool.label,
        big: res.ok ? String(res.status) : `HTTP ${res.status}`,
        ok: res.ok,
        status: res.status,
        lines: [summary].filter(Boolean),
        body: text,
        json,
        plugin: tool.id,
      };
    },
  };
}

/**
 * แปลงชุดปลั๊กอิน → dynamic tool defs (คีย์ `plugin__<id>`)
 * @returns {{ defs: Record<string, object>, errors: string[], tools: object[] }}
 */
export function customToolDefs(input, opts = {}) {
  const { tools, errors, ok } = validateCustomTools(input);
  const defs = {};
  if (ok) {
    for (const tool of tools) defs[`plugin__${tool.id}`] = buildHttpTool(tool, opts);
  }
  return { defs, errors, tools };
}

export const PLUGIN_EXAMPLE = [
  {
    id: 'catfact',
    label: 'เกร็ดแมว',
    emoji: '🐱',
    desc: 'ดึงเกร็ดเกี่ยวกับแมวแบบสุ่ม',
    method: 'GET',
    url: 'https://catfact.ninja/fact',
    risk: 0,
    category: 'read',
  },
  {
    id: 'todo_post',
    label: 'ส่งงานเข้า API',
    emoji: '📮',
    desc: 'POST รายการงานไปยัง endpoint ของคุณ',
    method: 'POST',
    url: 'https://example.com/api/items',
    risk: 2,
    params: { title: { desc: 'ชื่องาน', required: true } },
    body: { title: '{{title}}' },
  },
];
