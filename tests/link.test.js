import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();

const {
  signRequest, canonical, hexToBytes, bytesToHex, DeviceRegistry, DeviceStorageError,
  sendCommand, testConnection, deviceStatus, QUICK_COMMANDS,
  encodeBase64, decodeBase64, linkCapabilities, helloDevice, sendEyes, getEyes,
  sendVoiceChunk, pullVoice, voiceStatus, ackVoice,
} = await import('../web/src/core/link.js');

const SECRET = 'a'.repeat(64);
const freshRegistry = () => { localStorage.clear(); return new DeviceRegistry(); };

test('hex ↔ bytes round-trips', () => {
  const bytes = hexToBytes('deadbeef');
  assert.deepEqual([...bytes], [0xde, 0xad, 0xbe, 0xef]);
  assert.equal(bytesToHex(bytes), 'deadbeef');
  assert.equal(bytesToHex(hexToBytes('AA:BB')), 'aabb');
});

test('canonical string covers method, path and body', () => {
  assert.equal(canonical('post', '/api/link/command', '{"a":1}'), 'POST\n/api/link/command\n{"a":1}');
});

test('signature is stable and differs when body changes', async () => {
  const a = await signRequest(SECRET, 'POST', '/api/link/command', '{"x":1}');
  const b = await signRequest(SECRET, 'POST', '/api/link/command', '{"x":1}');
  const c = await signRequest(SECRET, 'POST', '/api/link/command', '{"x":2}');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('registry add validates secret and base URL', () => {
  const reg = freshRegistry();
  assert.throws(() => reg.add({ name: 'x', baseUrl: 'http://a' }), /secret/);
  assert.throws(() => reg.add({ name: 'x', baseUrl: 'http://a', secret: 'zzz' }), /secret/);
  const d = reg.add({ name: 'PC', baseUrl: 'http://192.168.1.5:8787/', code: '123456', secret: SECRET });
  assert.equal(d.baseUrl, 'http://192.168.1.5:8787');
  assert.equal(reg.list().length, 1);
});

test('registry persists and removes devices', () => {
  const reg = freshRegistry();
  const d = reg.add({ name: 'PC', baseUrl: 'http://a', code: '1', secret: SECRET });
  const reloaded = new DeviceRegistry();
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.get(d.id).name, 'PC');
  assert.equal(reloaded.remove(d.id), true);
  assert.equal(new DeviceRegistry().list().length, 0);
});

test('registry touch updates lastSeen', () => {
  const reg = freshRegistry();
  const d = reg.add({ name: 'PC', baseUrl: 'http://a', code: '1', secret: SECRET });
  const before = d.lastSeen;
  const after = reg.touch(d.id, { lastCommand: 'ping' });
  assert.ok(after.lastSeen >= before);
  assert.equal(after.lastCommand, 'ping');
});

test('registry quota failures preserve paired device secrets and metadata in storage and memory', () => {
  const values = new Map();
  let failWrites = false;
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      if (failWrites) throw new Error('QuotaExceededError');
      values.set(key, String(value));
    },
  };
  const reg = new DeviceRegistry(storage);
  const original = reg.add({ name: 'Local PC', baseUrl: 'http://device', code: '123', secret: SECRET });
  reg.get(original.id).secret = 'not persisted';
  reg.list()[0].name = 'unpersisted mutation';
  assert.equal(reg.get(original.id).secret, SECRET, 'returned device views cannot mutate registry memory');
  const persisted = values.get('no7.devices.v1');
  const beforeWrites = writes;
  assert.equal(reg.remove('missing'), false);
  assert.equal(writes, beforeWrites, 'ลบอุปกรณ์ที่ไม่มีไม่เขียนซ้ำ');

  failWrites = true;
  assert.throws(() => reg.add({ name: 'Second', baseUrl: 'http://second', code: '456', secret: SECRET }), DeviceStorageError);
  assert.throws(() => reg.remove(original.id), DeviceStorageError);
  assert.throws(() => reg.touch(original.id, { lastCommand: 'dangerous' }), DeviceStorageError);
  assert.throws(() => reg.clear(), DeviceStorageError);
  assert.equal(reg.list().length, 1);
  assert.equal(reg.get(original.id).secret, SECRET);
  assert.equal(reg.get(original.id).lastCommand, '');
  assert.equal(values.get('no7.devices.v1'), persisted);

  failWrites = false;
  reg.clear();
  assert.deepEqual(reg.list(), []);
  assert.deepEqual(JSON.parse(values.get('no7.devices.v1')), []);
});

test('sendCommand signs and posts, and errors surface server messages', async () => {
  const reg = freshRegistry();
  const device = reg.add({ name: 'PC', baseUrl: 'http://srv', code: '42', secret: SECRET });
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, id: 'c-1' }) };
  };
  const res = await sendCommand(device, 'ping', { a: 1 });
  assert.equal(res.id, 'c-1');
  assert.equal(seen.url, 'http://srv/api/link/command');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['X-No7-Code'], '42');
  assert.match(seen.init.headers['X-No7-Signature'], /^[0-9a-f]{64}$/);
  const expected = await signRequest(SECRET, 'POST', '/api/link/command', seen.init.body);
  assert.equal(seen.init.headers['X-No7-Signature'], expected);

  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '{"error":"bad signature"}' });
  await assert.rejects(() => sendCommand(device, 'ping'), /bad signature/);
});

test('status URL keeps the query out of the signature', async () => {
  const reg = freshRegistry();
  const device = reg.add({ name: 'PC', baseUrl: 'http://srv', code: '42', secret: SECRET });
  let url = '';
  let sig = '';
  globalThis.fetch = async (u, init) => { url = u; sig = init.headers['X-No7-Signature']; return { ok: true, status: 200, text: async () => '{"online":true}' }; };
  const st = await deviceStatus(device);
  assert.equal(st.online, true);
  assert.match(url, /\/api\/link\/status\?code=42/);
  assert.equal(sig, await signRequest(SECRET, 'GET', '/api/link/status', ''));
});

test('testConnection hits /api/health', async () => {
  const reg = freshRegistry();
  const device = reg.add({ name: 'PC', baseUrl: 'http://srv', code: '1', secret: SECRET });
  globalThis.fetch = async (u) => ({ ok: true, status: 200, text: async () => JSON.stringify({ version: '0.3.0' }) });
  const res = await testConnection(device);
  assert.equal(res.health.version, '0.3.0');
});

test('quick commands have ids and labels', () => {
  assert.ok(QUICK_COMMANDS.length >= 5);
  for (const c of QUICK_COMMANDS) {
    assert.ok(c.id && c.label);
    assert.equal(typeof c.args, 'object');
  }
});

test('base64 helpers round-trip binary voice chunks', () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const b64 = encodeBase64(bytes);
  assert.equal(b64, 'AAECf4D/');
  assert.deepEqual([...decodeBase64(b64)], [...bytes]);
  assert.equal(encodeBase64(new Uint8Array()).length, 0);
  assert.deepEqual([...decodeBase64('###')], []);
});

test('linkCapabilities reports mic/speaker/eyes/screen/buttons/voice', () => {
  const plain = linkCapabilities({});
  assert.deepEqual(Object.keys(plain).sort(), ['buttons', 'eyes', 'mic', 'screen', 'speaker', 'voice']);
  for (const key of Object.keys(plain)) assert.equal(typeof plain[key], 'boolean');

  const scope = {
    no7: { native: { isDesktop: true } },
    navigator: { mediaDevices: { getUserMedia: () => {} } },
    MediaRecorder: class {},
    speechSynthesis: {},
    document: {},
  };
  const rich = linkCapabilities(scope);
  assert.equal(rich.mic, true);
  assert.equal(rich.speaker, true);
  assert.equal(rich.eyes, true);
  assert.equal(rich.voice, true);
});

test('hello/eyes/voice client helpers sign and hit the right paths', async () => {
  const device = { name: 'PC', baseUrl: 'http://srv', code: '42', secret: SECRET };
  const seen = [];
  globalThis.fetch = async (url, opts = {}) => {
    seen.push({ url: String(url), method: opts.method, body: opts.body, sig: opts.headers?.['X-No7-Signature'] });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };

  await helloDevice(device, { name: 'PC', kind: 'pc', capabilities: { mic: true } });
  assert.equal(seen.at(-1).url, 'http://srv/api/link/hello');
  assert.equal(JSON.parse(seen.at(-1).body).capabilities.mic, true);
  assert.equal(seen.at(-1).sig, await signRequest(SECRET, 'POST', '/api/link/hello', seen.at(-1).body));

  await sendEyes(device, { emotion: 'happy', intensity: 70 });
  assert.equal(seen.at(-1).url, 'http://srv/api/link/eyes');
  await assert.rejects(() => sendEyes(device, { emotion: '' }), /อารมณ์/);

  await getEyes(device);
  assert.equal(seen.at(-1).method, 'GET');
  assert.equal(seen.at(-1).url, 'http://srv/api/link/eyes');

  await sendVoiceChunk(device, { chunk: new Uint8Array([1, 2, 3]), mime: 'audio/ogg', seq: 4, final: true });
  assert.equal(seen.at(-1).url, 'http://srv/api/link/voice');
  assert.equal(JSON.parse(seen.at(-1).body).chunk, 'AQID');

  await pullVoice(device, 3);
  assert.match(seen.at(-1).url, /\/api\/link\/voice\?since=3/);
  await voiceStatus(device);
  assert.equal(seen.at(-1).url, 'http://srv/api/link/voice/status');
  await ackVoice(device, 4);
  assert.equal(JSON.parse(seen.at(-1).body).upto, 4);
});
