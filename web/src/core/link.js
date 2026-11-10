// Phone-Link client — คุยกับ companion server (และต่อไปยัง ESP32) ด้วย HMAC-SHA256
// ลายเซ็น: HMAC(secret, "METHOD\n/path\nbody") เป็น hex — กันปลอมแปลง path/คำสั่ง

const DEVICES_KEY = 'no7.devices.v1';

export function hexToBytes(hex) {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function canonical(method, path, body = '') {
  return `${String(method).toUpperCase()}\n${path}\n${body}`;
}

export async function signRequest(secretHex, method, path, body = '') {
  if (!globalThis.crypto?.subtle) throw new Error('ต้องเปิดผ่าน https:// หรือ localhost เพื่อใช้ HMAC');
  const key = await crypto.subtle.importKey('raw', hexToBytes(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical(method, path, body)));
  return bytesToHex(new Uint8Array(sig));
}

export class DeviceRegistry {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.devices = this._read();
  }
  _read() {
    try {
      const raw = this.storage?.getItem(DEVICES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }
  _persist() {
    try { this.storage?.setItem(DEVICES_KEY, JSON.stringify(this.devices)); } catch {}
  }
  add({ name, baseUrl, code, secret, kind = 'server' }) {
    if (!name || !baseUrl) throw new Error('ต้องมีชื่อและที่อยู่');
    if (!/^[0-9a-f]{32,}$/i.test(String(secret || '').replace(/[^0-9a-f]/gi, ''))) {
      throw new Error('secret ต้องเป็น hex อย่างน้อย 32 ตัวอักษร (16 ไบต์)');
    }
    const device = {
      id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: String(name).slice(0, 40),
      baseUrl: String(baseUrl).replace(/\/$/, ''),
      code: String(code || ''),
      secret: String(secret).replace(/[^0-9a-f]/gi, ''),
      kind,
      createdAt: Date.now(),
      lastSeen: 0,
      lastCommand: '',
    };
    this.devices.push(device);
    this._persist();
    return device;
  }
  remove(id) {
    const n = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    this._persist();
    return this.devices.length !== n;
  }
  list() { return [...this.devices]; }
  get(id) { return this.devices.find((d) => d.id === id) || null; }
  touch(id, patch = {}) {
    const d = this.get(id);
    if (!d) return null;
    Object.assign(d, patch, { lastSeen: Date.now() });
    this._persist();
    return d;
  }
  clear() { this.devices = []; this._persist(); }
}

let registry = null;
export function getDeviceRegistry() {
  if (!registry) registry = new DeviceRegistry();
  return registry;
}

async function signedFetch(device, method, path, payload = null) {
  const body = payload ? JSON.stringify(payload) : '';
  const headers = { 'Content-Type': 'application/json' };
  if (device.secret) {
    const pathForSig = path.split('?')[0];      // query ไม่ถูกเซ็น (server ใช้ pathname)
    headers['X-No7-Code'] = device.code;
    headers['X-No7-Signature'] = await signRequest(device.secret, method, pathForSig, body);
  }
  const res = await fetch(`${device.baseUrl}${path}`, { method, headers, body: method === 'GET' ? undefined : body });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ไม่ใช่ JSON */ }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export async function testConnection(device) {
  const h = await signedFetch(device, 'GET', '/api/health');
  return { ok: true, health: h };
}

export async function sendCommand(device, command, args = {}) {
  return signedFetch(device, 'POST', '/api/link/command', { code: device.code, command, args });
}

export async function deviceStatus(device) {
  return signedFetch(device, 'GET', `/api/link/status?code=${encodeURIComponent(device.code)}`);
}

/** ถาม server ว่ามีผลลัพธ์ของคำสั่งที่ยังไม่ได้อ่านไหม */
export async function commandResults(device, sinceTs = 0) {
  return signedFetch(device, 'GET', `/api/link/results?code=${encodeURIComponent(device.code)}&since=${sinceTs}`);
}

/** คำสั่งด่วนที่ทุกอุปกรณ์ควรรู้จัก (โปรโตคอลกลาง) */
export const QUICK_COMMANDS = [
  { id: 'ping', label: '👋 ทักทาย', args: {} },
  { id: 'status', label: '📊 ขอสถานะ', args: {} },
  { id: 'eyes', label: '👀 แสดงตา', args: { emotion: 'happy' } },
  { id: 'say', label: '🔊 ให้พูด', args: { text: 'สวัสดีจาก No7' } },
  { id: 'time', label: '🕒 บอกเวลา', args: {} },
  { id: 'sleep', label: '😴 นอน', args: {} },
];
