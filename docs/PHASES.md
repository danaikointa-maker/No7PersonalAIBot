# แผนเฟสงาน (Loop: วิเคราะห์ → เฟส → งานย่อยตามลำดับ → ปิดเฟส → เฟถัดไป)

อัปเดตสถานะในไฟล์นี้ทุกครั้งที่ปิดเฟส

| เฟส | ชื่อ | งานย่อย | สถานะ |
|---|---|---|---|
| 1 | ความจำอัจฉริยะ (Memory 2.0) | 1.1–1.4 | ✅ ปิดเฟส |
| 2 | เสียงไว + ปลุกด้วยชื่อ (Voice 2.0) | 2.1–2.5 | ✅ ปิดเฟส |
| 3 | Persona Studio | 3.1–3.4 | ✅ ปิดเฟส |
| 4 | Connectors & Sync | 4.1–4.4 | ⬜ |
| 5 | Device Hub (Phone-Link ครบวงจร) | 5.1–5.4 | ⬜ |
| 6 | Ship 1.0 (คุณภาพ + แจกจ่าย) | 6.1–6.4 | ⬜ |

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

- 4.1 ปฏิทิน: นำเข้า .ics, รายการนัด, `calendar_add` / `calendar_list`
- 4.2 อ่านฟีด RSS + สรุปหน้าเว็บ (`rss_read`, `summarize_url`)
- 4.3 ซิงก์ข้ามเครื่องผ่าน server `/api/sync` (token) + UI
- 4.4 Tests

## เฟส 5 — Device Hub

- 5.1 Link client (HMAC signer) + device registry ในเครื่อง
- 5.2 Server: command queue + poll + pairing persistence
- 5.3 UI: อุปกรณ์, ทดสอบเชื่อมต่อ, คำสั่งด่วน
- 5.4 ESP32 reference client + tests

## เฟส 6 — Ship 1.0

- 6.1 CI (GitHub Actions) + version 1.0.0 + CHANGELOG
- 6.2 Accessibility + คีย์ลัด + empty states
- 6.3 เอกสาร final + อัปเดต README
- 6.4 ตรวจรับรวม (test/build/check) + PR
