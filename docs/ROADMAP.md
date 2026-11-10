# Roadmap

## v0.1 — รากฐานที่รันได้ทั้งมือถือและ PC ✅

- [x] ชุดโค้ดเดียว (web) → PWA + Electron + Capacitor
- [x] แชท + เสียงไทย (STT/TTS) + subtitle + อวาตาร์ 14 อารมณ์
- [x] 8 personas + กฎ ค่ะ/ครับ
- [x] ความจำระยะยาว BM25 GraphRAG-lite + heuristic consolidation
- [x] 10 tools พร้อมการ์ดผลลัพธ์ (ไม่มีคีย์ก็ใช้ได้)
- [x] 5 AI providers + quota-aware fallback
- [x] Derived state machine 8 สถานะ
- [x] เดสก์ท็อป: tray, hotkey, overlay always-on-top
- [x] server: static + AI proxy + tool API + HMAC pairing
- [x] 23 unit tests + syntax checker + เอกสาร 6 ไฟล์ (v0.2: 34 tests + 26 e2e)

## v0.2 — "เลือกได้ทั้งหมด" ✅ (ตอบโจทย์คอนเซ็บ: ทำได้ทุกบทบาท)

- [x] Agent loop หลายก้าว (1–8 ขั้น, มีขั้นยืนยันก่อนทำงานเสี่ยง)
- [x] 5 บทบาท (ทั้งหมด/เพื่อน/งาน/ชีวิตประจำวัน/อุปกรณ์) + กรองเครื่องมือ
- [x] Permission gate: 5 หมวดสิทธิ์, 3 ระดับอิสระ, กล่องยืนยัน + อนุญาตตลอด session
- [x] โหมดค่าใช้จ่าย 4 แบบ (ฟรี/คุณภาพ/ส่วนตัว/ผสม) + fallback chain
- [x] เครื่องมือ 19 ตัว (เพิ่ม calc, reminder, memory_*, open_url, clipboard, compose_message, open_app, system_info)
- [x] เตือนความจำตามเวลาจริง + คืนค่าการเตือนหลังรีสตาร์ท
- [x] เดสก์ท็อป: clipboard / open-app / notify bridge

## v1.0 — ครบวงจร ✅

- [x] ความจำ: LLM consolidation + หน้าจอตรวจ/แก้/ลบ/ปักหมุด + นำเข้า-ส่งออก
- [x] Wake word "No7" + หยุดฟังขณะพูด
- [x] สตรีมมิ่งคำตอบ + พูดก่อนคำตอบจบ
- [x] Persona Studio (สร้าง/แก้/ทำสำเนา/ลบ)
- [x] ปฏิทิน + นำเข้า/ส่งออก .ics
- [x] RSS + สรุปหน้าเว็บ (พร้อม server proxy)
- [x] ซิงก์ข้ามเครื่อง (self-hosted)
- [x] Phone-Link HMAC + Device Hub + ESP32 client
- [x] CI + accessibility + เอกสารครบ

## v1.3 — ใช้จริงบนมือถือ + ต่อโลกภายนอก ✅

- [x] Mobile hardening: PWA shortcuts, capability report, storage management, offline banner
- [x] Barge-in (keyword/any) + TTS router (system / OpenAI-compatible / off) พร้อม fallback
- [x] MCP client (JSON-RPC 2.0 over HTTP) + proxy + dynamic tool registry + สิทธิ์หมวด `mcp`
- [x] Reliability: retry/backoff, offline outbox, metrics (first token/p95), diagnostics ที่ปิดข้อมูลอ่อนไหว

## v1.4 — เชื่อมโลกภายนอกให้ลึกขึ้น ✅

- [x] MCP transport เพิ่มเติม: stdio ผ่าน proxy + OAuth 2.0 PKCE
- [x] Telegram / LINE bot ผ่าน `server/`
- [x] Computer control (Electron) พร้อม allowlist 3 ชั้น + audit
- [x] งาน + แจ้งเตือนข้ามอุปกรณ์ (self-host sync, LWW + tombstone)

## v1.5 — ลงลึกที่อุปกรณ์และออฟไลน์

- [ ] UI automation (Electron accessibility) ต่อจาก `control_run`
- [ ] ESP32 Phone-Link ครบวงจร (เสียงขึ้น-ลง, eyes บนจอ)
- [ ] MCP OAuth: dynamic client registration + device code flow
- [ ] recurring tasks + แจ้งเตือนข้ามเครื่องอัตโนมัติ (push)

## v2.0 — คุณภาพและการกระจาย

- [ ] เลือกเสียง TTS ระดับพรีเมียมเพิ่ม (Edge TTS / Kokoro in-app / ElevenLabs)
- [ ] โมเดลในเครื่องเต็มรูปแบบ (Ollama/Llama.cpp) สำหรับโหมดออฟไลน์
- [ ] Auto-update (electron-updater), CI build ทั้ง 3 แพลตฟอร์ม
- [ ] E2E test (Playwright) + performance budget
- [ ] i18n: ไทย/อังกฤษ สลับได้ทั้ง UI
