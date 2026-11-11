import './styles.css';
import { StateMachine, STATES } from './core/state.js';
import { allPersonas, customPersonas, getPersona, createPersona, updatePersona, deletePersona, duplicatePersona, personaVoice } from './core/persona-store.js';
import { getCalendar, formatWhen } from './core/calendar.js';
import { collectBundle, pushBundle, pullBundle, mergeBundle } from './core/sync.js';
import {
  getDeviceRegistry, sendCommand, deviceStatus, testConnection, QUICK_COMMANDS,
  helloDevice, sendEyes, getEyes, voiceStatus, linkCapabilities,
} from './core/link.js';
import { detectCapabilities, summarizeCapabilities, requestMicrophone, requestNotifications } from './core/capabilities.js';
import { usageBreakdown, formatBytes, estimateQuota, isPersisted, requestPersistentStorage, clearGroup } from './core/storage.js';
import { MemoryStore } from './core/memory.js';
import { PROVIDERS, ModelFallback, resolveProviderChain, chatWithFallback, chatWithFallbackStream } from './core/ai-providers.js';
import { getTool, TOOL_IDS, allToolIds, runTool, toolMeta, restoreReminders, registerDynamicTools } from './core/tools.js';
import { McpRegistry } from './core/mcp.js';
import {
  createPkcePair, randomState, buildAuthorizeUrl, parseCallback,
  requestDeviceCode, pollDeviceToken, registerClient, oauthMethodFor,
} from './core/oauth.js';
import { ControlAudit, normalizeControlPolicy, CONTROL_ACTION_META } from './core/control.js';
import {
  TaskStore, TaskScheduler, PRIORITIES, parseDue, formatTaskTime, isOverdue, describeRecurrence,
} from './core/tasks.js';
import {
  RecipeStore, listWindows, focusWindow, matchWindows, parseRecipeText, stringifyRecipeSteps,
  planRecipe, runRecipe, MAX_RECIPE_STEPS,
} from './core/desktop.js';
import { withRetry, classifyError, OfflineQueue } from './core/retry.js';
import { Metrics, formatMs, METRIC_KINDS } from './core/metrics.js';
import { buildDiagnosticsReport, diagnosticsFilename, redact } from './core/diagnostics.js';
import { Agent } from './core/agent.js';
import { MODES, MODE_IDS, getMode, toolsForMode } from './core/modes.js';
import { CATEGORIES, AUTONOMY, DEFAULT_PERMISSIONS, normalizePermissions, riskLabel } from './core/permissions.js';
import { consolidate, shouldConsolidate, startDailyConsolidation } from './core/consolidate.js';
import { Voice } from './core/voice.js';
import { SentenceSplitter, SpeechQueue, withCursor } from './core/stream.js';
import { WakeWord } from './core/wake.js';
import { BargeIn, BARGE_MODES } from './core/bargein.js';
import { TTSRouter, TTS_PROVIDERS, resolveTTSConfig, voicesFor } from './core/tts.js';
import { EyeAvatar } from './ui/avatar.js';
import { renderCard, renderError } from './ui/cards.js';
import { loadSettings, saveSettings, resetSettings, hasProviderConfigured, loadPermissions } from './core/settings.js';
import { detectPlatform, platformLabel, isDesktopHost } from './core/platform.js';
import { applyI18n, langOf, viewTitle, t as tr } from './core/i18n.js';
import { AgentTimeline, statusIcon } from './core/timeline.js';
import { buildDigest, digestTool, shouldAutoDigest } from './core/digest.js';
import {
  customToolDefs, validateCustomTools, PLUGIN_EXAMPLE, PLUGIN_LIMITS,
} from './core/custom-tools.js';
import {
  LOCAL_PRESETS, probeLocal, warmModel, pickBestModel, normalizeOfflineBrain,
  offlineChainSettings, describeLocalBrain, LocalModelCache,
} from './core/local-models.js';

/** escape ค่าที่มาจากภายนอกก่อนใส่ innerHTML */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ------------------------------------------------------------------- MCP */
const mcp = new McpRegistry({
  settings: () => settings,
  serverUrl: () => settings.serverUrl || 'http://localhost:8787',
});

/** เครื่องมือ dynamic ทั้งหมด: MCP + ปลั๊กอิน HTTP + digest (ลงทะเบียนที่เดียว) */
let pluginToolDefs = {};
let digestToolDef = null;

function refreshDynamicTools() {
  const defs = { ...mcp.toolDefs(), ...pluginToolDefs, digest: digestToolDef };
  registerDynamicTools(defs);
  return Object.keys(defs).length;
}

function applyMcpTools() {
  return refreshDynamicTools();
}

function renderMcp() {
  const list = $('#mcp-list');
  if (!list) return;
  const cfg = Array.isArray(settings.mcpServers) ? settings.mcpServers : [];
  const status = mcp.status();
  if (!cfg.length) {
    list.innerHTML = '<p class="hint">ยังไม่มี MCP server — เพิ่มด้านล่างได้เลย</p>';
    $('#mcp-status').textContent = 'ยังไม่มี server';
    return;
  }
  list.innerHTML = cfg.map((s) => {
    const row = status.servers.find((r) => r.id === (s.id || s.name || s.url));
    const on = s.enabled !== false;
    return `<div class="mcp-row" data-id="${esc(s.id || s.name || s.url)}">
      <div class="mcp-main">
        <strong>${esc(s.name || s.id || 'MCP')}</strong>
        <span class="hint">${esc(s.url)}</span>
        <span class="hint">${esc(s.transport || 'proxy')} · ${row ? `${row.tools} เครื่องมือ${row.error ? ` · ⚠️ ${esc(row.error)}` : ''}` : 'ยังไม่ได้เชื่อม'}</span>
      </div>
      <div class="row">
        ${s.oauth ? '<button data-mcp-oauth>🔑 ล็อกอิน</button>' : ''}
        ${s.oauth?.deviceAuthorizationUrl ? '<button data-mcp-device>🔢 ล็อกอินด้วยรหัส</button>' : ''}
        ${s.oauth?.registrationUrl ? '<button data-mcp-register>🆕 ขอ client id</button>' : ''}
        <label class="switch"><input type="checkbox" data-mcp-toggle ${on ? 'checked' : ''} /> เปิด</label>
        <button data-mcp-remove>ลบ</button>
      </div>
    </div>`;
  }).join('');
  const total = status.totalTools;
  $('#mcp-status').textContent = total
    ? `เชื่อมต่อแล้ว ${status.servers.filter((r) => !r.error).length}/${status.servers.length} server · ${total} เครื่องมือ`
    : 'ยังไม่ได้ค้นหาเครื่องมือ — กด "ค้นหาเครื่องมือ"';
}

async function refreshMcp({ quiet = false } = {}) {
  if (!Array.isArray(settings.mcpServers) || !settings.mcpServers.length) {
    renderMcp();
    return [];
  }
  if (!quiet) $('#mcp-status').textContent = 'กำลังเชื่อมต่อ MCP…';
  const results = await mcp.refresh();
  const count = applyMcpTools();
  renderMcp();
  renderToolsGrid(true);
  if (!quiet) {
    const bad = results.filter((r) => !r.ok);
    $('#mcp-status').textContent = bad.length
      ? `เชื่อมได้ ${results.length - bad.length}/${results.length} server · ${bad.map((b) => `${b.name}: ${b.error}`).join(' · ')}`
      : `เชื่อมต่อแล้ว ${results.length} server · ${count} เครื่องมือ`;
  }
  return results;
}

function saveMcpServers(next) {
  settings = saveSettings({ mcpServers: next });
  renderMcp();
}

/* ------------------------------------------------------- metrics / outbox */
const metrics = new Metrics();
const outbox = new OfflineQueue();
const recentErrors = [];

function noteError(err, where) {
  recentErrors.push({ at: Date.now(), where, message: redact(err?.message || String(err)).slice(0, 300) });
  if (recentErrors.length > 10) recentErrors.shift();
}

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
let currentView = 'chat';

function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#view-title').textContent = viewTitle(name, settings.uiLang);
  $('#sidebar').classList.remove('open');
  if (name === 'tools') renderToolsGrid();
  if (name === 'calendar') renderCalendar();
  if (name === 'devices') renderDevices();
  if (name === 'desktop') renderDesktop();
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
  const personaStyle = personaVoice(getPersona(settings.persona));
  return {
    lang: settings.language === 'en' ? 'en-US' : 'th-TH',
    rate: Number(settings.voiceRate) || personaStyle.rate || 1,
    pitch: Number(settings.voicePitch) || personaStyle.pitch || 1,
    voiceName: settings.voiceName || personaStyle.voiceName,
  };
}

async function speak(text) {
  if (!settings.tts || !text) return;
  setSubtitle(text);
  $('#stop-btn').hidden = false;
  wakeWord.pause();
  bargeIn.mode = settings.bargeIn || 'keyword';
  bargeIn.setSpoken(text);
  bargeIn.start();
  const ttsStart = performance.now();
  try {
    await tts.speak(text, voiceOptions());
    metrics.record({ kind: 'tts', label: settings.ttsProvider || 'system', totalMs: performance.now() - ttsStart });
  } catch (err) {
    metrics.record({ kind: 'tts', label: settings.ttsProvider || 'system', totalMs: performance.now() - ttsStart, ok: false });
    noteError(err, 'tts');
  } finally {
    bargeIn.stop();
    $('#stop-btn').hidden = true;
    wakeWordResume();
  }
}

/** Add one visible agent step (tool call / denial / error) into the chat. */
/** แผง timeline ระหว่างทำงาน — แสดงทุกขั้นพร้อมสถานะ */
function renderTimeline(timeline) {
  const box = $('#run-timeline');
  if (!box) return;
  if (!timeline || !timeline.steps.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const headIcon = timeline.cancelled ? statusIcon('cancelled') : timeline.active ? statusIcon('running') : statusIcon('ok');
  box.hidden = false;
  box.innerHTML = `<div class="tl-head">${headIcon} <span>${esc(timeline.headline())}</span></div>`
    + timeline.toRows().map((r) => `<div class="tl-row ${esc(r.status)}">`
      + `<span class="tl-icon">${r.icon}</span>`
      + `<span class="tl-label">${esc(r.label)}${r.title ? ` — <em>${esc(r.title)}</em>` : ''}</span>`
      + (r.ms ? `<span class="tl-ms">${Math.round(r.ms)} ms</span>` : '')
      + '</div>').join('');
}

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
    const previousFocus = document.activeElement;
    // ค่าเริ่มต้นที่ปลอดภัย: โฟกัส "ไม่อนุญาต"
    setTimeout(() => $('#confirm-no')?.focus(), 0);

    const finish = (answer, always) => {
      modal.hidden = true;
      previousFocus?.focus?.();
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
  const chain = resolveProviderChain(offlineChainSettings(settings));
  const botEl = addMessage('bot', '…');
  const cards = [];
  const splitter = new SentenceSplitter();
  const queue = new SpeechQueue(speechVoice, {
    onSentence: (sentence) => { bargeIn.setSpoken(sentence); },
  });
  activeQueue = queue;

  const streaming = !!settings.streaming;
  let speakLive = streaming && !!settings.tts && !!settings.speakWhileStreaming;
  let streamBuf = '';
  let toolLikely = false;
  let botText = '';
  const chatStart = performance.now();
  let firstTokenAt = 0;
  let chatOk = true;
  let retriedOnce = false;

  wakeWord.pause();
  bargeIn.mode = settings.bargeIn || 'keyword';
  if (speakLive) bargeIn.start();
  $('#stop-btn').hidden = false;

  const timeline = new AgentTimeline({
    maxSteps: Number(settings.maxSteps) || 4,
    lang: langOf(settings.uiLang),
  });
  timeline.start();
  currentTimeline = timeline;
  renderTimeline(timeline);

  const agent = new Agent({
    chat: (messages, { onToken } = {}) => {
      let emitted = false;
      const tap = onToken ? (delta) => { emitted = true; onToken(delta); } : undefined;
      // ลองใหม่เฉพาะเมื่อยังไม่มี token ไหลออกมา (กันข้อความซ้ำ)
      return withRetry(
        () => (streaming
          ? chatWithFallbackStream(messages, chain, { fallback, onToken: tap })
          : chatWithFallback(messages, chain, { fallback })),
        {
          retries: 1,
          baseMs: 400,
          isRetryable: (err) => !emitted && classifyError(err).retryable,
          onRetry: ({ delay, kind }) => {
            retriedOnce = true;
            setSubtitle(`เชื่อมต่อสะดุด (${kind}) — กำลังลองใหม่ใน ${Math.round(delay / 100) / 10}s`);
          },
        },
      );
    },
    memory,
    settings,
    confirm: askConfirm,
    maxSteps: Number(settings.maxSteps) || 4,
    onToolTiming: ({ tool, ms, ok }) => metrics.record({ kind: 'tool', label: tool, totalMs: ms, ok }),
    onEvent: (e) => {
      timeline.push(e);
      renderTimeline(timeline);
      if (e.type === 'thinking') {
        sm.set({ requestInFlight: true, toolRunning: false });
        if (e.step > 1 && !streamBuf) botEl.textContent = 'กำลังคิดต่อ…';
      }
      if (e.type === 'token') {
        if (!firstTokenAt) firstTokenAt = performance.now();
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

  currentAgent = agent;

  try {
    const result = await agent.run(userText, {
      history: history.slice(-20),
      platform,
      persona,
      modeId: settings.mode,
    });
    botText = result.text || '(ไม่มีคำตอบ)';
    timeline.finish();
    renderTimeline(timeline);

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
    chatOk = false;
    timeline.finish();
    renderTimeline(timeline);
    noteError(err, retriedOnce ? 'chat(retry)' : 'chat');
    queue.stop();
    botEl.textContent = `⚠️ ${err.message}`;
    sm.set({ error: err.message, requestInFlight: false, toolRunning: false });
    setSubtitle('มีปัญหาการเชื่อมต่อ ลองตรวจสอบการตั้งค่า');
    setTimeout(() => sm.set({ error: null }), 4000);
  } finally {
    busy = false;
    currentAgent = null;
    bargeIn.stop();
    $('#stop-btn').hidden = true;
    wakeWordResume();
    avatar.setEmotion(stateEmotion(sm.current));
    metrics.record({
      kind: 'chat',
      label: settings.provider || 'auto',
      firstTokenMs: firstTokenAt ? firstTokenAt - chatStart : null,
      totalMs: performance.now() - chatStart,
      ok: chatOk,
      error: chatOk ? null : 'chat failed',
    });
    renderMetrics();
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

  if (!navigator.onLine) {
    outbox.enqueue(text);
    addMessage('bot', `📥 ออฟไลน์อยู่ — เก็บข้อความไว้ในคิวแล้ว (${outbox.size()} รายการ) จะส่งให้ทันทีที่กลับมาออนไลน์`);
    setSubtitle('ออฟไลน์ — เก็บข้อความไว้ในคิว');
    updateOutboxBadge();
    return;
  }
  respond(text);
});

/** ส่งข้อความที่ค้างในคิวเมื่อกลับมาออนไลน์ */
async function flushOutbox() {
  if (!outbox.size() || !navigator.onLine) { updateOutboxBadge(); return; }
  const { sent, left } = await outbox.drain(async (item) => {
    if (busy) throw new Error('busy');
    await respond(item.text);
  });
  if (sent) addMessage('bot', `📤 ส่งข้อความที่ค้างไว้ให้แล้ว ${sent} รายการ${left ? ` (เหลือ ${left})` : ''}`);
  updateOutboxBadge();
}

function updateOutboxBadge() {
  const n = outbox.size();
  const el = $('#outbox-badge');
  if (!el) return;
  el.hidden = n === 0;
  el.textContent = `📥 ค้างส่ง ${n}`;
}

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

/** เติมรายชื่อเสียงแนะนำ (datalist) ตามผู้ให้บริการ TTS ที่เลือก */
function renderTTSVoiceOptions(provider, current = '') {
  const list = voicesFor(provider);
  const el = $('#set-ttsvoice');
  if (!el) return;
  if (!list.length) { el.removeAttribute('list'); return; }
  let dl = document.getElementById('tts-voice-list');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'tts-voice-list';
    document.body.appendChild(dl);
  }
  dl.innerHTML = list.map((v) => `<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('');
  el.setAttribute('list', 'tts-voice-list');
  if (current) el.value = current;
}

/* ---------------------------------------------------------- tts + barge-in */
const tts = new TTSRouter({
  settings: () => settings,
  voice,
  serverUrl: () => settings.serverUrl || 'http://localhost:8787',
});
tts.onFallback = (err) => {
  setSubtitle(`เสียงคุณภาพสูงใช้ไม่ได้ (${err.message}) — เปลี่ยนเป็นเสียงเครื่องให้แล้ว`);
};

const bargeIn = new BargeIn({
  mode: settings.bargeIn || 'keyword',
  lang: settings.language === 'en' ? 'en-US' : 'th-TH',
  onInterrupt: (heard) => {
    stopSpeaking();
    setSubtitle(`✋ หยุดให้แล้ว (ได้ยิน "${heard.slice(0, 24)}")`);
    sm.touch();
  },
});

/** voice ที่มี interface เดียวกับ Voice แต่ผ่าน router (ใช้กับ SpeechQueue) */
const speechVoice = {
  speak: (text) => tts.speak(text, voiceOptions()),
  stopSpeaking: () => tts.stop(),
};

/* ---------------------------------------------- stop speaking / stop agent */
let currentAgent = null;
let currentTimeline = null;

/** ปุ่ม ⏹ / Esc: หยุดทั้งงานที่กำลังทำและเสียง */
function stopAll(reason = 'ผู้ใช้กดหยุด') {
  const stoppedWork = !!(busy && currentAgent);
  if (stoppedWork) {
    currentAgent.cancel(reason);
    currentTimeline?.cancel(reason);
    if (currentTimeline) renderTimeline(currentTimeline);
    setSubtitle(tr('agent.cancelled', { lang: settings.uiLang }));
  }
  stopSpeaking();
  return stoppedWork;
}

function stopSpeaking() {
  activeQueue?.stop();
  activeQueue = null;
  bargeIn.stop();
  tts.stop();
  voice.stopSpeaking();
  $('#stop-btn').hidden = true;
  setSubtitle('หยุดแล้ว');
}
$('#stop-btn').addEventListener('click', () => stopAll());

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
function renderToolsGrid(force = false) {
  const grid = $('#tools-grid');
  const mode = getMode(settings.mode);
  const modeId = settings.mode || 'auto';
  if (!force && grid.dataset.ready === modeId) return;
  if (force) grid.dataset.ready = '';
  grid.innerHTML = '';
  grid.dataset.ready = modeId;

  const ids = toolsForMode(modeId);
  for (const id of ids) {
    const t = getTool(id);
    const meta = toolMeta(id);
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = `<strong>${esc(t.emoji)} ${esc(t.label)}</strong><small>${esc(t.desc)}</small>`
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
    note.textContent = `${mode.emoji} โหมด ${mode.label}: แสดง ${ids.length}/${allToolIds().length} เครื่องมือ`
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
  return chatWithFallback(messages, resolveProviderChain(offlineChainSettings(settings)), { fallback });
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

/* ------------------------------------------------------- HTTP tool plugins */
/** โหลดปลั๊กอินที่บันทึกไว้ → dynamic tool defs (คีย์ plugin__<id>) */
function loadPlugins({ apply = true } = {}) {
  const res = customToolDefs(settings.customPlugins || []);
  pluginToolDefs = res.defs;
  if (apply) refreshDynamicTools();
  return res;
}

function renderPlugins() {
  const list = $('#plugin-list');
  if (!list) return;
  const { tools, errors } = validateCustomTools(settings.customPlugins || []);
  const names = tools.map((t) => `${t.emoji} ${t.label} <small>(${t.method} ${new URL(t.url).host} · risk ${t.risk})</small>`);
  list.innerHTML = names.length
    ? names.map((n) => `<div>• ${n}</div>`).join('')
    : `<span>${tr('plugins.status', { lang: settings.uiLang })}</span>`;
  if (errors.length) list.innerHTML += `<div class="hint">⚠️ ${esc(errors.join(' · '))}</div>`;
  const box = $('#plugin-json');
  if (box && !box.value) box.value = (settings.customPlugins || []).length ? JSON.stringify(settings.customPlugins, null, 2) : '';
}

function setPluginStatus(text) {
  const el = $('#plugin-status');
  if (el) el.textContent = text;
}

$('#plugin-example')?.addEventListener('click', () => {
  const box = $('#plugin-json');
  if (box) box.value = JSON.stringify(PLUGIN_EXAMPLE, null, 2);
  setPluginStatus('ใส่ตัวอย่างแล้ว — กด “ตรวจสอบ” เพื่อเช็กก่อนบันทึก');
});

$('#plugin-validate')?.addEventListener('click', () => {
  const { ok, tools, errors } = validateCustomTools($('#plugin-json')?.value || '');
  setPluginStatus(ok
    ? `✅ ผ่านทั้งหมด ${tools.length}/${PLUGIN_LIMITS.maxTools} เครื่องมือ`
    : `❌ ${errors.slice(0, 3).join(' · ')}`);
  return ok;
});

$('#plugin-save')?.addEventListener('click', () => {
  const { ok, tools, errors } = validateCustomTools($('#plugin-json')?.value || '');
  if (!ok) {
    setPluginStatus(`❌ บันทึกไม่ได้: ${errors.slice(0, 2).join(' · ')}`);
    return;
  }
  Object.assign(settings, saveSettings({ customPlugins: tools }));
  pluginToolDefs = Object.fromEntries(Object.entries(customToolDefs(tools).defs));
  refreshDynamicTools();
  renderPlugins();
  renderToolsGrid(true);
  setPluginStatus(`✅ ใช้ ${tools.length} ปลั๊กอินแล้ว (เรียกได้ทั้ง AI และกดทดลองในหน้าเครื่องมือ)`);
});

/* ------------------------------------------------------------------ digest */
const DIGEST_KEY = 'no7.digest.last';

// ใช้ closure (ไม่ใช่ getter) เพื่อไม่ให้แตะ `tasks`/`calendar` ก่อนถูกประกาศ (TDZ)
digestToolDef = digestTool({
  tasks: { list: (opts = {}) => tasks.list(opts) },
  calendar: { list: () => calendar.all() },
  memory: { recent: () => memory.listFacts({ sort: 'recent' }) },
  lang: () => langOf(settings.uiLang),
});

function renderDigestCard(digest, target = null) {
  const box = $('#digest-card');
  const html = `<div class="digest-card">
    <strong>${esc(digest.headline)}</strong>
    ${digest.sections.map((sec) => `<div class="digest-sec">
      <div class="digest-sec-head">${sec.emoji} ${esc(sec.title)} <small>(${sec.items.length}${sec.more ? `+${sec.more}` : ''})</small></div>
      ${sec.items.map((it) => `<div class="digest-item">· ${esc(it.label)}${it.meta ? ` <small>${esc(it.meta)}</small>` : ''}</div>`).join('')}
      ${sec.more ? `<div class="digest-item">· …อีก ${sec.more}</div>` : ''}
    </div>`).join('') || `<p class="hint">${settings.uiLang === 'en' ? 'Nothing pending today.' : 'วันนี้ไม่มีอะไรค้าง 🎉'}</p>`}
  </div>`;
  if (box) {
    box.innerHTML = html;
    box.hidden = false;
  }
  if (target) {
    const plain = [digest.headline]
      .concat(digest.sections.flatMap((sec) => [
        `${sec.emoji} ${sec.title}`,
        ...sec.items.map((it) => `  · ${it.label}${it.meta ? ` (${it.meta})` : ''}`),
      ]))
      .join('\n');
    const el = addMessage('bot', plain);
    el.classList.add('digest');
  }
  return html;
}

/** สร้างสรุปวันนี้และแสดง (ปุ่ม / อัตโนมัติ / tool) */
function showDigest({ inChat = true } = {}) {
  const digest = buildDigest({
    tasks: tasks.list({ done: null }),
    events: calendar.all(),
    memories: memory.listFacts({ sort: 'recent' }),
    now: Date.now(),
    lang: langOf(settings.uiLang),
  });
  renderDigestCard(digest, inChat ? {} : null);
  setSubtitle(digest.headline);
  return digest;
}

function maybeAutoDigest() {
  if (!settings.digestAuto) return null;
  let last = null;
  try { last = Number(localStorage.getItem(DIGEST_KEY)) || null; } catch { last = null; }
  if (!shouldAutoDigest({ lastDate: last, now: Date.now(), hour: 7 })) return null;
  const digest = showDigest({ inChat: true });
  try { localStorage.setItem(DIGEST_KEY, String(digest.date)); } catch { /* พื้นที่เต็ม */ }
  return digest;
}

/* ---------------------------------------------------------------- calendar */
const calendar = getCalendar();

function renderCalendar() {
  const box = $('#cal-list');
  if (!box) return;
  const list = calendar.all().filter((e) => e.start >= Date.now() - 12 * 3600000);
  box.innerHTML = list.length ? '' : '<p class="hint">ยังไม่มีนัด — เพิ่มด้านบน หรือบอก No7 ว่า "นัดประชุมพรุ่งนี้ 14:30"</p>';
  for (const e of list) {
    const row = document.createElement('div');
    row.className = 'fact';
    const when = document.createElement('span');
    when.className = 'pill hot';
    when.textContent = formatWhen(e.start);
    const title = document.createElement('span');
    title.className = 'fact-text';
    title.textContent = `${e.title}${e.location ? ` · 📍 ${e.location}` : ''}`;
    const del = document.createElement('button');
    del.textContent = 'ลบ';
    del.addEventListener('click', () => { calendar.remove(e.uid); renderCalendar(); });
    row.append(when, title, del);
    box.appendChild(row);
  }
  renderTasks();
}

$('#cal-add-btn').addEventListener('click', () => {
  const title = $('#cal-title').value.trim();
  const when = $('#cal-when').value;
  if (!title || !when) { $('#cal-status').textContent = 'ต้องใส่หัวข้อและเวลา'; return; }
  calendar.add({ title, start: new Date(when).getTime() });
  $('#cal-title').value = '';
  $('#cal-when').value = '';
  $('#cal-status').textContent = 'เพิ่มนัดแล้ว ✅';
  renderCalendar();
});

$('#cal-import-btn').addEventListener('click', () => $('#cal-import-file').click());
$('#cal-import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const res = calendar.importIcs(await file.text());
    $('#cal-status').textContent = `นำเข้า ${res.added}/${res.total} รายการ`;
    renderCalendar();
  } catch (err) { $('#cal-status').textContent = `อ่านไฟล์ไม่สำเร็จ: ${err.message}`; }
  e.target.value = '';
});

$('#cal-export-btn').addEventListener('click', () => {
  const blob = new Blob([calendar.exportIcs()], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `no7-calendar-${Date.now()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
  $('#cal-status').textContent = 'ส่งออกแล้ว';
});

$('#digest-btn')?.addEventListener('click', () => {
  const digest = showDigest({ inChat: true });
  try { localStorage.setItem(DIGEST_KEY, String(digest.date)); } catch { /* noop */ }
});
$('#set-digest-auto')?.addEventListener('change', (e) => {
  Object.assign(settings, saveSettings({ digestAuto: e.target.checked }));
  $('#settings-status').textContent = e.target.checked
    ? (settings.uiLang === 'en' ? 'Morning digest: on' : 'สรุปอัตโนมัติทุกเช้า: เปิด')
    : (settings.uiLang === 'en' ? 'Morning digest: off' : 'สรุปอัตโนมัติทุกเช้า: ปิด');
});

$('#cal-today-btn').addEventListener('click', () => {
  const list = calendar.upcoming({ days: 1, limit: 20 });
  $('#cal-status').textContent = list.length
    ? `วันนี้/พรุ่งนี้: ${list.map((e) => `${formatWhen(e.start)} ${e.title}`).join(' · ')}`
    : 'ไม่มีนัดในช่วง 24 ชั่วโมง';
});

/* ----------------------------------------------------------------- devices */
const devices = getDeviceRegistry();

function devLog(text) {
  const el = $('#dev-log');
  el.hidden = false;
  el.textContent = `${new Date().toLocaleTimeString('th-TH')} — ${text}\n${el.textContent}`.slice(0, 4000);
}

function renderLinkDeviceOptions(selected = '') {
  const sel = $('#link-device');
  if (!sel) return;
  const list = devices.list();
  sel.innerHTML = list.length
    ? list.map((d) => `<option value="${esc(d.id)}"${d.id === selected ? ' selected' : ''}>${esc(d.name)} · ${esc(d.baseUrl)}</option>`).join('')
    : '<option value="">— ยังไม่มีอุปกรณ์ —</option>';
}

function selectedLinkDevice() {
  const id = $('#link-device')?.value || '';
  return devices.get(id) || devices.list()[0] || null;
}

function renderDevices() {
  renderLinkDeviceOptions($('#link-device')?.value || '');
  const box = $('#dev-list');
  if (!box) return;
  const list = devices.list();
  box.innerHTML = list.length ? '' : '<p class="hint">ยังไม่มีอุปกรณ์ — เปิด server (npm run server) แล้วเพิ่มอุปกรณ์ด้านล่าง</p>';

  for (const d of list) {
    const card = document.createElement('div');
    card.className = 'device';

    const header = document.createElement('header');
    header.innerHTML = `<span class="dot" id="dot-${d.id}"></span><strong>${d.name}</strong>`
      + `<small>${d.baseUrl}</small>`;
    card.appendChild(header);

    const info = document.createElement('small');
    info.textContent = `รหัส ${d.code || '—'} · ${d.lastSeen ? `เห็นล่าสุด ${new Date(d.lastSeen).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}` : 'ยังไม่เคยเชื่อมต่อ'}`;
    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'dev-actions';

    const testBtn = document.createElement('button');
    testBtn.textContent = '🔌 ทดสอบ';
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      try {
        const r = await testConnection(d);
        devices.touch(d.id);
        renderDevices();
        devLog(`✅ ${d.name}: เชื่อมต่อได้ (v${r.health?.version || '?'})`);
      } catch (e) { devLog(`❌ ${d.name}: ${e.message}`); }
      testBtn.disabled = false;
    });
    actions.appendChild(testBtn);

    const statusBtn = document.createElement('button');
    statusBtn.textContent = '📊 สถานะ';
    statusBtn.addEventListener('click', async () => {
      try {
        const st = await deviceStatus(d);
        const dot = document.getElementById(`dot-${d.id}`);
        if (dot) dot.className = `dot ${st.online ? 'online' : 'offline'}`;
        devLog(`${d.name}: online=${st.online} · ค้างส่ง ${st.pending} · ส่งแล้ว ${st.delivered}`);
      } catch (e) { devLog(`❌ ${d.name}: ${e.message}`); }
    });
    actions.appendChild(statusBtn);

    for (const q of QUICK_COMMANDS.slice(0, 4)) {
      const b = document.createElement('button');
      b.textContent = q.label;
      b.addEventListener('click', async () => {
        try {
          const res = await sendCommand(d, q.id, q.args);
          devices.touch(d.id, { lastCommand: q.id });
          devLog(`➡️ ${d.name}: ส่ง "${q.label}" (${res?.id || 'queued'})`);
          renderDevices();
        } catch (e) { devLog(`❌ ส่งไม่สำเร็จ: ${e.message}`); }
      });
      actions.appendChild(b);
    }

    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'ลบ';
    del.addEventListener('click', () => {
      if (!confirm(`ลบอุปกรณ์ ${d.name}?`)) return;
      devices.remove(d.id);
      renderDevices();
    });
    actions.appendChild(del);

    card.appendChild(actions);
    box.appendChild(card);
  }
}

$('#dev-pair').addEventListener('click', async () => {
  const url = ($('#dev-url').value.trim() || settings.serverUrl || '').replace(/\/$/, '');
  if (!url) { $('#dev-status').textContent = 'ใส่ที่อยู่ server ก่อน'; return; }
  $('#dev-status').textContent = 'กำลังขอรหัส…';
  try {
    const res = await fetch(`${url}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'no7-device' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    $('#dev-code').value = data.code;
    $('#dev-secret').value = data.secret;
    $('#dev-status').textContent = `ได้รหัส ${data.code} แล้ว — นำไปใส่ในอุปกรณ์ (บอร์ด) ด้วย`;
    devLog(`ขอรหัสจับคู่จาก ${url} สำเร็จ`);
  } catch (e) {
    $('#dev-status').textContent = `ขอรหัสไม่สำเร็จ: ${e.message}`;
  }
});

$('#dev-add').addEventListener('click', () => {
  try {
    const d = devices.add({
      name: $('#dev-name').value.trim() || 'อุปกรณ์ใหม่',
      baseUrl: $('#dev-url').value.trim(),
      code: $('#dev-code').value.trim(),
      secret: $('#dev-secret').value.trim(),
    });
    $('#dev-status').textContent = `เพิ่ม ${d.name} แล้ว ✅`;
    $('#dev-name').value = ''; $('#dev-code').value = ''; $('#dev-secret').value = '';
    renderDevices();
  } catch (e) {
    $('#dev-status').textContent = `เพิ่มไม่สำเร็จ: ${e.message}`;
  }
});

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
  for (const p of allPersonas()) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.emoji || '🤖'} ${p.name} — ${p.desc}${p.builtin ? '' : ' ✨'}`;
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
  $('#set-serverurl').value = settings.serverUrl || '';
  $('#set-synctoken').value = settings.syncToken || '';
  renderPermList();

  const ttsSel = $('#set-ttsprovider');
  ttsSel.innerHTML = Object.entries(TTS_PROVIDERS).map(([id, p]) => `<option value="${id}">${p.label}</option>`).join('');
  ttsSel.value = TTS_PROVIDERS[settings.ttsProvider] ? settings.ttsProvider : 'system';
  $('#tts-provider-hint').textContent = TTS_PROVIDERS[ttsSel.value].desc;
  $('#tts-openai-fields').hidden = !TTS_PROVIDERS[ttsSel.value].needsServer;
  const resolved = resolveTTSConfig({ ...settings, ttsProvider: ttsSel.value });
  $('#set-ttsbaseurl').value = settings.ttsBaseUrl || '';
  $('#set-ttsapikey').value = settings.ttsApiKey || '';
  $('#set-ttsmodel').value = resolved.model;
  $('#set-ttsvoice').value = resolved.voice;
  $('#set-ttscache').checked = settings.ttsCache !== false;
  renderTTSVoiceOptions(ttsSel.value, resolved.voice);

  const bargeSel = $('#set-bargein');
  bargeSel.innerHTML = Object.entries(BARGE_MODES).map(([id, m]) => `<option value="${id}">${m.label}</option>`).join('');
  bargeSel.value = BARGE_MODES[settings.bargeIn] ? settings.bargeIn : 'keyword';

  renderMcp();
  renderControl();
  renderBots();
  renderMetrics();
  updateOutboxBadge();

  $('#set-streaming').checked = settings.streaming !== false;
  $('#set-speakstream').checked = settings.speakWhileStreaming !== false;
  $('#set-wake').checked = !!settings.wake;
  $('#set-rate').value = settings.voiceRate || 1;
  $('#set-pitch').value = settings.voicePitch || 1;
  $('#out-rate').textContent = Number(settings.voiceRate || 1).toFixed(2);
  $('#out-pitch').textContent = Number(settings.voicePitch || 1).toFixed(2);
  renderVoiceOptions();
  renderPersonaList();
  renderCapabilities();
  renderStorage();
  $('#set-language').value = settings.language;
  $('#set-uilang').value = langOf(settings.uiLang);
  if ($('#set-digest-auto')) $('#set-digest-auto').checked = !!settings.digestAuto;
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
  $('#persona-name').textContent = `${p.emoji || '🤖'} ${p.name}`;
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
    uiLang: $('#set-uilang').value,
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
    ttsProvider: $('#set-ttsprovider').value,
    ttsBaseUrl: $('#set-ttsbaseurl').value.trim(),
    ttsApiKey: $('#set-ttsapikey').value.trim(),
    ttsModel: $('#set-ttsmodel').value.trim(),
    ttsVoice: $('#set-ttsvoice').value.trim(),
    ttsCache: $('#set-ttscache').checked,
    bargeIn: $('#set-bargein').value,
    controlPolicy: readControlPolicy(),
    streaming: $('#set-streaming').checked,
    speakWhileStreaming: $('#set-speakstream').checked,
    wake: $('#set-wake').checked,
    voiceRate: Number($('#set-rate').value) || 1,
    voicePitch: Number($('#set-pitch').value) || 1,
    voiceName: $('#set-voice').value,
    serverUrl: $('#set-serverurl').value.trim() || 'http://localhost:8787',
    syncToken: $('#set-synctoken').value.trim(),
  };
}

/* ------------------------------------------------ device capabilities */
async function renderCapabilities() {
  const box = $('#caps-list');
  if (!box) return;
  const caps = await detectCapabilities(window);
  const sum = summarizeCapabilities(caps);
  box.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = `พร้อมใช้ ${sum.ok}/${sum.total} (${sum.score}%)`
    + (sum.missing.length ? ` · ยังไม่มี: ${sum.missing.join(', ')}` : '');
  box.appendChild(head);

  for (const c of caps) {
    const row = document.createElement('div');
    row.className = `cap ${c.ok ? 'ok' : 'no'}`;
    const label = document.createElement('span');
    label.textContent = c.label;
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = c.ok ? '✅' : '➖';
    const extra = document.createElement('small');
    extra.textContent = c.value ? String(c.value) : (c.ok ? '' : (c.hint || 'ไม่รองรับ'));
    row.append(mark, label, extra);
    box.appendChild(row);
  }
}

async function renderStorage() {
  const { rows, total } = usageBreakdown(window);
  const est = await estimateQuota(window);
  const persisted = await isPersisted(window);

  $('#storage-summary').textContent = `ข้อมูล No7 ใช้ ${formatBytes(total)}`
    + (est?.quota ? ` · เบราว์เซอร์ใช้ ${est.usageText}/${est.quotaText} (${est.percent}%)` : '')
    + ` · พื้นที่ถาวร: ${persisted ? '✅ เปิดแล้ว' : '❌ ยังไม่เปิด'}`;

  const box = $('#storage-rows');
  box.innerHTML = '';
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  for (const r of rows.filter((x) => x.bytes > 0).sort((a, b) => b.bytes - a.bytes)) {
    const row = document.createElement('div');
    row.className = 'storage-row';
    row.innerHTML = `<span>${r.label}</span><span class="bar"><i style="width:${Math.round((r.bytes / max) * 100)}%"></i></span><span>${formatBytes(r.bytes)}</span>`;
    box.appendChild(row);
  }
  if (!box.children.length) box.innerHTML = '<p class="hint">ยังไม่มีข้อมูลที่บันทึกไว้</p>';
}

$('#caps-refresh').addEventListener('click', () => renderCapabilities());
$('#caps-mic').addEventListener('click', async () => {
  $('#caps-status').textContent = 'กำลังขอสิทธิ์…';
  try {
    await requestMicrophone(window);
    $('#caps-status').textContent = '✅ ได้สิทธิ์ไมโครโฟนแล้ว';
    renderCapabilities();
  } catch (e) {
    $('#caps-status').textContent = `❌ ${e.message}`;
  }
});
$('#caps-notify').addEventListener('click', async () => {
  try {
    const res = await requestNotifications(window);
    $('#caps-status').textContent = res === 'granted' ? '✅ เปิดแจ้งเตือนแล้ว' : `ผล: ${res}`;
    renderCapabilities();
  } catch (e) {
    $('#caps-status').textContent = `❌ ${e.message}`;
  }
});

$('#storage-persist').addEventListener('click', async () => {
  try {
    const ok = await requestPersistentStorage(window);
    $('#settings-status').textContent = ok ? '✅ ได้พื้นที่ถาวรแล้ว' : 'เบราว์เซอร์ยังไม่อนุญาต (อาจต้องติดตั้งเป็นแอปก่อน)';
    renderStorage();
  } catch (e) {
    $('#settings-status').textContent = `❌ ${e.message}`;
  }
});
$('#storage-clean-metrics').addEventListener('click', () => {
  clearGroup('metrics', window);
  renderStorage();
  $('#settings-status').textContent = 'ล้างสถิติแล้ว';
});
$('#storage-clean-notes').addEventListener('click', () => {
  if (!confirm('ล้างโน้ต/รายการงาน/เตือนความจำ?')) return;
  clearGroup('notes', window);
  renderStorage();
  $('#settings-status').textContent = 'ล้างโน้ตและรายการงานแล้ว';
});

// แจ้งเตือนเมื่อพื้นที่เต็ม
window.addEventListener('no7:storage-error', (e) => {
  const msg = e.detail?.message || 'พื้นที่เก็บข้อมูลเต็ม';
  $('#offline-banner').hidden = false;
  $('#offline-banner').textContent = `⚠️ ${msg}`;
});

/* ------------------------------------------------------- Persona Studio */
let editingPersonaId = null;

function renderPersonaList() {
  const box = $('#persona-list');
  if (!box) return;
  box.innerHTML = '';
  for (const p of allPersonas()) {
    const card = document.createElement('button');
    card.className = 'persona-card';
    card.type = 'button';
    card.classList.toggle('active', p.id === settings.persona);
    card.innerHTML = `<strong>${p.emoji || '🤖'} ${p.name}${p.builtin ? '' : ' ✨'}</strong>`
      + `<small>${p.desc || ''}</small>`;
    card.addEventListener('click', () => {
      settings = saveSettings({ persona: p.id });
      renderPersonaList();
      renderSettingsForm();
      updatePersonaHeader();
      $('#pf-status').textContent = `ใช้ ${p.name} แล้ว`;
    });
    box.appendChild(card);
  }
}

function openPersonaForm(id = null) {
  const persona = id ? allPersonas().find((p) => p.id === id) : null;
  editingPersonaId = persona?.builtin ? null : (persona?.id || null);
  const form = $('#persona-form');
  form.hidden = false;
  $('#pf-name').value = persona?.name || '';
  $('#pf-emoji').value = persona?.emoji || '🤖';
  $('#pf-desc').value = persona?.desc || '';
  $('#pf-system').value = persona?.system || '';
  $('#pf-greeting').value = persona?.greeting || '';
  $('#pf-banned').value = (persona?.banned || []).join(', ');
  $('#pf-gender').value = persona?.gender || 'neutral';
  $('#pf-rate').value = persona?.style?.rate ?? 1;
  $('#pf-rate-out').textContent = Number($('#pf-rate').value).toFixed(2);
  $('#pf-delete').hidden = !editingPersonaId;
  $('#pf-status').textContent = persona?.builtin
    ? 'persona มาตรฐานแก้ไม่ได้ — กดบันทึกเพื่อสร้างสำเนาที่แก้ได้'
    : '';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function readPersonaForm() {
  return {
    name: $('#pf-name').value.trim(),
    emoji: $('#pf-emoji').value.trim() || '🤖',
    desc: $('#pf-desc').value.trim(),
    system: $('#pf-system').value.trim(),
    greeting: $('#pf-greeting').value.trim(),
    banned: $('#pf-banned').value.split(',').map((x) => x.trim()).filter(Boolean),
    gender: $('#pf-gender').value,
    style: { rate: Number($('#pf-rate').value) || 1, pitch: 1, voiceName: settings.voiceName || '' },
  };
}

$('#persona-new').addEventListener('click', () => openPersonaForm(null));
$('#persona-dup').addEventListener('click', () => {
  const copy = duplicatePersona(settings.persona);
  if (!copy) return;
  renderPersonaList();
  openPersonaForm(copy.id);
  $('#pf-status').textContent = 'สร้างสำเนาแล้ว — แก้ได้เลย';
});
$('#pf-rate').addEventListener('input', (e) => { $('#pf-rate-out').textContent = Number(e.target.value).toFixed(2); });
$('#pf-cancel').addEventListener('click', () => { $('#persona-form').hidden = true; });
$('#pf-save').addEventListener('click', () => {
  const data = readPersonaForm();
  if (!data.name || !data.system) {
    $('#pf-status').textContent = '⚠️ ต้องมีชื่อและตัวตน (system prompt)';
    return;
  }
  const saved = editingPersonaId ? updatePersona(editingPersonaId, data) : createPersona(data);
  if (!saved) { $('#pf-status').textContent = 'บันทึกไม่สำเร็จ'; return; }
  settings = saveSettings({ persona: saved.id });
  editingPersonaId = saved.id;
  $('#persona-form').hidden = true;
  renderPersonaList();
  renderSettingsForm();
  updatePersonaHeader();
  $('#settings-status').textContent = `✅ บันทึก persona "${saved.name}" แล้ว`;
});
$('#pf-delete').addEventListener('click', () => {
  if (!editingPersonaId) return;
  if (!confirm('ลบ persona นี้?')) return;
  deletePersona(editingPersonaId);
  editingPersonaId = null;
  $('#persona-form').hidden = true;
  if (!allPersonas().some((p) => p.id === settings.persona)) settings = saveSettings({ persona: 'no7' });
  renderPersonaList();
  renderSettingsForm();
  updatePersonaHeader();
});
$('#pf-preview').addEventListener('click', async () => {
  const data = readPersonaForm();
  const line = data.greeting || `สวัสดีครับ ผมชื่อ ${data.name || 'No7'}`;
  $('#pf-status').textContent = 'กำลังพูด…';
  await voice.speak(line, { lang: 'th-TH', rate: Number($('#pf-rate').value) || 1, pitch: 1 });
  $('#pf-status').textContent = 'พูดจบแล้ว';
});

/* ------------------------------------------------- metrics + diagnostics */
function renderMetrics() {
  const box = $('#metrics-list');
  if (!box) return;
  const sum = metrics.summary();
  $('#metrics-summary').textContent = sum.total
    ? `เก็บ ${sum.total} ตัวอย่าง (ในเครื่องนี้เท่านั้น)`
    : 'ยังไม่มีข้อมูล — ลองคุยหรือใช้เครื่องมือสักครั้ง';
  const rows = [];
  for (const [kind, meta] of Object.entries(METRIC_KINDS)) {
    const k = sum.kinds[kind];
    if (!k.count) continue;
    rows.push(`<div class="metric-row"><span>${meta.emoji} ${meta.label}</span><span>${k.count} ครั้ง · เฉลี่ย ${formatMs(k.avg)} · p95 ${formatMs(k.p95)}`
      + `${k.firstTokenAvg ? ` · token แรก ${formatMs(k.firstTokenAvg)}` : ''} · สำเร็จ ${Math.round((k.okRate || 0) * 100)}%</span></div>`);
  }
  for (const l of sum.labels.slice(0, 5)) {
    rows.push(`<div class="metric-row"><span>${METRIC_KINDS[l.kind]?.emoji || '•'} ${esc(l.label)}</span><span>${l.count} ครั้ง · เฉลี่ย ${formatMs(l.avg)}</span></div>`);
  }
  box.innerHTML = rows.join('') || '<p class="hint">ยังไม่มีข้อมูล</p>';
}

async function renderDiagnostics() {
  const out = $('#diag-output');
  if (!out) return '';
  const caps = await detectCapabilities(window);
  const { rows, total } = usageBreakdown(window);
  const persisted = await isPersisted(window);
  const report = buildDiagnosticsReport({
    app: {
      name: 'No7 Personal AI',
      version: window.NO7_VERSION || '2.0.0',
      platform: platformLabel(platform),
      userAgent: navigator.userAgent,
    },
    settings,
    capabilities: caps,
    metrics: metrics.summary(),
    mcp: mcp.status(),
    storage: {
      rows: rows.filter((r) => r.bytes > 0).map((r) => ({ label: r.label, pretty: formatBytes(r.bytes) })),
      total: formatBytes(total),
      persisted,
    },
    errors: recentErrors,
  });
  out.textContent = report;
  return report;
}

$('#metrics-reset')?.addEventListener('click', () => {
  metrics.reset();
  renderMetrics();
  $('#metrics-summary').textContent = 'ล้างสถิติแล้ว';
});

$('#diag-run')?.addEventListener('click', async () => {
  $('#diag-status').textContent = 'กำลังสร้างรายงาน…';
  const report = await renderDiagnostics();
  $('#diag-status').textContent = report ? '✅ สร้างรายงานแล้ว (ตรวจซ้ำก่อนแชร์)' : 'สร้างไม่สำเร็จ';
});

$('#diag-copy')?.addEventListener('click', async () => {
  const report = $('#diag-output').textContent || await renderDiagnostics();
  try {
    await navigator.clipboard.writeText(report);
    $('#diag-status').textContent = '📋 คัดลอกแล้ว';
  } catch {
    $('#diag-status').textContent = 'คัดลอกไม่ได้ — เลือกข้อความในกล่องแล้วคัดลอกเอง';
  }
});

$('#diag-download')?.addEventListener('click', async () => {
  const report = $('#diag-output').textContent || await renderDiagnostics();
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = diagnosticsFilename();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $('#diag-status').textContent = `⬇️ ดาวน์โหลด ${a.download}`;
});

/* ------------------------------------------------------------------ tasks */
const tasks = new TaskStore();

function renderTasks() {
  const box = $('#task-list');
  if (!box) return;
  const filter = $('#task-filter').value || 'open';
  const now = Date.now();
  const opts = filter === 'all' ? { done: null } : filter === 'done' ? { done: true } : filter === 'today' ? { done: false, dueWithinMs: 24 * 3600000 } : { done: false };
  let list = tasks.list(opts);
  if (filter === 'overdue') list = list.filter((t) => isOverdue(t, now));

  const stats = tasks.stats(now);
  $('#task-stats').textContent = `ค้าง ${stats.open} · วันนี้ ${stats.today} · เกินกำหนด ${stats.overdue} · เสร็จแล้ว ${stats.done}`;
  box.innerHTML = list.length ? '' : '<p class="hint">ไม่มีงานในมุมมองนี้ 🎉</p>';

  for (const t of list) {
    const row = document.createElement('div');
    row.className = 'fact';
    const when = document.createElement('span');
    when.className = `pill${isOverdue(t, now) ? ' hot' : ''}`;
    when.textContent = formatTaskTime(t.due, now);
    const title = document.createElement('span');
    title.className = 'fact-text';
    title.textContent = `${PRIORITIES[t.priority].emoji} ${t.title}${t.recurrence ? ` 🔁 ${describeRecurrence(t.recurrence)}` : ''}`;
    const done = document.createElement('button');
    done.textContent = t.done ? '↩️' : '✅';
    done.title = t.done ? 'เปิดใหม่' : 'ทำเสร็จแล้ว';
    done.addEventListener('click', () => {
      const res = tasks.complete(t.id, !t.done);
      if (res.advanced) $('#task-status').textContent = `🔁 เลื่อนไปรอบถัดไป: ${formatTaskTime(res.task.due)}`;
      renderTasks();
      pushRemindersToServer();
    });
    const del = document.createElement('button');
    del.textContent = 'ลบ';
    del.addEventListener('click', () => { tasks.remove(t.id); renderTasks(); pushRemindersToServer(); });
    row.append(when, title, done, del);
    box.appendChild(row);
  }
}

$('#task-add')?.addEventListener('click', () => {
  const title = $('#task-title').value.trim();
  if (!title) { $('#task-status').textContent = 'ต้องใส่ชื่องาน'; return; }
  const rawWhen = $('#task-when').value;
  const due = rawWhen ? parseDue(rawWhen) : null;
  const repeat = $('#task-repeat').value || null;
  try {
    tasks.add({
      title, due,
      priority: Number($('#task-priority').value) || 0,
      recurrence: repeat,
      device: platform,
    });
    $('#task-title').value = '';
    $('#task-when').value = '';
    $('#task-status').textContent = 'เพิ่มงานแล้ว ✅ (จะเตือนตามเวลา)';
    renderTasks();
    pushRemindersToServer();
  } catch (e) {
    $('#task-status').textContent = e.message;
  }
});

$('#task-filter')?.addEventListener('change', () => renderTasks());

$('#task-clear-done')?.addEventListener('click', () => {
  const done = tasks.list({ done: true });
  for (const t of done) tasks.remove(t.id);
  $('#task-status').textContent = done.length ? `ล้าง ${done.length} งานที่เสร็จแล้ว` : 'ไม่มีงานที่เสร็จให้ล้าง';
  renderTasks();
  pushRemindersToServer();
});

/** เตือนเมื่อถึงเวลา — Notification + ข้อความในแชท + subtitle */
const taskScheduler = new TaskScheduler({
  store: tasks,
  intervalMs: 30_000,
  onDue: (task) => {
    const text = `⏰ ถึงเวลา: ${task.title}`;
    const label = settings.uiLang === 'en' ? `${tr('notify.taskPrefix', { lang: 'en' })} ${task.title}` : text;
    setSubtitle(label);
    addMessage('bot', `${label}${task.notes ? `\n${task.notes}` : ''}${task.due ? `\n(${formatTaskTime(task.due)})` : ''}`);
    try { new Notification(`No7 — ${tr('notify.task', { lang: settings.uiLang })}`, { body: task.title }); } catch { /* ไม่ได้อนุญาตแจ้งเตือน */ }
    renderTasks();
  },
});

/* ------------------------------------------------- reminders via server */
let reminderPushTimer = null;
let reminderPollTimer = null;

function remindersBase() {
  return String(settings.serverUrl || 'http://localhost:8787').replace(/\/$/, '');
}

/** ส่งงานที่มีเวลาไปให้ server เพื่อให้เตือนได้แม้ปิดแอป (Telegram) */
function pushRemindersToServer({ immediate = false } = {}) {
  clearTimeout(reminderPushTimer);
  const run = async () => {
    if (!navigator.onLine) return;
    const items = tasks.list({ done: null })
      .filter((t) => t.due)
      .map((t) => ({
        id: t.id, title: t.title, due: t.due, priority: t.priority,
        recurrence: t.recurrence, done: t.done, updatedAt: t.updatedAt, device: t.device,
      }));
    try {
      const res = await fetch(`${remindersBase()}/api/reminders`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tasks: items }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      renderReminderStatus();
    } catch {
      if ($('#task-server-status')) $('#task-server-status').textContent = 'server: ส่งงานไม่สำเร็จ (จะลองใหม่เมื่อแก้งาน)';
    }
  };
  if (immediate) return run();
  reminderPushTimer = setTimeout(run, 1200);
  return Promise.resolve();
}

/** ดึงงานที่ server เห็นว่าถึงเวลา (เช่น เตือนจากเครื่องอื่น) */
async function pollReminderDue() {
  if (!navigator.onLine) return [];
  try {
    const res = await fetch(`${remindersBase()}/api/reminders/due`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return [];
    for (const item of items) {
      addMessage('bot', `⏰ ถึงเวลา (จาก server): ${item.title}`);
      try { new Notification('No7 — ถึงเวลางาน', { body: item.title }); } catch { /* ไม่ได้อนุญาต */ }
      setSubtitle(`⏰ ${item.title}`);
    }
    await fetch(`${remindersBase()}/api/reminders/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: items.map((i) => i.id) }),
    });
    renderTasks();
    return items;
  } catch {
    return [];
  }
}

async function renderReminderStatus() {
  const el = $('#task-server-status');
  if (!el) return null;
  try {
    const res = await fetch(`${remindersBase()}/api/reminders/status`);
    const data = await res.json();
    el.textContent = `server: ${data.count || 0} งาน · ถึงเวลา ${data.due || 0} · Telegram ${data.telegram?.configured ? '✅' : '—'}`
      + `${data.next ? ` · ถัดไป ${formatTaskTime(data.next.due)}` : ''}`;
    return data;
  } catch {
    el.textContent = 'server: ยังไม่เชื่อม (รัน npm run server เพื่อให้เตือนได้แม้ปิดแอป)';
    return null;
  }
}

function scheduleReminderPolling() {
  clearInterval(reminderPollTimer);
  reminderPollTimer = setInterval(() => { pollReminderDue(); }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollReminderDue();
  });
}

/* --------------------------------------------------------------- desktop */
const recipes = new RecipeStore();
let desktopWindows = [];

function setDesktopStatus(text) {
  const el = $('#recipe-status');
  if (el) el.textContent = text;
}

function renderRecipeOptions(selectedId = '') {
  const sel = $('#recipe-select');
  if (!sel) return;
  const list = recipes.list();
  sel.innerHTML = '<option value="">— สูตรใหม่ —</option>'
    + list.map((r) => `<option value="${esc(r.id)}"${r.id === selectedId ? ' selected' : ''}>${esc(r.name)} (${r.steps.length} ขั้น)</option>`).join('');
}

function fillRecipeEditor(recipe) {
  $('#recipe-name').value = recipe?.name || '';
  $('#recipe-steps').value = recipe ? stringifyRecipeSteps(recipe.steps) : '';
}

function recipeFromEditor() {
  const parsed = parseRecipeText($('#recipe-steps').value);
  return { name: $('#recipe-name').value.trim(), steps: parsed.steps, errors: parsed.errors };
}

function renderWindows() {
  const box = $('#win-list');
  if (!box) return;
  const query = $('#win-query').value.trim();
  const found = matchWindows(desktopWindows, query);
  box.innerHTML = found.length
    ? ''
    : `<p class="hint">${desktopWindows.length ? 'ไม่พบหน้าต่างที่ตรงกับคำค้น' : 'ยังไม่มีรายการหน้าต่าง'}</p>`;
  for (const title of found.slice(0, 40)) {
    const row = document.createElement('div');
    row.className = 'fact';
    const label = document.createElement('span');
    label.className = 'fact-text';
    label.textContent = `🪟 ${title}`;
    const btn = document.createElement('button');
    btn.textContent = 'โฟกัส';
    btn.addEventListener('click', async () => {
      try {
        const res = await focusWindow({ target: title, windows: desktopWindows });
        $('#win-status').textContent = `✅ โฟกัสแล้ว: ${res.big}`;
      } catch (e) {
        $('#win-status').textContent = e.message;
      }
    });
    row.append(label, btn);
    box.appendChild(row);
  }
}

async function refreshDesktopWindows() {
  $('#win-status').textContent = 'กำลังอ่านรายการหน้าต่าง…';
  const res = await listWindows();
  desktopWindows = res.windows;
  $('#win-status').textContent = res.ok
    ? `พบ ${res.windows.length} หน้าต่าง (อ่านสด ๆ จากระบบ)`
    : res.reason;
  renderWindows();
  return res;
}

async function renderDesktop() {
  renderRecipeOptions($('#recipe-select')?.value || '');
  if (!desktopWindows.length) await refreshDesktopWindows();
}

$('#win-refresh')?.addEventListener('click', () => { refreshDesktopWindows(); });
$('#win-query')?.addEventListener('input', () => renderWindows());

$('#recipe-select')?.addEventListener('change', () => {
  const id = $('#recipe-select').value;
  const recipe = id ? recipes.get(id) : null;
  fillRecipeEditor(recipe);
  setDesktopStatus(recipe ? `แก้ไข "${recipe.name}" ได้เลย` : 'สร้างสูตรใหม่ — หนึ่งบรรทัด = หนึ่งขั้น');
  const log = $('#recipe-log');
  if (log) log.hidden = true;
});

$('#recipe-save')?.addEventListener('click', () => {
  const draft = recipeFromEditor();
  if (draft.errors.length) { setDesktopStatus(draft.errors[0]); return; }
  try {
    const saved = recipes.save({ name: draft.name, steps: draft.steps, id: $('#recipe-select').value || '' });
    renderRecipeOptions(saved.id);
    setDesktopStatus(`💾 บันทึกสูตร "${saved.name}" แล้ว (${saved.steps.length} ขั้น)`);
  } catch (e) {
    setDesktopStatus(e.message);
  }
});

function showStepLog(result) {
  const log = $('#recipe-log');
  if (!log) return;
  const icon = { done: '✅', planned: '•', blocked: '⛔', failed: '⛔' };
  log.textContent = result.steps.map((s) => `${icon[s.status] || '•'} ${s.label}${s.reason ? ` — ${s.reason}` : ''}`).join('\n');
  log.hidden = !result.steps.length;
}

$('#recipe-try')?.addEventListener('click', () => {
  const draft = recipeFromEditor();
  if (draft.errors.length) { setDesktopStatus(draft.errors[0]); return; }
  const plan = planRecipe(draft, { policy: settings.controlPolicy, windows: desktopWindows });
  showStepLog({ steps: plan.steps.map((s) => ({ ...s, status: s.allowed ? 'planned' : 'blocked' })) });
  const blocked = plan.steps.filter((s) => !s.allowed).length;
  setDesktopStatus(plan.errors[0]
    || (blocked ? `🔍 จะรันได้ ${plan.steps.length - blocked}/${plan.steps.length} ขั้น — ${blocked} ขั้นถูกบล็อก` : `🔍 ทั้ง ${plan.steps.length} ขั้นพร้อมรัน (ยังไม่ได้ทำอะไรจริง)`));
});

$('#recipe-run')?.addEventListener('click', async () => {
  const draft = recipeFromEditor();
  if (draft.errors.length) { setDesktopStatus(draft.errors[0]); return; }
  if (!desktopWindows.length) await refreshDesktopWindows();
  setDesktopStatus('กำลังรันสูตร…');
  const res = await runRecipe(draft, { policy: settings.controlPolicy, windows: desktopWindows });
  showStepLog(res);
  setDesktopStatus(res.ok ? `▶️ รันครบ ${res.steps.length} ขั้นแล้ว` : `⛔ ${res.error}`);
});

$('#recipe-delete')?.addEventListener('click', () => {
  const id = $('#recipe-select').value;
  if (!id) { setDesktopStatus('เลือกสูตรที่ต้องการลบก่อน'); return; }
  const removed = recipes.remove(id);
  renderRecipeOptions();
  fillRecipeEditor(null);
  setDesktopStatus(removed ? '🗑 ลบสูตรแล้ว' : 'ไม่พบสูตรนี้');
});

/* ------------------------------------------------- phone-link: hello/eyes/voice */
function setLinkStatus(text) {
  const el = $('#link-status');
  if (el) el.textContent = text;
}

$('#link-hello')?.addEventListener('click', async () => {
  const device = selectedLinkDevice();
  if (!device) { setLinkStatus('ยังไม่มีอุปกรณ์ — เพิ่มด้านบนก่อน'); return; }
  setLinkStatus('กำลังส่ง hello…');
  try {
    const caps = linkCapabilities();
    const res = await helloDevice(device, { name: device.name, kind: platform, capabilities: caps, firmware: 'no7-web/1.5' });
    const on = Object.entries(res.device?.capabilities || {}).filter(([, v]) => v).map(([k]) => k);
    setLinkStatus(`✅ ${res.device?.name || device.name}: ${res.protocol} · ความสามารถ: ${on.join(', ') || '—'} · ${res.features?.length || 0} features`);
    devices.touch(device.id);
    renderDevices();
  } catch (e) {
    setLinkStatus(`⛔ ${e.message}`);
  }
});

$('#link-eyes')?.addEventListener('click', async () => {
  const device = selectedLinkDevice();
  if (!device) { setLinkStatus('ยังไม่มีอุปกรณ์ — เพิ่มด้านบนก่อน'); return; }
  const emotion = $('#link-emotion').value.trim() || 'happy';
  try {
    const res = await sendEyes(device, { emotion, intensity: 85, text: 'จาก No7' });
    setLinkStatus(`👀 ส่งอารมณ์ "${res.eyes.emotion}" (${res.eyes.intensity}%) ไปที่ ${device.name} แล้ว — จอจะดึงไปวาด`);
  } catch (e) {
    setLinkStatus(`⛔ ${e.message}`);
  }
});

$('#link-eyes-read')?.addEventListener('click', async () => {
  const device = selectedLinkDevice();
  if (!device) { setLinkStatus('ยังไม่มีอุปกรณ์'); return; }
  try {
    const res = await getEyes(device);
    const e = res.eyes;
    setLinkStatus(e
      ? `📖 ${device.name}: ${e.emotion} ${e.intensity}% · ${e.stale ? 'เก่าแล้ว' : 'สด'} (${Math.round((e.ageMs || 0) / 1000)} วิที่แล้ว)`
      : `📖 ${device.name}: ยังไม่มีอารมณ์ที่บันทึกไว้`);
  } catch (e) {
    setLinkStatus(`⛔ ${e.message}`);
  }
});

$('#link-voice-status')?.addEventListener('click', async () => {
  const device = selectedLinkDevice();
  if (!device) { setLinkStatus('ยังไม่มีอุปกรณ์'); return; }
  try {
    const st = await voiceStatus(device);
    setLinkStatus(st.chunks
      ? `🎧 ${device.name}: ค้าง ${st.chunks} chunk · ${formatBytes(st.bytes)} · seq ล่าสุด ${st.lastSeq}${st.dropped ? ` · ทิ้งไป ${st.dropped}` : ''}`
      : `🎧 ${device.name}: ไม่มีเสียงค้าง (seq ล่าสุด ${st.lastSeq})`);
  } catch (e) {
    setLinkStatus(`⛔ ${e.message}`);
  }
});

/* ------------------------------------------------------------------ i18n */
function applyUiLang(lang) {
  applyI18n(document, langOf(lang));
  $('#view-title').textContent = viewTitle(currentView, settings.uiLang);
  renderModeChips();
  if (currentView === 'tools') renderToolsGrid(true);
}

$('#set-uilang')?.addEventListener('change', (e) => {
  Object.assign(settings, saveSettings({ uiLang: langOf(e.target.value) }));
  applyUiLang(settings.uiLang);
  $('#settings-status').textContent = settings.uiLang === 'en' ? 'Interface language: English' : 'ภาษาหน้าจอ: ไทย';
});

/* --------------------------------------------------------- local models */
const localCache = new LocalModelCache();
let localModels = [];

function localTarget() {
  const kind = $('#local-kind').value || 'ollama';
  const preset = LOCAL_PRESETS[kind];
  return {
    kind,
    baseUrl: ($('#local-baseurl').value || preset.baseUrl).trim().replace(/\/$/, ''),
  };
}

function renderLocalModels(probe = null) {
  const box = $('#local-models');
  if (!box) return;
  box.innerHTML = '';
  if (probe) {
    for (const r of probe.results) {
      const line = document.createElement('div');
      line.className = 'fact';
      line.innerHTML = `<span class="fact-text">${r.ok ? '✅' : '⛔'} ${esc(r.label)} · ${esc(r.baseUrl)}`
        + `${r.ok ? ` · ${r.models.length} โมเดล · ${r.latencyMs} ms` : ` · ${esc(r.error)}`}</span>`;
      box.appendChild(line);
    }
  }
  if (!localModels.length) {
    if (probe) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'ไม่พบโมเดล — เปิด Ollama/LM Studio แล้วดาวน์โหลดโมเดลก่อน (เช่น `ollama pull llama3.1`)';
      box.appendChild(hint);
    }
    return;
  }
  for (const m of localModels) {
    const row = document.createElement('div');
    row.className = 'fact';
    const label = document.createElement('span');
    label.className = 'fact-text';
    label.textContent = `🧠 ${m.id}${m.family ? ` · ${m.family}` : ''}${m.sizeBytes ? ` · ${(m.sizeBytes / 1e9).toFixed(1)} GB` : ''}`;
    const use = document.createElement('button');
    use.textContent = 'ใช้โมเดลนี้';
    use.addEventListener('click', () => {
      $('#local-kind').value = m.kind;
      $('#local-baseurl').value = m.baseUrl;
      const next = saveSettings({
        offlineBrain: { enabled: $('#set-offlinebrain').checked, kind: m.kind, baseUrl: m.baseUrl, model: m.id },
      });
      Object.assign(settings, next);
      $('#local-status').textContent = `เลือก ${m.name} เป็นสมองในเครื่องแล้ว — ${describeLocalBrain(settings)}`;
    });
    row.append(label, use);
    box.appendChild(row);
  }
}

async function scanLocalModels({ force = false } = {}) {
  const target = localTarget();
  if (!force) {
    const cached = localCache.get();
    if (cached && cached.target?.baseUrl === target.baseUrl && cached.target?.kind === target.kind) {
      localModels = cached.models;
      renderLocalModels(cached.probe);
      $('#local-status').textContent = `พบ ${localModels.length} โมเดล (แคช 60 วิ)`;
      return cached;
    }
  }
  $('#local-status').textContent = 'กำลังตรวจ…';
  let result;
  try {
    const res = await fetch(`${String(settings.serverUrl || '').replace(/\/$/, '')}/api/local-models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targets: [target] }),
    });
    if (!res.ok) throw new Error(`server ${res.status}`);
    result = await res.json();
  } catch {
    // ไม่มี server → ยิงตรง (อาจติด CORS แต่ Ollama มักอนุญาต localhost)
    result = await probeLocal({ targets: [target] });
  }
  localModels = Array.isArray(result.models) ? result.models : [];
  localCache.set({ target, probe: result, models: localModels });
  renderLocalModels(result);
  $('#local-status').textContent = localModels.length
    ? `พบ ${localModels.length} โมเดล — เลือกได้เลย`
    : `ไม่พบโมเดล${result.results?.[0]?.error ? ` (${result.results[0].error})` : ''}`;
  return result;
}

function renderLocalBrain() {
  const local = normalizeOfflineBrain(settings.offlineBrain);
  $('#local-kind').value = local.kind;
  $('#local-baseurl').value = local.baseUrl || LOCAL_PRESETS[local.kind].baseUrl;
  $('#set-offlinebrain').checked = local.enabled;
  $('#local-status').textContent = describeLocalBrain(settings) + (local.enabled && !local.model ? ' · ยังไม่ได้เลือกโมเดล' : '');
}

$('#local-scan')?.addEventListener('click', () => { scanLocalModels({ force: true }); });

$('#local-warm')?.addEventListener('click', async () => {
  const target = localTarget();
  const preferred = normalizeOfflineBrain(settings.offlineBrain).model;
  const model = pickBestModel(localModels.length ? localModels : [{ id: preferred }].filter((m) => m.id), preferred);
  if (!model) { $('#local-status').textContent = 'ต้องเลือกโมเดลก่อน (กดตรวจโมเดล)'; return; }
  $('#local-status').textContent = `กำลังอุ่นเครื่อง ${model}… (ครั้งแรกอาจใช้เวลา)`;
  try {
    let result;
    try {
      const res = await fetch(`${String(settings.serverUrl || '').replace(/\/$/, '')}/api/local-models/warm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...target, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `server ${res.status}`);
      result = data;
    } catch {
      result = await warmModel({ ...target, model });
    }
    $('#local-status').textContent = `🔥 ${model} พร้อมใช้ (${(result.ms / 1000).toFixed(1)} วิ)`;
  } catch (e) {
    $('#local-status').textContent = `อุ่นเครื่องไม่สำเร็จ: ${e.message}`;
  }
});

$('#set-offlinebrain')?.addEventListener('change', (e) => {
  const target = localTarget();
  const next = saveSettings({
    offlineBrain: {
      enabled: e.target.checked,
      kind: target.kind,
      baseUrl: target.baseUrl,
      model: normalizeOfflineBrain(settings.offlineBrain).model,
    },
  });
  Object.assign(settings, next);
  $('#local-status').textContent = describeLocalBrain(settings);
});

$('#local-kind')?.addEventListener('change', () => {
  const preset = LOCAL_PRESETS[$('#local-kind').value] || LOCAL_PRESETS.ollama;
  $('#local-baseurl').value = preset.baseUrl;
  localCache.clear();
  localModels = [];
  renderLocalModels();
  $('#local-status').textContent = 'เปลี่ยนชนิดแล้ว — กดตรวจโมเดล';
});

/* ------------------------------------------------------------- control UI */
function renderControl() {
  const policy = normalizeControlPolicy(settings.controlPolicy);
  $('#set-control-enabled').checked = policy.enabled;
  $('#set-control-apps').value = policy.allowApps.join('\n');
  $('#set-control-commands').value = policy.allowCommands.join('\n');
  $('#set-control-rate').value = String(policy.maxPerMinute);

  const audit = new ControlAudit();
  const entries = audit.list().slice(-6).reverse();
  const sum = audit.summary();
  $('#control-audit-summary').textContent = sum.total
    ? `บันทึกไว้ ${sum.total} ครั้ง · อนุญาต ${sum.allowed} · ปฏิเสธ ${sum.blocked}`
    : 'ยังไม่มีประวัติการสั่งงาน';
  $('#control-audit').innerHTML = entries.length
    ? entries.map((e) => `<div class="metric-row"><span>${e.allowed ? '✅' : '⛔'} ${esc(CONTROL_ACTION_META[e.action]?.label || e.action)}</span>`
      + `<span>${esc(e.target || '—')} · ${new Date(e.at).toLocaleTimeString('th-TH')}</span></div>`).join('')
    : '<p class="hint">ยังไม่มีรายการ</p>';
}

function readControlPolicy() {
  return normalizeControlPolicy({
    enabled: $('#set-control-enabled').checked,
    allowApps: $('#set-control-apps').value.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    allowCommands: $('#set-control-commands').value.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    maxPerMinute: Number($('#set-control-rate').value) || 6,
  });
}

$('#control-audit-refresh')?.addEventListener('click', () => renderControl());
$('#control-audit-clear')?.addEventListener('click', () => {
  new ControlAudit().clear();
  renderControl();
});

/* ---------------------------------------------------------------- bots UI */
function botsBase() {
  return String(settings.serverUrl || 'http://localhost:8787').replace(/\/$/, '');
}

async function renderBots() {
  const status = $('#bots-status');
  if (!status) return null;
  try {
    const res = await fetch(`${botsBase()}/api/bots/status`);
    const data = await res.json();
    const tg = data.telegram?.configured ? '✅ พร้อม' : '— ยังไม่ตั้ง TELEGRAM_BOT_TOKEN';
    const line = data.line?.configured ? '✅ พร้อม' : '— ยังไม่ตั้ง LINE token/secret';
    status.textContent = `สมองที่ใช้ตอบ: ${data.provider}${data.model ? ` (${data.model})` : ''} · Telegram: ${tg} · LINE: ${line}`
      + (data.sessions ? ` · ห้องที่คุยอยู่ ${data.sessions}` : '');
    return data;
  } catch {
    status.textContent = 'เชื่อม companion server ไม่ได้ — รัน `npm run server` ก่อน';
    return null;
  }
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    $('#bots-status').textContent = `📋 คัดลอก ${label} แล้ว: ${text}`;
  } catch {
    $('#bots-status').textContent = `${label}: ${text}`;
  }
}

$('#bots-refresh')?.addEventListener('click', () => { renderBots(); });
$('#bots-copy-telegram')?.addEventListener('click', () => copyText(`${botsBase()}/api/telegram/webhook`, 'webhook Telegram'));
$('#bots-copy-line')?.addEventListener('click', () => copyText(`${botsBase()}/api/line/webhook`, 'webhook LINE'));

/* -------- MCP UI -------- */
function mcpSlug(name, url) {
  const base = String(name || url || 'mcp').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'mcp'}-${Math.random().toString(36).slice(2, 6)}`;
}

$('#mcp-add').addEventListener('click', () => {
  const name = $('#mcp-name').value.trim();
  const transport = $('#mcp-transport').value;
  const stdioId = $('#mcp-stdio-id').value;
  const url = transport === 'stdio' ? '' : $('#mcp-url').value.trim();
  if (transport === 'stdio' && !stdioId) {
    $('#mcp-status').textContent = 'ยังไม่มี stdio server — ประกาศ MCP_STDIO_SERVERS ที่ server ก่อน';
    return;
  }
  if (transport !== 'stdio' && !/^https?:\/\//.test(url)) {
    $('#mcp-status').textContent = 'URL ต้องขึ้นต้นด้วย http:// หรือ https://';
    return;
  }
  const oauth = (() => {
    const tokenUrl = $('#mcp-oauth-token').value.trim();
    const authorizeUrl = $('#mcp-oauth-authorize').value.trim();
    if (!tokenUrl || !authorizeUrl) return null;
    return {
      authorizeUrl,
      tokenUrl,
      clientId: $('#mcp-oauth-client').value.trim(),
      scopes: $('#mcp-oauth-scopes').value.trim(),
      deviceAuthorizationUrl: $('#mcp-oauth-device')?.value.trim() || '',
      registrationUrl: $('#mcp-oauth-register')?.value.trim() || '',
    };
  })();
  const id = transport === 'stdio' ? stdioId : mcpSlug(name, url);
  const next = [...(Array.isArray(settings.mcpServers) ? settings.mcpServers : []), {
    id,
    name: name || (transport === 'stdio' ? stdioId : new URL(url).host),
    url,
    apiKey: $('#mcp-apikey').value.trim(),
    transport,
    oauth,
    enabled: true,
  }];
  saveMcpServers(next);
  $('#mcp-name').value = '';
  $('#mcp-url').value = '';
  $('#mcp-apikey').value = '';
  refreshMcp();
});

$('#mcp-transport').addEventListener('change', () => {
  const stdio = $('#mcp-transport').value === 'stdio';
  $('#mcp-stdio-wrap').hidden = !stdio;
  $('#mcp-url').closest('label').hidden = stdio;
  if (stdio) loadStdioServers();
});

/** รายการ stdio MCP server ที่ประกาศไว้ที่ companion server */
async function loadStdioServers() {
  const sel = $('#mcp-stdio-id');
  if (!sel) return;
  const base = String(settings.serverUrl || 'http://localhost:8787').replace(/\/$/, '');
  sel.innerHTML = '<option value="">กำลังโหลด…</option>';
  try {
    const res = await fetch(`${base}/api/mcp/stdio`);
    const data = await res.json();
    const list = Array.isArray(data.servers) ? data.servers : [];
    sel.innerHTML = list.length
      ? list.map((s) => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.command)} ${esc((s.args || []).join(' ')).slice(0, 40)}</option>`).join('')
      : '<option value="">— ไม่มี (ตั้ง MCP_STDIO_SERVERS) —</option>';
  } catch {
    sel.innerHTML = '<option value="">เชื่อม server ไม่ได้</option>';
  }
}

/* ------------------------------- OAuth (PKCE) ------------------------------- */
const OAUTH_PENDING_KEY = 'no7.oauth.pending';

async function startOAuth(serverCfg) {
  if (!serverCfg?.oauth?.authorizeUrl || !serverCfg?.oauth?.tokenUrl) {
    $('#mcp-status').textContent = 'server นี้ยังไม่มีค่า OAuth (authorize/token URL)';
    return;
  }
  try {
    const { verifier, challenge } = await createPkcePair();
    const state = randomState();
    const redirectUri = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}oauth-callback.html`;
    sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({
      id: serverCfg.id, verifier, state, redirectUri,
    }));
    const url = buildAuthorizeUrl({
      authorizeUrl: serverCfg.oauth.authorizeUrl,
      clientId: serverCfg.oauth.clientId,
      redirectUri,
      scopes: String(serverCfg.oauth.scopes || '').split(/\s+/).filter(Boolean),
      state,
      codeChallenge: challenge,
    });
    const popup = window.open(url, 'no7-oauth', 'width=520,height=680');
    if (!popup) $('#mcp-status').textContent = 'เบราว์เซอร์บล็อกหน้าต่างล็อกอิน — อนุญาต popup แล้วลองใหม่';
    else $('#mcp-status').textContent = 'เปิดหน้าต่างล็อกอินแล้ว — ทำต่อในหน้าต่างนั้น';
  } catch (e) {
    $('#mcp-status').textContent = `เริ่ม OAuth ไม่ได้: ${e.message}`;
  }
}

window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'no7-oauth') return;
  const pending = (() => {
    try { return JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) || 'null'); } catch { return null; }
  })();
  const cb = parseCallback(event.data.url || '');
  if (!pending) { $('#mcp-status').textContent = 'ไม่พบข้อมูล OAuth ที่ค้างไว้ — เริ่มใหม่'; return; }
  if (cb.error) {
    $('#mcp-status').textContent = `ผู้ให้บริการปฏิเสธ: ${cb.error} ${cb.errorDescription || ''}`.trim();
    return;
  }
  if (!cb.code || cb.state !== pending.state) {
    $('#mcp-status').textContent = 'ผลลัพธ์ OAuth ไม่ถูกต้อง (state ไม่ตรง) — ลองใหม่';
    return;
  }
  $('#mcp-status').textContent = 'แลก token…';
  try {
    const session = mcp.oauthSession(pending.id);
    if (!session) throw new Error('server นี้ไม่ได้ตั้ง OAuth');
    await session.exchange({ code: cb.code, codeVerifier: pending.verifier, redirectUri: pending.redirectUri });
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    $('#mcp-status').textContent = '✅ ล็อกอินแล้ว — กำลังดึงเครื่องมือ';
    await refreshMcp();
  } catch (e) {
    $('#mcp-status').textContent = `แลก token ไม่ได้: ${e.message}`;
  }
});

/* ------------------- OAuth device flow (รหัส + ลิงก์) ------------------- */
function mcpServerUrl() {
  return String(settings.serverUrl || 'http://localhost:8787').replace(/\/$/, '');
}

function updateMcpOauth(id, patch) {
  const list = (Array.isArray(settings.mcpServers) ? settings.mcpServers : [])
    .map((s) => ((s.id || s.name || s.url) === id ? { ...s, oauth: { ...(s.oauth || {}), ...patch } } : s));
  saveMcpServers(list);
  return list.find((s) => (s.id || s.name || s.url) === id) || null;
}

async function registerMcpClient(cfg) {
  const oauth = cfg?.oauth || {};
  if (!oauth.registrationUrl) throw new Error('server นี้ยังไม่มี Registration URL');
  $('#mcp-status').textContent = 'กำลังขอ client id (DCR)…';
  const reg = await registerClient({
    registrationUrl: oauth.registrationUrl,
    redirectUris: [`${location.origin}${location.pathname.replace(/[^/]*$/, '')}oauth-callback.html`],
    scopes: String(oauth.scopes || '').split(/\s+/).filter(Boolean),
    serverUrl: mcpServerUrl(),
  });
  updateMcpOauth(cfg.id, { clientId: reg.clientId, clientSecret: reg.clientSecret || '' });
  return reg;
}

async function startDeviceLogin(cfg) {
  const serverUrl = mcpServerUrl();
  try {
    if (!cfg?.oauth?.deviceAuthorizationUrl) {
      $('#mcp-status').textContent = 'server นี้ยังไม่มี Device Authorization URL';
      return;
    }
    if (!cfg.oauth.clientId && cfg.oauth.registrationUrl) {
      const reg = await registerMcpClient(cfg);
      cfg = { ...cfg, oauth: { ...cfg.oauth, clientId: reg.clientId, clientSecret: reg.clientSecret || '' } };
    }
    if (!cfg.oauth.clientId) {
      $('#mcp-status').textContent = 'ต้องมี client id ก่อน — ใส่ในช่อง OAuth หรือตั้ง Registration URL';
      return;
    }

    $('#mcp-status').textContent = 'กำลังขอรหัสล็อกอิน…';
    const code = await requestDeviceCode({
      deviceAuthorizationUrl: cfg.oauth.deviceAuthorizationUrl,
      clientId: cfg.oauth.clientId,
      scope: String(cfg.oauth.scopes || '').split(/\s+/).filter(Boolean).join(' '),
      serverUrl,
    });

    const link = code.verificationUriComplete || code.verificationUri;
    $('#mcp-status').textContent = `🔢 ไปที่ ${code.verificationUri || link} แล้วกรอกรหัส ${code.userCode} (หมดอายุใน ${Math.round(code.expiresIn / 60)} นาที)`;
    if (link) {
      try {
        const popup = window.open(link, 'no7-oauth-device', 'width=520,height=680');
        if (!popup) $('#mcp-status').textContent += ' · เบราว์เซอร์บล็อกหน้าต่าง — เปิดลิงก์เองได้';
      } catch {
        $('#mcp-status').textContent += ' · เปิดลิงก์เองได้';
      }
    }

    const tokens = await pollDeviceToken({
      deviceCode: code.deviceCode,
      tokenUrl: cfg.oauth.tokenUrl,
      clientId: cfg.oauth.clientId,
      clientSecret: cfg.oauth.clientSecret || '',
      scope: String(cfg.oauth.scopes || '').split(/\s+/).filter(Boolean).join(' '),
      interval: code.interval,
      expiresAt: code.expiresAt,
      serverUrl,
      onPending: ({ status, interval }) => {
        $('#mcp-status').textContent = status === 'slow_down'
          ? `รอช้าลงเป็น ${interval} วิ… (ผู้ให้บริการขอ slow_down)`
          : `รอการยืนยันรหัส ${code.userCode}… (ทุก ${interval} วิ)`;
      },
    });

    const session = mcp.oauthSession(cfg.id);
    if (!session) throw new Error('server นี้ไม่ได้ตั้ง OAuth');
    session.store.set(session.name, tokens);
    $('#mcp-status').textContent = '✅ ล็อกอินด้วยรหัสสำเร็จ — กำลังดึงเครื่องมือ';
    await refreshMcp();
  } catch (e) {
    $('#mcp-status').textContent = `ล็อกอินด้วยรหัสไม่สำเร็จ: ${e.message}`;
  }
}

$('#mcp-refresh').addEventListener('click', () => { refreshMcp(); });

$('#mcp-list').addEventListener('click', (e) => {
  const row = e.target.closest('.mcp-row');
  if (!row) return;
  const id = row.dataset.id;
  const list = Array.isArray(settings.mcpServers) ? settings.mcpServers : [];
  if (e.target.matches('[data-mcp-device]')) {
    const cfg = mcp.configFor(id) || (Array.isArray(settings.mcpServers) ? settings.mcpServers.find((x) => (x.id || x.name || x.url) === id) : null);
    startDeviceLogin(cfg);
    return;
  }
  if (e.target.matches('[data-mcp-register]')) {
    const cfg = mcp.configFor(id) || (Array.isArray(settings.mcpServers) ? settings.mcpServers.find((x) => (x.id || x.name || x.url) === id) : null);
    registerMcpClient(cfg)
      .then((reg) => { $('#mcp-status').textContent = `✅ ได้ client id: ${reg.clientId}`; renderMcp(); })
      .catch((err) => { $('#mcp-status').textContent = `ขอ client id ไม่ได้: ${err.message}`; });
    return;
  }
  if (e.target.matches('[data-mcp-oauth]')) {
    const cfg = mcp.configFor(id) || (Array.isArray(settings.mcpServers) ? settings.mcpServers.find((x) => (x.id || x.name || x.url) === id) : null);
    startOAuth(cfg ? { ...cfg, oauth: cfg.oauth || mcp.configFor(id)?.oauth } : null);
    return;
  }
  if (e.target.matches('[data-mcp-remove]')) {
    saveMcpServers(list.filter((s) => (s.id || s.name || s.url) !== id));
    mcp.hydrateFromCache();
    applyMcpTools();
    renderToolsGrid(true);
    refreshMcp();
  }
});

$('#mcp-list').addEventListener('change', (e) => {
  if (!e.target.matches('[data-mcp-toggle]')) return;
  const row = e.target.closest('.mcp-row');
  const id = row?.dataset.id;
  const list = (Array.isArray(settings.mcpServers) ? settings.mcpServers : [])
    .map((s) => ((s.id || s.name || s.url) === id ? { ...s, enabled: e.target.checked } : s));
  saveMcpServers(list);
  mcp.hydrateFromCache();
  applyMcpTools();
  renderToolsGrid(true);
  refreshMcp({ quiet: true });
});

$('#save-settings-btn').addEventListener('click', () => {
  settings = saveSettings(collectSettings());
  sm.set({ hasProvider: hasProviderConfigured(settings), error: null });
  updatePersonaHeader();
  renderModeChips();
  renderToolsGrid(true);
  syncWake();
  $('#settings-status').textContent = '✅ บันทึกแล้ว (เก็บในเครื่องนี้เท่านั้น)';
  if (Array.isArray(settings.mcpServers) && settings.mcpServers.length) {
    mcp.hydrateFromCache();
    applyMcpTools();
    refreshMcp({ quiet: true });
  }
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

$('#set-ttsprovider').addEventListener('change', (e) => {
  const p = TTS_PROVIDERS[e.target.value];
  $('#tts-provider-hint').textContent = p.desc;
  $('#tts-openai-fields').hidden = !p.needsServer;
  // เปลี่ยนผู้ให้บริการ = ใช้ค่าเริ่มต้นของเจ้านั้น (ไม่พาค่าเดิมข้ามเจ้ามาปน)
  const cfg = resolveTTSConfig({ ttsProvider: e.target.value, ttsCache: settings.ttsCache });
  $('#set-ttsmodel').value = cfg.model;
  $('#set-ttsvoice').value = cfg.voice;
  renderTTSVoiceOptions(e.target.value, cfg.voice);
});

$('#set-rate').addEventListener('input', (e) => { $('#out-rate').textContent = Number(e.target.value).toFixed(2); });
$('#set-pitch').addEventListener('input', (e) => { $('#out-pitch').textContent = Number(e.target.value).toFixed(2); });
$('#sync-test-btn').addEventListener('click', async () => {
  const url = ($('#set-serverurl').value || '').trim().replace(/\/$/, '');
  $('#sync-status').textContent = 'กำลังทดสอบ…';
  try {
    const r = await fetch(`${url}/api/health`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const h = await r.json();
    $('#sync-status').textContent = `✅ เชื่อมต่อได้ (v${h.version}) · sync ${h.sync?.requiresToken ? 'ต้องใช้ token' : 'เปิดอยู่'}`;
  } catch (e) {
    $('#sync-status').textContent = `❌ ${e.message} — เปิด npm run server แล้วหรือยัง?`;
  }
});

function bundleNow() {
  return collectBundle({
    memory,
    personas: customPersonas(),
    calendar: calendar.all(),
    tasks: tasks.exportData().tasks,
    settings,
  });
}

$('#sync-push-btn').addEventListener('click', async () => {
  settings = saveSettings({ serverUrl: $('#set-serverurl').value.trim(), syncToken: $('#set-synctoken').value.trim() });
  $('#sync-status').textContent = 'กำลังอัปโหลด…';
  try {
    const res = await pushBundle(settings.serverUrl, settings.syncToken, bundleNow());
    $('#sync-status').textContent = `✅ อัปโหลดแล้ว ${res.persisted ? '(บันทึกลงไฟล์)' : '(เก็บในหน่วยความจำ)'}`;
  } catch (e) { $('#sync-status').textContent = `❌ ${e.message}`; }
});

$('#sync-pull-btn').addEventListener('click', async () => {
  settings = saveSettings({ serverUrl: $('#set-serverurl').value.trim(), syncToken: $('#set-synctoken').value.trim() });
  $('#sync-status').textContent = 'กำลังดาวน์โหลด…';
  try {
    const bundle = await pullBundle(settings.serverUrl, settings.syncToken);
    if (!bundle) { $('#sync-status').textContent = 'ยังไม่มีข้อมูลบน server'; return; }
    const res = mergeBundle(bundle, {
      memory,
      createPersona,
      getPersona,
      listPersonas: allPersonas,
      calendar,
    });
    renderMemory(); renderCalendar(); renderPersonaList(); renderSettingsForm();
    $('#sync-status').textContent = `✅ ผสานแล้ว: ความจำ +${res.facts} · persona +${res.personas} · นัด +${res.events} · งาน ${res.tasks || 0}`;
    renderTasks();
    pushRemindersToServer();
  } catch (e) { $('#sync-status').textContent = `❌ ${e.message}`; }
});

$('#test-voice-btn').addEventListener('click', async () => {
  $('#voice-status').textContent = 'กำลังพูดทดสอบ…';
  const testSettings = { ...settings, ...collectSettings() };
  const tester = new TTSRouter({ settings: () => testSettings, voice, serverUrl: () => testSettings.serverUrl });
  tester.onFallback = (err) => { $('#voice-status').textContent = `คุณภาพสูงใช้ไม่ได้ (${err.message}) — ใช้เสียงเครื่องแทน`; };
  await tester.speak('สวัสดีครับ ผมคือ No7 ผู้ช่วยส่วนตัวของคุณ', {
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

$('#set-persona').addEventListener('change', (e) => {
  settings = saveSettings({ persona: e.target.value });
  updatePersonaHeader();
  renderPersonaList();
  const p = getPersona(e.target.value);
  setSubtitle(p.greeting || `${p.name} พร้อมช่วยแล้ว`);
});

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

/* ------------------------------------------------------- keyboard shortcuts */
function isTyping(el) {
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;

  if (e.key === 'Escape') {
    if (!$('#confirm-modal').hidden) { $('#confirm-no').click(); e.preventDefault(); return; }
    if (!$('#stop-btn').hidden) { stopAll('หยุดด้วยแป้น Esc'); e.preventDefault(); return; }
    $('#sidebar').classList.remove('open');
    return;
  }

  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    showView('chat');
    $('#input')?.focus();
    return;
  }
  if (mod && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    $('#mic-btn').click();
    return;
  }
  if (mod && e.key === 'Enter' && !isTyping(document.activeElement)) {
    e.preventDefault();
    $('#composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
});

/* -------------------------------------------------------------- startup */
startDailyConsolidation(memory, () => consolidate(memory, { chat: llmChat, useLLM: !!settings.memoryLLM }));

function syncOnlineState() {
  const offline = !navigator.onLine;
  const banner = $('#offline-banner');
  if (offline) {
    banner.hidden = false;
    banner.textContent = tr('status.offline', { lang: settings.uiLang });
  } else if (banner.textContent.startsWith('⚠️ ออฟไลน์')) {
    banner.hidden = true;
  }
}
window.addEventListener('online', () => { syncOnlineState(); flushOutbox(); });
window.addEventListener('offline', syncOnlineState);
syncOnlineState();

// PWA shortcut / deep link: ?view=memory
const bootView = new URLSearchParams(location.search).get('view');
if (bootView && document.getElementById(`view-${bootView}`)) showView(bootView);

taskScheduler.start();
renderTasks();
renderReminderStatus().then(() => pushRemindersToServer({ immediate: true }));
scheduleReminderPolling();

mcp.hydrateFromCache();
applyMcpTools();
renderMcp();
renderSettingsForm();
applyUiLang(settings.uiLang);
renderLocalBrain();
renderModeChips();
renderToolsGrid();
if (Array.isArray(settings.mcpServers) && settings.mcpServers.length) refreshMcp({ quiet: true });
restoreReminders();
renderRecipeOptions();
addMessage('bot', getPersona(settings.persona).greeting
  || `สวัสดีครับ ผม ${getPersona(settings.persona).name} 👋\nพิมพ์คุยได้เลย หรือกด 🎤 เพื่อพูด\n\nลองถาม: "อากาศกรุงเทพวันนี้", "ราคาบิทคอยน์", "ตั้งเวลา 5 นาที"`);
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
