# แผนเฟสงาน (Loop: วิเคราะห์ → เฟส → งานย่อยตามลำดับ → ปิดเฟส → เฟถัดไป)

อัปเดตสถานะในไฟล์นี้ทุกครั้งที่ปิดเฟส

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| 1 | ความจำอัจฉริยะ (Memory 2.0) | 1.1–1.4 | ✅ ปิดเฟส |
| 2 | เสียงไว + ปลุกด้วยชื่อ (Voice 2.0) | 2.1–2.5 | ✅ ปิดเฟส |
| 3 | Persona Studio | 3.1–3.4 | ✅ ปิดเฟส |
| 4 | Connectors & Sync | 4.1–4.4 | ✅ ปิดเฟส |
| 5 | Device Hub (Phone-Link ครบวงจร) | 5.1–5.4 | ✅ ปิดเฟส |
| 6 | Ship 1.0 (คุณภาพ + แจกจ่าย) | 6.1–6.4 | ✅ ปิดเฟส |

## เฟส 1 — ความจำอัจฉริยะ

- [x] 1.1 MemoryStore 2.0: pin / edit / decay / stats / export-import + migration จาก v1
- [x] 1.2 Consolidation engine: heuristic + LLM (ถ้ามีสมอง) + ตารางรายวัน + merge ข้อเท็จจริงซ้ำ
- [x] 1.3 UI ความจำ: ตัวกรอง, ปักหมุด, แก้ไข, นำเข้า/ส่งออก, ปุ่ม "สรุปความจำเดี๋ยวนี้", สถิติ
- [x] 1.4 Tests (13 memory + 11 consolidate) + docs/MEMORY.md

## เฟส 2 — เสียงไว + ปลุกด้วยชื่อ

- [x] 2.1 SentenceSplitter + คิว TTS พูดทีละประโยค
- [x] 2.2 Provider streaming (SSE): pollinations / openai / openai-compatible / ollama / gemini + fallback
- [x] 2.3 Wake word "No7" (Web Speech ต่อเนื่อง) + ตั้งค่า + ตัวชี้สถานะ + pause ขณะพูด
- [x] 2.4 Agent → UI แบบสตรีม + หยุดพูดได้ + กันพูดตอนเป็น tool call
- [x] 2.5 Tests (7 stream + 7 provider streaming + 7 wake) + docs/VOICE.md

## เฟส 3 — Persona Studio

- [x] 3.1 Persona store (สร้าง/แก้/ลบ/ทำสำเนา) + voice params + คำทักทาย + หัวข้อต้องห้าม
- [x] 3.2 หน้าจอ editor + พรีวิวเสียง + การ์ดรายชื่อ
- [x] 3.3 ต่อเข้า prompt (banned topics) / voice / greeting / agent
- [x] 3.4 Tests (9) + docs/PERSONA.md

## เฟส 4 — Connectors & Sync

- [x] 4.1 ปฏิทิน: นำเข้า/ส่งออก .ics, รายการนัด, `calendar_add` / `calendar_list`, UI ตารางนัด
- [x] 4.2 อ่านฟีด RSS + สรุปหน้าเว็บ (`rss_read`, `summarize_url`) + server `/api/fetch` proxy
- [x] 4.3 ซิงก์ข้ามเครื่องผ่าน server `/api/sync` (token) + UI + merge แบบ additive
- [x] 4.4 Tests (10 calendar + 10 connectors) + docs/CONNECTORS.md

## เฟส 5 — Device Hub

- [x] 5.1 Link client (HMAC canonical signer) + device registry ในเครื่อง
- [x] 5.2 Server: command queue + poll + results + status (ไฟล์/หน่วยความจำ)
- [x] 5.3 UI อุปกรณ์ + tool `device_command` (control/risk3) + log
- [x] 5.4 ESP32 reference client (`devices/esp32/`) + tests (10 link) + docs/DEVICES.md

## เฟส 6 — Ship 1.0

- [x] 6.1 CI (GitHub Actions, Node 20/22) + version 1.0.0 + CHANGELOG
- [x] 6.2 Accessibility (focus ring, aria-live, โฟกัสในกล่องยืนยัน) + คีย์ลัด + reduced-motion
- [x] 6.3 เอกสาร final + README v1.0
- [x] 6.4 ตรวจรับรวม (check / unit / browser e2e / build)

## สรุปการปิดเฟส

| เฟส | ผลลัพธ์หลัก | Tests |
|---|---|---|
| 1 | Memory 2.0 + consolidation + UI | 13 + 11 |
| 2 | Streaming + speak-while-generating + wake word | 7 + 7 + 7 |
| 3 | Persona Studio | 9 |
| 4 | Calendar + RSS + Sync | 10 + 10 |
| 5 | Device Hub + ESP32 client | 10 |
| 6 | CI + a11y + docs + 1.0.0 | — |

รวม: **112 unit tests · 40 e2e checks · 24 tools · 43 JS files**


---

# รอบที่ 2 (v1.1 → v1.3)

เป้าหมาย: ทำให้ "ใช้จริงบนมือถือ" แข็งแรงขึ้น, พูดคุยเป็นธรรมชาติขึ้น (ขัดจังหวะได้), เปิดให้ต่อโลกภายนอกด้วย MCP

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| R1 | ความเสถียรบนมือถือ (Mobile hardening) | 1.1–1.4 | ✅ ปิดเฟส |
| R2 | Barge-in + TTS ระดับพรีเมียม | 2.1–2.4 | ✅ |
| R3 | MCP / Integrations | 3.1–3.4 | ✅ |
| R4 | Reliability & Performance | 4.1–4.4 | ✅ |
| R5 | Release 1.3 | 5.1–5.3 | ✅ |

## R1 — ความเสถียรบนมือถือ

- [x] 1.1 PWA: manifest shortcuts + เปิด view จาก query + แถบออฟไลน์
- [x] 1.2 Capabilities: ตรวจ 15 ความสามารถ + ขอสิทธิ์ไมค์/แจ้งเตือน + แผงสถานะ
- [x] 1.3 Storage: ขนาดต่อส่วน, โควตา, ขอพื้นที่ถาวร, จัดการ QuotaExceeded, ล้างรายกลุ่ม
- [x] 1.4 Tests (9 capabilities + 9 storage) + docs/MOBILE.md

## R2 — Barge-in + TTS

- [x] 2.1 Barge-in: พูดขัดจังหวะได้ (keyword หรือ any-speech) + กันเสียงสะท้อนของตัวเอง (`core/bargein.js`)
- [x] 2.2 TTS provider router: system / OpenAI-compatible (ผ่าน `POST /api/tts` proxy) / ปิดเสียง (`core/tts.js`)
- [x] 2.3 เลือก provider + voice/model/base URL ในหน้าตั้งค่า, ใช้ router ทั้งการพูดปกติและ streaming
- [x] 2.4 Tests (`tests/bargein.test.js`, `tests/tts.test.js`) + อัปเดต `docs/VOICE.md`

## R3 — MCP

- [x] 3.1 MCP client (JSON-RPC 2.0 over HTTP) + discovery (`initialize`, `tools/list`, `tools/call`) — `core/mcp.js`, proxy `POST /api/mcp`, รองรับ JSON + SSE + `mcp-session-id`
- [x] 3.2 Dynamic tool registry: `registerDynamicTools()` รวม tool จาก MCP เข้ากับ 24 tools ในเครื่อง (prompt + tools grid + agent)
- [x] 3.3 Permission หมวดใหม่ `mcp` (risk 2) + UI เพิ่ม/เปิดปิด/ค้นหา server + cache `no7.mcp.tools.v1`
- [x] 3.4 Tests (`tests/mcp.test.js` 9) + `docs/MCP.md`

## R4 — Reliability & Performance

- [x] 4.1 Retry/backoff (`core/retry.js`) + offline outbox `no7.outbox.v1` ส่งอัตโนมัติเมื่อกลับมาออนไลน์
- [x] 4.2 Metrics: first token / total / tool time / tts + แผงสถิติในหน้าตั้งค่า (`core/metrics.js`)
- [x] 4.3 Diagnostics: รายงาน markdown ที่ปิดข้อมูลอ่อนไหว + คัดลอก/ดาวน์โหลด (`core/diagnostics.js`)
- [x] 4.4 Tests (`retry` 11, `metrics` 5, `diagnostics` 6) + `docs/RELIABILITY.md`

## R5 — Release 1.3

- [x] 5.1 version 1.3.0 (`package.json`, `/api/health` อ่านจาก package.json) + CHANGELOG
- [x] 5.2 README ปรับเป็น v1.3 + ตารางสรุป Round 2 ปิดครบ
- [x] 5.3 ตรวจรับรวม: `npm run check` 59 ไฟล์ · `npm test` 177 · `npm run test:browser` 60/60 · `vite build` ผ่าน → เปิด PR

---

# รอบที่ 3 (v1.4)

เป้าหมาย: ให้ No7 ออกไป "ทำงานนอกแอป" ได้จริง — MCP แบบ local process + OAuth, บอทแชท (Telegram/LINE),
ควบคุมคอมพิวเตอร์แบบมี allowlist, และงาน/แจ้งเตือนที่ตามข้ามอุปกรณ์ได้

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| R6 | MCP ลึกขึ้น (stdio + OAuth) | 6.1–6.4 | ✅ |
| R7 | บอทแชท (Telegram / LINE) | 7.1–7.4 | ✅ |
| R8 | Computer control + allowlist | 8.1–8.4 | ✅ |
| R9 | งาน + แจ้งเตือนข้ามอุปกรณ์ | 9.1–9.4 | ✅ |
| R10 | Release 1.4 | 10.1–10.3 | ✅ |

## R6 — MCP ลึกขึ้น

- [x] 6.1 stdio bridge ที่ server: `MCP_STDIO_SERVERS`, spawn/cache, newline JSON-RPC, timeout 25s + stderr tail, `GET /api/mcp/stdio`
- [x] 6.2 client รองรับ `transport: 'stdio'` + UI เลือก server ที่ server ประกาศไว้
- [x] 6.3 OAuth 2.0 + PKCE: `core/oauth.js`, `/api/oauth/token` proxy, `oauth-callback.html`, ปุ่ม 🔑 ในหน้าตั้งค่า
- [x] 6.4 Tests (`oauth` 14, `mcp` +4, integration stdio 1) + `docs/MCP.md` + `docs/OAUTH.md`

---

# รอบที่ 4 (v1.5)

เป้าหมาย: ลงลึกที่อุปกรณ์และการออฟไลน์ — งานซ้ำ + เตือนที่ดังแม้ปิดแอป, รู้จักหน้าต่างบนจอ,
Phone-Link ครบวงจร (hello/eyes/voice), และ MCP OAuth ที่ไม่ต้องใช้เบราว์เซอร์

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| S1 | งานซ้ำ + เตือนผ่าน server | 11.1–11.4 | ✅ |
| S2 | Desktop awareness + automation | 12.1–12.4 | ✅ |
| S3 | Phone-Link ครบวงจร | 13.1–13.4 | ✅ |
| S4 | MCP OAuth: device flow + DCR | 14.1–14.4 | ✅ |
| S5 | Release 1.5 | 15.1–15.3 | ✅ |

## S1 — งานซ้ำ + เตือนผ่าน server

- [x] 11.1 `core/tasks.js`: `normalizeRecurrence` (daily/weekdays/weekly/monthly/hourly + interval/weekday/at), `nextOccurrence`, `describeRecurrence`, `complete()` เลื่อนงานซ้ำไปรอบถัดไป
- [x] 11.2 server: `PUT /api/reminders` + `/due` + `/upcoming` + `/ack` + `/status`, tick ทุก `NO7_REMINDER_TICK_MS`, ส่ง Telegram (`TELEGRAM_REMINDER_CHAT_ID`) และเลื่อนงานซ้ำให้เอง, เก็บที่ `NO7_DATA_DIR/reminders.json`
- [x] 11.3 UI: เลือกงานซ้ำ, แสดง 🔁 + รอบถัดไป, push งานขึ้น server, poll due ทุก 60 วิ, แสดงสถานะ server
- [x] 11.4 Tests (`tasks` +5, `server.reminders` 1 integration) + `docs/TASKS.md`

## S2 — Desktop awareness + automation

- [x] 12.1 `core/desktop.js`: `parseWindowList` (win32/darwin/wmctrl), `matchWindows` (คะแนน + glob), `listWindows`, `focusWindow` + bridge `listWindows`/`focusWindow` ใน Electron (`powershell`/`osascript`/`wmctrl`, ไม่มี shell)
- [x] 12.2 recipes: 5 ขั้น (`open_app`/`open_url`/`focus_window`/`wait`/`notify`), สูงสุด 8 ขั้น, `validateRecipe`, `planRecipe` (dry-run), `runRecipe` (หยุดเมื่อล้มเหลว, ผ่าน allowlist เดิม), `RecipeStore` (20 สูตร, localStorage)
- [x] 12.3 tool `desktop` (list/focus) + tool `run_recipe` (เก็บ/รัน/สร้างจาก steps) + หน้า 🖥️ เดสก์ท็อป (รายการหน้าต่าง + ตัวแก้สูตร + dry-run + log)
- [x] 12.4 Tests (`tests/desktop.test.js` 16, smoke +3) + `docs/DESKTOP.md`

## S3 — Phone-Link ครบวงจร

- [x] 13.1 `POST /api/link/hello` — ลงทะเบียนอุปกรณ์ + capabilities (mic/speaker/eyes/screen/buttons/voice), เก็บ `.no7/devices.json`, `GET` อ่านคืนได้, ส่งซ้ำไม่ทับค่าเดิม
- [x] 13.2 eyes: `POST/GET /api/link/eyes` เก็บตา/อารมณ์ล่าสุด + `ttlMs` → `stale`/`ageMs` ให้จอ ESP32 ดึงไปวาด (poll 1 วิ)
- [x] 13.3 voice: `POST /api/link/voice` รับ chunk base64 (≤256 KB, mime allowlist) → คิว ≤2 MB/40 chunk, `GET ?since`, `/voice/status`, `POST /voice/ack`; ฝั่ง PC มี `pullVoice/ackVoice`
- [x] 13.4 Tests (`link` +3, `server.link` 1 integration ครอบ hello/eyes/voice/auth, smoke +3) + `devices/esp32/no7_link.h` (hello/onEyes/sendEyes/sendVoice) + docs `DEVICES.md`, `PHONE_LINK.md`

## S4 — MCP OAuth: device flow + DCR

- [x] 14.1 `core/oauth.js`: `requestDeviceCode`, `requestDeviceToken`, `pollDeviceToken` (interval/slow_down/expired_token/access_denied/timeout), `normalizeDeviceCode`
- [x] 14.2 `registerClient` (RFC 7591) + proxy `/api/oauth/device` และ `/api/oauth/register` (+ ส่ง `device_code` ผ่าน `/api/oauth/token`)
- [x] 14.3 UI: ช่อง Device/Registration URL, ปุ่ม 🔢 "ล็อกอินด้วยรหัส" (แสดงรหัส + ลิงก์ + slow_down) และ 🆕 ขอ client id
- [x] 14.4 Tests (`oauth` +7, `server.oauth` 1 integration, smoke +3) + `docs/OAUTH.md`

## S5 — Release 1.5

- [x] 15.1 version 1.5.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics) + CHANGELOG 1.5.0
- [x] 15.2 README (v1.5 + ตัวเลขใหม่) + ROADMAP + PHASES ปิดครบทั้ง S1–S5
- [x] 15.3 ตรวจรับรวม: `npm run check` 75 ไฟล์ · `npm test` 266/0 · `npm run test:browser` 82/82 · `npx vite build` ผ่าน · เปิด PR

---

# รอบที่ 5 (v2.0)

เป้าหมาย: ยกระดับคุณภาพ (เสียงพรีเมียม, สมองในเครื่อง), ทำแอปเป็นสองภาษา, และเตรียมกระจายจริง
(auto-update + CI 3 แพลตฟอร์ม) พร้อมด่านตรวจคุณภาพอัตโนมัติ (performance budget)

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| T1 | TTS พรีเมียม + แคชเสียง | 16.1–16.4 | ✅ |
| T2 | โมเดลในเครื่อง (Ollama / LM Studio) | 17.1–17.4 | ✅ |
| T3 | สองภาษา ไทย/อังกฤษ | 18.1–18.4 | ✅ |
| T4 | Performance budget + E2E | 19.1–19.4 | ✅ |
| T5 | Auto-update + CI 3 แพลตฟอร์ม | 20.1–20.3 | ✅ |
| T6 | Release 2.0 | 21.1–21.3 | ✅ |

## T1 — TTS พรีเมียม + แคชเสียง

- [x] 16.1 `core/tts.js`: provider `elevenlabs`, `TTS_VOICES` (เสียงแนะนำต่อเจ้า), `voicesFor`, `resolveTTSConfig` (เติม default + กัน voice ข้ามเจ้า)
- [x] 16.2 server `/api/tts`: branch `provider: 'elevenlabs'` (`xi-api-key`, `ELEVENLABS_API_KEY`/`BASE_URL`, `output_format=mp3_44100_128`, voice encode) + health `aiKeys.elevenlabs`
- [x] 16.3 `AudioCache` LRU (20 รายการ/5 MB) — key ตาม provider/voice/model/lang/text, `cached` ในผลลัพธ์, `cacheStats`/`clearCache`, ปิดได้ด้วย `ttsCache`
- [x] 16.4 Tests (`tts` 12, `server.tts` 1 integration, smoke +2) + UI ใช้ช่องร่วม (`needsServer`) + datalist เสียง + `docs/VOICE.md`

## T2 — โมเดลในเครื่อง

- [x] 17.1 `core/local-models.js`: `probeLocal` (Ollama `/api/tags`, LM Studio `/v1/models`), `warmModel`, `parseModelList`, `matchModel`, `LocalModelCache` (60 วิ), `offlineChainSettings`
- [x] 17.2 server proxy `/api/local-models` + `/api/local-models/warm` พร้อม SSRF guard (เฉพาะ loopback/RFC1918, `NO7_LOCAL_ALLOW_REMOTE=1` เพื่อเปิด)
- [x] 17.3 UI: แผง 🧠 สมองในเครื่อง (ตรวจ/เลือก/อุ่นเครื่อง/สวิตช์ออฟไลน์) + `resolveProviderChain` ใช้โมเดลในเครื่องอัตโนมัติเมื่อออฟไลน์
- [x] 17.4 Tests (`local-models` 10, `server.local-models` 1 integration, smoke +5) + `docs/LOCAL_MODELS.md`

## T3 — สองภาษา ไทย/อังกฤษ

- [x] 18.1 `core/i18n.js`: `LANGS`, `DICT` (th/en ครบเท่ากัน), `t()` (+vars/fallback), `applyI18n`, `langOf`, `detectLang`, `viewTitle` + `settings.uiLang`
- [x] 18.2 `data-i18n`/`data-i18n-placeholder`/`data-i18n-title` ใน UI หลัก ~90 จุด + สลับทันที (ไม่รีโหลด) + `html.lang`
- [x] 18.3 ข้อความระบบที่สำคัญ (offline banner, view title, แจ้งเตือนงาน) ใช้ `t()` ตามภาษา
- [x] 18.4 Tests (`i18n` 6, smoke +5) + `docs/I18N.md`

## T4 — Performance budget + E2E

- [x] 19.1 `tools/perf.js`: `measureSource`/`measureDist` (gzip ระดับ 9), `checkBudget`, `formatReport` + CLI
- [x] 19.2 `npm run perf` + `perf-budget.json` + `tests/perf.test.js` (6 tests) + ขั้น CI ใหม่
- [x] 19.3 E2E journey: งานซ้ำเลื่อนรอบใน UI (+3 checks) — smoke รวม 97
- [x] 19.4 `docs/QUALITY.md`

## T5 — Auto-update + CI 3 แพลตฟอร์ม

- [x] 20.1 `desktop/updater.js`: `updaterConfig`/`describeUpdateEvent`/`setupAutoUpdater` (inject ได้) + `main.js` opt-in (`NO7_AUTO_UPDATE=1`, packaged เท่านั้น) + เมนู tray "ตรวจอัปเดต"
- [x] 20.2 `.github/workflows/release.yml`: verify (check/test/smoke/build/perf) → matrix win/mac/linux → draft release + `latest*.yml`
- [x] 20.3 `docs/BUILD.md` §2.1 (ออก release, env ของ updater, signing) + `tests/updater.test.js` (6)

## T6 — Release 2.0

- [x] 21.1 version 2.0.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics, `window.NO7_VERSION` จาก vite define) + CHANGELOG 2.0.0
- [x] 21.2 README v2.0 + ตารางเอกสาร (QUALITY/I18N/LOCAL_MODELS) + PHASES ปิดครบ
- [x] 21.3 ตรวจรับรวม: check 86 ไฟล์ · unit 306 · browser 97 · build · perf ผ่าน → PR #6 merged (`22f005d`)

---

# รอบที่ 6 (v2.1)

เป้าหมาย: ทำให้ "การทำงานหลายขั้น" มองเห็นและหยุดได้จริง, ให้ No7 สรุปวันให้ทุกเช้า,
และเปิดให้ผู้ใช้ต่อยอดเครื่องมือของตัวเองได้ (HTTP plugin) โดยไม่ต้องแก้โค้ด

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| U1 | Timeline + ยกเลิกกลางทาง | 22.1–22.4 | ✅ |
| U2 | สรุปประจำวัน (digest) | 23.1–23.4 | ✅ |
| U3 | ปลั๊กอินเครื่องมือ HTTP | 24.1–24.4 | ✅ |
| U4 | Release 2.1 | 25.1–25.3 | ✅ |

## U1 — Timeline + ยกเลิกกลางทาง

- [x] 22.1 `core/timeline.js`: `AgentTimeline` (push event → ขั้นตอนมีสถานะ), `summary()`, `headline()`, `toRows()`, `toMarkdown()`
- [x] 22.2 `core/agent.js`: `cancel()` + ตรวจธง 3 จุดในลูป (ก่อนรอบใหม่ / หลังได้คำตอบ / หลังยืนยัน), event `cancelled`, ผลลัพธ์ `{ cancelled }`
- [x] 22.3 UI: แผง `#run-timeline` + `stopAll()` ผูกกับปุ่ม ⏹ และ `Esc` (ยกเลิก agent + หยุดเสียง)
- [x] 22.4 `tests/timeline.test.js` (10) + smoke +3 (100 checks) + `docs/AGENT.md`

## U2 — สรุปประจำวัน (digest)

- [x] 23.1 `core/digest.js`: `buildDigest` (เกินกำหนด/วันนี้/นัดหมาย/48 ชม./ถัดไป/ความจำใหม่/ไม่มีกำหนด) + `digestMarkdown` + `toMs` (รับ ISO string)
- [x] 23.2 tool `digest` (dynamic, risk 0) + ปุ่ม "🌅 สรุปวันนี้" (การ์ด + โพสต์ในแชท) + `refreshDynamicTools()` รวม MCP/ปลั๊กอิน
- [x] 23.3 สรุปอัตโนมัติครั้งแรกของวันหลัง 07:00 (`settings.digestAuto`, `no7.digest.last`) + i18n
- [x] 23.4 `tests/digest.test.js` (12) + smoke +5 (105 checks) + `docs/DIGEST.md`

## U3 — ปลั๊กอินเครื่องมือ HTTP

- [x] 24.1 `core/custom-tools.js`: `normalizeCustomTool`, `renderTemplate`, `fillArgs`, `validateCustomTools`, `buildHttpTool`, `customToolDefs`, `PLUGIN_EXAMPLE`
- [x] 24.2 ความปลอดภัย: https (ยกเว้น `allowInsecure`), บล็อก host วงใน (`allowPrivate`), timeout 10 วิ, ตัด response 64 KB, `assertSafeUrl` ตรวจซ้ำตอนยิงจริง, ส่งเฉพาะ declared params
- [x] 24.3 UI หน้าเครื่องมือ: `#plugin-json` + ตัวอย่าง/ตรวจสอบ/บันทึก + รายการที่ใช้ได้ (ผสาน MCP+digest ผ่าน `refreshDynamicTools()`)
- [x] 24.4 `tests/custom-tools.test.js` (13) + smoke +6 (111 checks) + `docs/PLUGINS.md`

## U4 — Release 2.1

- [x] 25.1 version 2.1.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics) + CHANGELOG 2.1.0
- [x] 25.2 README v2.1 (timeline, digest, plugins, 341 unit / 111 checks, 29 tools) + docs table + PHASES ปิดครบ
- [x] 25.3 ตรวจรับรวม: check 92 ไฟล์ · unit 341 · browser 111 · build · perf (83.5 KB gzip) → PR

---

# รอบที่ 7 (v2.2)

เป้าหมาย: ทำให้ข้อมูลที่มีอยู่ "หาเจอ" และ "ย้ายเครื่องได้" — ค้นทุกอย่างจากที่เดียวด้วย ⌘/Ctrl+K
และสำรอง/กู้คืนข้อมูลทั้งแอปได้อย่างปลอดภัย (schema ชัดเจน, dry-run ก่อนเขียนทับ)

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| V1 | ค้นหาทุกอย่าง (⌘K) | 26.1–26.4 | ✅ |
| V2 | สำรอง/กู้คืนข้อมูล | 27.1–27.4 | ✅ |
| V3 | Release 2.2 | 28.1–28.3 | ✅ |

## V1 — ค้นหาทุกอย่าง (Command palette)

- [x] 26.1 `core/search.js`: `buildIndex` (8 ชนิด) + `searchIndex` (exact>prefix>token + น้ำหนักชนิด + ความใหม่) + `matchRanges`/`highlightRanges` + `groupResults`
- [x] 26.2 UI `#palette`: ⌘/Ctrl+K เปิด, ↑↓ เลื่อน, Enter เลือก, Esc ปิด, คลิกพื้นหลังปิด, จัดกลุ่มตามชนิด + ไฮไลต์คำค้น
- [x] 26.3 การกระทำ: เปิดหน้า / ค้นความจำ / แสดงงาน-นัด-เครื่องมือ / `digest` / `stopAll` / เริ่มแชทใหม่
- [x] 26.4 `tests/search.test.js` (13) + smoke +7 (118 checks) + `docs/SEARCH.md`

## V2 — สำรอง/กู้คืนข้อมูล

- [x] 27.1 `core/backup.js`: `createBackup` (schema 2 + checksum + counts), `redactSettings`/`hasSecrets`, `validateBackup`, `summarizeBackup`, `migrateBackup` (export รุ่นเก่า)
- [x] 27.2 `mergeRecords` (LWW ตาม `ts/updatedAt`) + `planRestore` (merge/replace, dry-run) + `describePlan` + `COLLECTIONS`
- [x] 27.3 UI: `#export-btn` ใช้ schema 2, `#import-btn`/`#import-file` (FileReader → validate → confirm พร้อมสรุป → merge) + `#backup-status`
- [x] 27.4 `tests/backup.test.js` (14) + smoke +5 (123 checks) + `docs/BACKUP.md`

## V3 — Release 2.2

- [x] 28.1 version 2.2.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics) + CHANGELOG 2.2.0
- [x] 28.2 README v2.2 (⌘K, backup/restore, 368 unit / 123 checks, 28 docs) + PHASES ปิดครบ
- [x] 28.3 ตรวจรับรวม: check 96 ไฟล์ · unit 368 · browser 123 · build · perf → PR

---

# รอบที่ 8 (v2.3)

เป้าหมาย: ทำงานหลายเครื่องมือได้ลื่นขึ้น (เห็นผลระหว่างทาง), มองย้อนภาพรวมสัปดาห์ได้,
และปิดช่องว่างของ sync ความจำระหว่างเครื่อง

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| W1 | ผลเครื่องมือแบบ progressive | 29.1–29.4 | ✅ |
| W2 | รายงานรายสัปดาห์ | 30.1–30.4 | ✅ |
| W3 | Release 2.3 | 31.1–31.3 | ✅ |

## W1 — ผลเครื่องมือแบบ progressive (partial UI)

- [x] 29.1 ฟองคำตอบแยก `msg-text` + `msg-cards`: event `result` วาดการ์ดทันที + `data-count` + ข้อความ "กำลังสรุป…"
- [x] 29.2 หลายเครื่องมือต่อคำสั่ง → หลายการ์ดในฟองเดียว ตามลำดับที่เสร็จ (ไม่รอคำตอบจบ)
- [x] 29.3 คำตอบสุดท้ายเขียนเฉพาะ `msg-text` → การ์ดที่วาดไปแล้วไม่หาย (ลบ `.streaming` เมื่อจบ/ผิดพลาด)
- [x] 29.4 smoke +6 (129 checks: การ์ดใน `msg-cards`, ข้อความใน `msg-text`, multi-tool 2 การ์ด) + `docs/AGENT.md` §2.1

## W2 — รายงานรายสัปดาห์ (weekly review)

- [x] 30.1 `core/weekly.js`: `buildWeekly` (ปิดได้/เพิ่มใหม่/เกินกำหนด/สัปดาห์หน้า/นัดหมาย/ความจำใหม่/เครื่องมือ+failure rate) + `focus` + sections + markdown
- [x] 30.2 tool `weekly` (dynamic, risk 0) + ปุ่ม "📆 รายงานสัปดาห์" + `#weekly-card` + โพสต์ในแชท
- [x] 30.3 `startOfWeek`/`weekRange` (จันทร์ 00:00, half-open) + เทียบสัปดาห์ก่อน (`deltaCompleted`)
- [x] 30.4 `tests/weekly.test.js` (9) + smoke +4 (133 checks) + `docs/WEEKLY.md`

## W3 — Release 2.3

- [x] 31.1 version 2.3.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics) + CHANGELOG 2.3.0
- [x] 31.2 README v2.3 (progressive cards, weekly review, 30 tools, 377 unit / 133 checks, 29 docs) + PHASES ปิดครบ
- [x] 31.3 ตรวจรับรวม: check 98 ไฟล์ · unit 377 · browser 133 · build · perf → PR

# รอบที่ 9 (v2.4)

รอบนี้เน้น "ข้อมูลที่ย้ายเครื่องแล้วไม่ทับกันหาย" และ "เอารายงานออกไปใช้ต่อได้"

| # | งาน | ช่วง | สถานะ |
| --- | --- | --- | --- |
| X1 | ซิงก์แบบ conflict-aware | 32.1–32.4 | ✅ |
| X2 | ส่งออกรายงาน (MD/CSV) | 33.1–33.4 | ✅ |
| X3 | Release 2.4 | 34.1–34.3 | ✅ |

## X1 — ซิงก์แบบ conflict-aware

- 32.1 ✅ `core/sync-merge.js`: `mergeRecordSets` (newest / prefer-local / prefer-remote / keep-both) + `deviceId()` + report ความขัดแย้ง
- 32.2 ✅ `mergeSyncBundle` สำหรับ facts/notes/todos/tasks/events → `{data, report}` (แทน merge แบบ additive)
- 32.3 ✅ UI: เลือกกลยุทธ์ในหน้าซิงก์ + แสดงผล "เพิ่ม/อัปเดต/ชนกัน" + `docs/SYNC.md`
- 32.4 ✅ Tests + smoke

## X2 — ส่งออกรายงาน (MD/CSV)

- 33.1 ✅ `core/report-export.js`: `toCsv`, `weeklyCsv`, `digestCsv`, `reportMarkdown` (escape CSV ถูกต้อง)
- 33.2 ✅ UI: ปุ่ม ⬇️ Markdown / ⬇️ CSV บนการ์ดสรุปวันนี้และรายงานสัปดาห์
- 33.3 ✅ ชื่อไฟล์มีวันที่ + BOM สำหรับ Excel (ภาษาไทย)
- 33.4 ✅ Tests + smoke + `docs/REPORTS.md`

## X3 — Release 2.4

- 34.1 ✅ version 2.4.0 + CHANGELOG
- 34.2 ✅ README + PHASES ปิดครบ
- 34.3 ✅ ตรวจรับรวม (check/test/browser/perf/build) + PR

# รอบที่ 10 (v2.5)

เป้าหมาย: ให้ผู้ใช้ตรวจสุขภาพข้อมูลส่วนตัวได้ทันที พร้อมล้างเฉพาะรายการซ้ำ/ว่างที่ระบบระบุ โดยไม่ลบข้อมูลสำคัญอัตโนมัติ

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| Y1 | ตรวจสุขภาพข้อมูล | 35.1–35.4 | ✅ |
| Y2 | ล้างข้อมูลอย่างปลอดภัย | 36.1–36.3 | ✅ |
| Y3 | Release 2.5 | 37.1–37.3 | ✅ |

## Y1 — ตรวจสุขภาพข้อมูล

- [x] 35.1 `core/health.js`: ตรวจซ้ำ/ว่าง/เก่า/งานเกินกำหนด/นัดเก่า + คะแนน 0–100 และระดับ A–D
- [x] 35.2 UI ปุ่มตรวจสุขภาพ + การ์ดสรุป + รายงานในแชท ไทย/อังกฤษ
- [x] 35.3 Tests ครอบคลุมคะแนน, ปัญหา, ขอบเขตข้อมูล และ Markdown
- [x] 35.4 `docs/HEALTH.md` + browser smoke

## Y2 — ล้างข้อมูลอย่างปลอดภัย

- [x] 36.1 แสดงรายการที่ล้างได้ แยกจากคำแนะนำที่ต้องตรวจเอง
- [x] 36.2 ยืนยันก่อนล้าง; จำกัดการลบเฉพาะรายการซ้ำ/ว่างที่ถูกทำเครื่องหมาย
- [x] 36.3 Tests + smoke + เอกสารความปลอดภัย

## Y3 — Release 2.5

- [x] 37.1 version 2.5.0 + CHANGELOG
- [x] 37.2 README (32 docs, 417 unit / 145 checks) + PHASES ปิดครบ
- [x] 37.3 ตรวจรับรวม: check 104 files · unit 417 · browser 145 · perf · build → PR

# รอบที่ 11 (v2.6)

เป้าหมาย: เพิ่มทางย้อนกลับสำหรับการล้างข้อมูล และทำให้หน้าตรวจสุขภาพสลับไทย/อังกฤษได้ครบ โดยเก็บข้อมูลชั่วคราวในหน่วยความจำเท่านั้น

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| Z1 | ย้อนกลับการล้างล่าสุด | 38.1–38.4 | ✅ |
| Z2 | i18n หน้าสุขภาพข้อมูล | 39.1–39.3 | ✅ |
| Z3 | Release 2.6 | 40.1–40.3 | ✅ |

## Z1 — ย้อนกลับการล้างล่าสุด

- [x] 38.1 เก็บ snapshot ของรายการที่ลบล่าสุดในหน่วยความจำ (ไม่ persist, ไม่เกินหนึ่งชุด)
- [x] 38.2 ปุ่ม Undo ใช้ได้ 30 วินาที; กู้คืนข้อความและ metadata ความจำเดิม
- [x] 38.3 ป้องกันการคืนข้อมูลซ้ำ/ทับข้อมูลที่ผู้ใช้แก้ภายหลัง
- [x] 38.4 Tests + smoke + `docs/HEALTH.md`

## Z2 — i18n หน้าสุขภาพข้อมูล

- [x] 39.1 ปุ่ม/การ์ด/ยืนยัน/Undo ใช้ภาษาเดียวกับ `uiLang`
- [x] 39.2 สลับภาษาแล้ว render การ์ดเดิมใหม่ ไม่ต้องสแกนซ้ำ
- [x] 39.3 Tests + browser smoke

## Z3 — Release 2.6

- [x] 40.1 version 2.6.0 + CHANGELOG
- [x] 40.2 README (32 docs, 420 unit / 151 checks) + PHASES ปิดครบ
- [x] 40.3 ตรวจรับรวม: check 106 files · unit 420 · browser 151 · perf · build → PR

# รอบที่ 12 (v2.7)

เป้าหมาย: แสดงแนวโน้มสุขภาพข้อมูลย้อนหลังแบบเป็นส่วนตัว โดยบันทึกเฉพาะคะแนน/จำนวนปัญหา ไม่บันทึกเนื้อหาส่วนตัว

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AA1 | ประวัติสุขภาพ 30 วัน | 41.1–41.4 | ✅ |
| AA2 | กราฟ/สรุปแนวโน้ม | 42.1–42.3 | ✅ |
| AA3 | Release 2.7 | 43.1–43.3 | ✅ |

## AA1 — ประวัติสุขภาพ 30 วัน

- [x] 41.1 `core/health-history.js`: snapshot แบบ schema versioned, 30 วัน, หนึ่งรายการต่อวัน
- [x] 41.2 เก็บเฉพาะวัน/คะแนน/เกรด/จำนวนปัญหาตามระดับ — ไม่เก็บข้อความหรือรายการส่วนตัว
- [x] 41.3 บันทึกเมื่อผู้ใช้สแกนเอง; ปุ่มล้างประวัติพร้อมยืนยัน
- [x] 41.4 Tests + `docs/HEALTH.md`

## AA2 — กราฟ/สรุปแนวโน้ม

- [x] 42.1 แสดงคะแนนย้อนหลังแบบ SVG/CSS ที่เข้าถึงได้และไม่มี dependency เพิ่ม
- [x] 42.2 สรุปการเปลี่ยนแปลงเทียบครั้งก่อน ไทย/อังกฤษ
- [x] 42.3 Browser smoke + ตรวจขนาด/performance

## AA3 — Release 2.7

- [x] 43.1 version 2.7.0 + CHANGELOG
- [x] 43.2 README (32 docs, 427 unit / 154 checks) + PHASES ปิดครบ
- [x] 43.3 ตรวจรับรวม: check 110 files · unit 427 · browser 154 · perf · build → PR

# รอบที่ 13 (v2.8)

เป้าหมาย: ให้ผู้ใช้ส่งออกประวัติสุขภาพแบบเลือกเอง โดยส่งออกเฉพาะสรุปคะแนนที่เก็บในเครื่อง ไม่รวมเนื้อหาส่วนตัว

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AB1 | Export ประวัติสุขภาพ | 44.1–44.3 | ✅ |
| AB2 | UI ดาวน์โหลด CSV/Markdown | 45.1–45.3 | ✅ |
| AB3 | Release 2.8 | 46.1–46.3 | ✅ |

## AB1 — Export ประวัติสุขภาพ

- [x] 44.1 API CSV (BOM/Excel) และ Markdown (ไทย/อังกฤษ) จาก summary snapshots เท่านั้น
- [x] 44.2 Escape CSV และกัน formula injection; ไม่มีรายละเอียดปัญหาหรือข้อความส่วนตัว
- [x] 44.3 Tests สำหรับรูปแบบ/ข้อมูลว่าง/ภาษา

## AB2 — UI ดาวน์โหลด CSV/Markdown

- [x] 45.1 ปุ่มส่งออกในประวัติ พร้อมชื่อไฟล์วันที่และ clipboard fallback
- [x] 45.2 บันทึกเฉพาะตอนผู้ใช้กดส่งออก; ไม่มี auto-upload
- [x] 45.3 Browser smoke + `docs/HEALTH.md`

## AB3 — Release 2.8

- [x] 46.1 version 2.8.0 + CHANGELOG
- [x] 46.2 README (32 docs, 431 unit / 156 checks) + PHASES ปิดครบ
- [x] 46.3 ตรวจรับรวม: check 112 files · unit 431 · browser 156 · perf · build → PR

# รอบที่ 14 (v2.9)

เป้าหมาย: ให้ดูช่วงสั้น/ยาวของแนวโน้มสุขภาพได้ทันที โดยไม่เพิ่มข้อมูลใหม่หรือขยายสิ่งที่เก็บไว้

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AC1 | ตัวกรองประวัติ 7/30 วัน | 47.1–47.3 | ✅ |
| AC2 | สรุปช่วงที่เลือก | 48.1–48.3 | ✅ |
| AC3 | Release 2.9 | 49.1–49.3 | ✅ |

## AC1 — ตัวกรองประวัติ 7/30 วัน

- [x] 47.1 `filterHealthHistory` เลือก 7 หรือ 30 วันตามปฏิทินเครื่อง
- [x] 47.2 UI ปุ่มเลือกช่วง; เปลี่ยนกราฟ/รายการทันทีโดยไม่สแกนหรือเขียน storage
- [x] 47.3 Tests สำหรับขอบเขตวัน, history ที่มีวันที่ขาด และข้อมูลว่าง

## AC2 — สรุปช่วงที่เลือก

- [x] 48.1 คำนวณจำนวนวันมีข้อมูล, ค่าเฉลี่ย, สูงสุด/ต่ำสุด และ delta ต้นช่วง→ปลายช่วง
- [x] 48.2 สรุปไทย/อังกฤษ และกราฟ/รายการสอดคล้องกับช่วงที่ active
- [x] 48.3 Browser smoke + docs

## AC3 — Release 2.9

- [x] 49.1 version 2.9.0 + CHANGELOG
- [x] 49.2 README (32 docs, 433 unit / 159 checks) + PHASES ปิดครบ
- [x] 49.3 ตรวจรับรวม: check 112 files · unit 433 · browser 159 · perf · build → PR

# รอบที่ 15 (v2.10)

เป้าหมาย: เพิ่มไฟล์ JSON สำหรับเก็บ/ส่งต่อประวัติสุขภาพอย่างเป็นโครงสร้าง โดยคงขอบเขตข้อมูลสรุป ไม่มีข้อความส่วนตัว

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AD1 | JSON export schema | 50.1–50.3 | ✅ |
| AD2 | UI ส่งออก JSON | 51.1–51.3 | ✅ |
| AD3 | Release 2.10 | 52.1–52.3 | ✅ |

## AD1 — JSON export schema

- [x] 50.1 `healthHistoryJson`: schema versioned, exportedAt, snapshots ที่ normalize แล้วเท่านั้น
- [x] 50.2 จำกัด 30 snapshots; ตัด field/ข้อความส่วนตัวและข้อมูล malformed
- [x] 50.3 Tests สำหรับ schema, ข้อมูลว่าง, privacy และความทนทาน

## AD2 — UI ส่งออก JSON

- [x] 51.1 เพิ่มปุ่ม JSON ข้าง CSV/Markdown พร้อมวันที่ในชื่อไฟล์
- [x] 51.2 ใช้เส้นทาง download/clipboard เดิม; ส่งออกเมื่อผู้ใช้กดเท่านั้น
- [x] 51.3 Browser smoke + `docs/HEALTH.md`

## AD3 — Release 2.10

- [x] 52.1 version 2.10.0 + CHANGELOG
- [x] 52.2 README (32 docs, 434 unit / 159 checks) + PHASES ปิดครบ
- [x] 52.3 ตรวจรับรวม: check 112 files · unit 434 · browser 159 · perf · build → PR

# รอบที่ 16 (v2.11)

เป้าหมาย: กู้คืน/รวมประวัติสุขภาพ JSON ที่ผู้ใช้ส่งออกไว้ โดยตรวจสอบก่อนเขียนและไม่รับข้อมูลส่วนตัวส่วนเกิน

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AE1 | ตรวจสอบและวางแผนนำเข้า | 53.1–53.3 | ✅ |
| AE2 | UI นำเข้าแบบยืนยัน | 54.1–54.3 | ✅ |
| AE3 | Release 2.11 | 55.1–55.3 | ✅ |

## AE1 — ตรวจสอบและวางแผนนำเข้า

- [x] 53.1 `parseHealthHistoryBackup`: ตรวจ format/schema/date/ขนาด/จำนวน snapshots
- [x] 53.2 `planHealthHistoryImport`: merge ตามวัน, incoming ชนะเมื่อชนกัน, cap 30 และสรุปผลโดยไม่เขียน storage
- [x] 53.3 Tests ครอบคลุม malformed/oversized/privacy/merge/retention

## AE2 — UI นำเข้าแบบยืนยัน

- [x] 54.1 เลือกไฟล์ JSON พร้อม preview เพิ่ม/แทนที่/คงเดิม/ตัดเก่า แล้วต้องยืนยันก่อนบันทึก
- [x] 54.2 Import ไทย/อังกฤษ; อ่านไฟล์เสีย/ไม่รองรับแล้วไม่เปลี่ยนข้อมูล
- [x] 54.3 Browser smoke + `docs/HEALTH.md`

## AE3 — Release 2.11

- [x] 55.1 version 2.11.0 + CHANGELOG
- [x] 55.2 README (32 docs, 439 unit / 161 checks) + PHASES ปิดครบ
- [x] 55.3 ตรวจรับรวม: check 115 files · unit 439 · browser 161 · perf · build → PR

# รอบที่ 17 (v2.12)

เป้าหมาย: ให้ไฟล์สำรองข้อมูลทั้งแอปเก็บ/กู้ประวัติสุขภาพแบบสรุปได้ด้วย โดยรักษาความเป็นส่วนตัวและการ merge แบบปลอดภัย

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AF1 | รวมประวัติสุขภาพใน backup core | 56.1–56.3 | ✅ |
| AF2 | เชื่อม UI สำรอง/กู้คืน | 57.1–57.3 | ✅ |
| AF3 | Release 2.12 | 58.1–58.3 | ✅ |

## AF1 — รวมประวัติสุขภาพใน backup core

- [x] 56.1 เพิ่ม `healthHistory` เป็นคอลเลกชัน summary-only ในไฟล์สำรอง; จำกัด 30 วันและ whitelist fields
- [x] 56.2 restore แบบ merge ตามวันที่ และ replace ตามโหมดเดิม; ไฟล์เก่าไม่มีคอลเลกชันนี้ต้องทำงานได้
- [x] 56.3 Unit tests ครอบคลุม export privacy, merge/replace, retention, backward compatibility

## AF2 — เชื่อม UI สำรอง/กู้คืน

- [x] 57.1 Export app backup รวมประวัติจาก local storage โดยผู้ใช้กดเองเท่านั้น
- [x] 57.2 Restore แสดงจำนวนประวัติใน dry-run; เขียนหลังการยืนยันเดียวกับข้อมูลอื่น
- [x] 57.3 Browser smoke + `docs/BACKUP.md`/`docs/HEALTH.md`

## AF3 — Release 2.12

- [x] 58.1 version 2.12.0 + CHANGELOG
- [x] 58.2 README (32 docs, 442 unit / 163 checks) + PHASES ปิดครบ
- [x] 58.3 ตรวจรับรวม: check 115 files · unit 442 · browser 163 · perf · build → PR

# รอบที่ 18 (v2.13)

เป้าหมาย: ย้าย Persona Studio ที่ผู้ใช้สร้างเองผ่านไฟล์สำรองทั้งแอปได้ โดยตรวจ/จำกัดข้อมูลและไม่แตะ persona built-in

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AG1 | ทำ persona data ให้สำรอง/นำเข้าได้ปลอดภัย | 59.1–59.3 | ✅ |
| AG2 | เชื่อม persona กับ backup/restore UI | 60.1–60.3 | ✅ |
| AG3 | Release 2.13 | 61.1–61.3 | ✅ |

## AG1 — ทำ persona data ให้สำรอง/นำเข้าได้ปลอดภัย

- [x] 59.1 normalize persona ที่นำเข้า: จำกัดจำนวน/ความยาว/รูปแบบและตัด metadata ที่ไม่รู้จัก
- [x] 59.2 ใช้ ID และ updatedAt สำหรับ merge; built-in personas ห้ามถูกแทนที่
- [x] 59.3 Tests สำหรับ sanitization, merge/replace และไฟล์รุ่นเก่า

## AG2 — เชื่อม persona กับ backup/restore UI

- [x] 60.1 Export เฉพาะ custom personas ที่ผู้ใช้สร้างเอง
- [x] 60.2 Restore ตามแผนที่ยืนยันแล้วและ refresh UI; replace/merge ไม่แก้ built-ins
- [x] 60.3 Browser smoke + อัปเดต `docs/BACKUP.md`/`docs/PERSONA.md`

## AG3 — Release 2.13

- [x] 61.1 version 2.13.0 + CHANGELOG
- [x] 61.2 README (32 docs, 446 unit / 164 checks) + PHASES ปิดครบ
- [x] 61.3 ตรวจรับรวม: check 116 files · unit 446 · browser 164 · perf · build → PR

# รอบที่ 19 (v2.14)

เป้าหมาย: ให้กู้คืนบทสนทนาที่อยู่ในไฟล์สำรองได้อย่างจำกัดและปลอดภัย; restore เกิดเฉพาะหลังผู้ใช้เลือกไฟล์และยืนยัน

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AH1 | validate/merge log records | 62.1–62.3 | ✅ |
| AH2 | เชื่อม restore ทั้งแอปและ memory import | 63.1–63.3 | ✅ |
| AH3 | Release 2.14 | 64.1–64.3 | ✅ |

## AH1 — validate/merge log records

- [x] 62.1 export/restore เก็บเฉพาะ role, text, timestamp; จำกัดความยาวและจำนวน
- [x] 62.2 merge ตาม identity ของข้อความ, เรียงตามเวลา, เก็บได้ไม่เกินเพดาน memory store
- [x] 62.3 Tests สำหรับ roles/metadata/duplicate/limit และข้อมูล malformed

## AH2 — เชื่อม restore ทั้งแอปและ memory import

- [x] 63.1 Full restore รวม chat log ใน dry-run ที่ยืนยันก่อนเขียน
- [x] 63.2 Memory JSON import ยังคง compatible และกู้คืน log แบบ merge
- [x] 63.3 Browser smoke + อัปเดต `docs/BACKUP.md`

## AH3 — Release 2.14

- [x] 64.1 version 2.14.0 + CHANGELOG
- [x] 64.2 README (32 docs, 449 unit / 165 checks) + PHASES ปิดครบ
- [x] 64.3 ตรวจรับรวม: check 116 files · unit 449 · browser 165 · perf · build → PR

# รอบที่ 20 (v2.15)

เป้าหมาย: ป้องกันไฟล์สำรองขนาดใหญ่หรือโครงสร้างผิดปกติทำให้หน้าเว็บค้าง/restore ล้ม; ปฏิเสธก่อนอ่านและก่อนเขียน storage

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AI1 | จำกัดขนาดและตรวจ schema ของ backup | 65.1–65.3 | ✅ |
| AI2 | เชื่อม file picker และแผน restore ที่ทน malformed rows | 66.1–66.3 | ✅ |
| AI3 | Release 2.15 | 67.1–67.3 | ✅ |

## AI1 — จำกัดขนาดและตรวจ schema ของ backup

- [x] 65.1 จำกัดขนาด JSON 20 MiB ก่อน parse; object API มี byte guard เช่นกัน
- [x] 65.2 ตรวจรูปแบบ collection/จำนวนแถวก่อนสร้าง restore plan
- [x] 65.3 Tests สำหรับขนาด, wrong shape, row caps และ legacy compatibility

## AI2 — เชื่อม file picker และแผน restore ที่ทน malformed rows

- [x] 66.1 file picker ปฏิเสธไฟล์เกินขนาดก่อน FileReader และแสดงสาเหตุ
- [x] 66.2 dry-run/restore ไม่ throw เมื่อมี record แถวผิดรูป; storage ไม่เปลี่ยนหากไฟล์ไม่ผ่าน validation
- [x] 66.3 Browser smoke + `docs/BACKUP.md`

## AI3 — Release 2.15

- [x] 67.1 version 2.15.0 + CHANGELOG
- [x] 67.2 README (32 docs, 451 unit / 166 checks) + PHASES ปิดครบ
- [x] 67.3 ตรวจรับรวม: check 116 files · unit 451 · browser 166 · perf · build → PR

# รอบที่ 21 (v2.16)

เป้าหมาย: การกู้คืน backup ที่ตัด secrets ออกตามค่าเริ่มต้นต้องไม่ล้าง API keys/credentials ที่ตั้งไว้ในเครื่องปลายทาง

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AJ1 | วางนโยบาย merge settings แบบรักษาความลับ | 68.1–68.3 | ✅ |
| AJ2 | เชื่อม dry-run, UI และทดสอบ credential preservation | 69.1–69.3 | ✅ |
| AJ3 | Release 2.16 | 70.1–70.3 | ✅ |

## AJ1 — วางนโยบาย merge settings แบบรักษาความลับ

- [x] 68.1 merge settings แบบไม่ล้าง keys ที่ว่าง/ขาดจากไฟล์เมื่อเครื่องนี้มีค่าอยู่
- [x] 68.2 จับคู่ MCP server ด้วย id/name/url และรักษา apiKey เดิมเมื่อไฟล์ redacted
- [x] 68.3 Tests ครอบคลุมไฟล์ redacted, includeSecrets และ replace/merge

## AJ2 — เชื่อม dry-run, UI และทดสอบ credential preservation

- [x] 69.1 ส่ง settings ปัจจุบันเข้า restore plan; แสดงคำเตือนว่าข้อมูลลับในเครื่องจะคงอยู่
- [x] 69.2 ตรวจว่าไฟล์ที่มี secrets แสดงคำเตือนเดิมและไม่เปลี่ยนพฤติกรรมเขียนหลังยืนยัน
- [x] 69.3 Browser smoke + อัปเดต `docs/BACKUP.md`

## AJ3 — Release 2.16

- [x] 70.1 version 2.16.0 + CHANGELOG
- [x] 70.2 README (32 docs, 452 unit / 167 checks) + PHASES ปิดครบ
- [x] 70.3 ตรวจรับรวม: check 116 files · unit 452 · browser 167 · perf · build → PR

# รอบที่ 22 (v2.17)

เป้าหมาย: ให้ผู้ใช้เปิดดูและค้นหาบทสนทนาที่เก็บใน memory log ได้จากหน้า memory รวมถึง log ที่ restore มา โดยไม่ส่งหรือแก้ไขข้อความ

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AK1 | ตัวกรอง local chat archive | 71.1–71.3 | ✅ |
| AK2 | เชื่อมหน้า memory และ UX เข้าถึงได้ | 72.1–72.3 | ✅ |
| AK3 | Release 2.17 | 73.1–73.3 | ✅ |

## AK1 — ตัวกรอง local chat archive

- [x] 71.1 ค้นหาข้อความและกรอง user/assistant จาก local memory log เท่านั้น
- [x] 71.2 เรียงล่าสุดก่อน, แสดงทีละ 50 พร้อม load-more และข้าม records ผิดรูป
- [x] 71.3 Unit tests สำหรับ search, role, ordering, malformed entries และ limits

## AK2 — เชื่อมหน้า memory และ UX เข้าถึงได้

- [x] 72.1 เพิ่มส่วนอ่านประวัติในหน้า memory; ข้อความใช้ textContent และไม่มีปุ่มลบ/แก้
- [x] 72.2 แสดงผลหลัง restore/import โดยไม่เพิ่มข้อมูลเข้า prompt หรือส่งออก network
- [x] 72.3 Browser smoke + อัปเดต `docs/MEMORY.md`

## AK3 — Release 2.17

- [x] 73.1 version 2.17.0 + CHANGELOG
- [x] 73.2 README (32 docs, 455 unit / 168 checks) + PHASES ปิดครบ
- [x] 73.3 ตรวจรับรวม: check 118 files · unit 455 · browser 168 · perf · build → PR

# รอบที่ 23 (v2.18)

เป้าหมาย: ให้หน้า conversation archive เข้าถึง log ที่ restore/import มาได้ครบถึงเพดาน memory 800 ข้อความ และแสดงสถานะเมื่อเจอข้อมูลมากกว่าเพดาน

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AL1 | ขยาย pagination ของ archive | 74.1–74.3 | ✅ |
| AL2 | ตรวจ XSS และขอบเขต log เต็ม | 75.1–75.3 | ✅ |
| AL3 | Release 2.18 | 76.1–76.3 | ✅ |

## AL1 — ขยาย pagination ของ archive

- [x] 74.1 load more เข้าถึงรายการได้ครบถึง 800 แทนเพดานหน้า 200
- [x] 74.2 เมื่อมีข้อมูลเกิน 800 ให้ซ่อนปุ่มเมื่อถึงเพดานและแจ้งจำนวนที่ยังไม่แสดง
- [x] 74.3 Unit tests ขอบเขต 50/200/800 และรายการเกินเพดาน

## AL2 — ตรวจ XSS และขอบเขต log เต็ม

- [x] 75.1 Browser smoke ข้อความ HTML ถูกแสดงเป็นข้อความ ไม่สร้าง element
- [x] 75.2 ทดสอบหน้า archive เปิดหลัง import/restore และ search/filter ไม่เขียน storage
- [x] 75.3 อัปเดต `docs/MEMORY.md` ให้ตรงกับเพดานที่เก็บจริง

## AL3 — Release 2.18

- [x] 76.1 version 2.18.0 + CHANGELOG
- [x] 76.2 README (32 docs, 456 unit / 170 checks) + PHASES ปิดครบ
- [x] 76.3 ตรวจรับรวม: check 118 files · unit 456 · browser 170 · perf · build → PR

# รอบที่ 24 (v2.19)

เป้าหมาย: เพิ่มตัวกรองวันที่ใน local conversation archive เพื่อให้ผู้ใช้ค้นประวัติเป็นช่วงเวลาได้โดยไม่เปลี่ยนหรือส่งข้อมูลออก

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AM1 | เพิ่มตัวกรองวันที่ inclusive ตาม local calendar day | 77.1–77.3 | ✅ |
| AM2 | เชื่อม UI ไทย/อังกฤษและทดสอบ privacy | 78.1–78.3 | ✅ |
| AM3 | Release 2.19 | 79.1–79.3 | ✅ |

## AM1 — เพิ่มตัวกรองวันที่ inclusive ตาม local calendar day

- [x] 77.1 filter helper รองรับวันที่เริ่ม/สิ้นสุดแบบรวมวันนั้นและจัดการวันผิดรูป/DST
- [x] 77.2 รวม date range กับค้นข้อความ/role และ reset pagination เมื่อเปลี่ยนเงื่อนไข
- [x] 77.3 Unit tests สำหรับขอบวัน, ช่วงเดียว, ช่วงว่าง/กลับด้าน และ invalid dates

## AM2 — เชื่อม UI ไทย/อังกฤษและทดสอบ privacy

- [x] 78.1 เพิ่ม date inputs ที่ติดป้ายชัดเจนและ localize ใน archive
- [x] 78.2 Browser smoke ช่วงวันที่เปลี่ยนผลค้นหา แต่ไม่เขียน memory storage
- [x] 78.3 อัปเดต `docs/MEMORY.md`

## AM3 — Release 2.19

- [x] 79.1 version 2.19.0 + CHANGELOG
- [x] 79.2 README (32 docs, 458 unit / 172 checks) + PHASES ปิดครบ
- [x] 79.3 ตรวจรับรวม: check 118 files · unit 458 · browser 172 · perf · build → PR

# รอบที่ 25 (v2.20)

เป้าหมาย: ทำให้การกรองบทสนทนาตามเวลาใช้ง่ายขึ้นด้วยตัวเลือกช่วงวันที่แบบเร็ว โดยยังใช้วันท้องถิ่นและไม่เปลี่ยน/ส่งข้อมูล

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AN1 | เพิ่ม quick date presets | 80.1–80.3 | ✅ |
| AN2 | เชื่อม date picker และทดสอบ privacy | 81.1–81.3 | ✅ |
| AN3 | Release 2.20 | 82.1–82.3 | ✅ |

## AN1 — เพิ่ม quick date presets

- [x] 80.1 helper สร้างช่วง All/Today/Last 7 days/Last 30 days ตามวันท้องถิ่น
- [x] 80.2 preset กำหนด date inputs; แก้ input ด้วยมือเปลี่ยนเป็น Custom; All ล้างช่วง
- [x] 80.3 Tests สำหรับขอบเขตช่วง, rollover เดือน/ปี/leap day และ DST-aware local calendar

## AN2 — เชื่อม date picker และทดสอบ privacy

- [x] 81.1 เพิ่ม select ที่แปลไทย/อังกฤษและติด label
- [x] 81.2 Browser smoke preset กรองข้อความวันนี้โดยไม่เขียน memory storage
- [x] 81.3 อัปเดต `docs/MEMORY.md`

## AN3 — Release 2.20

- [x] 82.1 version 2.20.0 + CHANGELOG
- [x] 82.2 README (32 docs, 459 unit / 173 checks) + PHASES ปิดครบ
- [x] 82.3 ตรวจรับรวม: check 118 files · unit 459 · browser 173 · perf · build → PR

# รอบที่ 26 (v2.21)

เป้าหมาย: ป้องกันการทิ้ง facts, conversation history และ health summary เก่าโดยอัตโนมัติเมื่อเกินเพดานภายใน และให้ archive/backup เข้าถึงประวัติที่เก็บไว้ได้ทั้งหมด

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AO1 | ยกเลิกการ prune memory/log/health summary อัตโนมัติ | 83.1–83.3 | ✅ |
| AO2 | archive paging และ backup แบบไม่ตัดประวัติเงียบ ๆ | 84.1–84.3 | ✅ |
| AO3 | Release 2.21 | 85.1–85.3 | ✅ |

## AO1 — ยกเลิกการ prune memory/log อัตโนมัติ

- [x] 83.1 เพิ่ม facts/log/health summaries เกินเพดานเดิมแล้วยังเก็บของเก่าและใหม่ครบ
- [x] 83.2 import/export และ merge memory ไม่ตัด record เก่า; การ replace ยังทำหลังผู้ใช้เลือกเอง
- [x] 83.3 Tests สำหรับ retention และ persistence หลังเกินเพดานเดิม

## AO2 — archive paging และ backup แบบไม่ตัดประวัติเงียบ ๆ

- [x] 84.1 archive ใช้ older/newer ทีละ 50 ได้โดยไม่มีเพดาน 800
- [x] 84.2 full backup รวม facts/log/health summaries ทั้งหมด; cap import อิงขนาดไฟล์ ไม่ silently slice ประวัติ
- [x] 84.3 Browser smoke ตรวจ pagination, restore, memory-import confirmation; UI แจ้งเมื่อ export เกิน 20 MiB และอัปเดต docs memory/storage/backup/health

## AO3 — Release 2.21

- [x] 85.1 version 2.21.0 + CHANGELOG
- [x] 85.2 README (32 docs, 462 unit / 178 checks) + PHASES ปิดครบ
- [x] 85.3 ตรวจรับรวม: check 118 files · unit 462 · browser 178 · perf · build → PR

# รอบที่ 27 (v2.22)

เป้าหมาย: ทำให้ memory JSON import มี dry-run ที่บอกผล merge จริงก่อนยืนยัน และไม่มีการเขียน storage หากผู้ใช้ยกเลิก

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AP1 | เพิ่ม pure memory import plan | 86.1–86.3 | ✅ |
| AP2 | แสดง preview/ยืนยันก่อน apply | 87.1–87.3 | ✅ |
| AP3 | Release 2.22 | 88.1–88.3 | ✅ |

## AP1 — เพิ่ม pure memory import plan

- [x] 86.1 plan นับ fact added/merged/skipped และ conversation added/skipped โดยไม่แก้ instance/storage
- [x] 86.2 apply ใช้ผล plan เดิมครั้งเดียว; merge รักษา history เก่าและ dedupe เฉพาะ identity ที่ตรงกัน
- [x] 86.3 Unit tests สำหรับ duplicate/fuzzy merge, malformed rows, replacement plan และ read-only behavior

## AP2 — แสดง preview/ยืนยันก่อน apply

- [x] 87.1 confirm แสดงจำนวนที่จะเพิ่ม/รวม/ข้ามจริง ไม่ใช่ raw row count
- [x] 87.2 Browser smoke ยืนยัน cancel ไม่เขียน storage และ confirm เขียนตาม preview
- [x] 87.3 อัปเดต `docs/MEMORY.md`

## AP3 — Release 2.22

- [x] 88.1 version 2.22.0 + CHANGELOG
- [x] 88.2 README + PHASES ปิดครบ
- [x] 88.3 ตรวจรับรวม (check/test/browser/perf/build) + PR

# รอบที่ 28 (v2.23)

เป้าหมาย: ป้องกันการใช้ import preview ที่ไม่ถูกต้องหรือเก่า หลัง memory เปลี่ยนระหว่าง plan กับ apply; แผนที่หมดอายุ/ถูกแก้ไข/มาจาก store อื่นต้องไม่เขียน storage

| # | งาน | ช่วง | สถานะ |
|---|---|---|---|
| AQ1 | ทำ import plan ให้ opaque และผูกกับ store ต้นทาง | 89.1–89.3 | ✅ |
| AQ2 | ปฏิเสธ plan ที่ stale/tampered ก่อน persist | 90.1–90.3 | ✅ |
| AQ3 | Release 2.23 | 91.1–91.3 | ✅ |

## AQ1 — ทำ import plan ให้ opaque และผูกกับ store ต้นทาง

- [x] 89.1 เก็บ payload/result จริงใน WeakMap; consumer เห็นเฉพาะ preview counts
- [x] 89.2 อนุญาต apply เฉพาะ plan ที่สร้างจาก MemoryStore instance นี้และยังไม่เคยใช้
- [x] 89.3 Unit tests สำหรับ plan ที่ปลอม/แก้ไข/ย้ายข้าม instance และ apply ซ้ำ

## AQ2 — ปฏิเสธ plan ที่ stale ก่อน persist

- [x] 90.1 ตรวจ snapshot ของ facts/log/meta ก่อน apply; state เปลี่ยนแล้วให้ reject แบบ no-write
- [x] 90.2 UI แจ้งให้ผู้ใช้เริ่ม import ใหม่เมื่อ preview หมดอายุ
- [x] 90.3 Browser smoke ครอบคลุมการเปลี่ยน memory ระหว่าง plan/apply โดยไม่ทิ้งข้อมูล

## AQ3 — Release 2.23

- [ ] 91.1 version 2.23.0 + CHANGELOG
- [ ] 91.2 README + PHASES ปิดครบ
- [ ] 91.3 ตรวจรับรวม (check/test/browser/perf/build) + PR
