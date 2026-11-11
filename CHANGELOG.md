# Changelog

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชัน: SemVer

## [2.2.0] — 2026-11-10

รอบที่เจ็ด: ทำให้ข้อมูลที่สะสมไว้ "หาเจอ" และ "ย้ายเครื่องได้" — command palette ที่ค้นทุกอย่าง,
ไฟล์สำรอง schema ใหม่ที่ตรวจสอบได้ และกู้คืนแบบ dry-run ก่อนเขียนทับ

### เพิ่ม
**V1 — ค้นหาทุกอย่าง (⌘/Ctrl+K)**
- `core/search.js`: `buildIndex` (ความจำ/โน้ต/รายการ/งาน/นัด/เครื่องมือ/เมนู/คำสั่ง) + `searchIndex`
  (exact > prefix > substring > token, น้ำหนักชนิด, โบนัสความใหม่/pinned) + จำกัดผลลัพธ์ต่อชนิด
- `groupResults`, `matchRanges`, `highlightRanges` (ตำแหน่งบนข้อความดิบ — ปลอดภัยกับวรรณยุกต์ไทย),
  `defaultPaletteExtras()` (เมนู 7 หน้า + 3 คำสั่ง)
- UI `#palette`: เปิดด้วย ⌘/Ctrl+K, ↑↓/Enter/Esc, คลิกพื้นหลังปิด, ไฮไลต์คำค้นด้วย `<mark>`
- การกระทำ: เปลี่ยนหน้า, ค้นความจำทันที, แสดงงาน/นัด/เครื่องมือ, `สรุปวันนี้`, `หยุดทุกอย่าง`, เริ่มแชทใหม่
- `docs/SEARCH.md`

**V2 — สำรอง / กู้คืน (schema 2)**
- `core/backup.js`: `createBackup` (+ counts + checksum), `redactSettings`/`hasSecrets`,
  `validateBackup` (string/object, migrate export รุ่นเก่า, เตือนเมื่อ checksum ไม่ตรง),
  `summarizeBackup`, `mergeRecords` (last-write-wins ต่อคอลเลกชัน), `planRestore`/`describePlan`
- UI: ส่งออกเป็น schema 2 (ไม่มีคีย์), นำเข้าไฟล์ด้วย `FileReader` → dry-run สรุปในกล่องยืนยัน → merge
- `docs/BACKUP.md`

### เปลี่ยน
- `Ctrl/Cmd+K` เปิด command palette (เดิมโฟกัสช่องแชท) · `Esc` ปิด palette ก่อน modal อื่น
- `downloadJson` คืนสถานะและไม่ล้มในสภาพแวดล้อมที่ไม่มี object URL

### แก้
- กัน `tasks`/`calendar` ถูกอ้างก่อนประกาศในโค้ด digest (TDZ) ด้วย closure

## [2.1.0] — 2026-11-10

รอบที่หก: "ทำงานหลายขั้น" กลายเป็นสิ่งที่มองเห็นและหยุดได้, No7 สรุปวันให้ทุกเช้า,
และผู้ใช้ต่อยอดเครื่องมือของตัวเองได้ด้วยปลั๊กอิน HTTP โดยไม่ต้องแตะโค้ด

### เพิ่ม
**U1 — Timeline + หยุดกลางทาง**
- `core/timeline.js`: `AgentTimeline` แปลง event เป็นขั้นตอน (running/ok/error/denied/cancelled)
  + `summary()`, `headline()`, `toRows()`, `toMarkdown()`
- `core/agent.js`: `cancel()` ตรวจธง 3 จุด (ก่อนรอบใหม่ / หลังได้คำตอบ / หลังกล่องยืนยัน)
  → event `cancelled` และผลลัพธ์ `{ cancelled: true }` พร้อมสรุปสิ่งที่ทำไปแล้ว
- UI: แผง `#run-timeline` เห็นทุกขั้นสด ๆ, ปุ่ม ⏹ และ `Esc` เรียก `stopAll()` (ยกเลิกงาน + หยุดเสียง)
- `docs/AGENT.md`

**U2 — สรุปประจำวัน**
- `core/digest.js`: `buildDigest` จัดกลุ่มเกินกำหนด/วันนี้/นัดหมาย/48 ชม./งานถัดไป/ความจำใหม่/ไม่มีกำหนด
  + `digestMarkdown` + `toMs` (รับ ISO string จาก TaskStore) + `shouldAutoDigest`
- tool `digest` (dynamic, risk 0) ให้ AI ตอบ "วันนี้มีอะไรต้องทำ" ได้เอง
- UI: ปุ่ม 🌅 สรุปวันนี้ + การ์ด + โพสต์ในแชท + สรุปอัตโนมัติครั้งแรกของวันหลัง 07:00 (opt-in)
- `docs/DIGEST.md`

**U3 — ปลั๊กอินเครื่องมือ HTTP**
- `core/custom-tools.js`: JSON-defined tools (`plugin__<id>`), `renderTemplate` (ไม่มี eval),
  `fillArgs` (เฉพาะพารามิเตอร์ที่ประกาศ), `buildHttpTool` (fetch inject ได้)
- ความปลอดภัย: https เท่านั้น, บล็อก localhost/วง LAN, `assertSafeUrl` ตรวจซ้ำตอนยิงจริง,
  timeout 10 วิ, ตัด response 64 KB, risk ≥ 1 ต้องยืนยัน
- UI: ช่อง JSON + ตัวอย่าง/ตรวจสอบ/บันทึก + รายการ + ลงทะเบียนผ่าน `refreshDynamicTools()`
- `docs/PLUGINS.md`

### เปลี่ยน
- เครื่องมือในหน้าเครื่องมือ = 29 (28 เดิม + `digest`) และเพิ่มตามปลั๊กอินที่เปิด
- `tools-note` แสดงตัวหารจาก `allToolIds()` (รวม dynamic)

### แก้
- digest ต้องแปลง `due` ที่เป็น ISO string ก่อนเปรียบเทียบเวลา (เดิมงานหายจากสรุป)
- digest tool สร้างด้วย closure แทน getter เพื่อไม่ให้แตะ `tasks` ก่อนประกาศ (TDZ)

## [2.0.0] — 2026-11-10

รอบที่ห้า: ยกระดับจาก "ผู้ช่วยที่ใช้ได้" → "ผู้ช่วยที่ไว้ใจได้ทุกวัน" — เสียงพรีเมียม, สมองในเครื่อง
สองภาษา, ด่านคุณภาพที่วัดได้ และการอัปเดตที่ไม่ต้องโหลดใหม่ทั้งแอป

### เพิ่ม
**T1 — เสียงพรีเมียม + แคช**
- `core/tts.js`: provider `elevenlabs` (multilingual v2, `xi-api-key`, mp3_44100_128),
  ค่าเริ่มต้นต่อ provider, `resolveTTSConfig` ไม่พาค่าเก่าข้าม provider
- `AudioCache` (20 รายการ / 5 MB, key = provider|voice|model|lang|text) — ผลลัพธ์ `{engine, cached}`
- server `POST /api/tts` รองรับ ElevenLabs · `docs/VOICE.md` อัปเดต

**T2 — สมองในเครื่อง (Ollama / LM Studio)**
- `core/local-models.js`: `LOCAL_PRESETS`, `probeLocal` (timeout 4s, cache 60s), `matchModel`/`pickBestModel`,
  `warmModel`, `offlineChainSettings`, `normalizeOfflineBrain`
- สลับอัตโนมัติเมื่อออฟไลน์ → `costMode: private`, `provider: ollama`, ไม่ใช้คีย์
- server `/api/local-models` + `/warm` พร้อม guard กัน SSRF (`NO7_LOCAL_ALLOW_REMOTE=1` สำหรับกรณีพิเศษ)
- UI แผง "🧠 สมองในเครื่อง" (สแกน/อุ่นเครื่อง/สถานะ) · `docs/LOCAL_MODELS.md`

**T3 — สองภาษา ไทย/อังกฤษ**
- `core/i18n.js`: `LANGS`, `DICT` th/en (คีย์ตรงกันบังคับด้วยเทสต์), `t()` + interpolation, `applyI18n`,
  `langOf`, `detectLang`, `viewTitle`
- `settings.uiLang` + `#set-uilang` — สลับทันทีไม่ต้องรีโหลด, อัปเดต `<html lang>`
- ~90 จุดผ่าน `data-i18n` / `-placeholder` / `-title` · `docs/I18N.md`

**T4 — คุณภาพที่วัดได้**
- `tools/perf.js` + `perf-budget.json` + `npm run perf` (source + gzip bundle, exit 1 เมื่อเกิน) เข้า CI
- E2E เพิ่มเส้นทางงานซ้ำ (เลื่อนรอบ) → 97 checks · `docs/QUALITY.md`

**T5 — อัปเดตเวอร์ชัน + release**
- `desktop/updater.js`: opt-in `NO7_AUTO_UPDATE=1` (packaged เท่านั้น), feed/channel/delay ปรับได้,
  แจ้งเตือนทุกขั้น, ติดตั้งตอนปิดแอป, เมนู tray "ตรวจอัปเดต"
- `.github/workflows/release.yml`: verify → matrix linux/mac/win → draft GitHub Release + `latest*.yml`
- `build.publish` (GitHub) + `electron-updater` · `docs/BUILD.md` §2.1

### เปลี่ยน
- เวอร์ชัน 2.0.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics) — `window.NO7_VERSION` มาจาก build
- CI รัน `npm run perf` หลัง build

### แก้
- `renderTTSVoiceOptions` ถูกประกาศซ้อนในฟังก์ชัน → ย้ายไป module scope
- เปลี่ยน provider แล้วไม่พา model/voice เดิมข้าม (กันค่าไม่ตรง)

## [1.5.0] — 2026-11-10

รอบที่สี่: ลงลึกที่อุปกรณ์และความต่อเนื่อง — งานซ้ำที่เตือนได้แม้ปิดแอป, รู้จักหน้าต่างบนจอ
พร้อมสูตรอัตโนมัติ, Phone-Link ครบวงจร (hello/eyes/voice) และ MCP OAuth ที่ไม่ต้องมี redirect

### เพิ่ม
**S1 — งานซ้ำ + เตือนผ่าน server**
- `core/tasks.js`: `normalizeRecurrence` (daily/weekdays/weekly/monthly/hourly + interval/weekday/at),
  `nextOccurrence`, `describeRecurrence`; `complete()` บนงานซ้ำเลื่อนรอบถัดไปแทนการปิด (`repeatCount`)
- tool `task` รับ `repeat` · UI เลือกความถี่ + แสดง 🔁 + รอบถัดไป
- server: `PUT /api/reminders`, `GET /api/reminders/due|upcoming|status`, `POST /api/reminders/ack`,
  tick `NO7_REMINDER_TICK_MS`, ส่ง Telegram (`TELEGRAM_REMINDER_CHAT_ID`) และเลื่อนงานซ้ำเอง
- แอป push งานขึ้น server + poll due ทุก 60 วิ/ตอนกลับมาโฟกัส + แสดงสถานะ server
- `NO7_DATA_DIR` สำหรับแยกข้อมูล (ใช้ในเทสต์) · `docs/TASKS.md`

**S2 — Desktop awareness + automation**
- `core/desktop.js`: อ่าน/จับคู่/โฟกัสหน้าต่าง (powershell/osascript/wmctrl), recipes 5 ขั้น
  (open_app/open_url/focus_window/wait/notify) ≤8 ขั้น, dry-run, `RecipeStore` (localStorage)
- Electron IPC `no7:list-windows` / `no7:focus-window` (คำสั่งคงที่ ไม่มี shell)
- tool ใหม่ `desktop` + `run_recipe` — **28 tools** · หน้า 🖥️ เดสก์ท็อป · `docs/DESKTOP.md`

**S3 — Phone-Link ครบวงจร**
- `POST/GET /api/link/hello` (capabilities + `.no7/devices.json`),
  `POST/GET /api/link/eyes` (อารมณ์ + ttl → stale), `POST /api/link/voice`,
  `GET /api/link/voice?since`, `/voice/status`, `POST /voice/ack` (คิว ≤2 MB)
- client: `helloDevice`, `sendEyes`, `getEyes`, `sendVoiceChunk`, `pullVoice`, `voiceStatus`, `ackVoice`
- ESP32 header: `hello` / `onEyes`+`pollEyes` / `sendEyes` / `sendVoice` · แผงในหน้า 🔗 อุปกรณ์
- `docs/DEVICES.md`, `docs/PHONE_LINK.md`

**S4 — MCP OAuth: device flow + DCR**
- `core/oauth.js`: `requestDeviceCode`, `requestDeviceToken`, `pollDeviceToken`
  (pending/slow_down/expired_token/access_denied/timeout), `registerClient` (RFC 7591), `oauthMethodFor`
- server proxies `/api/oauth/device` และ `/api/oauth/register`; `/api/oauth/token` ส่ง `device_code`
- UI: ช่อง Device/Registration URL + ปุ่ม 🔢 ล็อกอินด้วยรหัส (แสดงรหัส/ลิงก์) + 🆕 ขอ client id
- `docs/OAUTH.md`

### เปลี่ยน
- `MCP_CLIENT_INFO.version` = 1.5.0, diagnostics ใช้ 1.5.0
- tool ทั้งหมด **28 ตัว** (auto 28, hub 21) — อัปเดตเทสต์/smoke ตามจำนวนจริง
- `/api/link/status` รายงาน device/eyes/voice เพิ่ม

### ตัวเลข
- 266 unit tests · 82 end-to-end checks · 75 JS files · 28 tools + MCP tools แบบ dynamic · 20 docs

## [1.4.0] — 2026-11-10

รอบที่สาม: ให้ No7 ออกไปทำงานนอกแอป — MCP แบบ local process + OAuth, บอท Telegram/LINE,
ควบคุมคอมพิวเตอร์แบบมี allowlist และงาน/แจ้งเตือนที่ตามข้ามเครื่องได้

### เพิ่ม
**R6 — MCP ลึกขึ้น**
- stdio bridge ที่ companion server: ประกาศ `MCP_STDIO_SERVERS`, spawn/cache process, newline JSON-RPC,
  timeout 25 วิ, stderr tail, `GET /api/mcp/stdio`
- client รองรับ `transport: 'stdio'` + UI เลือก server ที่ประกาศไว้
- OAuth 2.0 + PKCE (`core/oauth.js`): authorize URL builder, token exchange/refresh, `TokenStore`,
  `OAuthSession` (single-flight refresh), `/api/oauth/token` proxy, `oauth-callback.html`, ปุ่ม 🔑 ในหน้าตั้งค่า
- `docs/OAUTH.md` + อัปเดต `docs/MCP.md`

**R7 — บอทแชท**
- `server/bots.js`: normalize Telegram/LINE, ตรวจ signature, `BotSessions` (TTL 2 ชม.),
  คำสั่ง `/start` `/help` `/clear` `/tools`, ตัดข้อความยาวเป็นก้อน
- `POST /api/telegram/webhook` (secret header, ACK ก่อนแล้วตอบ async), `POST /api/line/webhook`,
  `GET /api/bots/status`
- หน้าตั้งค่า: แผงบอท + ปุ่มคัดลอก webhook URL · `docs/BOTS.md`

**R8 — Computer control**
- `core/control.js`: policy ปิดโดยค่าเริ่มต้น, allowlist แบบ glob, deny patterns, กัน shell operator,
  rate limit ต่อนาที, `ControlAudit` (`no7.control.audit.v1`)
- tool ใหม่ `control_run` (risk 3) — 26 tools
- Electron: preload expose `openApp`/`copyText`/`notify`/`runCommand`/`controlInfo`,
  main process รัน `execFile` แบบไม่มี shell ภายใต้ `NO7_CONTROL_ALLOW_COMMANDS`
- หน้าตั้งค่า: switch, allowlist 2 ชุด, rate, audit log · `docs/CONTROL.md`

**R9 — งาน + เตือนข้ามเครื่อง**
- `core/tasks.js`: `TaskStore`, `parseDue` (ISO/±เวลา/คำไทย), `mergeTaskLists` (LWW + tombstone),
  `TaskScheduler` (ทุก 30 วิ → Notification + แชท) + `no7.tasks.v1`
- tool ใหม่ `task` (risk 1) + แผงงานในแท็บตารางนัด (เพิ่ม/เสร็จ/ลบ/กรอง/สถิติ)
- ซิงก์งานผ่าน `collectBundle`/`mergeBundle` · `docs/TASKS.md`

### เปลี่ยน
- `MCP_CLIENT_INFO.version` = 1.4.0 และ diagnostics ใช้ 1.4.0
- tool ทั้งหมด **26 ตัว** (auto mode 26, hub 19) — อัปเดตเทสต์/smoke ตามจำนวนจริง

### แก้ไข
- คุณภาพโค้ด: กัน `${...}` ในเทมเพลตไปรบกวน regex escape ของ `matchesGlob` (ใช้ค่าคงที่นอกเทมเพลต)
- `replyLine`/`sendTelegramMessage` ส่ง arguments ครบเมื่อไม่ inject fetch (เดิม fallback ตัด options ทิ้ง)

### ตัวเลข
- 232 unit tests · 72 end-to-end checks · 70 JS files · 26 tools + MCP tools แบบ dynamic

## [1.3.0] — 2026-11-10

รอบที่สอง: เสียงสองทาง (พูดขัดจังหวะได้ + TTS ระดับพรีเมียม), MCP, ความเสถียรบนมือถือ
และการวัดผล/รายงานปัญหาที่ปลอดภัย — ยังคงโค้ดชุดเดียวสำหรับมือถือและ PC

### เพิ่ม
**R1 — ความเสถียรบนมือถือ**
- PWA `shortcuts` 4 ทางลัด (`?view=chat|memory|calendar|devices`) + `id`/`categories` ใน manifest
- `core/capabilities.js`: ตรวจ 15 ความสามารถ + ขอสิทธิ์ไมโครโฟน/แจ้งเตือน + แผงสถานะในหน้าตั้งค่า
- `core/storage.js`: สรุปการใช้พื้นที่, ขอ persistent storage, ล้างข้อมูลเป็นกลุ่ม, ตรวจจับ quota
- แถบออฟไลน์ + แจ้งเตือนเมื่อเขียน localStorage ไม่สำเร็จ (`no7:storage-error`)
- `docs/MOBILE.md`

**R2 — Barge-in + TTS**
- `core/bargein.js`: พูดขัดจังหวะได้ (`off` / `keyword` / `any`) พร้อมกันเสียงสะท้อนของตัวเอง (`isEcho`)
- `core/tts.js`: router 3 ผู้ให้บริการ — เสียงเครื่อง / OpenAI-compatible / ปิดเสียง พร้อม fallback อัตโนมัติ
- `POST /api/tts` ที่ companion server (ใช้ `OPENAI_API_KEY` ของ server หรือ key ในเครื่อง)
- ตั้งค่า `ttsProvider`, `ttsVoice`, `ttsModel`, `ttsBaseUrl`, `ttsApiKey`, `bargeIn` + UI

**R3 — MCP**
- `core/mcp.js`: MCP client JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) รองรับ JSON + SSE + `mcp-session-id`
- Dynamic tool registry: MCP tools เข้า agent loop / prompt / tools grid ในชื่อ `mcp__<server>__<tool>`
- หมวดสิทธิ์ใหม่ `mcp` (risk 2 = ถามก่อน) + UI เพิ่ม/เปิดปิด/ค้นหา server + cache `no7.mcp.tools.v1`
- `POST /api/mcp` proxy (allow-list headers) + `docs/MCP.md`

**R4 — Reliability & Performance**
- `core/retry.js`: classify error + exponential backoff พร้อม jitter, retry เฉพาะก่อน token แรก
- Offline outbox `no7.outbox.v1`: เก็บข้อความตอนออฟไลน์แล้วส่งอัตโนมัติเมื่อกลับมาออนไลน์
- `core/metrics.js`: first token / total / tool / tts + p50/p95 + แผงสถิติในหน้าตั้งค่า
- `core/diagnostics.js`: รายงาน markdown ที่ปิด key/token/อีเมล/เบอร์โทร + คัดลอก/ดาวน์โหลด
- `docs/RELIABILITY.md`

### เปลี่ยน
- `GET /api/health` อ่านเวอร์ชันจาก `package.json` (ไม่ต้องแก้สองที่)
- เครื่องมือทั้งหมดเรียกผ่าน `getTool()`/`allToolIds()` เพื่อรองรับเครื่องมือ dynamic
- `Agent` มี hook `onToolTiming` สำหรับวัดเวลาต่อเครื่องมือ

### แก้ไข
- เทสต์ `memory: importance boosts ranking` เปราะเพราะใช้ localStorage ร่วมกันและ timestamp ชนกัน — เคลียร์ store และหาข้อเท็จจริงตามเนื้อหาแทน

### ตัวเลข
- 177 unit tests · 60 end-to-end checks · 59 JS files · 24 tools ในเครื่อง + MCP tools ตามที่ server ประกาศ

## [1.0.0] — 2026-11-10

รุ่นแรกที่ครบวงจร: โค้ดชุดเดียวรันบนมือถือและ PC พร้อมความจำ เสียง เครื่องมือ การซิงก์ และการสั่งงานอุปกรณ์

### เพิ่ม
**รากฐาน (เฟส 0)**
- `web/` PWA ชุดเดียวจบ: แชทไทย, อวาตาร์ 14 อารมณ์, state machine ที่ derive จากข้อเท็จจริง
- `desktop/` Electron host: tray, hotkey ระดับระบบ, overlay always-on-top, bridge (clipboard/open-app/notify)
- `mobile/` Capacitor host ใช้ `dist/` เดียวกัน
- `server/` zero-dependency: static, AI proxy, tool API, HMAC pairing

**เฟส 1 — ความจำ 2.0**
- MemoryStore v2: pin, แก้ไข, ตัวนับการใช้งาน, BM25 × importance × recency × pin, decay, stats, export/import, pruning, migration จาก v1
- Consolidation engine: heuristic ไทย/อังกฤษ + LLM (opt-in) + merge ซ้ำ + ตารางรายวัน
- หน้าความจำ: การ์ดสถิติ, ตัวกรอง, แก้ inline, นำเข้า/ส่งออก, รันสรุปเอง

**เฟส 2 — เสียง 2.0**
- สตรีมคำตอบแบบ SSE/NDJSON จาก Pollinations/OpenAI/Ollama/Gemini + fallback ที่ไม่ปนข้อความ
- `SentenceSplitter` + `SpeechQueue` ให้เริ่มพูดก่อนคำตอบจบ (และหยุดทันทีถ้าเป็น tool call)
- Wake word "No7" (ไทย/อังกฤษ) + pause ขณะพูด + cooldown
- ปรับ rate/pitch/เสียง, ปุ่มหยุดพูด

**เฟส 3 — Persona Studio**
- สร้าง/แก้/ทำสำเนา/ลบ persona ได้เอง (สูงสุดตาม limit ที่กำหนด)
- คำทักทาย, หัวข้อต้องห้าม, สไตล์เสียงต่อ persona

**เฟส 4 — Connectors & Sync**
- ปฏิทินในเครื่อง + นำเข้า/ส่งออก `.ics` + tools `calendar_add`/`calendar_list`
- `rss_read`, `summarize_url` + `/api/fetch` proxy แก้ปัญหา CORS
- ซิงก์ข้ามเครื่องผ่าน `/api/sync` (token, additive merge, ตัด secret ออก)

**เฟส 5 — Device Hub**
- HMAC canonical signing, device registry, `/api/link/command|poll|status|result|results`
- UI อุปกรณ์ + tool `device_command` (risk 3 ต้องยืนยัน)
- ESP32 reference client (`devices/esp32/no7_link.h`)

**เฟส 6 — Ship**
- GitHub Actions CI (Node 20/22): check → test → browser smoke → build → artifact
- คีย์ลัด, focus ring, aria labels, การจัดการโฟกัสในกล่องยืนยัน
- เอกสาร 10 ไฟล์ + CHANGELOG

### เครื่องมือ (24)
`weather` `air` `crypto` `fx` `gold` `wiki` `news` `calc` `rss_read` `summarize_url`
`memory_save` `memory_search` `todo` `note` `calendar_add` `calendar_list`
`timer` `reminder` `clipboard_copy` `open_url` `compose_message` `open_app` `device_command` `system_info`

### ความปลอดภัย
- API key ไม่ถูกส่งออก ไม่ถูกซิงก์ และไม่เคยถูกส่งไปที่อื่นนอกจากผู้ให้บริการที่ผู้ใช้เลือก
- ทุกการกระทำเสี่ยงต้องผ่าน permission gate (5 หมวด, risk 0–3, 3 ระดับอิสระ)
- HMAC timing-safe ทั้ง pairing และ phone-link

### ทดสอบ
- 112 unit tests (`npm test`)
- 40 end-to-end checks ใน jsdom ที่รันแอปจริง (`npm run test:browser`)
- 43 ไฟล์ JS ผ่าน syntax/structure check (`npm run check`)

## [0.2.0] — 2026-11-10

- 5 บทบาท (ทั้งหมด/เพื่อนคุย/งาน/ชีวิตประจำวัน/อุปกรณ์) + ตรวจจับเจตนา
- agent loop 1–8 ขั้น + permission gate + กล่องยืนยัน + อนุญาตตลอด session
- 19 tools, โหมดค่าใช้จ่าย 4 แบบ (ฟรี/คุณภาพ/ส่วนตัว/ผสม) + fallback chain
- เตือนความจำ, คลิปบอร์ด, open-app bridge

## [0.1.0] — 2026-11-10

- โครงรากฐาน: PWA + Electron + Capacitor + server
- แชทไทย, เสียง STT/TTS, 8 personas, ความจำ BM25, 10 tools, เอกสารเริ่มต้น
