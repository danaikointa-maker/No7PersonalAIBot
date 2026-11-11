// OAuth 2.0 + PKCE — สำหรับ MCP server ที่ต้องล็อกอิน (Gmail, ปฏิทิน, Drive)
// เก็บ token ในเครื่องเท่านั้น และแลก token ผ่าน companion server เพื่อเลี่ยง CORS
//
// ใช้กับ browser: crypto.subtle (ต้องเป็น https:// หรือ localhost)

export const OAUTH_KEY = 'no7.oauth.v1';
export const OAUTH_SKEW_MS = 60_000;

/** base64url ของ Uint8Array (ไม่ padding) */
export function base64UrlEncode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** verifier แบบ RFC 7636 (43–128 ตัวอักษร base64url) */
export function randomVerifier(byteLength = 32, random = null) {
  const bytes = new Uint8Array(byteLength);
  if (random) {
    const r = random(bytes.length);
    for (let i = 0; i < bytes.length; i++) bytes[i] = r[i] % 256;
  } else if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return base64UrlEncode(bytes);
}

/** PKCE pair: challenge = BASE64URL(SHA256(verifier)) */
export async function createPkcePair({ verifier = null, subtle = null } = {}) {
  const v = verifier || randomVerifier();
  const impl = subtle || globalThis.crypto?.subtle;
  if (!impl) throw new Error('ต้องมี crypto.subtle (เปิดผ่าน https:// หรือ localhost)');
  const digest = await impl.digest('SHA-256', new TextEncoder().encode(v));
  return { verifier: v, challenge: base64UrlEncode(digest), method: 'S256' };
}

/** สร้าง state แบบสุ่ม กัน CSRF */
export function randomState(random = null) {
  return randomVerifier(16, random);
}

export function buildAuthorizeUrl({
  authorizeUrl, clientId, redirectUri, scopes = [], state = '', codeChallenge = '',
  extraParams = {},
} = {}) {
  const base = String(authorizeUrl || '');
  const url = new URL(base);
  url.searchParams.set('response_type', 'code');
  if (clientId) url.searchParams.set('client_id', clientId);
  if (redirectUri) url.searchParams.set('redirect_uri', redirectUri);
  if (scopes.length) url.searchParams.set('scope', Array.isArray(scopes) ? scopes.join(' ') : String(scopes));
  if (state) url.searchParams.set('state', state);
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** อ่านผลจาก redirect URL: { code, state, error, errorDescription } */
export function parseCallback(input) {
  let params;
  try {
    params = new URL(String(input)).searchParams;
  } catch {
    params = new URLSearchParams(String(input || '').replace(/^[?#]/, ''));
  }
  return {
    code: params.get('code') || '',
    state: params.get('state') || '',
    error: params.get('error') || '',
    errorDescription: params.get('error_description') || '',
  };
}

export function isExpired(tokens, now = Date.now(), skewMs = OAUTH_SKEW_MS) {
  if (!tokens) return true;
  if (!tokens.expiresAt) return false; // token ที่ไม่มีวันหมดอายุ (เช่น API key)
  return Number(tokens.expiresAt) - skewMs <= now;
}

export function normalizeTokenResponse(json = {}, now = Date.now()) {
  const expiresIn = Number(json.expires_in);
  return {
    accessToken: json.access_token || json.accessToken || '',
    refreshToken: json.refresh_token || json.refreshToken || '',
    tokenType: json.token_type || json.tokenType || 'Bearer',
    scope: typeof json.scope === 'string' ? json.scope : '',
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? now + expiresIn * 1000 : null,
    obtainedAt: now,
  };
}

/** เก็บ token แยกตาม server/label — localStorage เท่านั้น */
export class TokenStore {
  constructor({ storage = null, key = OAUTH_KEY, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.now = now;
    this.data = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  _save() {
    try { this.storage?.setItem(this.key, JSON.stringify(this.data)); } catch { /* quota */ }
  }

  set(name, tokens) {
    const merged = { ...(this.data[name] || {}), ...(tokens || {}) };
    if (tokens?.refreshToken === '' && this.data[name]?.refreshToken) merged.refreshToken = this.data[name].refreshToken;
    this.data[name] = merged;
    this._save();
    return merged;
  }

  get(name) {
    return this.data[name] || null;
  }

  remove(name) {
    delete this.data[name];
    this._save();
  }

  list() {
    return Object.entries(this.data).map(([name, t]) => ({
      name, expiresAt: t.expiresAt || null, expired: isExpired(t, this.now()),
    }));
  }
}

/**
 * แลก/ต่ออายุ token ผ่าน proxy `/api/oauth/token` (หรือยิงตรงถ้าไม่มี server)
 * @returns {Promise<object>} token ที่ normalize แล้ว
 */
export async function requestToken({
  tokenUrl, grantType = 'authorization_code', code = '', redirectUri = '', clientId = '',
  clientSecret = '', codeVerifier = '', refreshToken = '', scope = '',
  serverUrl = '', fetchImpl = null, now = () => Date.now(),
} = {}) {
  const body = {
    grant_type: grantType,
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
    refresh_token: refreshToken,
    scope,
    tokenUrl,
  };
  for (const k of Object.keys(body)) if (body[k] === '' || body[k] == null) delete body[k];
  const doFetch = fetchImpl || ((...a) => fetch(...a));

  let json;
  if (serverUrl) {
    const res = await doFetch(`${String(serverUrl).replace(/\/$/, '')}/api/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`oauth proxy HTTP ${res.status}`);
    const envelope = await res.json();
    if (envelope.status >= 400) {
      throw new Error(`oauth ${envelope.status}: ${String(envelope.body || '').slice(0, 200)}`);
    }
    try { json = JSON.parse(envelope.body || '{}'); } catch { json = {}; }
  } else {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (k !== 'tokenUrl') params.set(k, String(v));
    const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    const res = await doFetch(tokenUrl, { method: 'POST', headers, body: params.toString() });
    const text = await res.text();
    try { json = JSON.parse(text); } catch { json = {}; }
    if (!res.ok || json.error) {
      throw new Error(`oauth ${res.status}: ${json.error_description || json.error || text.slice(0, 160)}`);
    }
  }
  if (json.error) throw new Error(`oauth: ${json.error_description || json.error}`);
  const tokens = normalizeTokenResponse(json, now());
  if (!tokens.accessToken) throw new Error('oauth: ไม่ได้รับ access_token');
  return tokens;
}

export function exchangeCode(opts = {}) {
  return requestToken({ ...opts, grantType: 'authorization_code' });
}

export function refreshAccessToken(opts = {}) {
  return requestToken({ ...opts, grantType: 'refresh_token' });
}

/**
 * ตัวช่วยครบวงจรต่อ server หนึ่งตัว: อ่าน token, ต่ออายุอัตโนมัติ, เก็บกลับ
 * @param {{name: string, tokenUrl: string, clientId?: string, clientSecret?: string,
 *          scopes?: string[], serverUrl?: string|(() => string), store?: TokenStore,
 *          fetchImpl?: Function, now?: Function}} cfg
 */
export class OAuthSession {
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.store = cfg.store || new TokenStore();
    this.name = cfg.name || 'default';
    this.fetchImpl = cfg.fetchImpl || null;
    this.now = cfg.now || (() => Date.now());
    this.refreshing = null;
  }

  tokens() { return this.store.get(this.name); }

  authorized() { return !!this.tokens()?.accessToken; }

  serverUrl() {
    const v = this.cfg.serverUrl;
    return String((typeof v === 'function' ? v() : v) || '');
  }

  async getAccessToken() {
    let t = this.tokens();
    if (!t?.accessToken) return null;
    if (!isExpired(t, this.now()) || !t.refreshToken) return t.accessToken;
    const fresh = await this._refresh(t);
    return fresh?.accessToken || null;
  }

  _refresh(t) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = refreshAccessToken({
      tokenUrl: this.cfg.tokenUrl,
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      refreshToken: t.refreshToken,
      serverUrl: this.serverUrl(),
      fetchImpl: this.fetchImpl,
      now: this.now,
    }).then((next) => {
      const merged = { ...t, ...next, refreshToken: next.refreshToken || t.refreshToken };
      this.store.set(this.name, merged);
      return merged;
    }).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async exchange({ code, codeVerifier, redirectUri }) {
    const tokens = await exchangeCode({
      tokenUrl: this.cfg.tokenUrl,
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      code,
      codeVerifier,
      redirectUri,
      serverUrl: this.serverUrl(),
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
    return this.store.set(this.name, tokens);
  }
}

/* ============================================================================
 * OAuth 2.0 Device Authorization Grant (RFC 8628) + Dynamic Client Registration
 * (RFC 7591) — สำหรับ MCP server ที่ไม่รองรับ redirect URI (เช่น CLI/เดสก์ท็อป)
 *
 * ผู้ใช้เห็น "รหัสสั้น ๆ + ลิงก์" ไปกรอกบนมือถือ/เบราว์เซอร์ แล้วแอปจะ poll
 * จนได้ token — ไม่ต้องมี redirect, ไม่ต้องมี client secret ในเบราว์เซอร์
 * ========================================================================== */

export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export const DEVICE_DEFAULT_TTL_SEC = 600;
export const DEVICE_MAX_INTERVAL_SEC = 60;

/** แปลงผล device authorization → รูปแบบที่ UI ใช้ */
export function normalizeDeviceCode(json = {}, now = Date.now()) {
  const expiresIn = Number(json.expires_in);
  const interval = Number(json.interval);
  return {
    deviceCode: json.device_code || json.deviceCode || '',
    userCode: json.user_code || json.userCode || '',
    verificationUri: json.verification_uri || json.verificationUri || json.verification_url || '',
    verificationUriComplete: json.verification_uri_complete || json.verificationUriComplete || '',
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEVICE_DEFAULT_TTL_SEC,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEVICE_DEFAULT_TTL_SEC) * 1000,
    interval: Number.isFinite(interval) && interval > 0 ? Math.min(DEVICE_MAX_INTERVAL_SEC, Math.max(1, interval)) : 5,
    scope: typeof json.scope === 'string' ? json.scope : '',
    raw: json,
  };
}

async function readJson(res) {
  const text = await res.text();
  try { return { json: text ? JSON.parse(text) : {}, text }; } catch { return { json: {}, text }; }
}

/** POST ฟอร์มไปที่ endpoint (ผ่าน proxy หรือตรง) แล้วคืน JSON + status */
async function postForm({ url, fields, serverUrl, proxyPath, extraBody = {}, fetchImpl = null }) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const clean = {};
  for (const [k, v] of Object.entries(fields)) if (v !== '' && v != null) clean[k] = String(v);

  if (serverUrl && proxyPath) {
    const res = await doFetch(`${String(serverUrl).replace(/\/$/, '')}${proxyPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...extraBody, ...clean }),
    });
    if (!res.ok) throw new Error(`oauth proxy HTTP ${res.status}`);
    const envelope = await res.json();
    const { json, text } = await readJson({ text: async () => String(envelope.body || '') });
    return { status: Number(envelope.status) || 0, json, text };
  }

  const params = new URLSearchParams(clean);
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: params.toString(),
  });
  const { json, text } = await readJson(res);
  return { status: res.status, json, text };
}

/**
 * 14.1 ขอ device code
 * @returns {Promise<object>} ผลจาก normalizeDeviceCode()
 */
export async function requestDeviceCode({
  deviceAuthorizationUrl, clientId = '', scope = '', serverUrl = '',
  fetchImpl = null, now = () => Date.now(), extraParams = {},
} = {}) {
  if (!deviceAuthorizationUrl) throw new Error('ต้องระบุ deviceAuthorizationUrl');
  const { status, json, text } = await postForm({
    url: deviceAuthorizationUrl,
    serverUrl,
    proxyPath: '/api/oauth/device',
    extraBody: { deviceAuthorizationUrl },
    fields: { client_id: clientId, scope, ...extraParams },
    fetchImpl,
  });
  if (status >= 400 || json.error) {
    throw new Error(`device code ${status}: ${json.error_description || json.error || text.slice(0, 160)}`);
  }
  const out = normalizeDeviceCode(json, now());
  if (!out.deviceCode || !out.userCode) throw new Error('device code: response ไม่มี device_code/user_code');
  return out;
}

/** ขอ token หนึ่งครั้งด้วย device code (คืน error code ผ่าน err.code) */
export async function requestDeviceToken({
  tokenUrl, deviceCode, clientId = '', clientSecret = '', scope = '',
  serverUrl = '', fetchImpl = null, now = () => Date.now(),
} = {}) {
  if (!tokenUrl) throw new Error('ต้องระบุ tokenUrl');
  if (!deviceCode) throw new Error('ต้องระบุ deviceCode');
  const { status, json, text } = await postForm({
    url: tokenUrl,
    serverUrl,
    proxyPath: '/api/oauth/token',
    extraBody: { tokenUrl },
    fields: {
      grant_type: DEVICE_GRANT,
      device_code: deviceCode,
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    },
    fetchImpl,
  });
  if (json.error) {
    const err = new Error(`oauth: ${json.error_description || json.error}`);
    err.code = json.error;
    err.status = status;
    throw err;
  }
  if (status >= 400) {
    throw Object.assign(new Error(`oauth ${status}: ${text.slice(0, 160)}`), { code: 'server_error', status });
  }
  const tokens = normalizeTokenResponse(json, now());
  if (!tokens.accessToken) throw new Error('oauth: ไม่ได้รับ access_token');
  return tokens;
}

/**
 * 14.1 poll จนได้ token — จัดการ `authorization_pending`, `slow_down`, `expired_token`,
 * `access_denied` ตาม RFC 8628
 * @returns {Promise<object>} token ที่ normalize แล้ว
 */
export async function pollDeviceToken({
  deviceCode, tokenUrl, clientId = '', clientSecret = '', scope = '',
  interval = 5, expiresAt = 0, serverUrl = '', fetchImpl = null,
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onPending = null, maxAttempts = 200,
} = {}) {
  let waitSec = Math.min(DEVICE_MAX_INTERVAL_SEC, Math.max(1, Number(interval) || 5));
  const deadline = Number(expiresAt) > 0 ? Number(expiresAt) : now() + DEVICE_DEFAULT_TTL_SEC * 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (now() > deadline) break;
    try {
      return await requestDeviceToken({
        tokenUrl, deviceCode, clientId, clientSecret, scope, serverUrl, fetchImpl, now,
      });
    } catch (err) {
      const code = err?.code || '';
      if (code === 'authorization_pending') {
        onPending?.({ status: 'pending', attempt, interval: waitSec });
      } else if (code === 'slow_down') {
        waitSec = Math.min(DEVICE_MAX_INTERVAL_SEC, waitSec + 5);
        onPending?.({ status: 'slow_down', attempt, interval: waitSec });
      } else if (code === 'expired_token') {
        throw Object.assign(new Error('รหัสล็อกอินหมดอายุ — เริ่มขั้นตอนใหม่'), { code });
      } else if (code === 'access_denied') {
        throw Object.assign(new Error('ผู้ใช้ปฏิเสธการให้สิทธิ์'), { code });
      } else {
        throw err;
      }
    }
    if (now() >= deadline) break;
    await sleep(waitSec * 1000);
  }
  throw Object.assign(new Error('หมดเวลารอการยืนยันรหัส — ลองใหม่'), { code: 'expired_token' });
}

/** 14.2 Dynamic Client Registration — ลงทะเบียน client เอง (MCP spec 2025) */
export async function registerClient({
  registrationUrl, clientName = 'No7 Personal AI Bot', redirectUris = [],
  grantTypes = ['authorization_code', 'refresh_token', DEVICE_GRANT],
  scopes = [], tokenEndpointAuthMethod = 'none', softwareId = 'no7-personal-ai-bot',
  softwareVersion = '1.5', serverUrl = '', fetchImpl = null,
} = {}) {
  if (!registrationUrl) throw new Error('ต้องระบุ registrationUrl');
  const payload = {
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: ['code'],
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    software_id: softwareId,
    software_version: softwareVersion,
  };
  if (scopes.length) payload.scope = Array.isArray(scopes) ? scopes.join(' ') : String(scopes);

  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let status = 0;
  let json = {};
  let text = '';
  if (serverUrl) {
    const res = await doFetch(`${String(serverUrl).replace(/\/$/, '')}/api/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ registrationUrl, client: payload }),
    });
    if (!res.ok) throw new Error(`register proxy HTTP ${res.status}`);
    const envelope = await res.json();
    status = Number(envelope.status) || 0;
    text = String(envelope.body || '');
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  } else {
    const res = await doFetch(registrationUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    status = res.status;
    ({ json, text } = await readJson(res));
  }

  if (status >= 400 || json.error) {
    throw new Error(`register ${status}: ${json.error_description || json.error || text.slice(0, 160)}`);
  }
  const clientId = json.client_id || json.clientId || '';
  if (!clientId) throw new Error('register: response ไม่มี client_id');
  return {
    clientId,
    clientSecret: json.client_secret || json.clientSecret || '',
    registrationAccessToken: json.registration_access_token || '',
    registrationClientUri: json.registration_client_uri || '',
    tokenEndpointAuthMethod: json.token_endpoint_auth_method || tokenEndpointAuthMethod,
    scope: json.scope || payload.scope || '',
    raw: json,
  };
}

/** ช่วยเลือกวิธีล็อกอินที่ server รองรับ (device flow ก่อน แล้วค่อย PKCE) */
export function oauthMethodFor(oauth = {}) {
  if (oauth.deviceAuthorizationUrl || oauth.deviceAuthorizationEndpoint) return 'device';
  if (oauth.authorizeUrl) return 'pkce';
  return 'none';
}
