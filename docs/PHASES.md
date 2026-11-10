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
| R5 | Release 1.3 | 5.1–5.3 | ⬜ |

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

- 5.1 version 1.3.0 + CHANGELOG
- 5.2 README + PHASES ปิดครบ
- 5.3 ตรวจรับรวม + PR
