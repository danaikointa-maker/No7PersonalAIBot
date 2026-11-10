import test from 'node:test';
import assert from 'node:assert/strict';

import { redact, redactUrl, buildDiagnosticsReport, diagnosticsFilename } from '../web/src/core/diagnostics.js';

test('redact removes keys, tokens, emails and phone numbers', () => {
  const input = 'key sk-abc123456789 token=supersecret123 email me@example.com phone 081-234-5678 bearer Bearer abc.def-123';
  const out = redact(input);
  assert.ok(!out.includes('sk-abc123456789'));
  assert.ok(!out.includes('supersecret123'));
  assert.ok(!out.includes('me@example.com'));
  assert.ok(!out.includes('081-234-5678'));
  assert.ok(!out.includes('abc.def-123'));
  assert.match(out, /sk-\*\*\*/);
});

test('redact keeps harmless text intact', () => {
  assert.equal(redact('อากาศกรุงเทพ 32 องศา'), 'อากาศกรุงเทพ 32 องศา');
  assert.equal(redact(''), '');
});

test('redactUrl drops query strings and credentials', () => {
  assert.equal(redactUrl('http://localhost:8787/api?token=abc123456'), 'http://localhost:8787/api?…');
  assert.equal(redactUrl('https://user:pass@example.com/mcp'), 'https://example.com/mcp');
  assert.equal(redactUrl('not a url'), 'not a url');
});

test('report contains sections and no secrets', () => {
  const report = buildDiagnosticsReport({
    now: Date.parse('2026-11-10T10:00:00Z'),
    app: { name: 'No7 Personal AI', version: '1.3.0', platform: 'เว็บ (เบราว์เซอร์)', userAgent: 'Mozilla/5.0 sk-secret12345678' },
    settings: {
      provider: 'openai', model: 'gpt-4o-mini', mode: 'auto', persona: 'no7', language: 'th',
      permissions: { autonomy: 'ask-risky', allow: { mcp: false, read: true } },
      ttsProvider: 'openai', bargeIn: 'keyword', streaming: true,
      serverUrl: 'http://192.168.1.10:8787/?token=abcdef123456', syncToken: 'x',
    },
    capabilities: [{ id: 'microphone', ok: true }, { id: 'speechSynthesis', ok: true }],
    metrics: { kinds: { chat: { count: 2, avg: 900, p95: 1500, okRate: 1, firstTokenAvg: 250 }, tool: {}, tts: {} } },
    mcp: { servers: [{ name: 'Gmail', url: 'http://localhost:3100/mcp?key=zzzzzzzzzzzz', transport: 'proxy', tools: 3, error: 'HTTP 401 key=abcdefgh' }] },
    storage: { rows: [{ label: 'ความจำ', pretty: '12 KB' }], total: '12 KB', persisted: true },
    errors: [{ at: Date.parse('2026-11-10T09:59:00Z'), message: 'fetch failed for me@example.com' }],
  });

  assert.match(report, /^# No7 Diagnostics/);
  assert.match(report, /## ตั้งค่า \(ไม่รวมความลับ\)/);
  assert.match(report, /ผู้ให้บริการ AI: openai/);
  assert.match(report, /หมวดที่ปิด: mcp/);
  assert.match(report, /รองรับ 2\/2/);
  assert.match(report, /แชท: 2 ครั้ง/);
  assert.match(report, /แรก 250 ms|token แรก 250 ms/);
  assert.match(report, /Gmail/);
  assert.match(report, /ความจำ: 12 KB/);
  assert.match(report, /ข้อผิดพลาดล่าสุด/);

  assert.ok(!report.includes('sk-secret12345678'), 'API key leaked');
  assert.ok(!report.includes('me@example.com'), 'email leaked');
  assert.ok(!report.includes('abcdef123456'), 'token leaked');
  assert.ok(!report.includes('zzzzzzzzzzzz'), 'query key leaked');
  assert.ok(!report.includes('abcdefgh'), 'error payload key leaked');
});

test('report works with almost no input', () => {
  const report = buildDiagnosticsReport({});
  assert.match(report, /ยังไม่มีข้อมูล/);
  assert.match(report, /ยังไม่มี server/);
  assert.match(report, /ตรวจซ้ำก่อนแชร์เสมอ/);
});

test('filename is timestamped', () => {
  assert.equal(diagnosticsFilename(new Date(2026, 10, 10, 9, 5)), 'no7-diagnostics-20261110-0905.md');
});
