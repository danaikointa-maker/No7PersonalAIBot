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

## v1.5 — ลงลึกที่อุปกรณ์และออฟไลน์ ✅

- [x] งานซ้ำ (recurrence) + เตือนผ่าน server/Telegram แม้ปิดแอป (push)
- [x] Desktop awareness: รายชื่อหน้าต่าง + โฟกัส + สูตรอัตโนมัติ (dry-run ได้)
- [x] ESP32 Phone-Link ครบวงจร (hello/capabilities, eyes บนจอ, เสียงขึ้น–ลง)
- [x] MCP OAuth: dynamic client registration + device code flow

## v2.0 — คุณภาพและการกระจาย

สถานะของรายการเดิม: TTS พรีเมียม (ElevenLabs), local models (Ollama/LM Studio), auto-update, CI build desktop ทั้งสามระบบ, performance budget และ UI ไทย/อังกฤษ ส่งมอบแล้ว ส่วน Edge TTS/Kokoro ในแอปและ Playwright บน browser จริงยังไม่ใช่สิ่งที่ส่งมอบ; Playwright แยกเป็น backlog ด้านล่าง (ปัจจุบันใช้ jsdom browser smoke):

- [x] เลือกเสียง TTS ระดับพรีเมียมเพิ่ม — ElevenLabs
- [x] โมเดลในเครื่อง (Ollama / LM Studio) และ provider fallback
- [x] Auto-update (electron-updater), CI build ทั้ง 3 แพลตฟอร์ม
- [x] Performance budget และ browser smoke/integration checks บน jsdom
- [x] i18n: ไทย/อังกฤษ สลับได้ทั้ง UI

## งานคงค้างและลำดับถัดไป (ตรวจสถานะ 2026-11-10)

เอกสารนี้สรุปงานต่อเนื่องจากสถานะ repository และผลตรวจ dependency ปัจจุบัน ไม่ใช่คำรับรองกำหนดส่ง; ปิดรายการเมื่อมีหลักฐานทดสอบและส่งงานครบเท่านั้น อย่าลบหรือย้ายข้อมูลผู้ใช้โดยอัตโนมัติ งาน backup/import/sync ต้องคงการเริ่มโดยผู้ใช้, การยืนยันก่อนเขียน storage และข้อจำกัดข้อมูลสุขภาพเป็น summary metrics เท่านั้น

| ลำดับ | งาน | สถานะ | เงื่อนไขปิดงาน |
|---|---|---|---|
| P0 | แก้ Critical/High ใน dependency runtime และ desktop tooling | ✅ v2.42.1 | pin tar รุ่นแก้ critical; อัปเดต Electron/electron-builder/electron-updater; CI packaging smoke และ release matrix Linux/macOS/Windows ผ่าน |
| P1 | ลด moderate dependency advisories ที่ยังเหลือ | วางแผน | ตรวจและอัปเดต Capacitor CLI, glob/minimatch และ transitive chain ทีละชุด โดยไม่ลดรุ่น Electron tooling และไม่ซ่อนผล audit; เป้าหมายคือ audit clean หรือข้อยกเว้นที่อธิบาย/กำหนดวันทบทวน |
| P1 | ย้าย Capacitor 6 ไปสายที่ได้รับ security fixes | วางแผน | ปรับ CLI/core/android/ios ให้รุ่นเข้ากัน, อัปเดตข้อกำหนด Node/Android Gradle/Xcode และทดสอบสร้าง/sync native project บน Android/iOS; ไม่เปลี่ยน native project ที่ผู้ใช้มีอยู่แบบทำลายข้อมูล |
| P1 | ขยาย CI ให้เห็นความเสี่ยงของ desktop/mobile ก่อน release | กำลังดำเนินการ | Linux `.deb` smoke และ release matrix 3 OS ผ่านแล้ว; ยังต้องกำหนด audit policy และพิจารณา native mobile checks |
| P1 | เพิ่ม real-browser E2E | วางแผน | ประเมิน Playwright บน Chromium ใน CI เพื่อทดสอบ flow สำคัญจริง; คง jsdom tests เป็นชั้นที่เร็วกว่าและไม่อ้างว่าแทนอุปกรณ์จริง |
| P2 | ตรวจความสามารถเสียงบนอุปกรณ์จริง | รอการทดสอบอุปกรณ์ | ยืนยันข้อจำกัด SpeechRecognition/wake word บน iOS Safari และ Android WebView รุ่นต่าง ๆ; พิจารณา native speech plugin หลังทบทวนสิทธิ์, offline behavior และ privacy |
| P2 | รักษาความถูกต้องของเอกสาร/ประวัติงาน | ทำต่อเนื่อง | ให้ README, BUILD, CHANGELOG, release metadata และสถานะใน PHASES ตรงกันทุกครั้งที่ส่ง release |

### งานเริ่มต้นในรอบนี้

- `npm audit` ก่อนเริ่มงานพบ 23 รายการ (รวม critical 1); pin `tar@7.5.23` ผ่าน npm override ลดเหลือ 18 และตัด critical ออก
- PR #70 รวมและเผยแพร่ [v2.42.1](https://github.com/danaikointa-maker/No7PersonalAIBot/releases/tag/v2.42.1) แล้ว; release run สร้าง Linux DEB, macOS ZIP, Windows NSIS/portable และ updater metadata ครบ
- Electron 45.3.0, electron-builder 26.18.x และ electron-updater 6.8.11 ผ่าน Linux packaging smoke และ release matrix; audit lockfile ปัจจุบันเหลือ 12 (low 2, moderate 10, high/critical 0)
- งานถัดไปคือจัดการ moderate advisories และ Capacitor 8 ซึ่งต้องใช้ Node 22 พร้อม migration native แยก; ไม่ใช้ `npm audit fix --force` แบบเหมารวม เพราะอาจอัปเกรด native tooling หลายชุดพร้อมกันโดยไม่มี validation

### วิธีตรวจรับก่อนปิดงานแต่ละชุด

1. ติดตั้งแบบ clean จาก lockfile (`npm ci`) และตรวจ `npm audit` แยกตาม dependency direct/transitive; บันทึกข้อยกเว้นพร้อมเหตุผลและวันทบทวน ห้ามปิด audit ด้วยการซ่อนหรือปิดคำเตือน
2. รัน `npm run check`, `npm test`, `npm run test:browser`, `npm run build`, `npm run perf` และ `git diff --check`
3. สำหรับ Electron/electron-builder: ทดสอบแพ็กเกจบน OS ที่เกี่ยวข้อง, เปิด/ตรวจอัปเดตโดยไม่ติดตั้งเองแบบเงียบ และยืนยันไฟล์ release ตรงกับ workflow
4. สำหรับ Capacitor: สร้าง/sync โปรเจกต์ทดลองบน Android และ iOS ตามเอกสาร platform; ตรวจ permission prompts, microphone, navigation และ backup/restore บนอุปกรณ์จริง ก่อนประกาศรองรับ
5. หลัง merge ตรวจ PR, CI, release metadata และสถานะ repository; ไม่ออก release ใหม่เพียงเพราะมีการเปลี่ยนเอกสารหรือ lockfile โดยไม่มีเหตุผลด้านเวอร์ชัน/ผู้ใช้
