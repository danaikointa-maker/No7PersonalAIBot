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
