// Computer control — "ทำงานบนเครื่องได้" แต่ต้องผ่าน allowlist ที่ผู้ใช้ตั้งเอง
// หลักการเดียวกับ permission gate: ค่าเริ่มต้นคือ "ปิด" และทุกการกระทำถูกบันทึก
//
// ใช้ได้จริงเฉพาะในเดสก์ท็อปแอป (Electron bridge) — บนเว็บ/มือถือจะได้ error ที่อ่านรู้เรื่อง

export const CONTROL_ACTION_META = {
  open_app: { emoji: '🖥️', label: 'เปิดโปรแกรม', risk: 1 },
  open_url: { emoji: '🌐', label: 'เปิดลิงก์', risk: 0 },
  clipboard: { emoji: '📋', label: 'คัดลอกข้อความ', risk: 0 },
  run_command: { emoji: '⌨️', label: 'รันคำสั่ง', risk: 3 },
};

export const DEFAULT_CONTROL_POLICY = {
  enabled: false,           // ต้องเปิดเองในหน้าตั้งค่า
  allowApps: [],            // เช่น ["code", "notepad", "chrome"]
  allowCommands: [],        // เช่น ["git", "node"] — รันได้เฉพาะคำสั่งแรกที่อยู่ในลิสต์
  maxPerMinute: 6,
};

export const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+[/~]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bdiskpart\b/i,
  /\bformat\s+[a-z]:/i,
  /\breg\s+delete\b/i,
  /\b(?:del|erase)\s+\/[sq]\b/i,
  /:\s*\(\s*\)\s*\{.*\}\s*;\s*:/, // fork bomb
  /\bcurl\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i,
  /\bwget\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i,
  /(?:^|[;&|])\s*(?:sudo|doas)\b/i,
  /\bchmod\s+777\s+\//i,
  />\s*\/dev\/(?:sd|disk)/i,
];

export const CONTROL_AUDIT_KEY = 'no7.control.audit.v1';

export function normalizeControlPolicy(raw = {}) {
  const list = (v, cap = 50) => (Array.isArray(v) ? v : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, cap);
  const max = Number(raw?.maxPerMinute);
  return {
    enabled: raw?.enabled === true,
    allowApps: list(raw?.allowApps),
    allowCommands: list(raw?.allowCommands, 30),
    maxPerMinute: Number.isFinite(max) && max > 0 ? Math.min(60, Math.round(max)) : DEFAULT_CONTROL_POLICY.maxPerMinute,
  };
}

const GLOB_ESCAPE = /[.+^${}()|[\]\\]/g;

/** glob แบบง่าย: * = อะไรก็ได้, ? = ตัวเดียว (ไม่สนตัวพิมพ์เล็ก/ใหญ่) */
export function matchesGlob(pattern = '', value = '') {
  const p = String(pattern).trim().toLowerCase();
  const v = String(value).trim().toLowerCase();
  if (!p || !v) return false;
  if (p === v) return true;
  const re = new RegExp(`^${p.replace(GLOB_ESCAPE, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(v);
}

export function isAppAllowed(app = '', policy = DEFAULT_CONTROL_POLICY) {
  const p = normalizeControlPolicy(policy);
  const name = String(app || '').trim();
  if (!name) return false;
  return p.allowApps.some((pattern) => matchesGlob(pattern, name));
}

export function isCommandAllowed(command = '', policy = DEFAULT_CONTROL_POLICY) {
  const p = normalizeControlPolicy(policy);
  const binary = String(command || '').trim().split(/\s+/)[0] || '';
  if (!binary) return false;
  return p.allowCommands.some((pattern) => matchesGlob(pattern, binary));
}

export function isDangerous(text = '') {
  const value = String(text || '');
  return DANGEROUS_PATTERNS.some((re) => re.test(value));
}

/** ตรวจว่าคำขอนี้ผ่าน policy ไหม (ยังไม่รัน) */
export function checkControl({ action = '', target = '', text = '', policy = DEFAULT_CONTROL_POLICY } = {}) {
  const p = normalizeControlPolicy(policy);
  const meta = CONTROL_ACTION_META[action];
  if (!meta) return { allowed: false, reason: `ไม่รู้จักคำสั่ง "${action}"`, risk: 3 };
  if (!p.enabled) return { allowed: false, reason: 'ยังไม่เปิด "ควบคุมคอมพิวเตอร์" ในหน้าตั้งค่า', risk: meta.risk };

  if (action === 'open_app') {
    if (!String(target || '').trim()) return { allowed: false, reason: 'ต้องระบุชื่อโปรแกรม', risk: meta.risk };
    if (isDangerous(target)) return { allowed: false, reason: 'คำสั่งนี้อยู่ในรายการต้องห้าม', risk: meta.risk };
    if (!isAppAllowed(target, p)) {
      return { allowed: false, reason: `โปรแกรม "${target}" ไม่อยู่ใน allowlist`, risk: meta.risk };
    }
    return { allowed: true, reason: 'อยู่ใน allowlist', risk: meta.risk };
  }

  if (action === 'open_url') {
    try {
      const u = new URL(String(target || ''));
      if (!/^https?:$/.test(u.protocol)) return { allowed: false, reason: 'เปิดได้เฉพาะ http/https', risk: meta.risk };
      return { allowed: true, reason: 'ลิงก์ปลอดภัย', risk: meta.risk };
    } catch {
      return { allowed: false, reason: 'URL ไม่ถูกต้อง', risk: meta.risk };
    }
  }

  if (action === 'clipboard') {
    if (!String(text || target || '').trim()) return { allowed: false, reason: 'ไม่มีข้อความให้คัดลอก', risk: meta.risk };
    return { allowed: true, reason: 'คัดลอกข้อความ', risk: meta.risk };
  }

  if (action === 'run_command') {
    const cmd = String(target || '').trim();
    if (!cmd) return { allowed: false, reason: 'ต้องระบุคำสั่ง', risk: meta.risk };
    if (isDangerous(cmd)) return { allowed: false, reason: 'คำสั่งนี้อยู่ในรายการต้องห้าม', risk: meta.risk };
    if (!isCommandAllowed(cmd, p)) {
      return { allowed: false, reason: `"${cmd.split(/\s+/)[0]}" ไม่อยู่ในรายการคำสั่งที่อนุญาต`, risk: meta.risk };
    }
    if (/[;&|><`$]/.test(cmd)) {
      return { allowed: false, reason: 'ไม่อนุญาตตัวดำเนินการเชลล์ (;, &, |, >, `, $)', risk: meta.risk };
    }
    return { allowed: true, reason: 'อยู่ในรายการคำสั่งที่อนุญาต', risk: meta.risk };
  }

  return { allowed: false, reason: 'ไม่รองรับ', risk: meta.risk };
}

/** บันทึกทุกครั้งที่พยายามสั่งงาน (สำเร็จหรือไม่) — เก็บในเครื่อง 50 รายการล่าสุด */
export class ControlAudit {
  constructor({ storage = null, key = CONTROL_AUDIT_KEY, max = 50, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.max = max;
    this.now = now;
    this.entries = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  _save() {
    try { this.storage?.setItem(this.key, JSON.stringify(this.entries)); } catch { /* quota */ }
  }

  record({ action, target = '', allowed = false, reason = '', source = 'agent' } = {}) {
    const entry = { at: this.now(), action, target: String(target).slice(0, 200), allowed: !!allowed, reason, source };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries = this.entries.slice(-this.max);
    this._save();
    return entry;
  }

  list() { return [...this.entries]; }

  recent(ms = 60_000) {
    const cutoff = this.now() - ms;
    return this.entries.filter((e) => e.at >= cutoff);
  }

  countAllowed(ms = 60_000) {
    return this.recent(ms).filter((e) => e.allowed).length;
  }

  summary() {
    const total = this.entries.length;
    const allowed = this.entries.filter((e) => e.allowed).length;
    return { total, allowed, blocked: total - allowed };
  }

  clear() { this.entries = []; this._save(); }
}

export function controlBridge(scope = globalThis) {
  const native = scope?.no7?.native;
  if (!native) return null;
  const hasAny = native.openApp || native.openExternal || native.copyText || native.runCommand;
  return hasAny ? native : null;
}

/**
 * รันคำสั่งควบคุมจริง (หลังผ่าน policy แล้ว)
 * @returns {Promise<{title: string, big: string, lines: string[]}>}
 */
export async function runControlAction({ action, target = '', text = '', policy, bridge = null, now = () => Date.now() } = {}) {
  const p = normalizeControlPolicy(policy);
  const live = bridge || controlBridge();
  if (!live) throw new Error('ควบคุมคอมพิวเตอร์ใช้ได้เฉพาะในเดสก์ท็อปแอป (Electron)');
  const check = checkControl({ action, target, text, policy: p });
  if (!check.allowed) throw new Error(check.reason);

  if (action === 'open_app') {
    await live.openApp?.(String(target));
    return { title: 'เปิดโปรแกรม', big: String(target), lines: [`ผ่าน allowlist: ${p.allowApps.join(', ') || '—'}`] };
  }
  if (action === 'open_url') {
    await live.openExternal?.(String(target));
    return { title: 'เปิดลิงก์', big: String(target), lines: ['เปิดในเบราว์เซอร์แล้ว'] };
  }
  if (action === 'clipboard') {
    await live.copyText?.(String(text || target));
    return { title: 'คัดลอกแล้ว', big: String(text || target).slice(0, 80), lines: ['อยู่ในคลิปบอร์ดแล้ว'] };
  }
  if (action === 'run_command') {
    const result = await live.runCommand?.({ command: String(target), timeoutMs: 10_000 });
    return {
      title: 'รันคำสั่ง',
      big: String(target),
      lines: [result?.stdout ? String(result.stdout).slice(0, 400) : 'ไม่มี output', result?.stderr ? `stderr: ${String(result.stderr).slice(0, 200)}` : ''].filter(Boolean),
    };
  }
  throw new Error(`ไม่รู้จักคำสั่ง "${action}"`);
}
