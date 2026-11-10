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
