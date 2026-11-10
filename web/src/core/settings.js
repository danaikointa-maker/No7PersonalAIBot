// Settings store — everything local to the device (localStorage), no cloud account.
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
  if (s.provider === 'pollinations') return true;
  if (s.provider === 'ollama') return !!s.baseUrl;
  return !!s.apiKey;
}
