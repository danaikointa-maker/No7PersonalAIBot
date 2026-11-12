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

สถานะของรายการเดิม: TTS พรีเมียม (ElevenLabs), local models (Ollama/LM Studio), auto-update, CI build desktop ทั้งสามระบบ, performance budget และ UI ไทย/อังกฤษ ส่งมอบแล้ว ส่วน Edge TTS/Kokoro ในแอปยังไม่ใช่สิ่งที่ส่งมอบ; Playwright Chromium smoke สำหรับ boot/chat ทำงานใน CI แล้ว โดยการขยาย coverage เป็นงานต่อเนื่องด้านล่าง (jsdom ยังคงเป็นชั้นทดสอบเร็ว):

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
| P1 | ทบทวน low severity advisories ใน dev tooling | เฝ้าติดตาม upstream | รอบนี้ตรวจ `npm audit` และ dependency tree แล้ว: เหลือ 4 Low จาก `deepmerge@4.3.1` ผ่าน `@rollup/plugin-node-resolve` → `workbox-build` → `vite-plugin-pwa` ซึ่งเป็นสาย build-time ใน devDependencies; advisory คือ [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4); registry ยังไม่มี deepmerge รุ่น 4.x ที่แก้แล้ว และ `npm audit fix --force` เสนอ downgrade `vite-plugin-pwa` เป็น 0.2.1 แบบ breaking จึงไม่ใช้; ตรวจใหม่เมื่อ upstream ออกแพตช์ ห้ามซ่อนคำเตือนหรือ downgrade tooling |
| P1 | ย้าย Capacitor 6 → 8.6 | เกือบเสร็จ | v2.42.2 เผยแพร่แล้ว; CI generate/sync Android+iOS ผ่าน; ยังต้องทดสอบ microphone, navigation และ permissions บนอุปกรณ์จริงก่อนประกาศรองรับเต็มรูปแบบ |
| P1 | ขยาย CI ให้เห็นความเสี่ยงของ desktop/mobile ก่อน release | เกือบเสร็จ | Linux `.deb` smoke, release matrix 3 OS, audit gate, Android/iOS generation + sync และ Chromium E2E ผ่าน; ต้องทดสอบ real-device behavior ก่อนรับรอง native เต็มรูปแบบ |
| P1 | ขยาย real-browser E2E | ทำต่อเนื่อง | Playwright/Chromium ครอบ boot/chat/permission denial+approval/session, offline enqueue/remove/online flush และ backup restore แบบยกเลิกไม่เขียน storage/ยืนยันก่อนเขียนแล้ว; capability report เทียบ API จริง/กรณีไม่มี API ใน Chromium, Firefox, WebKit ผ่าน CI; ยังต้องทดสอบ hardware, permission จริง และ Capacitor บนอุปกรณ์ พร้อมคง jsdom เป็นชั้นเร็ว |
| P2 | ปรับปรุง GitHub Actions runtime | กำลังดำเนินการ | อัปเดต checkout/setup-node/setup-java และ upload/download-artifact ไป major ที่รองรับ Node 24; pin `ubuntu-latest` jobs เป็น `ubuntu-24.04`; เพิ่ม synthetic v7→v8 artifact round-trip ใน CI; ยืนยัน installer/release round-trip จริงเมื่อออก release ครั้งถัดไป |
| P2 | ตรวจความสามารถเสียงบนอุปกรณ์จริง | รอการทดสอบอุปกรณ์ | ยืนยันข้อจำกัด SpeechRecognition/wake word บน iOS Safari และ Android WebView รุ่นต่าง ๆ; พิจารณา native speech plugin หลังทบทวนสิทธิ์, offline behavior และ privacy |
| P2 | รักษาความถูกต้องของเอกสาร/ประวัติงาน | ทำต่อเนื่อง | ให้ README, BUILD, CHANGELOG, release metadata และสถานะใน PHASES ตรงกันทุกครั้งที่ส่ง release |

### งานเริ่มต้นในรอบนี้

- `npm audit` ก่อนเริ่มงานพบ 23 รายการ (รวม critical 1); pin `tar@7.5.23` ผ่าน npm override ลดเหลือ 18 และตัด critical ออก
- PR #70 รวมและเผยแพร่ [v2.42.1](https://github.com/danaikointa-maker/No7PersonalAIBot/releases/tag/v2.42.1) แล้ว; release run สร้าง Linux DEB, macOS ZIP, Windows NSIS/portable และ updater metadata ครบ
- Electron 45.3.0, electron-builder 26.18.x และ electron-updater 6.8.11 ผ่าน Linux packaging smoke และ release matrix; หลังจากนั้น pin patched glob/minimatch ตาม package subtree ลด audit จาก 12 เหลือ 4 low (ไม่มี moderate/high/critical)
- เพิ่ม `npm audit --audit-level=moderate` เป็น CI/release gate; `npm audit fix --force` ไม่ใช้ เพราะเสนอ downgrade electron-builder หรือยก Capacitor เป็น major โดยไม่มี native validation
- PR #74 อัปเดต Capacitor CLI/core/Android/iOS จาก 6.2 ไป 8.6; CI สร้าง/sync Android (JDK 21) และ iOS (macOS) ผ่าน โดยไม่เก็บ generated native project เข้า Git
- PR #75 รวมและเผยแพร่ [v2.42.2](https://github.com/danaikointa-maker/No7PersonalAIBot/releases/tag/v2.42.2) แล้ว; run 43169027271 ผ่าน verify และ build installer ครบทุกระบบ พร้อม updater metadata; README/BUILD/mobile docs ระบุ Node.js และคำเตือนสำรอง native project เดิม
- ยังต้องทดสอบบนอุปกรณ์จริงก่อนรับรองไมโครโฟน/เสียง; ตรวจ upstream สำหรับ deepmerge low advisory ต่อไปโดยไม่ downgrade tooling

### วิธีตรวจรับก่อนปิดงานแต่ละชุด

1. ติดตั้งแบบ clean จาก lockfile (`npm ci`) และตรวจ `npm audit` แยกตาม dependency direct/transitive; บันทึกข้อยกเว้นพร้อมเหตุผลและวันทบทวน ห้ามปิด audit ด้วยการซ่อนหรือปิดคำเตือน
2. รัน `npm run check`, `npm test`, `npm run test:browser`, `npm run build`, `npm run perf` และ `git diff --check`
3. สำหรับ Electron/electron-builder: ทดสอบแพ็กเกจบน OS ที่เกี่ยวข้อง, เปิด/ตรวจอัปเดตโดยไม่ติดตั้งเองแบบเงียบ และยืนยันไฟล์ release ตรงกับ workflow
4. สำหรับ Capacitor: สร้าง/sync โปรเจกต์ทดลองบน Android และ iOS ตามเอกสาร platform; ตรวจ permission prompts, microphone, navigation และ backup/restore บนอุปกรณ์จริง ก่อนประกาศรองรับ
5. หลัง merge ตรวจ PR, CI, release metadata และสถานะ repository; ไม่ออก release ใหม่เพียงเพราะมีการเปลี่ยนเอกสารหรือ lockfile โดยไม่มีเหตุผลด้านเวอร์ชัน/ผู้ใช้
