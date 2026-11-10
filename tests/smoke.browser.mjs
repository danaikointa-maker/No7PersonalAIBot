// Optional browser smoke test — runs the REAL app bundle in jsdom and walks
// through boot → nav → settings → memory → chat → tool call → mic → pairing.
// Needs dev-only packages: npm i -D jsdom esbuild
// Run: node tests/smoke.browser.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let JSDOM;
let esbuild;
try {
  ({ JSDOM } = await import('jsdom'));
  esbuild = await import('esbuild');
} catch {
  console.log('⏭  skipped: ติดตั้ง dependency ก่อน → npm i -D jsdom esbuild');
  process.exit(0);
}

// 1) bundle the app the same way vite would (CSS dropped, no DOM deps)
const outfile = path.join(os.tmpdir(), `no7-smoke-${process.pid}.js`);
await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/src/main.js')],
  bundle: true,
  format: 'iife',
  loader: { '.css': 'empty' },
  outfile,
  logLevel: 'silent',
});

// 2) jsdom + minimal browser stubs
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.js"></script>', '');

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;

const ctxStub = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'canvas') return { width: 360, height: 140 };
    return () => {};
  },
  set: () => true,
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.URL.createObjectURL = () => 'blob:stub';
window.open = () => ({ closed: false });
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak(u) { spoken.push(u.text); setTimeout(() => u.onend?.(), 0); },
    cancel() {},
    getVoices: () => [{ name: 'TestThai', lang: 'th-TH' }],
  },
});
const spoken = [];
window.SpeechRecognition = class {
  start() {
    this.onstart?.();
    setTimeout(() => {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'ทดสอบเสียง' }], { isFinal: true })] });
      this.onend?.();
    }, 5);
  }
  stop() {}
};

const calls = [];
window.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), body: opts.body });
  const u = String(url);
  if (u.includes('text.pollinations.ai')) {
    const msgs = JSON.parse(opts.body).messages;
    const last = msgs[msgs.length - 1].content;
    const reply = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
    if (last.includes('ผลลัพธ์จากเครื่องมือ')) return reply('ราคาทองตอนนี้ 2,412 ดอลลาร์ต่อออนซ์ครับ');
    if (last.includes('พิมพ์คำว่า OK')) return reply('OK');
    if (last.includes('ราคาทอง')) return reply('```tool\n{"tool":"gold","args":{}}\n```');
    if (last.includes('เปิดเว็บ')) return reply('```tool\n{"tool":"open_url","args":{"url":"https://example.com"}}\n```');
    return reply('สวัสดีครับ ผมชื่อ No7');
  }
  if (u.includes('/api/mcp')) {
    const payload = JSON.parse(opts.body || '{}').payload || {};
    const ok = (result) => ({ ok: true, json: async () => ({ status: 200, headers: {}, body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result }) }) });
    if (payload.method === 'initialize') return ok({ protocolVersion: '2024-11-05', serverInfo: { name: 'Demo' } });
    if (payload.method === 'tools/list') {
      return ok({ tools: [{ name: 'send_email', description: 'ส่งอีเมลผ่าน MCP', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' } } } }] });
    }
    if (payload.method === 'tools/call') return ok({ content: [{ type: 'text', text: 'ส่งอีเมลแล้ว' }] });
    return { ok: true, json: async () => ({ status: 202, headers: {}, body: '' }) };
  }
  if (u.includes('gold-api')) return { ok: true, json: async () => ({ price: 2412.5, updatedAt: new Date().toISOString() }) };
  return { ok: true, json: async () => ({}) };
};

const script = window.document.createElement('script');
script.textContent = fs.readFileSync(outfile, 'utf8');
window.document.body.appendChild(script);
fs.rmSync(outfile, { force: true });

// 3) assertions
const $ = (s) => window.document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra = '') => results.push({ name, ok: !!cond, extra });
const submit = (text) => {
  $('#input').value = text;
  $('#composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
};

await wait(100);
check('boot: initial state', ['IDLE', 'SETUP'].includes($('#state-label').textContent), $('#state-label').textContent);
check('boot: welcome message', $('#messages').children.length >= 1);
check('boot: 24 tools in auto mode', $('#tools-grid').children.length === 24, String($('#tools-grid').children.length));
check('boot: 5 role modes', $('#mode-chips').children.length === 5, String($('#mode-chips').children.length));
check('boot: persona header', $('#persona-name').textContent.length > 0);

$('#nav button[data-view="memory"]').click();
check('nav: memory view', $('#view-memory').classList.contains('active'));

// mode switching filters tools
window.document.querySelector('#mode-chips button[data-mode="hub"]').click();
await wait(20);
check('mode: hub filters tools', $('#tools-grid').children.length === 18, String($('#tools-grid').children.length));
window.document.querySelector('#mode-chips button[data-mode="auto"]').click();
await wait(20);
check('mode: back to auto', $('#tools-grid').children.length === 24);

$('#set-provider').value = 'pollinations';
$('#save-settings-btn').click();
check('settings: saved', $('#settings-status').textContent.includes('บันทึกแล้ว'));

$('#test-ai-btn').click();
await wait(80);
check('settings: test AI', $('#settings-status').textContent.includes('OK'), $('#settings-status').textContent);

$('#mem-new').value = 'ฉันชอบกาแฟดำ';
$('#mem-add-btn').click();
await wait(20);
check('memory: fact added', $('#mem-results').textContent.includes('กาแฟดำ'), $('#mem-results').textContent.slice(0, 60));
$('#mem-query').value = 'กาแฟ';
$('#mem-search-btn').click();
check('memory: BM25 search', $('#mem-results').textContent.includes('กาแฟ'));
check('memory: stats rendered', $('#mem-stats').textContent.includes('ข้อเท็จจริง'), $('#mem-stats').textContent.slice(0, 40));

submit('สวัสดี No7');
await wait(120);
check('chat: bot replied', [...$('#messages').querySelectorAll('.msg.bot')].some((m) => m.textContent.includes('No7')));
check('chat: TTS spoke', spoken.length > 0, spoken.join(' | '));

submit('ราคาทองวันนี้');
await wait(220);
const lastBot = [...$('#messages').querySelectorAll('.msg.bot')].at(-1);
check('tool: card rendered', !!lastBot?.querySelector('.card'));
check('tool: provider API called', calls.some((c) => c.url.includes('gold-api')));
check('tool: spoken summary', lastBot?.textContent.includes('2,412'), lastBot?.textContent.slice(0, 60));

$('#mic-btn').click();
await wait(80);
check('voice: transcript sent', [...$('#messages').querySelectorAll('.msg.user')].some((m) => m.textContent.includes('ทดสอบเสียง')));

await wait(400);          // รอให้คิวก่อนหน้าจบ (busy guard)
submit('จำไว้ว่า ฉันมีแมวชื่อมีโจ');
await wait(300);
$('#nav button[data-view="memory"]').click();
check('memory: learned from chat', $('#mem-results').textContent.includes('มีโจ'), $('#mem-results').textContent.slice(0, 80));

// calendar view
$('#nav button[data-view="calendar"]').click();
$('#cal-title').value = 'ประชุมทดสอบ';
$('#cal-when').value = '2026-12-01T10:00';
$('#cal-add-btn').click();
await wait(20);
check('calendar: event added', $('#cal-list').textContent.includes('ประชุมทดสอบ'), $('#cal-list').textContent.slice(0, 60));
check('calendar: persisted', JSON.parse(window.localStorage.getItem('no7.calendar.v1') || '[]').length > 0);

// memory 2.0: pin + consolidate run
$('#nav button[data-view="memory"]').click();
await wait(20);
$('#mem-results').querySelector('.fact button')?.click();      // ปุ่ม 📍 ตัวแรก
await wait(20);
check('memory: pin toggles', $('#mem-results').textContent.includes('📌'), $('#mem-results').textContent.slice(0, 40));
$('#mem-consolidate-btn').click();
await wait(200);
check('memory: consolidate runs', $('#mem-status').textContent.includes('สรุปเสร็จ'), $('#mem-status').textContent);

$('#nav button[data-view="settings"]').click();
$('#pair-btn').click();
await wait(50);
check('pairing: handled (code or clear warning)', /รหัสจับคู่|ต้องเปิดผ่าน https|สร้างไม่สำเร็จ/.test($('#pair-output').textContent), $('#pair-output').textContent.slice(0, 60));

// devices view (no server running → must fail gracefully)
$('#nav button[data-view="devices"]').click();
$('#dev-name').value = 'PC ทดสอบ';
$('#dev-url').value = 'http://127.0.0.1:9';
$('#dev-code').value = '123456';
$('#dev-secret').value = 'a'.repeat(64);
$('#dev-add').click();
await wait(20);
check('devices: added to registry', $('#dev-list').textContent.includes('PC ทดสอบ'), $('#dev-list').textContent.slice(0, 60));
$('#dev-list').querySelector('.dev-actions button')?.click();
await wait(150);
check('devices: failure logged, no crash', $('#dev-log').hidden === false, $('#dev-log').textContent.slice(0, 80));

// capabilities + storage panels (R1)
check('caps: list rendered', $('#caps-list').children.length > 3, String($('#caps-list').children.length));
check('caps: summary line', /พร้อมใช้/.test($('#caps-list').textContent), $('#caps-list').textContent.slice(0, 50));
check('storage: summary rendered', $('#storage-summary').textContent.includes('พื้นที่'), $('#storage-summary').textContent.slice(0, 60));
$('#storage-clean-metrics').click();
check('storage: clean metrics works', $('#settings-status').textContent.includes('ล้างสถิติ'), $('#settings-status').textContent);
check('offline banner hidden while online', $('#offline-banner').hidden === true);

// Persona Studio
$('#nav button[data-view="settings"]').click();
check('sync: controls present', !!$('#sync-push-btn') && !!$('#set-serverurl'));
check('persona: list rendered', $('#persona-list').children.length === 8, String($('#persona-list').children.length));
$('#persona-new').click();
$('#pf-name').value = 'น้องสโมค';
$('#pf-emoji').value = '🍊';
$('#pf-system').value = 'คุณคือน้องสโมค พูดจาน่ารัก';
$('#pf-greeting').value = 'สวัสดีค่ะ น้องสโมคมาแล้ว';
$('#pf-save').click();
await wait(20);
check('persona: custom created', $('#persona-list').children.length === 9, String($('#persona-list').children.length));
check('persona: selected header updated', $('#persona-name').textContent.includes('น้องสโมค'), $('#persona-name').textContent);
check('persona: appears in dropdown', [...$('#set-persona').options].some((o) => o.textContent.includes('น้องสโมค')));

// MCP: add server → discover tools → tools appear in grid
check('mcp: empty state shown', $('#mcp-status').textContent.includes('ยังไม่มี server'), $('#mcp-status').textContent);
$('#mcp-name').value = 'Demo';
$('#mcp-url').value = 'http://localhost:3100/mcp';
$('#mcp-add').click();
await wait(150);
check('mcp: server listed', $('#mcp-list').textContent.includes('Demo'), $('#mcp-list').textContent.slice(0, 80));
check('mcp: tool count reported', $('#mcp-list').textContent.includes('1 เครื่องมือ'), $('#mcp-list').textContent.slice(0, 120));
check('mcp: dynamic tool in tools grid', [...$('#tools-grid').children].some((b) => b.textContent.includes('send_email')));
check('mcp: permission category listed', $('#perm-list').children.length === 6, String($('#perm-list').children.length));

// voice & streaming settings
$('#nav button[data-view="settings"]').click();
check('voice: thai voice listed', $('#set-voice').options.length >= 2, `${$('#set-voice').options.length} options`);
check('voice: 3 tts providers offered', $('#set-ttsprovider').options.length === 3, `${$('#set-ttsprovider').options.length} options`);
check('voice: openai fields hidden by default', $('#tts-openai-fields').hidden === true);
$('#set-ttsprovider').value = 'openai';
$('#set-ttsprovider').dispatchEvent(new window.Event('change'));
check('voice: openai fields reveal on select', $('#tts-openai-fields').hidden === false);
check('voice: barge-in defaults to keyword', $('#set-bargein').value === 'keyword', $('#set-bargein').value);
$('#set-streaming').checked = false;
$('#set-speakstream').checked = false;
$('#save-settings-btn').click();
await wait(20);
$('#nav button[data-view="chat"]').click();
$('#stop-btn').click();
check('voice: stop button halts speech', $('#subtitle').textContent.includes('หยุดแล้ว'), $('#subtitle').textContent);

// permission gate: risky tool must ask first
submit('เปิดเว็บ example.com ให้หน่อย');
await wait(150);
check('permission: confirm modal shown', $('#confirm-modal').hidden === false, $('#confirm-title').textContent);
$('#confirm-no').click();
await wait(120);
check('permission: denial respected', $('#messages').textContent.includes('ไม่อนุญาต') || $('#messages').textContent.includes('ไม่ได้ทำอะไรต่อ'), $('#messages').textContent.slice(-120));
submit('เปิดเว็บ example.com อีกครั้ง');
await wait(150);
check('permission: asks again next time', $('#confirm-modal').hidden === false);
$('#confirm-always').click();
await wait(150);
check('permission: approved run completed', $('#messages').textContent.includes('เปิดลิงก์') || $('#messages').textContent.includes('example.com'), $('#messages').textContent.slice(-160));

$('#companion-btn').click();
check('companion: overlay toggled', $('#companion').hidden === false);

$('#nav button[data-view="tools"]').click();
$('#tools-grid').children[4].click();
await wait(80);
check('tools view: direct run card', $('#tool-result').children.length > 0);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `  → ${r.extra}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
window.close();
process.exit(failed.length ? 1 : 0);
