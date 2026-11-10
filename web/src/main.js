import './styles.css';
import { StateMachine, STATES } from './core/state.js';
import { PERSONAS, getPersona } from './core/personas.js';
import { MemoryStore } from './core/memory.js';
import { PROVIDERS, ModelFallback, resolveProviderChain, chatWithFallback, chatWithFallbackStream } from './core/ai-providers.js';
import { TOOLS, TOOL_IDS, runTool, toolMeta, restoreReminders } from './core/tools.js';
import { Agent } from './core/agent.js';
import { MODES, MODE_IDS, getMode, toolsForMode } from './core/modes.js';
import { CATEGORIES, AUTONOMY, DEFAULT_PERMISSIONS, normalizePermissions, riskLabel } from './core/permissions.js';
import { consolidate, shouldConsolidate, startDailyConsolidation } from './core/consolidate.js';
import { Voice } from './core/voice.js';
import { SentenceSplitter, SpeechQueue, withCursor } from './core/stream.js';
import { WakeWord } from './core/wake.js';
import { EyeAvatar } from './ui/avatar.js';
import { renderCard, renderError } from './ui/cards.js';
import { loadSettings, saveSettings, resetSettings, hasProviderConfigured, loadPermissions } from './core/settings.js';
import { detectPlatform, platformLabel, isDesktopHost } from './core/platform.js';

/* ------------------------------------------------------------------ boot */
const $ = (sel) => document.querySelector(sel);

let settings = loadSettings();
const memory = new MemoryStore();
const sm = new StateMachine();
const voice = new Voice();
const fallback = new ModelFallback();
const platform = detectPlatform();

let history = [];          // [{role, content}] short-term (last 12 turns)
let busy = false;
let deferredInstall = null;
const sessionAllow = new Set();   // "อนุญาตตลอด session" ต่อเครื่องมือ
let pendingConfirm = null;

settings.permissions = loadPermissions(settings);

sm.set({ hasProvider: hasProviderConfigured(settings) });
sm.onChange((s) => {
  $('#state-label').textContent = s;
  $('#conn-badge').textContent = `● ${s === STATES.ERROR ? 'มีปัญหา' : s === STATES.SETUP ? 'ต้องตั้งค่า' : 'พร้อมใช้'}`;
  $('#conn-badge').style.color = s === STATES.ERROR ? '#f87171' : s === STATES.SETUP ? '#fbbf24' : '#34d399';
  avatar.setEmotion(stateEmotion(s));
  companionAvatar?.setEmotion(stateEmotion(s));
  globalThis.no7?.native?.sendEmotion?.(stateEmotion(s));
  updateMicUi();
});

const avatar = new EyeAvatar($('#avatar'));
avatar.start();
const companionAvatar = isDesktopHost() ? new EyeAvatar($('#companion-avatar')) : null;
if (companionAvatar) companionAvatar.start();

// Reflect the initial derived state (no transition fires on first paint).
$('#state-label').textContent = sm.current;
avatar.setEmotion(stateEmotion(sm.current));
$('#conn-badge').textContent = `● ${sm.current === STATES.SETUP ? 'ต้องตั้งค่า' : 'พร้อมใช้'}`;
$('#conn-badge').style.color = sm.current === STATES.SETUP ? '#fbbf24' : '#34d399';

// Voice events feed the same derived state machine.
voice.onState = (s) => sm.set({ micActive: s === STATES.LISTENING, ttsPlaying: s === STATES.SPEAKING });
voice.onSubtitle = (text) => { if (text) setSubtitle(text); };

$('#platform-badge').textContent = platformLabel(platform);
$('#device-info').textContent = `${platformLabel(platform)} · จอ ${window.innerWidth}×${window.innerHeight} · STT ${voice.sttSupported ? '✅' : '❌'} · TTS ${voice.ttsSupported ? '✅' : '❌'}`;

/* -------------------------------------------------------------- navigation */
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#view-title').textContent = { chat: 'แชทกับ No7', tools: 'เครื่องมือ', memory: 'ความจำ', settings: 'ตั้งค่า' }[name] || name;
  $('#sidebar').classList.remove('open');
  if (name === 'tools') renderToolsGrid();
  if (name === 'memory') {
    memQuery = '';                       // เข้าหน้าความจำ = ดูทั้งหมดก่อน
    const q = $('#mem-query');
    if (q) q.value = '';
    const c = $('#mem-clear-search');
    if (c) c.hidden = true;
    renderMemory();
  }
}
document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

/* ------------------------------------------------------------------ modes */
/** โหมดคือ "เลือกทั้งหมดได้" — auto สลับบทบาทเอง, หรือล็อกโหมดเดียวก็ได้ */
function renderModeChips() {
  const nav = $('#mode-chips');
  nav.innerHTML = '';
  for (const id of MODE_IDS) {
    const m = MODES[id];
    const b = document.createElement('button');
    b.dataset.mode = id;
    b.textContent = `${m.emoji} ${m.label}`;
    b.title = m.desc;
    b.classList.toggle('active', (settings.mode || 'auto') === id);
    b.addEventListener('click', () => selectMode(id));
    nav.appendChild(b);
  }
}

function selectMode(id) {
  settings = saveSettings({ mode: id });
  renderModeChips();
  const m = getMode(id);
  setSubtitle(`${m.emoji} โหมด ${m.label} — ${m.desc}`);
  renderToolsGrid();
  const sel = $('#set-mode');
  if (sel) sel.value = id;
}

/* ------------------------------------------------------------------- chat */
function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  $('#messages').appendChild(el);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return el;
}

function setSubtitle(text) {
  $('#subtitle').textContent = text;
  const bubble = $('#companion-bubble');
  if (bubble) { bubble.textContent = text; bubble.hidden = !text; }
  globalThis.no7?.native?.sendSubtitle?.(text);
}

function voiceOptions() {
  return {
    lang: settings.language === 'en' ? 'en-US' : 'th-TH',
    rate: Number(settings.voiceRate) || 1,
    pitch: Number(settings.voicePitch) || 1,
    voiceName: settings.voiceName || undefined,
  };
}

async function speak(text) {
  if (!settings.tts || !text) return;
  setSubtitle(text);
  $('#stop-btn').hidden = false;
  wakeWord.pause();
  try {
    await voice.speak(text, voiceOptions());
  } finally {
    $('#stop-btn').hidden = true;
    wakeWordResume();
  }
}

/** Add one visible agent step (tool call / denial / error) into the chat. */
function addStep(text, kind = '') {
  const el = document.createElement('div');
  el.className = `step ${kind}`;
  const n = document.createElement('span');
  n.className = 'step-num';
  n.textContent = String($('#messages').querySelectorAll('.step').length + 1);
  el.appendChild(n);
  el.appendChild(document.createTextNode(text));
  $('#messages').appendChild(el);
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

/** Permission gate UI: resolves true only when the user explicitly allows. */
function askConfirm(req) {
  if (sessionAllow.has(req.tool)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const modal = $('#confirm-modal');
    $('#confirm-title').textContent = `${req.emoji || '⚠️'} ให้ No7 ใช้ "${req.label || req.tool}" ไหม?`;
    $('#confirm-desc').textContent = `${CATEGORIES[req.meta?.category]?.label || req.meta?.category} · ${riskLabel(req.meta?.risk ?? 1)}`;
    $('#confirm-args').textContent = JSON.stringify(req.args || {}, null, 2);
    modal.hidden = false;

    const finish = (answer, always) => {
      modal.hidden = true;
      $('#confirm-yes').onclick = $('#confirm-no').onclick = $('#confirm-always').onclick = null;
      if (always) sessionAllow.add(req.tool);
      pendingConfirm = null;
      resolve(answer);
    };
    pendingConfirm = () => finish(false, false);
    $('#confirm-yes').onclick = () => finish(true, false);
    $('#confirm-always').onclick = () => finish(true, true);
    $('#confirm-no').onclick = () => finish(false, false);
  });
}

let activeQueue = null;

/** One chat turn: agent loop + streaming tokens + speak-while-generating. */
async function respond(userText) {
  if (busy) return;
  busy = true;
  sm.set({ error: null, requestInFlight: true });
  memory.logTurn('user', userText);

  const persona = getPersona(settings.persona);
  const chain = resolveProviderChain(settings);
  const botEl = addMessage('bot', '…');
  const cards = [];
  const splitter = new SentenceSplitter();
  const queue = new SpeechQueue(voice);
  activeQueue = queue;

  const streaming = !!settings.streaming;
  let speakLive = streaming && !!settings.tts && !!settings.speakWhileStreaming;
  let streamBuf = '';
  let toolLikely = false;
  let botText = '';

  wakeWord.pause();
  $('#stop-btn').hidden = false;

  const agent = new Agent({
    chat: (messages, { onToken } = {}) => (streaming
      ? chatWithFallbackStream(messages, chain, { fallback, onToken })
      : chatWithFallback(messages, chain, { fallback })),
    memory,
    settings,
    confirm: askConfirm,
    maxSteps: Number(settings.maxSteps) || 4,
    onEvent: (e) => {
      if (e.type === 'thinking') {
        sm.set({ requestInFlight: true, toolRunning: false });
        if (e.step > 1 && !streamBuf) botEl.textContent = 'กำลังคิดต่อ…';
      }
      if (e.type === 'token') {
        streamBuf += e.delta;
        if (streamBuf.includes('```') || /^\s*\{/.test(streamBuf)) toolLikely = true;
        botEl.textContent = withCursor(streamBuf, !toolLikely);
        $('#messages').scrollTop = $('#messages').scrollHeight;
        if (speakLive && !toolLikely) {
          for (const sentence of splitter.push(e.delta)) queue.enqueue(sentence);
        }
      }
      if (e.type === 'tool') {
        // ข้อความที่ไหลมาเป็นเจตนาเรียกเครื่องมือ ไม่ใช่คำตอบ → ล้างและหยุดเสียง
        streamBuf = '';
        toolLikely = false;
        botEl.textContent = '';
        splitter.reset();
        speakLive = false;
        queue.stop();
        sm.set({ requestInFlight: false, toolRunning: true });
        addStep(`เรียก ${e.emoji || '🧰'} ${e.label || e.tool}`);
        setSubtitle(`กำลังใช้ ${e.label || e.tool}…`);
      }
      if (e.type === 'result') {
        addStep(`${e.data?.title || e.tool} — เสร็จแล้ว`, 'ok');
        cards.push(e);
      }
      if (e.type === 'denied') {
        addStep(e.reason === 'user-declined' ? `ไม่อนุญาต ${e.tool}` : `ถูกบล็อก: หมวด ${CATEGORIES[e.category]?.label || e.category}`, 'deny');
      }
      if (e.type === 'error') addStep(`ผิดพลาด: ${e.message}`, 'deny');
    },
  });

  try {
    const result = await agent.run(userText, {
      history: history.slice(-20),
      platform,
      persona,
      modeId: settings.mode,
    });
    botText = result.text || '(ไม่มีคำตอบ)';

    if (speakLive) {
      queue.resume();
      for (const sentence of splitter.flush()) queue.enqueue(sentence);
      setSubtitle(botText);
    } else {
      botEl.textContent = botText;
    }
    for (const c of cards) renderCard(botEl, c.tool, c.data);

    memory.logTurn('assistant', botText);
    history.push({ role: 'user', content: userText }, { role: 'assistant', content: botText });
    if (history.length > 24) history = history.slice(-24);
    learnFrom(userText);

    sm.set({ requestInFlight: false, toolRunning: false });
    if (!speakLive) await speak(botText);
  } catch (err) {
    queue.stop();
    botEl.textContent = `⚠️ ${err.message}`;
    sm.set({ error: err.message, requestInFlight: false, toolRunning: false });
    setSubtitle('มีปัญหาการเชื่อมต่อ ลองตรวจสอบการตั้งค่า');
    setTimeout(() => sm.set({ error: null }), 4000);
  } finally {
    busy = false;
    $('#stop-btn').hidden = true;
    wakeWordResume();
    avatar.setEmotion(stateEmotion(sm.current));
  }
}

/** Lightweight fact extraction — the "on-device consolidation" idea, heuristic version. */
function learnFrom(text) {
  const name = /(?:ฉันชื่อ|ผมชื่อ|หนูชื่อ|เรียกฉันว่า|my name is)\s*([^\s,。.!?]{1,30})/i.exec(text);
  if (name) memory.addFact(`ชื่อผู้ใช้คือ ${name[1]}`, 3);

  const remember = /(?:จำไว้ว่า|จำไว้|remember that)\s*(.{3,200})/i.exec(text);
  if (remember) memory.addFact(remember[1].trim(), 2);

  const like = /(?:ฉันชอบ|ผมชอบ|ชอบ)\s*(.{2,60})/i.exec(text);
  if (like && like[1].length > 2) memory.addFact(`ผู้ใช้ชอบ ${like[1].trim()}`, 1);
}

/* -------------------------------------------------------- composer + mic */
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  addMessage('user', text);
  respond(text);
});

/** ฟังหนึ่งครั้ง → ส่งข้อความ (ใช้ร่วมกันทั้งปุ่มไมค์และ wake word) */
async function triggerListen() {
  if (busy) return;
  if (voice.listening) { voice.stopListening(); return; }
  if (!settings.stt) { alert('เปิด "ใช้ไมค์พูด" ในตั้งค่าก่อน'); return; }
  try {
    wakeWord.pause();
    setSubtitle('กำลังฟัง… 🎤');
    const text = await voice.listenOnce({ lang: settings.language === 'en' ? 'en-US' : 'th-TH' });
    if (text) {
      addMessage('user', text);
      respond(text);
    } else {
      setSubtitle('ไม่ได้ยินเสียง ลองอีกครั้ง');
    }
  } catch (e) {
    setSubtitle(e.message);
  } finally {
    wakeWordResume();
  }
}

$('#mic-btn').addEventListener('click', triggerListen);

/* ------------------------------------------------------------- wake word */
const wakeWord = new WakeWord({
  lang: settings.language === 'en' ? 'en-US' : 'th-TH',
  onWake: () => { setSubtitle('ได้ยินชื่อแล้ว กำลังฟัง…'); triggerListen(); },
  onState: (st) => {
    const badge = $('#wake-badge');
    badge.hidden = st !== 'listening';
    if (st === 'denied') {
      settings = saveSettings({ wake: false });
      $('#set-wake') && ($('#set-wake').checked = false);
      $('#voice-status').textContent = '⚠️ เบราว์เซอร์ไม่อนุญาตไมค์ — ปลุกด้วยชื่อถูกปิด';
    }
  },
});

function wakeWordResume() {
  if (settings.wake && wakeWord.active) wakeWord.resume();
  else if (settings.wake && !wakeWord.active) syncWake();
}

function syncWake() {
  if (!settings.wake) { wakeWord.stop(); return; }
  if (!wakeWord.supported) {
    settings = saveSettings({ wake: false });
    $('#voice-status').textContent = '⚠️ อุปกรณ์นี้ไม่รองรับการฟังเบื้องหลัง';
    return;
  }
  try { wakeWord.start(); } catch (e) { $('#voice-status').textContent = e.message; }
}

/* ---------------------------------------------------------- stop speaking */
function stopSpeaking() {
  activeQueue?.stop();
  activeQueue = null;
  voice.stopSpeaking();
  $('#stop-btn').hidden = true;
  setSubtitle('หยุดแล้ว');
}
$('#stop-btn').addEventListener('click', stopSpeaking);

function updateMicUi() {
  $('#mic-btn').classList.toggle('listening', sm.current === STATES.LISTENING);
}

function stateEmotion(s) {
  return {
    [STATES.IDLE]: 'happy',
    [STATES.LISTENING]: 'listening',
    [STATES.THINKING]: 'thinking',
    [STATES.CONNECTING]: 'thinking',
    [STATES.SPEAKING]: 'speaking',
    [STATES.ERROR]: 'error',
    [STATES.SLEEP]: 'sleepy',
    [STATES.SETUP]: 'confused',
  }[s] || 'neutral';
}

/* ------------------------------------------------------------------ tools */
function renderToolsGrid() {
  const grid = $('#tools-grid');
  const mode = getMode(settings.mode);
  const modeId = settings.mode || 'auto';
  if (grid.dataset.ready === modeId) return;
  grid.innerHTML = '';
  grid.dataset.ready = modeId;

  const ids = toolsForMode(modeId);
  for (const id of ids) {
    const t = TOOLS[id];
    const meta = toolMeta(id);
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = `<strong>${t.emoji} ${t.label}</strong><small>${t.desc}</small>`
      + `<small style="display:block;opacity:.7;margin-top:4px">${CATEGORIES[meta.category]?.label || meta.category} · ${riskLabel(meta.risk)}</small>`;
    btn.addEventListener('click', async () => {
      const out = $('#tool-result');
      out.innerHTML = '';
      try {
        if (meta.risk >= 1 && settings.permissions?.autonomy !== 'allow-all') {
          const ok = await askConfirm({ tool: id, label: t.label, emoji: t.emoji, args: {}, meta });
          if (!ok) { out.textContent = 'ยกเลิกแล้ว'; return; }
        }
        const res = await runTool(id, {}, { memory });
        renderCard(out, res.tool, res.data);
      } catch (e) {
        renderError(out, e.message);
      }
    });
    grid.appendChild(btn);
  }

  const note = $('#tools-note');
  if (note) {
    note.textContent = `${mode.emoji} โหมด ${mode.label}: แสดง ${ids.length}/${TOOL_IDS.length} เครื่องมือ`
      + (modeId === 'auto' ? ' — สลับโหมดเพื่อดูชุดอื่น' : '');
  }
}

/* ----------------------------------------------------------------- memory */
let memFilter = 'all';
let memQuery = '';

const MEM_FILTERS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'pinned', label: '📌 ปักหมุด' },
  { id: 'frequent', label: '🔥 ใช้บ่อย' },
  { id: 'new', label: '🆕 ใหม่' },
];

function llmChat(messages) {
  return chatWithFallback(messages, resolveProviderChain(settings), { fallback });
}

function renderMemStats() {
  const st = memory.stats();
  const last = st.lastConsolidated
    ? new Date(st.lastConsolidated).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
    : 'ยังไม่เคย';
  $('#mem-stats').innerHTML = [
    [st.facts, 'ข้อเท็จจริง'], [st.pinned, 'ปักหมุด'], [st.logTurns, 'บทสนทนา'],
    [st.addedThisWeek, 'ใหม่สัปดาห์นี้'], [st.avgImportance, 'importance เฉลี่ย'],
  ].map(([v, k]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('')
    + `<div class="stat"><b style="font-size:12px">${last}</b><small>สรุปครั้งล่าสุด</small></div>`;
}

function renderMemFilters() {
  const box = $('#mem-filters');
  box.innerHTML = '';
  for (const f of MEM_FILTERS) {
    const b = document.createElement('button');
    b.textContent = f.label;
    b.classList.toggle('active', memFilter === f.id);
    b.addEventListener('click', () => { memFilter = f.id; renderMemory(); });
    box.appendChild(b);
  }
}

function renderMemory() {
  renderMemStats();
  renderMemFilters();

  const opts = { sort: memFilter === 'frequent' ? 'used' : 'recent', pinnedOnly: memFilter === 'pinned' };
  let list = memQuery ? memory.search(memQuery, 50) : memory.listFacts(opts);
  if (memFilter === 'new') list = [...list].sort((a, b) => b.created - a.created).slice(0, 20);

  const box = $('#mem-results');
  box.innerHTML = list.length ? '' : '<p class="hint">ยังไม่มีความจำ — ลองพิมพ์ "จำไว้ว่า ฉันชอบกาแฟดำ" หรือกดปุ่มสรุปความจำ</p>';

  for (const f of list) {
    const row = document.createElement('div');
    row.className = 'fact';

    const text = document.createElement('span');
    text.className = 'fact-text';
    text.textContent = f.text;
    text.title = 'คลิกเพื่อแก้ไข';
    text.addEventListener('click', () => startEdit(row, f));

    const meta = document.createElement('span');
    meta.className = 'fact-meta';
    if (f.pinned) meta.innerHTML += '<span class="pill hot">📌</span>';
    if ((f.used || 0) > 0) meta.innerHTML += `<span class="pill">ใช้ ${f.used}×</span>`;
    meta.innerHTML += `<span class="pill">★${f.importance}</span>`;

    const pin = document.createElement('button');
    pin.textContent = f.pinned ? '📌' : '📍';
    pin.title = f.pinned ? 'เอาปักหมุดออก' : 'ปักหมุด';
    pin.addEventListener('click', () => { memory.togglePin(f.id); renderMemory(); });

    const del = document.createElement('button');
    del.textContent = 'ลบ';
    del.addEventListener('click', () => { memory.removeFact(f.id); renderMemory(); });

    row.append(text, meta, pin, del);
    box.appendChild(row);
  }
}

function startEdit(row, fact) {
  row.innerHTML = '';
  const input = document.createElement('input');
  input.className = 'edit';
  input.value = fact.text;
  const save = document.createElement('button');
  save.textContent = 'บันทึก';
  const cancel = document.createElement('button');
  cancel.textContent = 'ยกเลิก';
  const commit = () => {
    if (input.value.trim()) memory.updateFact(fact.id, { text: input.value.trim() });
    renderMemory();
  };
  save.addEventListener('click', commit);
  cancel.addEventListener('click', renderMemory);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderMemory(); });
  row.append(input, save, cancel);
  input.focus();
}

$('#mem-search-btn').addEventListener('click', () => {
  memQuery = $('#mem-query').value.trim();
  $('#mem-clear-search').hidden = !memQuery;
  renderMemory();
});
$('#mem-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#mem-search-btn').click(); });
$('#mem-clear-search').addEventListener('click', () => {
  memQuery = ''; $('#mem-query').value = ''; $('#mem-clear-search').hidden = true; renderMemory();
});

$('#mem-add-btn').addEventListener('click', () => {
  const v = $('#mem-new').value.trim();
  if (!v) return;
  memory.addFact(v, { importance: 3, source: 'user' });
  $('#mem-new').value = '';
  $('#mem-status').textContent = 'จำไว้แล้ว ✅';
  renderMemory();
});

$('#mem-consolidate-btn').addEventListener('click', async () => {
  const useLLM = $('#mem-llm-toggle').checked;
  $('#mem-status').textContent = useLLM ? 'กำลังสรุปด้วย AI…' : 'กำลังสรุป…';
  try {
    const res = await consolidate(memory, { chat: llmChat, useLLM, force: true });
    $('#mem-status').textContent = `สรุปเสร็จ: เพิ่ม ${res.extracted} · รวมซ้ำ ${res.mergeCandidates} · ลดความสำคัญ ${res.decayed}`
      + (useLLM ? (res.usedLLM ? ' · ใช้ AI ✅' : ' · AI ไม่ได้ใช้ (ไม่มีสมองหรือผลว่าง)') : '');
    renderMemory();
  } catch (e) {
    $('#mem-status').textContent = `สรุปไม่สำเร็จ: ${e.message}`;
  }
});

$('#mem-export-btn').addEventListener('click', () => {
  downloadJson(memory.exportData(), `no7-memory-${Date.now()}.json`);
  $('#mem-status').textContent = 'ส่งออกแล้ว';
});

$('#mem-import-btn').addEventListener('click', () => $('#mem-import-file').click());
$('#mem-import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const res = memory.importData(payload, { merge: true });
    $('#mem-status').textContent = `นำเข้าแล้ว: เพิ่ม ${res.added} · รวม ${res.merged} · ข้าม ${res.skipped}`;
    renderMemory();
  } catch (err) {
    $('#mem-status').textContent = `ไฟล์ไม่ถูกต้อง: ${err.message}`;
  }
  e.target.value = '';
});

$('#mem-llm-toggle').checked = !!settings.memoryLLM;
$('#mem-llm-toggle').addEventListener('change', (e) => {
  settings = saveSettings({ memoryLLM: e.target.checked });
});

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* --------------------------------------------------------------- settings */
let permDraft = null;

function renderPermList() {
  permDraft = normalizePermissions(settings.permissions);
  const box = $('#perm-list');
  box.innerHTML = '';
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    const row = document.createElement('label');
    row.className = 'perm-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = permDraft.allow[id] !== false;
    cb.addEventListener('change', () => { permDraft.allow[id] = cb.checked; });
    const text = document.createElement('div');
    text.innerHTML = `<strong>${cat.emoji} ${cat.label}</strong><small>${cat.desc} · ความเสี่ยง: ${riskLabel(cat.risk)}</small>`;
    row.appendChild(cb);
    row.appendChild(text);
    box.appendChild(row);
  }
}

function renderSettingsForm() {
  const personaSel = $('#set-persona');
  personaSel.innerHTML = '';
  for (const p of PERSONAS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.name} — ${p.desc}`;
    personaSel.appendChild(o);
  }
  personaSel.value = settings.persona;

  const modeSel = $('#set-mode');
  modeSel.innerHTML = MODE_IDS.map((id) => `<option value="${id}">${MODES[id].emoji} ${MODES[id].label} — ${MODES[id].desc}</option>`).join('');
  modeSel.value = settings.mode || 'auto';

  const autoSel = $('#set-autonomy');
  autoSel.innerHTML = Object.entries(AUTONOMY).map(([id, a]) => `<option value="${id}">${a.label} — ${a.desc}</option>`).join('');
  autoSel.value = normalizePermissions(settings.permissions).autonomy;

  $('#set-maxsteps').value = settings.maxSteps || 4;
  $('#set-costmode').value = settings.costMode || 'mixed';
  renderPermList();

  $('#set-streaming').checked = settings.streaming !== false;
  $('#set-speakstream').checked = settings.speakWhileStreaming !== false;
  $('#set-wake').checked = !!settings.wake;
  $('#set-rate').value = settings.voiceRate || 1;
  $('#set-pitch').value = settings.voicePitch || 1;
  $('#out-rate').textContent = Number(settings.voiceRate || 1).toFixed(2);
  $('#out-pitch').textContent = Number(settings.voicePitch || 1).toFixed(2);
  renderVoiceOptions();
  $('#set-language').value = settings.language;
  $('#set-polite').checked = settings.polite;
  $('#set-tts').checked = settings.tts;
  $('#set-stt').checked = settings.stt;
  $('#set-provider').value = settings.provider;
  $('#set-model').value = settings.model;
  $('#set-apikey').value = settings.apiKey;
  $('#set-baseurl').value = settings.baseUrl;
  updatePersonaHeader();
}

function updatePersonaHeader() {
  const p = getPersona(settings.persona);
  $('#persona-name').textContent = p.name;
  $('#persona-desc').textContent = p.desc;
}

function renderVoiceOptions() {
  const sel = $('#set-voice');
  if (!sel) return;
  const voices = voice.ttsSupported ? window.speechSynthesis.getVoices() : [];
  const thai = voices.filter((v) => /^th/i.test(v.lang));
  const list = thai.length ? thai : voices.slice(0, 20);
  sel.innerHTML = '<option value="">อัตโนมัติ (เสียงไทยของเครื่อง)</option>'
    + list.map((v) => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
  sel.value = settings.voiceName || '';
}

function collectSettings() {
  return {
    persona: $('#set-persona').value,
    language: $('#set-language').value,
    polite: $('#set-polite').checked,
    tts: $('#set-tts').checked,
    stt: $('#set-stt').checked,
    provider: $('#set-provider').value,
    model: $('#set-model').value || PROVIDERS[$('#set-provider').value]?.defaultModel || '',
    apiKey: $('#set-apikey').value.trim(),
    baseUrl: $('#set-baseurl').value.trim(),
    mode: $('#set-mode').value,
    maxSteps: Math.min(8, Math.max(1, Number($('#set-maxsteps').value) || 4)),
    costMode: $('#set-costmode').value,
    permissions: {
      autonomy: $('#set-autonomy').value,
      allow: { ...(permDraft?.allow || DEFAULT_PERMISSIONS.allow) },
    },
    streaming: $('#set-streaming').checked,
    speakWhileStreaming: $('#set-speakstream').checked,
    wake: $('#set-wake').checked,
    voiceRate: Number($('#set-rate').value) || 1,
    voicePitch: Number($('#set-pitch').value) || 1,
    voiceName: $('#set-voice').value,
  };
}

$('#save-settings-btn').addEventListener('click', () => {
  settings = saveSettings(collectSettings());
  sm.set({ hasProvider: hasProviderConfigured(settings), error: null });
  updatePersonaHeader();
  renderModeChips();
  renderToolsGrid();
  syncWake();
  $('#settings-status').textContent = '✅ บันทึกแล้ว (เก็บในเครื่องนี้เท่านั้น)';
});

$('#test-ai-btn').addEventListener('click', async () => {
  const draft = { ...settings, ...collectSettings() };
  $('#settings-status').textContent = 'กำลังทดสอบ…';
  try {
    const chain = resolveProviderChain(draft);
    const reply = await chatWithFallback(
      [
        { role: 'system', content: 'ตอบสั้นๆ' },
        { role: 'user', content: 'พิมพ์คำว่า OK เท่านั้น' },
      ],
      chain,
      { fallback },
    );
    $('#settings-status').textContent = `✅ เชื่อมต่อได้ (${chain.map((c) => c.provider).join(' → ')}): "${String(reply).slice(0, 60)}"`;
  } catch (e) {
    $('#settings-status').textContent = `❌ ${e.message}`;
  }
});

$('#set-rate').addEventListener('input', (e) => { $('#out-rate').textContent = Number(e.target.value).toFixed(2); });
$('#set-pitch').addEventListener('input', (e) => { $('#out-pitch').textContent = Number(e.target.value).toFixed(2); });
$('#test-voice-btn').addEventListener('click', async () => {
  $('#voice-status').textContent = 'กำลังพูดทดสอบ…';
  await voice.speak('สวัสดีครับ ผมคือ No7 ผู้ช่วยส่วนตัวของคุณ', {
    ...voiceOptions(),
    rate: Number($('#set-rate').value) || 1,
    pitch: Number($('#set-pitch').value) || 1,
    voiceName: $('#set-voice').value || undefined,
  });
  $('#voice-status').textContent = 'พูดจบแล้ว';
});
$('#stop-voice-btn').addEventListener('click', stopSpeaking);

if (voice.ttsSupported) {
  window.speechSynthesis.onvoiceschanged = renderVoiceOptions;
}

$('#set-provider').addEventListener('change', () => {
  const p = PROVIDERS[$('#set-provider').value];
  if (p) {
    $('#set-model').value = p.defaultModel;
    $('#set-baseurl').value = p.defaultBaseUrl || '';
  }
});

$('#export-btn').addEventListener('click', () => {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: { ...settings, apiKey: '' },
    facts: memory.listFacts(),
    log: memory.recentLog(500),
    todos: JSON.parse(localStorage.getItem('no7.todos.v1') || '[]'),
    notes: JSON.parse(localStorage.getItem('no7.notes.v1') || '[]'),
  };
  downloadJson(data, `no7-backup-${Date.now()}.json`);
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้? (ความจำ, ตั้งค่า, โน้ต)')) return;
  memory.clearAll();
  settings = resetSettings();
  ['no7.todos.v1', 'no7.notes.v1'].forEach((k) => localStorage.removeItem(k));
  renderSettingsForm();
  renderMemory();
  sm.set({ hasProvider: hasProviderConfigured(settings) });
  $('#settings-status').textContent = 'ล้างข้อมูลแล้ว';
});

/* ---------------------------------------------------------------- PWA */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});
$('#install-btn').addEventListener('click', async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall = null;
  } else {
    alert('ถ้าเปิดในเบราว์เซอร์อยู่: ใช้เมนู "เพิ่มไปยังหน้าจอโฮม" หรือติดตั้งผ่าน Android/iOS build (ดู docs/BUILD.md)');
  }
});

/* ------------------------------------------------------- companion mode */
$('#companion-btn').addEventListener('click', () => {
  const c = $('#companion');
  c.hidden = !c.hidden;
  if (!c.hidden) makeDraggable(c);
});

function makeDraggable(el) {
  let dx = 0, dy = 0, dragging = false;
  const onDown = (e) => {
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    const r = el.getBoundingClientRect();
    dx = p.clientX - r.left; dy = p.clientY - r.top;
  };
  const onMove = (e) => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    el.style.left = `${p.clientX - dx}px`;
    el.style.top = `${p.clientY - dy}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    e.preventDefault();
  };
  const onUp = () => { dragging = false; };
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

/* ------------------------------------------------------- phone-link pairing */
$('#pair-btn').addEventListener('click', async () => {
  const out = $('#pair-output');
  out.textContent = 'กำลังสร้าง…';
  if (!globalThis.crypto?.subtle) {
    out.textContent = '⚠️ ต้องเปิดผ่าน https:// หรือ localhost (เบราว์เซอร์ปิด crypto.subtle บน http://)<\n'
      + 'ทางเลือก: รัน npm run server แล้วใช้ POST /api/pair เพื่อจับคู่';
    return;
  }
  try {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`pair:${code}`));
    const hex = [...new Uint8Array(sig)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('no7.pairing.v1', JSON.stringify({ code, secret: [...secret], createdAt: Date.now() }));
    out.textContent = `รหัสจับคู่: ${code}\nHMAC proof: ${hex}\n(บันทึกในเครื่องแล้ว — ใช้กับ ESP32 / Phone-Link ดู docs/PHONE_LINK.md)`;
  } catch (e) {
    out.textContent = `สร้างไม่สำเร็จ: ${e.message}`;
  }
});

/* ------------------------------------------------------------ timers */
window.addEventListener('no7:timer', (e) => {
  const label = e.detail?.label || 'Timer';
  addMessage('system', `⏱️ ${label}: ครบเวลาแล้ว!`);
  setSubtitle(`⏱️ ${label} ครบเวลาแล้ว`);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('No7 AI', { body: `${label} ครบเวลาแล้ว` });
  }
  voice.speak(`${label} ครบเวลาแล้ว`, { lang: 'th-TH' });
});

// Desktop global hotkey (Ctrl/Cmd+Shift+Space) → same path as the mic button.
globalThis.no7?.native?.onPushToTalk?.(() => $('#mic-btn').click());

if ('Notification' in window && Notification.permission === 'default') {
  setTimeout(() => Notification.requestPermission().catch(() => {}), 5000);
}

/* -------------------------------------------------------------- startup */
startDailyConsolidation(memory, () => consolidate(memory, { chat: llmChat, useLLM: !!settings.memoryLLM }));

renderSettingsForm();
renderModeChips();
renderToolsGrid();
restoreReminders();
addMessage('bot', 'สวัสดีครับ ผม No7 👋\nพิมพ์คุยได้เลย หรือกด 🎤 เพื่อพูด\n\nลองถาม: "อากาศกรุงเทพวันนี้", "ราคาบิทคอยน์", "ตั้งเวลา 5 นาที"');
setSubtitle('สวัสดีครับ ผม No7 พร้อมช่วยแล้ว');
syncWake();
if (!hasProviderConfigured(settings)) {
  setSubtitle('เริ่มต้น: ไปที่ ⚙️ ตั้งค่า เพื่อเลือกสมอง AI');
}
sm.recompute();

if (shouldConsolidate(memory)) {
  setTimeout(() => consolidate(memory, { chat: llmChat, useLLM: !!settings.memoryLLM }).catch(() => {}), 4000);
}

// re-check derived state periodically (sleep/idle)
setInterval(() => sm.recompute(), 15000);

// expose app internals for debugging (kept off globalThis.no7, which is the
// frozen native bridge injected by Electron's preload).
globalThis.__no7app = { settings, memory, sm, voice, respond, addMessage };
