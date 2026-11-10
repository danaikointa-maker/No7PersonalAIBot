// Settings store — everything local to the device (localStorage), no cloud account.
import { DEFAULT_PERMISSIONS } from './permissions.js';

export const DEFAULT_SETTINGS = {
  provider: 'pollinations',
  model: 'openai',
  apiKey: '',
  baseUrl: '',
  persona: 'no7',
  language: 'th',
  polite: true,
  tts: true,
  stt: true,
  temperature: 0.7,
  // v0.2 — role modes, autonomy and cost strategy
  mode: 'auto',
  maxSteps: 4,
  costMode: 'mixed', // free | quality | private | mixed
  permissions: DEFAULT_PERMISSIONS,
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
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
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
