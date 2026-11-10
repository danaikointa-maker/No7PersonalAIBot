# Changelog

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชัน: SemVer

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
