// Capability report — "เครื่องนี้ทำอะไรได้จริง" เพื่อไม่ให้ผู้ใช้เจอปุ่มที่กดแล้วเงียบ
// ทุกอย่างตรวจจาก API ที่มีอยู่จริง ไม่เดา

export const CAPABILITY_IDS = [
  'microphone', 'speechRecognition', 'speechSynthesis', 'wakeWord',
  'notifications', 'clipboard', 'share', 'vibration',
  'battery', 'network', 'secureContext', 'standalone', 'persistentStorage',
  'crypto', 'fileSystemAccess',
];

const has = (fn) => { try { return !!fn; } catch { return false; } };

/** @returns {Promise<Array<{id, ok, label, hint?, value?}>>} */
export async function detectCapabilities(env = globalThis) {
  const nav = env.navigator || {};
  const win = env.window || env;

  const SR = has(win.SpeechRecognition) || has(win.webkitSpeechRecognition);
  const tts = has(win.speechSynthesis);
  const secure = !!(env.isSecureContext ?? win.isSecureContext ?? true);
  const standalone = !!(win.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone === true);

  let storage = null;
  try {
    storage = nav.storage?.persisted ? await nav.storage.persisted() : null;
  } catch { storage = null; }

  let battery = null;
  try { battery = nav.getBattery ? await nav.getBattery() : null; } catch { battery = null; }

  const conn = nav.connection || null;

  return [
    { id: 'microphone', ok: has(nav.mediaDevices?.getUserMedia), label: 'ไมโครโฟน (ขอสิทธิ์)', hint: secure ? '' : 'ต้องเปิดผ่าน https:// หรือ localhost' },
    { id: 'speechRecognition', ok: SR, label: 'แปลงเสียงเป็นข้อความ (STT)', hint: SR ? '' : 'เบราว์เซอร์นี้ไม่รองรับ — ใช้การพิมพ์แทนได้' },
    { id: 'speechSynthesis', ok: tts, label: 'อ่านออกเสียง (TTS)', hint: tts ? '' : 'ไม่มี engine เสียงในเครื่องนี้' },
    { id: 'wakeWord', ok: SR && secure, label: 'ปลุกด้วยคำว่า "No7"', hint: SR ? '' : 'ต้องมี STT ก่อน' },
    { id: 'notifications', ok: has(win.Notification), label: 'แจ้งเตือน', value: win.Notification?.permission || 'unknown' },
    { id: 'clipboard', ok: has(nav.clipboard?.writeText), label: 'คลิปบอร์ด', hint: secure ? '' : 'ต้องเป็น secure context' },
    { id: 'share', ok: has(nav.share), label: 'แชร์ออกแอปอื่น', hint: has(nav.share) ? '' : 'ใช้ได้บนมือถือส่วนใหญ่' },
    { id: 'vibration', ok: has(nav.vibrate), label: 'สั่น (มือถือ)' },
    { id: 'battery', ok: !!battery, label: 'ระดับแบตเตอรี่', value: battery ? `${Math.round(battery.level * 100)}%` : undefined },
    { id: 'network', ok: !!conn, label: 'ข้อมูลเครือข่าย', value: conn ? `${conn.effectiveType || '—'}${conn.downlink ? ` · ~${conn.downlink} Mbps` : ''}` : (nav.onLine ? 'ออนไลน์' : 'ออฟไลน์') },
    { id: 'secureContext', ok: secure, label: 'บริบทปลอดภัย (https/localhost)', hint: secure ? '' : 'บางฟีเจอร์ (ไมค์/HMAC) จะถูกปิด' },
    { id: 'standalone', ok: standalone, label: 'ติดตั้งเป็นแอปแล้ว', hint: standalone ? '' : 'ติดตั้งจากเมนูเบราว์เซอร์เพื่อประสบการณ์เต็ม' },
    { id: 'persistentStorage', ok: storage === true, label: 'พื้นที่จัดเก็บถาวร', value: storage === null ? 'ไม่ทราบ' : String(storage), hint: storage ? '' : 'กด "ขอพื้นที่ถาวร" ในหน้าตั้งค่า' },
    { id: 'crypto', ok: has(env.crypto?.subtle), label: 'HMAC / เข้ารหัส', hint: secure ? '' : 'ต้องเป็น secure context' },
    { id: 'fileSystemAccess', ok: has(win.showOpenFilePicker), label: 'เปิดไฟล์แบบเลือกเอง', hint: has(win.showOpenFilePicker) ? '' : 'ใช้ input file แทนได้' },
  ];
}

export function summarizeCapabilities(list = []) {
  const ok = list.filter((c) => c.ok).length;
  return {
    total: list.length,
    ok,
    missing: list.filter((c) => !c.ok).map((c) => c.label),
    score: list.length ? Math.round((ok / list.length) * 100) : 0,
  };
}

/** สรุปว่าฟีเจอร์หลักใช้ได้ไหม (ใช้ตัดสินใจใน UI) */
export async function featureFlags(env = globalThis) {
  const caps = await detectCapabilities(env);
  const by = Object.fromEntries(caps.map((c) => [c.id, c.ok]));
  return {
    canListen: by.speechRecognition && by.microphone,
    canSpeak: by.speechSynthesis,
    canWake: by.wakeWord,
    canNotify: by.notifications,
    canShare: by.share,
    canHMAC: by.crypto,
    offlineReady: by.persistentStorage,
    caps,
  };
}

/** ขอสิทธิ์ไมค์จริง (ทำให้ STT ทำงานได้ทันที ไม่ต้องรอ error) */
export async function requestMicrophone(env = globalThis) {
  const md = env.navigator?.mediaDevices;
  if (!md?.getUserMedia) throw new Error('อุปกรณ์นี้ไม่รองรับการขอสิทธิ์ไมโครโฟน');
  const stream = await md.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
  return true;
}

export async function requestNotifications(env = globalThis) {
  const N = env.Notification;
  if (!N) throw new Error('อุปกรณ์นี้ไม่รองรับการแจ้งเตือน');
  if (N.permission === 'granted') return 'granted';
  const res = await N.requestPermission();
  return res;
}
