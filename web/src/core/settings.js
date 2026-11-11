// Settings store — everything local to the device (localStorage), no cloud account.
import { DEFAULT_PERMISSIONS } from './permissions.js';

export const DEFAULT_SETTINGS = {
  provider: 'pollinations',
  model: 'openai',
  apiKey: '',
  baseUrl: '',
  persona: 'no7',
  language: 'th',
  uiLang: 'th',           // ภาษาของหน้าจอ: th | en (ไม่กระทบภาษาที่ AI ตอบ)
  digestAuto: false,      // สรุปประจำวันอัตโนมัติ (ครั้งแรกของวัน หลัง 07:00)
  customPlugins: [],      // ปลั๊กอินเครื่องมือ HTTP (JSON ที่ผ่านการตรวจแล้ว)
  polite: true,
  tts: true,
  stt: true,
  temperature: 0.7,
  // v0.2 — role modes, autonomy and cost strategy
  mode: 'auto',
  maxSteps: 4,
  costMode: 'mixed', // free | quality | private | mixed
  permissions: DEFAULT_PERMISSIONS,
  memoryLLM: false,       // ใช้ AI ช่วยสรุปความจำ (opt-in เพื่อคุมโควตา)
  streaming: true,        // แสดงคำตอบแบบไหลทีละคำ
  speakWhileStreaming: true, // เริ่มพูดก่อนคำตอบจบ
  wake: false,            // ปลุกด้วยคำว่า "No7"
  voiceRate: 1,
  voicePitch: 1,
  voiceName: '',
  ttsProvider: 'system',   // system | openai | elevenlabs | off
  ttsVoice: 'alloy',       // voice id ของผู้ให้บริการที่เลือก
  ttsModel: 'tts-1',
  ttsBaseUrl: '',
  ttsApiKey: '',
  ttsCache: true,          // แคชเสียงในหน่วยความจำ (เล่นซ้ำไม่จ่ายซ้ำ)
  bargeIn: 'keyword',      // off | keyword | any
  mcpServers: [],          // [{id, name, url, apiKey, transport, enabled}]
  controlPolicy: {         // เดสก์ท็อปเท่านั้น — ค่าเริ่มต้นปิด
    enabled: false,
    allowApps: [],
    allowCommands: [],
    maxPerMinute: 6,
  },
  offlineBrain: {                     // สมองสำรองในเครื่องเมื่อออฟไลน์
    enabled: false,
    kind: 'ollama',                   // ollama | lmstudio
    baseUrl: 'http://localhost:11434',
    model: '',
  },
  serverUrl: 'http://localhost:8787',   // companion server (AI proxy / tools / sync)
  syncToken: '',
  syncStrategy: 'newest',              // newest | prefer-local | prefer-remote | keep-both
};

const KEY = 'no7.settings.v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    try {
      globalThis.dispatchEvent?.(new CustomEvent('no7:storage-error', {
        detail: { key: KEY, message: `บันทึกตั้งค่าไม่สำเร็จ: ${err?.message || err}` },
      }));
    } catch {}
  }
  return next;
}

export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function hasProviderConfigured(s) {
  if (!s) return false;
  if (s.costMode === 'private') return !!s.baseUrl;   // private mode ต้องมี Ollama
  if (s.costMode === 'free') return true;             // Pollinations ฟรีเสมอ
  if (s.provider === 'pollinations') return true;
  if (s.provider === 'ollama') return !!s.baseUrl;
  return !!s.apiKey;
}

export function loadPermissions(s) {
  return { ...DEFAULT_PERMISSIONS, ...(s?.permissions || {}), allow: { ...DEFAULT_PERMISSIONS.allow, ...(s?.permissions?.allow || {}) } };
}
