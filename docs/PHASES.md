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
| S5 | Release 1.5 | 15.1–15.3 | ⬜ |

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

- 15.1 version 1.5.0 + CHANGELOG
- 15.2 README + ROADMAP + PHASES ปิดครบ
- 15.3 ตรวจรับรวม + PR
