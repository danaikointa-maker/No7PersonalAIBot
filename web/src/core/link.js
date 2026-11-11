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

export class DeviceStorageError extends Error {
  constructor(message = 'บันทึกข้อมูลอุปกรณ์ลงในเครื่องไม่สำเร็จ', options = {}) {
    super(message, options);
    this.name = 'DeviceStorageError';
  }
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
  _persist(candidate) {
    try {
      this.storage?.setItem(DEVICES_KEY, JSON.stringify(candidate));
    } catch (cause) {
      throw new DeviceStorageError('บันทึกข้อมูลอุปกรณ์ไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม', { cause });
    }
    this.devices = candidate;
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
    this._persist([...this.devices, device]);
    return { ...device };
  }
  remove(id) {
    const candidate = this.devices.filter((d) => d.id !== id);
    if (candidate.length === this.devices.length) return false;
    this._persist(candidate);
    return true;
  }
  list() { return this.devices.map((d) => ({ ...d })); }
  get(id) {
    const device = this.devices.find((d) => d.id === id);
    return device ? { ...device } : null;
  }
  touch(id, patch = {}) {
    const index = this.devices.findIndex((d) => d.id === id);
    if (index < 0) return null;
    const device = { ...this.devices[index], ...patch, lastSeen: Date.now() };
    const candidate = this.devices.map((d, i) => i === index ? device : d);
    this._persist(candidate);
    return { ...device };
  }
  clear() {
    if (!this.devices.length) return;
    this._persist([]);
  }
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

/* ------------------------------------------------ hello / eyes / voice *
 * สามส่วนนี้ทำให้ Phone-Link ครบวงจร:
 *   hello → อุปกรณ์บอกว่าตัวเองเป็นใคร มีไมค์/ลำโพง/จอ/ปุ่มอะไร
 *   eyes  → เก็บอารมณ์ล่าสุดไว้ให้จอ (ESP32) ดึงไปวาด
 *   voice → อุปกรณ์ส่ง chunk เสียงขึ้นมา แล้ว PC ดึงไปเล่น/ถอดความ
 */

/** base64 ของ bytes → ใช้ส่งเสียงผ่าน JSON */
export function encodeBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof globalThis.btoa === 'function' && typeof TextDecoder !== 'undefined') {
    let s = '';
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return btoa(s);
  }
  let out = '';
  for (let i = 0; i < arr.length; i++) out += String.fromCharCode(arr[i]);
  return out ? Buffer.from(out, 'binary').toString('base64') : '';
}

/** base64 → Uint8Array (สำหรับเล่นเสียงฝั่ง PC) */
export function decodeBase64(text = '') {
  const clean = String(text || '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array();
  try {
    const binary = typeof globalThis.atob === 'function' ? atob(clean) : Buffer.from(clean, 'base64').toString('binary');
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch { return new Uint8Array(); }
}

/** ความสามารถที่อุปกรณ์นี้มี — ใช้แนบไปกับ hello */
export function linkCapabilities(scope = globalThis) {
  const native = scope?.no7?.native || {};
  return {
    mic: typeof scope?.navigator?.mediaDevices?.getUserMedia === 'function' || native.isDesktop === true,
    speaker: typeof scope?.speechSynthesis !== 'undefined' || native.isDesktop === true,
    eyes: !!scope?.no7,
    screen: typeof scope?.document !== 'undefined',
    buttons: !!scope?.no7 || typeof scope?.Capacitor !== 'undefined',
    voice: typeof scope?.MediaRecorder !== 'undefined' || !!native.isDesktop,
  };
}

/** ลงทะเบียนอุปกรณ์กับ server → ได้ protocol/features/eyesTtlMs กลับมา */
export async function helloDevice(device, { name = device?.name, kind = 'pc', firmware = '', capabilities = null } = {}) {
  return signedFetch(device, 'POST', '/api/link/hello', {
    name, kind, firmware,
    capabilities: capabilities || linkCapabilities(),
  });
}

export async function deviceInfo(device) {
  return signedFetch(device, 'GET', '/api/link/hello');
}

/** ส่งอารมณ์/ตาให้จออุปกรณ์วาด */
export async function sendEyes(device, { emotion = 'happy', mood = '', intensity = 80, text = '', ttlMs = 15000 } = {}) {
  if (!String(emotion).trim()) throw new Error('ต้องระบุอารมณ์');
  return signedFetch(device, 'POST', '/api/link/eyes', { emotion, mood, intensity, text, ttlMs });
}

export async function getEyes(device) {
  return signedFetch(device, 'GET', '/api/link/eyes');
}

/** อุปกรณ์ส่ง chunk เสียงขึ้น server (bytes หรือ base64) */
export async function sendVoiceChunk(device, { chunk, mime = 'audio/ogg', seq = 0, final = false } = {}) {
  const payload = typeof chunk === 'string' ? chunk : encodeBase64(chunk);
  if (!payload) throw new Error('ไม่มีข้อมูลเสียง');
  return signedFetch(device, 'POST', '/api/link/voice', { chunk: payload, mime, seq, final });
}

/** PC ดึง chunk เสียงที่ค้างอยู่ (since = seq ล่าสุดที่เล่นแล้ว) */
export async function pullVoice(device, since = 0) {
  return signedFetch(device, 'GET', `/api/link/voice?since=${Number(since) || 0}`);
}

export async function voiceStatus(device) {
  return signedFetch(device, 'GET', '/api/link/voice/status');
}

export async function ackVoice(device, upto) {
  return signedFetch(device, 'POST', '/api/link/voice/ack', { upto: Number(upto) || 0 });
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
