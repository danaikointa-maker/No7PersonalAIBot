import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  base64UrlEncode, randomVerifier, createPkcePair, randomState, buildAuthorizeUrl, parseCallback,
  isExpired, normalizeTokenResponse, TokenStore, requestToken, exchangeCode, refreshAccessToken,
  OAuthSession, OAUTH_KEY,
  normalizeDeviceCode, requestDeviceCode, requestDeviceToken, pollDeviceToken, registerClient,
  oauthMethodFor, DEVICE_GRANT,
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

test('TokenStore set/remove are transactional when storage writes fail', () => {
  const storage = fakeStorage();
  let fail = false;
  let writes = 0;
  const setItem = storage.setItem;
  storage.setItem = function (key, value) {
    writes += 1;
    if (fail) throw new Error('quota exceeded');
    return setItem.call(this, key, value);
  };
  const store = new TokenStore({ storage });
  store.set('gmail', { accessToken: 'old-access', refreshToken: 'old-refresh' });
  const previousData = store.data;
  const previousStored = storage.getItem(OAUTH_KEY);
  fail = true;
  assert.throws(() => store.set('gmail', { accessToken: 'new-access', refreshToken: 'new-refresh' }), { name: 'OAuthStorageError' });
  assert.equal(store.data, previousData);
  assert.deepEqual(store.get('gmail'), { accessToken: 'old-access', refreshToken: 'old-refresh' });
  assert.equal(storage.getItem(OAUTH_KEY), previousStored);
  assert.throws(() => store.remove('gmail'), { name: 'OAuthStorageError' });
  assert.equal(store.data, previousData);
  assert.equal(storage.getItem(OAUTH_KEY), previousStored);
  const attemptedWrites = writes;
  assert.equal(store.remove('missing'), false);
  assert.equal(writes, attemptedWrites, 'removing an unknown token does not write');
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

test('OAuthSession exchange/refresh do not report success when token persistence fails', async () => {
  const storage = fakeStorage();
  let fail = false;
  const setItem = storage.setItem;
  storage.setItem = function (key, value) {
    if (fail && key === OAUTH_KEY) throw new Error('quota exceeded');
    return setItem.call(this, key, value);
  };
  const store = new TokenStore({ storage });
  const fetchImpl = jsonFetch(() => ({ envelope: { status: 200, body: JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }) } }));
  const session = new OAuthSession({ name: 'drive', tokenUrl: 'https://oauth/token', store, serverUrl: 'http://srv', fetchImpl, now: () => 1000 });
  fail = true;
  await assert.rejects(() => session.exchange({ code: 'code', codeVerifier: 'verifier', redirectUri: 'https://no7.local/cb' }), { name: 'OAuthStorageError' });
  assert.equal(session.authorized(), false, 'exchange must not appear successful without saved tokens');

  fail = false;
  store.set('drive', { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 1 });
  fail = true;
  await assert.rejects(() => session.getAccessToken(), { name: 'OAuthStorageError' });
  assert.equal(store.get('drive').accessToken, 'old-access', 'failed refresh keeps the prior token');
});

/* ------------------------- device flow + DCR (v1.5) ------------------------- */

test('normalizeDeviceCode clamps interval and computes expiry', () => {
  const d = normalizeDeviceCode({
    device_code: 'dc', user_code: 'ABCD-EFGH', verification_uri: 'https://x/device',
    verification_uri_complete: 'https://x/device?c=ABCD-EFGH', expires_in: 900, interval: 0,
  }, 1000);
  assert.equal(d.deviceCode, 'dc');
  assert.equal(d.userCode, 'ABCD-EFGH');
  assert.equal(d.interval, 5, 'interval 0 → 5');
  assert.equal(d.expiresAt, 1000 + 900_000);
  assert.equal(normalizeDeviceCode({ interval: 999 }, 0).interval, 60);

  const bare = normalizeDeviceCode({}, 0);
  assert.equal(bare.expiresIn, 600);
  assert.equal(bare.userCode, '');
});

test('requestDeviceCode goes through /api/oauth/device proxy', async () => {
  const fetchImpl = jsonFetch(() => ({
    envelope: {
      status: 200,
      body: JSON.stringify({ device_code: 'dc-1', user_code: 'WXYZ-1234', verification_uri: 'https://id/device', expires_in: 300, interval: 7 }),
    },
  }));
  const code = await requestDeviceCode({
    deviceAuthorizationUrl: 'https://id/device_authorization',
    clientId: 'client-9', scope: 'read mail', serverUrl: 'http://srv:8787',
    fetchImpl, now: () => 10_000,
  });
  assert.equal(fetchImpl.calls[0].url, 'http://srv:8787/api/oauth/device');
  const sent = JSON.parse(fetchImpl.calls[0].body);
  assert.equal(sent.deviceAuthorizationUrl, 'https://id/device_authorization');
  assert.equal(sent.client_id, 'client-9');
  assert.equal(sent.scope, 'read mail');
  assert.equal(code.deviceCode, 'dc-1');
  assert.equal(code.interval, 7);
  assert.equal(code.expiresAt, 10_000 + 300_000);
});

test('requestDeviceCode can call the provider directly and surfaces errors', async () => {
  const ok = jsonFetch(() => ({ status: 200, text: JSON.stringify({ device_code: 'd', user_code: 'u', verification_uri: 'https://v' }) }));
  const code = await requestDeviceCode({
    deviceAuthorizationUrl: 'https://id/device', clientId: 'c', scope: 's', fetchImpl: ok,
  });
  assert.equal(code.deviceCode, 'd');
  assert.match(ok.calls[0].body, /grant_type|client_id=c/);

  const bad = jsonFetch(() => ({ status: 401, text: JSON.stringify({ error: 'invalid_client', error_description: 'bad client' }) }));
  await assert.rejects(() => requestDeviceCode({ deviceAuthorizationUrl: 'https://id/device', fetchImpl: bad }), /bad client/);
  await assert.rejects(() => requestDeviceCode({ fetchImpl: bad }), /deviceAuthorizationUrl/);
});

test('pollDeviceToken handles pending → slow_down → success', async () => {
  let attempt = 0;
  const fetchImpl = jsonFetch(() => {
    attempt++;
    if (attempt === 1) return { envelope: { status: 400, body: JSON.stringify({ error: 'authorization_pending' }) } };
    if (attempt === 2) return { envelope: { status: 400, body: JSON.stringify({ error: 'slow_down' }) } };
    return { envelope: { status: 200, body: JSON.stringify({ access_token: 'at', expires_in: 120 }) } };
  });
  const slept = [];
  const pending = [];
  const tokens = await pollDeviceToken({
    deviceCode: 'dc', tokenUrl: 'https://id/token', clientId: 'c', interval: 5,
    expiresAt: Date.now() + 60_000, serverUrl: 'http://srv', fetchImpl,
    sleep: async (ms) => { slept.push(ms); },
    onPending: (info) => pending.push(info.status),
  });
  assert.equal(tokens.accessToken, 'at');
  assert.deepEqual(pending, ['pending', 'slow_down']);
  assert.deepEqual(slept, [5_000, 10_000], 'slow_down เพิ่ม interval 5 วิ');
  assert.equal(JSON.parse(fetchImpl.calls[0].body).grant_type, DEVICE_GRANT);
  assert.equal(JSON.parse(fetchImpl.calls[0].body).device_code, 'dc');
});

test('pollDeviceToken maps expired/denied/timeout to Thai errors', async () => {
  const expired = jsonFetch(() => ({ envelope: { status: 400, body: JSON.stringify({ error: 'expired_token' }) } }));
  await assert.rejects(
    () => pollDeviceToken({ deviceCode: 'd', tokenUrl: 'https://t', serverUrl: 'http://s', fetchImpl: expired, sleep: async () => {} }),
    /หมดอายุ/,
  );

  const denied = jsonFetch(() => ({ envelope: { status: 400, body: JSON.stringify({ error: 'access_denied' }) } }));
  await assert.rejects(
    () => pollDeviceToken({ deviceCode: 'd', tokenUrl: 'https://t', serverUrl: 'http://s', fetchImpl: denied, sleep: async () => {} }),
    /ปฏิเสธ/,
  );

  let clock = 0;
  const alwaysPending = jsonFetch(() => ({ envelope: { status: 400, body: JSON.stringify({ error: 'authorization_pending' }) } }));
  await assert.rejects(
    () => pollDeviceToken({
      deviceCode: 'd', tokenUrl: 'https://t', serverUrl: 'http://s', fetchImpl: alwaysPending,
      now: () => clock, sleep: async (ms) => { clock += ms; }, expiresAt: 1_000_000, maxAttempts: 3,
    }),
    /หมดเวลา/,
  );
});

test('registerClient performs DCR through the proxy and directly', async () => {
  const proxy = jsonFetch(() => ({ envelope: { status: 201, body: JSON.stringify({ client_id: 'dcr-1', client_secret: 'sec', token_endpoint_auth_method: 'client_secret_basic' }) } }));
  const reg = await registerClient({
    registrationUrl: 'https://id/register', clientName: 'No7', scopes: ['read', 'mail'],
    redirectUris: ['https://no7.local/oauth-callback.html'], serverUrl: 'http://srv', fetchImpl: proxy,
  });
  assert.equal(proxy.calls[0].url, 'http://srv/api/oauth/register');
  const sent = JSON.parse(proxy.calls[0].body);
  assert.equal(sent.registrationUrl, 'https://id/register');
  assert.equal(sent.client.client_name, 'No7');
  assert.deepEqual(sent.client.redirect_uris, ['https://no7.local/oauth-callback.html']);
  assert.ok(sent.client.grant_types.includes(DEVICE_GRANT));
  assert.equal(reg.clientId, 'dcr-1');
  assert.equal(reg.clientSecret, 'sec');
  assert.equal(reg.tokenEndpointAuthMethod, 'client_secret_basic');

  const direct = jsonFetch(() => ({ status: 201, text: JSON.stringify({ client_id: 'dcr-2' }) }));
  const reg2 = await registerClient({ registrationUrl: 'https://id/register', fetchImpl: direct });
  assert.equal(reg2.clientId, 'dcr-2');
  assert.equal(JSON.parse(direct.calls[0].body).token_endpoint_auth_method, 'none');

  const bad = jsonFetch(() => ({ status: 400, text: JSON.stringify({ error: 'invalid_redirect_uri' }) }));
  await assert.rejects(() => registerClient({ registrationUrl: 'https://id/register', fetchImpl: bad }), /invalid_redirect_uri/);
  await assert.rejects(() => registerClient({ fetchImpl: bad }), /registrationUrl/);

  const none = jsonFetch(() => ({ status: 201, text: JSON.stringify({ ok: true }) }));
  await assert.rejects(() => registerClient({ registrationUrl: 'https://id/register', fetchImpl: none }), /client_id/);
});

test('oauthMethodFor prefers device flow, then PKCE', () => {
  assert.equal(oauthMethodFor({ deviceAuthorizationUrl: 'https://d' }), 'device');
  assert.equal(oauthMethodFor({ authorizeUrl: 'https://a' }), 'pkce');
  assert.equal(oauthMethodFor({}), 'none');
});
