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

## v0.3 — ความจำและเสียงระดับถัดไป

- [ ] ความจำ: LLM consolidation รายวัน + หน้าจอตรวจ/แก้/ลบ + นำเข้า-ส่งออก
- [ ] Wake word "No7" (Vosk/Porcupine หรือ Web Speech ต่อเนื่อง)
- [ ] สตรีมมิ่งคำตอบ (token-by-token) + TTS แบบพูดทีละประโยค
- [ ] Persona editor ให้ผู้ใช้สร้างบุคลิกเองได้

## v0.4 — เชื่อมโลกภายนอก

- [ ] MCP client (Gmail / Calendar / Drive / Notion)
- [ ] Telegram / LINE bot ผ่าน `server/`
- [ ] Computer control (Electron: accessibility / UI automation) พร้อม allowlist
- [ ] ตารางงาน + แจ้งเตือนข้ามอุปกรณ์ (server sync แบบ self-host)
- [ ] ESP32 Phone-Link ครบวงจร (เสียงขึ้น-ลง, eyes บนจอ)

## v0.5 — คุณภาพและการกระจาย

- [ ] เลือกเสียง TTS ระดับพรีเมียม (Edge TTS / Kokoro in-app / ElevenLabs)
- [ ] โมเดลในเครื่องเต็มรูปแบบ (Ollama/Llama.cpp) สำหรับโหมดออฟไลน์
- [ ] Auto-update (electron-updater), CI build ทั้ง 3 แพลตฟอร์ม
- [ ] E2E test (Playwright) + performance budget
- [ ] i18n: ไทย/อังกฤษ สลับได้ทั้ง UI
