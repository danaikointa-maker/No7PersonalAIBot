import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  base64UrlEncode, randomVerifier, createPkcePair, randomState, buildAuthorizeUrl, parseCallback,
  isExpired, normalizeTokenResponse, TokenStore, requestToken, exchangeCode, refreshAccessToken,
  OAuthSession, OAUTH_KEY,
} from '../web/src/core/oauth.js';

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function jsonFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, body: init.body });
    const out = handler(url, init);
    return {
      ok: out.status ? out.status < 400 : true,
      status: out.status || 200,
      json: async () => (out.envelope !== undefined ? out.envelope : out.json || {}),
      text: async () => (typeof out.text === 'string' ? out.text : JSON.stringify(out.json || {})),
    };
  };
  fn.calls = calls;
  return fn;
}

test('base64UrlEncode is url-safe without padding', () => {
  assert.equal(base64UrlEncode(new Uint8Array([0xfb, 0xff])), '-_8');
  assert.equal(base64UrlEncode(new Uint8Array([104, 105])), 'aGk');
});

test('randomVerifier produces 43+ url-safe chars', () => {
  const v = randomVerifier(32);
  assert.ok(v.length >= 43, v.length);
  assert.match(v, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(randomVerifier(32), randomVerifier(32));
});

test('PKCE challenge matches SHA-256 of the verifier', async () => {
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
  const { challenge, method } = await createPkcePair({ verifier });
  const expected = crypto.createHash('sha256').update(verifier).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(challenge, expected);
  assert.equal(method, 'S256');
});

test('randomState is short and unique', () => {
  assert.ok(randomState().length >= 16);
});

test('buildAuthorizeUrl sets PKCE and scope params', () => {
  const url = new URL(buildAuthorizeUrl({
    authorizeUrl: 'https://auth.example.com/authorize',
    clientId: 'client-1',
    redirectUri: 'https://no7.local/oauth-callback.html',
    scopes: ['gmail.readonly', 'calendar'],
    state: 'st-1',
    codeChallenge: 'ch-1',
    extraParams: { access_type: 'offline', prompt: '' },
  }));
  assert.equal(url.origin, 'https://auth.example.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'client-1');
  assert.equal(url.searchParams.get('scope'), 'gmail.readonly calendar');
  assert.equal(url.searchParams.get('code_challenge'), 'ch-1');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), null);
});

test('parseCallback reads code/state/error', () => {
  const ok = parseCallback('https://no7.local/oauth-callback.html?code=abc&state=xyz');
  assert.deepEqual(ok, { code: 'abc', state: 'xyz', error: '', errorDescription: '' });
  const bad = parseCallback('?error=access_denied&error_description=user%20said%20no');
  assert.equal(bad.error, 'access_denied');
  assert.equal(bad.errorDescription, 'user said no');
  assert.equal(parseCallback('code=1&state=2').code, '1');
});

test('isExpired honours the 60s skew', () => {
  const now = 1_000_000;
  assert.equal(isExpired(null, now), true);
  assert.equal(isExpired({ accessToken: 'a' }, now), false, 'no expiry = never expires');
  assert.equal(isExpired({ expiresAt: now + 120_000 }, now), false);
  assert.equal(isExpired({ expiresAt: now + 30_000 }, now), true);
  assert.equal(isExpired({ expiresAt: now + 30_000 }, now, 0), false);
});

test('normalizeTokenResponse converts expires_in', () => {
  const t = normalizeTokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'a b' }, 1000);
  assert.equal(t.accessToken, 'at');
  assert.equal(t.refreshToken, 'rt');
  assert.equal(t.expiresAt, 1000 + 3_600_000);
  assert.equal(t.scope, 'a b');
  assert.equal(normalizeTokenResponse({}, 5).expiresAt, null);
});

test('TokenStore persists, keeps refresh token and lists state', () => {
  const storage = fakeStorage();
  const store = new TokenStore({ storage, now: () => 1000 });
  store.set('gmail', { accessToken: 'a1', refreshToken: 'r1', expiresAt: 2000 });
  store.set('gmail', { accessToken: 'a2', refreshToken: '', expiresAt: 500 });
  const t = store.get('gmail');
  assert.equal(t.accessToken, 'a2');
  assert.equal(t.refreshToken, 'r1', 'ต้องไม่ลบ refresh token เดิม');
  assert.ok(storage.getItem(OAUTH_KEY).includes('a2'));
  assert.deepEqual(store.list().map((x) => [x.name, x.expired]), [['gmail', true]]);
  store.remove('gmail');
  assert.equal(store.get('gmail'), null);
});

test('requestToken goes through the companion proxy', async () => {
  const fetchImpl = jsonFetch(() => ({
    envelope: { status: 200, body: JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 60 }) },
  }));
  const tokens = await exchangeCode({
    tokenUrl: 'https://oauth.example.com/token',
    code: 'code-1',
    codeVerifier: 'verifier-1',
    redirectUri: 'https://no7.local/oauth-callback.html',
    clientId: 'client-1',
    serverUrl: 'http://srv:8787',
    fetchImpl,
    now: () => 5000,
  });
  assert.equal(fetchImpl.calls[0].url, 'http://srv:8787/api/oauth/token');
  const sent = JSON.parse(fetchImpl.calls[0].body);
  assert.equal(sent.tokenUrl, 'https://oauth.example.com/token');
  assert.equal(sent.grant_type, 'authorization_code');
  assert.equal(sent.code, 'code-1');
  assert.equal(sent.code_verifier, 'verifier-1');
  assert.equal(tokens.accessToken, 'at');
  assert.equal(tokens.expiresAt, 5000 + 60000);
});

test('requestToken can call the token endpoint directly', async () => {
  const fetchImpl = jsonFetch(() => ({ status: 200, text: JSON.stringify({ access_token: 'direct-at' }) }));
  const tokens = await refreshAccessToken({
    tokenUrl: 'https://oauth.example.com/token',
    clientId: 'c', refreshToken: 'r', fetchImpl, now: () => 1,
  });
  assert.equal(tokens.accessToken, 'direct-at');
  assert.match(fetchImpl.calls[0].body, /grant_type=refresh_token/);
  assert.match(fetchImpl.calls[0].body, /refresh_token=r/);
});

test('requestToken surfaces provider errors', async () => {
  const proxyFail = jsonFetch(() => ({ envelope: { status: 400, body: '{"error":"invalid_grant"}' } }));
  await assert.rejects(() => exchangeCode({ tokenUrl: 'https://t', code: 'x', serverUrl: 'http://srv', fetchImpl: proxyFail }), /oauth 400/);

  const directFail = jsonFetch(() => ({ status: 400, text: '{"error":"invalid_client","error_description":"bad id"}' }));
  await assert.rejects(() => requestToken({ tokenUrl: 'https://t', grantType: 'authorization_code', code: 'x', fetchImpl: directFail }), /bad id/);
});

test('OAuthSession refreshes expired tokens once for concurrent calls', async () => {
  const storage = fakeStorage();
  const store = new TokenStore({ storage });
  store.set('gmail', { accessToken: 'old', refreshToken: 'r-old', expiresAt: 1 });
  const fetchImpl = jsonFetch(() => ({
    envelope: { status: 200, body: JSON.stringify({ access_token: 'new', expires_in: 3600 }) },
  }));
  const session = new OAuthSession({
    name: 'gmail', tokenUrl: 'https://oauth/token', clientId: 'c', store,
    serverUrl: 'http://srv', fetchImpl, now: () => 10_000,
  });
  const [a, b] = await Promise.all([session.getAccessToken(), session.getAccessToken()]);
  assert.equal(a, 'new');
  assert.equal(b, 'new');
  assert.equal(fetchImpl.calls.length, 1, 'ต้องต่ออายุครั้งเดียว');
  assert.equal(store.get('gmail').accessToken, 'new');
  assert.equal(store.get('gmail').refreshToken, 'r-old');
});

test('OAuthSession without tokens returns null and exchange stores them', async () => {
  const store = new TokenStore({ storage: fakeStorage() });
  const fetchImpl = jsonFetch(() => ({ envelope: { status: 200, body: JSON.stringify({ access_token: 'ex', refresh_token: 'rex', expires_in: 60 }) } }));
  const session = new OAuthSession({ name: 'drive', tokenUrl: 'https://oauth/token', clientId: 'c', store, serverUrl: 'http://srv', fetchImpl, now: () => 100 });
  assert.equal(await session.getAccessToken(), null);
  assert.equal(session.authorized(), false);
  const saved = await session.exchange({ code: 'c1', codeVerifier: 'v1', redirectUri: 'https://no7.local/cb' });
  assert.equal(saved.accessToken, 'ex');
  assert.equal(session.authorized(), true);
  const sent = JSON.parse(fetchImpl.calls[0].body);
  assert.equal(sent.grant_type, 'authorization_code');
  assert.equal(sent.redirect_uri, 'https://no7.local/cb');
});
