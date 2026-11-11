import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_PRESETS, isPrivateHost, normalizeLocalTarget, parseModelList, matchModel, pickBestModel,
  probeLocal, warmModel, LocalModelCache, normalizeOfflineBrain, offlineChainSettings, describeLocalBrain,
} from '../web/src/core/local-models.js';

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    const out = handler(String(url), init) || {};
    return {
      ok: out.ok !== false,
      status: out.status || 200,
      json: async () => out.json || {},
      text: async () => (typeof out.text === 'string' ? out.text : JSON.stringify(out.json || {})),
    };
  };
  fn.calls = calls;
  return fn;
}

test('isPrivateHost allows loopback and RFC1918 only', () => {
  for (const h of ['localhost', '127.0.0.1', '::1', '[::1]', '10.1.2.3', '192.168.0.9', '172.16.4.2', '172.31.255.1', 'box.localhost']) {
    assert.equal(isPrivateHost(h), true, h);
  }
  for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', '']) {
    assert.equal(isPrivateHost(h), false, h);
  }
});

test('normalizeLocalTarget applies presets and validates the URL', () => {
  const ollama = normalizeLocalTarget({ kind: 'ollama' });
  assert.equal(ollama.baseUrl, LOCAL_PRESETS.ollama.baseUrl);
  assert.equal(ollama.valid, true);
  assert.equal(ollama.private, true);

  const lm = normalizeLocalTarget({ kind: 'lmstudio', baseUrl: 'http://192.168.1.5:1234/' });
  assert.equal(lm.baseUrl, 'http://192.168.1.5:1234');
  assert.equal(lm.kind, 'lmstudio');

  assert.equal(normalizeLocalTarget({ kind: 'nope' }).kind, 'ollama');
  const bad = normalizeLocalTarget({ baseUrl: 'ftp://x' });
  assert.equal(bad.valid, false);
  assert.equal(bad.baseUrl, LOCAL_PRESETS.ollama.baseUrl, 'URL เสีย → กลับไปค่าเริ่มต้น');
});

test('parseModelList understands Ollama tags and OpenAI-style model lists', () => {
  const ollama = parseModelList('ollama', {
    models: [
      { name: 'llama3.1:latest', size: 4_700_000_000, details: { family: 'llama' }, modified_at: '2026-01-01' },
      { name: 'llama3.1:latest' },                      // ซ้ำ
      { model: 'qwen2.5:7b', details: { family: 'qwen2' } },
      { name: '' },                                     // ข้าม
    ],
  });
  assert.deepEqual(ollama.map((m) => m.id), ['llama3.1:latest', 'qwen2.5:7b']);
  assert.equal(ollama[0].name, 'llama3.1');
  assert.equal(ollama[0].family, 'llama');
  assert.equal(ollama[0].sizeBytes, 4_700_000_000);

  const lm = parseModelList('lmstudio', {
    data: [{ id: 'qwen2.5-7b-instruct', owned_by: 'organization_owner' }],
  });
  assert.deepEqual(lm.map((m) => m.id), ['qwen2.5-7b-instruct']);
  assert.equal(lm[0].family, 'organization_owner');
  assert.deepEqual(parseModelList('ollama', {}), []);
});

test('matchModel ranks exact/prefix/contains and pickBestModel respects preference', () => {
  const models = [{ id: 'llama3.1:latest' }, { id: 'llama3.1:70b' }, { id: 'qwen2.5:7b' }];
  assert.deepEqual(matchModel(models, 'qwen').map((m) => m.id), ['qwen2.5:7b']);
  assert.equal(matchModel(models, '')[0].id, 'llama3.1:latest');
  assert.deepEqual(matchModel(models, 'zzz'), []);
  assert.equal(pickBestModel(models, 'qwen'), 'qwen2.5:7b');
  assert.equal(pickBestModel(models, 'missing'), 'llama3.1:latest');
  assert.equal(pickBestModel([], 'x'), '');
});

test('probeLocal reports per-target health and flattens models', async () => {
  const fetchImpl = fakeFetch((url) => {
    if (url.includes('11434')) {
      return { json: { models: [{ name: 'llama3.1:latest', size: 100 }] } };
    }
    return { ok: false, status: 500, text: 'boom' };
  });
  const probe = await probeLocal({ fetchImpl });
  assert.equal(probe.results.length, 2);
  const ollama = probe.results.find((r) => r.kind === 'ollama');
  assert.equal(ollama.ok, true);
  assert.equal(ollama.models[0].id, 'llama3.1:latest');
  assert.equal(fetchImpl.calls[0].url, 'http://localhost:11434/api/tags');
  const lm = probe.results.find((r) => r.kind === 'lmstudio');
  assert.equal(lm.ok, false);
  assert.match(lm.error, /HTTP 500/);
  assert.equal(probe.models.length, 1);
  assert.equal(probe.best.kind, 'ollama');
});

test('probeLocal survives network errors and empty target list', async () => {
  const probe = await probeLocal({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.ok(probe.results.every((r) => !r.ok && /ECONNREFUSED/.test(r.error)));
  assert.equal(probe.best, null);

  const single = await probeLocal({
    targets: [{ kind: 'lmstudio', baseUrl: 'http://10.0.0.2:1234' }],
    fetchImpl: fakeFetch(() => ({ json: { data: [{ id: 'm1' }, { id: 'm2' }] } })),
  });
  assert.equal(single.models.length, 2);
  assert.equal(single.models[0].kind, 'lmstudio');
});

test('warmModel pings the right chat endpoint', async () => {
  const ollama = fakeFetch(() => ({ json: { message: { content: '' } } }));
  const res = await warmModel({ kind: 'ollama', model: 'llama3.1', fetchImpl: ollama });
  assert.equal(ollama.calls[0].url, 'http://localhost:11434/api/chat');
  assert.equal(ollama.calls[0].method, 'POST');
  const body = JSON.parse(ollama.calls[0].body);
  assert.equal(body.model, 'llama3.1');
  assert.equal(body.stream, false);
  assert.equal(res.ok, true);

  const lm = fakeFetch(() => ({ json: { choices: [] } }));
  await warmModel({ kind: 'lmstudio', model: 'm', fetchImpl: lm });
  assert.equal(lm.calls[0].url, 'http://localhost:1234/v1/chat/completions');

  await assert.rejects(() => warmModel({ kind: 'ollama', fetchImpl: ollama }), /โมเดล/);
  await assert.rejects(() => warmModel({ kind: 'ollama', model: 'x', baseUrl: 'ftp://x', fetchImpl: ollama }), /baseUrl/);
  const down = fakeFetch(() => ({ ok: false, status: 503, text: 'not loaded' }));
  await assert.rejects(() => warmModel({ kind: 'ollama', model: 'x', fetchImpl: down }), /503/);
});

test('LocalModelCache expires entries after the TTL', () => {
  let clock = 1000;
  const cache = new LocalModelCache({ ttlMs: 60_000, now: () => clock });
  assert.equal(cache.get(), null);
  cache.set({ models: [1] });
  clock = 30_000;
  assert.deepEqual(cache.get(), { models: [1] });
  clock = 70_000;
  assert.equal(cache.get(), null);
  cache.set({ models: [2] });
  cache.clear();
  assert.equal(cache.get(), null);
});

test('offlineChainSettings switches to the local brain only when offline and enabled', () => {
  const base = { provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'k', costMode: 'mixed' };

  assert.deepEqual(offlineChainSettings(base, { online: true }), base, 'ออนไลน์ = ไม่แตะ');

  const off = normalizeOfflineBrain({});
  assert.equal(off.enabled, false);
  assert.deepEqual(offlineChainSettings({ ...base, offlineBrain: off }, { online: false }), { ...base, offlineBrain: off });

  const local = { enabled: true, kind: 'ollama', baseUrl: 'http://localhost:11434/', model: 'qwen2.5:7b' };
  const switched = offlineChainSettings({ ...base, offlineBrain: local }, { online: false });
  assert.equal(switched.provider, 'ollama');
  assert.equal(switched.costMode, 'private');
  assert.equal(switched.baseUrl, 'http://localhost:11434');
  assert.equal(switched.model, 'qwen2.5:7b');
  assert.equal(switched.apiKey, '');

  const noModel = offlineChainSettings({ ...base, model: 'm', offlineBrain: { ...local, model: '' } }, { online: false });
  assert.equal(noModel.model, 'm', 'ไม่เลือกโมเดล = ใช้โมเดลเดิมที่ตั้งไว้');
});

test('describeLocalBrain summarises the setting', () => {
  assert.match(describeLocalBrain({ offlineBrain: { enabled: false } }), /ปิด/);
  assert.match(
    describeLocalBrain({ offlineBrain: { enabled: true, kind: 'lmstudio', baseUrl: 'http://localhost:1234', model: 'm' } }),
    /LM Studio · m/,
  );
  assert.match(describeLocalBrain({ offlineBrain: { enabled: true } }), /ยังไม่เลือกโมเดล/);
});
