// Integration: /api/oauth/device and /api/oauth/register proxies (device flow + DCR)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 26000 + Math.floor(Math.random() * 1200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-oauth-'));

async function waitFor(fn, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

function startMockProvider() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const entry = { path: req.url, body, contentType: req.headers['content-type'] || '' };
      seen.push(entry);
      const send = (status, obj) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (req.url === '/device') {
        return send(200, {
          device_code: 'dev-123', user_code: 'ABCD-EFGH',
          verification_uri: 'https://id.example.com/device',
          verification_uri_complete: 'https://id.example.com/device?c=ABCD-EFGH',
          expires_in: 900, interval: 5,
        });
      }
      if (req.url === '/token') {
        const params = new URLSearchParams(body);
        assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
        if (params.get('device_code') !== 'dev-123') {
          return send(400, { error: 'expired_token', error_description: 'device code expired' });
        }
        return send(200, { access_token: 'at-device', refresh_token: 'rt-device', expires_in: 3600, token_type: 'Bearer' });
      }
      if (req.url === '/register') {
        const client = JSON.parse(body || '{}');
        return send(201, {
          client_id: 'dcr-client',
          client_secret: 'dcr-secret',
          token_endpoint_auth_method: client.token_endpoint_auth_method || 'none',
          client_name: client.client_name,
        });
      }
      return send(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, seen }));
  });
}

test('oauth device + DCR proxies forward to the provider and envelope the response', async (t) => {
  const provider = await startMockProvider();
  t.after(() => { try { provider.srv.close(); } catch { /* closed */ } });
  const providerBase = `http://127.0.0.1:${provider.port}`;

  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, NO7_PORT: String(PORT), NO7_HOST: '127.0.0.1', NO7_DATA_DIR: DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });

  const up = await waitFor(async () => {
    try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
  });
  assert.ok(up, `server ไม่ขึ้น ${stderr.slice(-300)}`);

  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.ok(health.endpoints.includes('/api/oauth/device'));
  assert.ok(health.endpoints.includes('/api/oauth/register'));

  // device authorization
  const device = await (await fetch(`${BASE}/api/oauth/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceAuthorizationUrl: `${providerBase}/device`, client_id: 'client-1', scope: 'mail read' }),
  })).json();
  assert.equal(device.status, 200);
  const deviceBody = JSON.parse(device.body);
  assert.equal(deviceBody.user_code, 'ABCD-EFGH');
  assert.equal(deviceBody.interval, 5);
  assert.equal(provider.seen.at(-1).path, '/device');
  assert.match(provider.seen.at(-1).body, /client_id=client-1/);
  assert.match(provider.seen.at(-1).body, /scope=mail/);

  // token exchange with the device grant (proxy must pass device_code through)
  const token = await (await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokenUrl: `${providerBase}/token`, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'dev-123', client_id: 'client-1' }),
  })).json();
  assert.equal(token.status, 200);
  assert.equal(JSON.parse(token.body).access_token, 'at-device');

  const expired = await (await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokenUrl: `${providerBase}/token`, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'wrong' }),
  })).json();
  assert.equal(expired.status, 400, 'error จาก provider ต้องถูกส่งกลับแบบ envelope');
  assert.match(expired.body, /expired_token/);

  // DCR
  const reg = await (await fetch(`${BASE}/api/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registrationUrl: `${providerBase}/register`,
      client: { client_name: 'No7 Personal AI Bot', redirect_uris: ['https://no7.local/oauth-callback.html'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'] },
    }),
  })).json();
  assert.equal(reg.status, 201);
  const regBody = JSON.parse(reg.body);
  assert.equal(regBody.client_id, 'dcr-client');
  assert.equal(regBody.client_name, 'No7 Personal AI Bot');
  const forwarded = JSON.parse(provider.seen.at(-1).body);
  assert.equal(provider.seen.at(-1).path, '/register');
  assert.equal(provider.seen.at(-1).contentType, 'application/json');
  assert.ok(forwarded.grant_types.includes('urn:ietf:params:oauth:grant-type:device_code'));

  // input guards
  const badDevice = await fetch(`${BASE}/api/oauth/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceAuthorizationUrl: 'file:///etc/passwd' }),
  });
  assert.equal(badDevice.status, 400);
  const badReg = await fetch(`${BASE}/api/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ registrationUrl: 'not-a-url' }),
  });
  assert.equal(badReg.status, 400);
  const noGrant = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokenUrl: `${providerBase}/token` }),
  });
  assert.equal(noGrant.status, 400);
});
