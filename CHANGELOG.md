# Changelog

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชัน: SemVer

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
