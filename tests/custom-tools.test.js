// ปลั๊กอินเครื่องมือ HTTP: validation, template, ความปลอดภัย, และการเรียกจริง (fetch ปลอม)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLUGIN_LIMITS, renderTemplate, templateVars, normalizeCustomTool, validateCustomTools,
  fillArgs, assertSafeUrl, buildHttpTool, customToolDefs, PLUGIN_EXAMPLE,
} from '../web/src/core/custom-tools.js';

const base = {
  id: 'weather_extra',
  label: 'อากาศเพิ่มเติม',
  desc: 'ทดสอบ',
  method: 'GET',
  url: 'https://api.example.com/v1/{{city}}',
  params: { city: { desc: 'ชื่อเมือง', required: true } },
};

function fakeFetch({ status = 200, body = '{"ok":true}', throwAbort = false } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (throwAbort) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}

test('renderTemplate encodes values and lists required vars', () => {
  assert.equal(renderTemplate('https://x/{{a}}/{{ b }}', { a: 'hello world', b: 'ก' }), 'https://x/hello%20world/%E0%B8%81');
  assert.equal(renderTemplate('{{missing}}', {}), '');
  assert.equal(renderTemplate('{"t":"{{t}}"}', { t: 'a b' }, { encode: false }), '{"t":"a b"}');
  assert.deepEqual(templateVars('https://x/{{a}}?q={{b}}&c={{a}}').sort(), ['a', 'b']);
});

test('normalizeCustomTool accepts a valid definition and applies defaults', () => {
  const { tool, errors, ok } = normalizeCustomTool(base);
  assert.equal(ok, true, errors.join('; '));
  assert.equal(tool.id, 'weather_extra');
  assert.equal(tool.emoji, '🔌');
  assert.equal(tool.method, 'GET');
  assert.equal(tool.risk, 1);
  assert.equal(tool.category, 'read');
  assert.equal(tool.timeoutMs, PLUGIN_LIMITS.timeoutMs);
  assert.deepEqual(Object.keys(tool.params), ['city']);
});

test('invalid ids, labels, methods and urls are rejected with clear errors', () => {
  const cases = [
    [{ ...base, id: 'Bad-Id' }, /id ต้องเป็น/],
    [{ ...base, label: '' }, /ต้องมี label/],
    [{ ...base, method: 'DELETE' }, /method ต้องเป็น/],
    [{ ...base, url: 'not a url' }, /url ไม่ถูกต้อง/],
    [{ ...base, url: '' }, /ต้องมี url/],
  ];
  for (const [raw, re] of cases) {
    const { ok, errors } = normalizeCustomTool(raw);
    assert.equal(ok, false, `${raw.id} ควรไม่ผ่าน`);
    assert.ok(errors.some((e) => re.test(e)), errors.join(' | '));
  }
});

test('https is required unless allowInsecure, and private hosts are blocked', () => {
  const http = normalizeCustomTool({ ...base, url: 'http://api.example.com/x' });
  assert.equal(http.ok, false);
  assert.match(http.errors.join(' '), /https:\/\//);

  assert.equal(normalizeCustomTool({ ...base, url: 'http://api.example.com/x', allowInsecure: true }).ok, true);

  const local = normalizeCustomTool({ ...base, url: 'https://localhost:8443/x' });
  assert.equal(local.ok, false);
  assert.match(local.errors.join(' '), /วง LAN/);

  const lan = normalizeCustomTool({ ...base, url: 'https://192.168.1.10/x' });
  assert.equal(lan.ok, false);

  assert.equal(normalizeCustomTool({ ...base, url: 'https://192.168.1.10/x', allowPrivate: true }).ok, true);
});

test('validateCustomTools accepts an array, a JSON string or { tools }', () => {
  assert.equal(validateCustomTools([base]).ok, true);
  assert.equal(validateCustomTools(JSON.stringify([base])).ok, true);
  assert.equal(validateCustomTools({ tools: [base] }).ok, true);
  assert.equal(validateCustomTools('').tools.length, 0);

  const bad = validateCustomTools('{oops');
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /JSON ไม่ถูกต้อง/);

  assert.equal(validateCustomTools({ nope: 1 }).ok, false);

  const dup = validateCustomTools([base, base]);
  assert.equal(dup.ok, false);
  assert.match(dup.errors.join(' '), /id ซ้ำ/);

  const many = validateCustomTools(Array.from({ length: PLUGIN_LIMITS.maxTools + 3 }, (_, i) => ({ ...base, id: `tool${i}` })));
  assert.match(many.errors.join(' '), /สูงสุด/);

  const badParam = validateCustomTools([{ ...base, params: { 'bad-name': 'x' } }]);
  assert.equal(badParam.ok, false);
  assert.match(badParam.errors.join(' '), /ชื่อพารามิเตอร์/);
});

test('the built-in example is valid', () => {
  const res = validateCustomTools(PLUGIN_EXAMPLE);
  assert.equal(res.ok, true, res.errors.join('; '));
  assert.equal(res.tools.length, 2);
  assert.equal(res.tools[1].method, 'POST');
});

test('fillArgs fills defaults and reports missing required params', () => {
  const { tool } = normalizeCustomTool({
    ...base,
    params: { city: { desc: 'เมือง', required: true }, units: { desc: 'หน่วย', default: 'metric' } },
  });
  const ok = fillArgs(tool, { city: 'Bangkok' });
  assert.deepEqual(ok.used, { city: 'Bangkok', units: 'metric' });
  assert.deepEqual(ok.missing, []);

  const miss = fillArgs(tool, {});
  assert.deepEqual(miss.missing, ['city']);
});

test('assertSafeUrl blocks protocol and host downgrades at call time', () => {
  const { tool } = normalizeCustomTool(base);
  assert.equal(assertSafeUrl('https://api.example.com/x', tool).host, 'api.example.com');
  assert.throws(() => assertSafeUrl('http://api.example.com/x', tool), /https/);
  assert.throws(() => assertSafeUrl('https://127.0.0.1/x', tool), /วง LAN/);
  assert.throws(() => assertSafeUrl('ftp://x/y', tool), /https/);
});

test('buildHttpTool runs a GET with encoded params and parses JSON', async () => {
  const { tool } = normalizeCustomTool({ ...base, query: { unit: 'metric', city: '{{city}}' } });
  const fetchImpl = fakeFetch({ body: '{"temp":31,"city":"Bangkok"}' });
  const def = buildHttpTool(tool, { fetchImpl });

  assert.equal(def.label, 'อากาศเพิ่มเติม');
  assert.equal(def.meta.risk, 1);
  assert.deepEqual(def.params, { city: 'ชื่อเมือง' });

  const out = await def.run({ city: 'Bangkok' });
  assert.equal(fetchImpl.calls.length, 1);
  const call = fetchImpl.calls[0];
  assert.equal(call.init.method, 'GET');
  assert.match(call.url, /api\.example\.com\/v1\/Bangkok\?unit=metric&city=Bangkok/);
  assert.equal(out.ok, true);
  assert.equal(out.status, 200);
  assert.equal(out.json.temp, 31);
  assert.match(out.lines[0], /temp: 31/);
  assert.equal(out.plugin, 'weather_extra');
});

test('buildHttpTool posts declared body fields only', async () => {
  const { tool } = normalizeCustomTool({
    id: 'poster', label: 'ส่ง', method: 'POST', url: 'https://api.example.com/items',
    params: { title: { desc: 'ชื่อ', required: true }, secret: { desc: 'อื่น ๆ' } },
    body: { name: '{{title}}' },
  });
  const fetchImpl = fakeFetch({ body: 'created' });
  const out = await buildHttpTool(tool, { fetchImpl }).run({ title: 'งาน', extra: 'ไม่ควรถูกส่ง' });
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.deepEqual(sent, { name: 'งาน' });
  assert.equal(fetchImpl.calls[0].init.headers['content-type'], 'application/json');
  assert.equal(out.json, null, 'body ไม่ใช่ JSON → json = null');
  assert.match(out.lines[0], /created/);
});

test('buildHttpTool fails loudly on missing params and errors', async () => {
  const { tool } = normalizeCustomTool(base);
  await assert.rejects(() => buildHttpTool(tool, { fetchImpl: fakeFetch() }).run({}), /ขาดพารามิเตอร์: city/);

  const abort = fakeFetch({ throwAbort: true });
  await assert.rejects(() => buildHttpTool(tool, { fetchImpl: abort }).run({ city: 'x' }), /หมดเวลา/);

  const failing = async () => { throw new Error('dns'); };
  await assert.rejects(() => buildHttpTool(tool, { fetchImpl: failing }).run({ city: 'x' }), /ปลั๊กอิน weather_extra: dns/);

  const notFound = fakeFetch({ status: 404, body: 'nope' });
  const out = await buildHttpTool(tool, { fetchImpl: notFound }).run({ city: 'x' });
  assert.equal(out.ok, false);
  assert.equal(out.big, 'HTTP 404');
});

test('responses are truncated to maxBytes', async () => {
  const { tool } = normalizeCustomTool({ ...base, maxBytes: 1024 });
  const big = 'x'.repeat(5000);
  const out = await buildHttpTool(tool, { fetchImpl: fakeFetch({ body: big }) }).run({ city: 'x' });
  assert.equal(out.body.length, 1025);
  assert.ok(out.body.endsWith('…'));
});

test('customToolDefs namespaces ids and returns errors without defs', () => {
  const ok = customToolDefs([base]);
  assert.deepEqual(Object.keys(ok.defs), ['plugin__weather_extra']);
  assert.equal(ok.errors.length, 0);

  const bad = customToolDefs([{ ...base, url: 'http://insecure.example.com' }]);
  assert.deepEqual(bad.defs, {});
  assert.ok(bad.errors.length > 0);

  const passed = customToolDefs([base], { fetchImpl: fakeFetch() });
  assert.equal(typeof passed.defs.plugin__weather_extra.run, 'function');
});
