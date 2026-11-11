# Changelog

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชัน: SemVer

## [2.18.0] — 2026-11-10

รอบที่ยี่สิบสาม: ขยายการเข้าถึง conversation archive ให้ครบ log ในเครื่อง

### เปลี่ยน
- archive โหลดเพิ่มครั้งละ 50 ได้ครบสูงสุด 800 ข้อความ (เท่ากับ memory log cap) จากเดิม 200
- เมื่อข้อมูลผิดปกติเกิน 800 แสดงจำนวนที่แสดงและซ่อนปุ่มเมื่อถึงขีดจำกัด
- เพิ่ม browser smoke ยืนยัน HTML ในข้อความไม่ถูก execute และ search/filter ไม่เขียน storage

### ตรวจรับ
- 456 unit tests · 170 browser checks · `npm run check` 118 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.9 KB; main gzip 108.2 KB

## [2.17.0] — 2026-11-10

รอบที่ยี่สิบสอง: เพิ่มหน้าอ่าน/ค้นหา conversation archive ที่เก็บในเครื่อง

### เพิ่ม
- หน้า memory แสดงบทสนทนาที่เก็บใน log รวมถึงรายการ restore/import
- ค้นหาข้อความและกรอง user/assistant; เรียงใหม่→เก่า, โหลดทีละ 50 และจำกัด 200 ต่อหน้า
- render ด้วย textContent; archive เป็น read-only และการค้นหาไม่ส่งข้อความไป AI/เครือข่าย

### ตรวจรับ
- 455 unit tests · 168 browser checks · `npm run check` 118 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.9 KB; main gzip 108.1 KB

## [2.16.0] — 2026-11-10

รอบที่ยี่สิบเอ็ด: กู้คืน backup โดยรักษา API credentials ที่มีอยู่ในเครื่อง

### เปลี่ยน
- merge settings กับค่าในเครื่องแทนการแทนที่ทั้งก้อน
- เมื่อไฟล์ redacted หรือคีย์ว่าง รักษา `apiKey`, `ttsApiKey`, `syncToken` เดิมไว้
- จับคู่ MCP server ด้วย id/name/url และคง apiKey เดิมของรายการที่ตรงกัน
- แสดงคำเตือนใน dry-run; secrets ที่แนบมาในไฟล์ยังเตือนและถูกใช้ตามที่เลือก

### ตรวจรับ
- 452 unit tests · 167 browser checks · `npm run check` 116 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.9 KB; main gzip 106.9 KB

## [2.15.0] — 2026-11-10

รอบที่ยี่สิบ: ป้องกันการนำเข้าไฟล์สำรองที่ใหญ่หรือผิดรูปเกินไป

### เพิ่ม
- จำกัด full backup 20 MiB; UI ปฏิเสธก่อน FileReader และ `validateBackup` ตรวจ UTF-8 bytes ก่อน parse
- ตรวจว่า collection เป็น array และอยู่ในขีดจำกัด (facts 3,000 · log 500 · personas 100 · healthHistory 30 · collections อื่น 50,000)
- ข้าม row ที่ไม่ใช่ object ใน restore plan เพื่อไม่ให้ malformed rows ทำให้ทั้งแผน throw

### ตรวจรับ
- 451 unit tests · 166 browser checks · `npm run check` 116 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.9 KB; main gzip 106.6 KB

## [2.14.0] — 2026-11-10

รอบที่สิบเก้า: กู้คืน chat log จากไฟล์สำรองได้หลังยืนยัน พร้อม normalize ข้อมูล

### เพิ่ม
- สำรอง 500 ข้อความล่าสุด; restore merge/replace เข้า local memory log สูงสุด 800 รายการ
- รับเฉพาะ role `user`/`assistant`, text สูงสุด 2,000 ตัวอักษร และ timestamp ถูกต้อง; ตัด metadata อื่นออก
- merge ด้วย role + timestamp + ข้อความเต็ม เรียงตามเวลา และกันรายการซ้ำ
- memory JSON import รองรับ chat log ด้วย พร้อมแสดงจำนวนที่เพิ่ม; full restore แสดงจำนวน log ในผลลัพธ์

### ตรวจรับ
- 449 unit tests · 165 browser checks · `npm run check` 116 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.9 KB; main gzip 106.1 KB

## [2.13.0] — 2026-11-10

รอบที่สิบแปด: รวม custom personas ในไฟล์สำรอง/กู้คืนข้อมูลทั้งแอปอย่างปลอดภัย

### เพิ่ม
- สำรองเฉพาะ Persona Studio ที่ผู้ใช้สร้าง; ไม่รวม/ไม่เขียนทับ persona built-in
- normalize ด้วย whitelist; จำกัด 100 custom personas, ความยาวข้อความ, banned topics และ voiceName
- merge ด้วย ID และ `updatedAt` (เพิ่ม timestamp ตอนแก้ persona); replace แทนที่เฉพาะ custom personas
- หลัง restore ตรวจ persona ที่เลือกและกลับไป built-in `no7` หากไม่มี; refresh UI หลังยืนยัน

### ตรวจรับ
- 446 unit tests · 164 browser checks · `npm run check` 116 JS files
- Performance/build ผ่าน; source ใหญ่สุด 150.0 KB; main gzip 105.7 KB

## [2.12.0] — 2026-11-10

รอบที่สิบเจ็ด: รวมประวัติสุขภาพแบบสรุปในไฟล์สำรอง/กู้คืนข้อมูลทั้งแอป

### เพิ่ม
- app backup เก็บ `healthHistory` เฉพาะ `{ date, score, grade, issues }` ที่ normalize แล้ว ไม่เกิน 30 วัน
- restore แสดงจำนวนในแผน dry-run; merge ตามวันที่และให้ข้อมูลจากไฟล์ชนะเมื่อวันซ้ำ; replace ตามโหมดเดิม
- เขียนประวัติลง localStorage หลังยืนยันกู้คืน; ไฟล์ backup รุ่นเก่าที่ยังไม่มี healthHistory ใช้ได้เหมือนเดิม
- แสดงจำนวนประวัติสุขภาพในสถานะหลังส่งออก และอัปเดตเอกสาร/ทดสอบ privacy

### ตรวจรับ
- 442 unit tests · 163 browser checks · `npm run check` 115 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.8 KB; main gzip 105.3 KB

## [2.11.0] — 2026-11-11

รอบที่สิบหก: นำเข้าประวัติสุขภาพ JSON แบบตรวจสอบและ preview ก่อน merge

### เพิ่ม
- รับเฉพาะ `no7-health-history` schema 1; จำกัดไฟล์ 64 KiB และไม่เกิน 30 snapshots
- ตรวจ format, exportedAt, วัน/คะแนน/จำนวน; ทิ้ง field เพิ่มเติมและแถว malformed
- merge ตามวัน โดยไฟล์นำเข้าชนะเมื่อวันที่ชนกัน; แสดงจำนวนเพิ่ม/แทนที่/คงเดิม/ตัดเก่าก่อนยืนยัน
- วางแผนแบบ read-only และเขียน localStorage หลังผู้ใช้ยืนยันเท่านั้น; ไม่อัปโหลด
- เพิ่ม `parseHealthHistoryBackup`, `planHealthHistoryImport`, `applyHealthHistoryImport` และ file picker ไทย/อังกฤษ

### ตรวจรับ
- 439 unit tests · 161 browser checks · `npm run check` 115 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.6 KB; main gzip 105.2 KB

## [2.10.0] — 2026-11-10

รอบที่สิบห้า: ส่งออกประวัติสุขภาพเป็น JSON แบบมี schema และตัดข้อมูลส่วนตัวออก

### เพิ่ม
- ปุ่ม JSON ในประวัติสุขภาพ พร้อมชื่อไฟล์วันที่และ download/clipboard fallback
- `healthHistoryJson` สร้าง envelope `{ format, schema, exportedAt, snapshots }`; snapshots ผ่าน normalization และจำกัด 30 รายการ
- ไม่ส่งออก field เพิ่มเติมหรือเนื้อหาความจำ/โน้ต/งาน/นัดหมาย; ไม่มี auto-export
- Tests สำหรับ JSON schema, field privacy, ข้อมูลว่าง และ browser smoke

### ตรวจรับ
- 434 unit tests · 159 browser checks · `npm run check` 112 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.3 KB

## [2.9.0] — 2026-11-10

รอบที่สิบสี่: เลือกดูแนวโน้มสุขภาพช่วง 7 หรือ 30 วัน พร้อมสถิติช่วงที่เลือก

### เพิ่ม
- ตัวกรอง 7/30 วันตามปฏิทินเครื่อง; เปลี่ยนกราฟและรายการทันที โดยไม่สแกนหรือเขียน localStorage
- สรุปจำนวนวันที่มีข้อมูล, ค่าเฉลี่ย, สูงสุด/ต่ำสุด และ delta จากคะแนนแรกถึงล่าสุดในช่วง
- การคำนวณรองรับวันที่ขาด, ช่วงที่ไม่มีข้อมูล และไม่นับวันที่ในอนาคต
- เพิ่ม `filterHealthHistory` / `healthWindowSummary`; tests ขอบเขตวันและ UI

### ตรวจรับ
- 433 unit tests · 159 browser checks · `npm run check` 112 JS files
- Performance/build ผ่าน; source ใหญ่สุด 149.1 KB; main gzip 103.9 KB

## [2.8.0] — 2026-11-10

รอบที่สิบสาม: ส่งออกประวัติสุขภาพในเครื่องเป็น CSV หรือ Markdown ได้เอง

### เพิ่ม
- ส่งออกเฉพาะ snapshot คะแนน/เกรด/จำนวนปัญหา ด้วย CSV (BOM) หรือ Markdown ไทย/อังกฤษ
- ชื่อไฟล์มีวันที่; ดาวน์โหลดผ่าน browser และใช้ clipboard fallback เมื่อดาวน์โหลดไม่ได้
- CSV สร้างจาก schema ที่ normalize แล้วและใช้ escape/formula guard; ไม่มีข้อความความจำ/โน้ต/งาน/นัดหมาย
- เพิ่ม `healthHistoryCsv` / `healthHistoryMarkdown`; tests รูปแบบ, ภาษา, privacy, malformed/formula-like data

### ตรวจรับ
- 431 unit tests · 156 browser checks · `npm run check` 112 JS files
- Performance/build ผ่าน; source ใหญ่สุด 148.8 KB; main gzip 103.0 KB

## [2.7.0] — 2026-11-10

รอบที่สิบสอง: ดูแนวโน้มคะแนนสุขภาพข้อมูลย้อนหลัง โดยเก็บเฉพาะข้อมูลสรุปไว้ในเครื่อง

### เพิ่ม
- ประวัติสุขภาพแบบ schema 1 สูงสุด 30 วัน; สแกนซ้ำในวันเดิมแทนที่ snapshot เดิม
- เก็บเฉพาะวัน คะแนน เกรด และจำนวนปัญหาแยก high/medium/low — ไม่บันทึกข้อความหรือรายละเอียดส่วนตัว
- กราฟ SVG ที่เข้าถึงได้, รายการสรุปแบบข้อความ, ส่วนต่างจากการสแกนครั้งก่อน (ไทย/อังกฤษ)
- ปุ่มล้างประวัติแยกจากข้อมูลสุขภาพ และยืนยันก่อนลบ
- `core/health-history.js` + `ui/health-history.js`; tests สำหรับ schema/retention/trend/UI

### ตรวจรับ
- 427 unit tests · 154 browser checks · `npm run check` 110 JS files
- Performance/build ผ่าน; source ใหญ่สุด 148.0 KB; main gzip 102.3 KB

## [2.6.0] — 2026-11-10

รอบที่สิบเอ็ด: ย้อนกลับการล้างข้อมูลได้ใน 30 วินาที และ UI สุขภาพข้อมูลเปลี่ยนภาษาได้ครบ

### เพิ่ม
- ปุ่ม Undo หลังล้างข้อมูล พร้อมคืน metadata ความจำเดิมภายใน 30 วินาที
- Undo ทำงานใน session ปัจจุบันเท่านั้น; snapshot ล่าสุดอยู่ในหน่วยความจำ ไม่เพิ่มสำเนาถาวรใน localStorage
- ป้องกันการคืนความจำที่มี id/ข้อความเดิม และแทรกโน้ต/สิ่งที่ต้องทำกลับโดยไม่เขียนทับรายการใหม่
- ปุ่มสแกน, การ์ด, คำยืนยัน และข้อความ Undo รองรับไทย/อังกฤษ; เปลี่ยนภาษาแล้ว render การ์ดเดิมทันที
- `MemoryStore.restoreFacts` + UI copy แยกใน `core/health-i18n.js`; tests และ smoke เพิ่ม

### ตรวจรับ
- 420 unit tests · 151 browser checks · `npm run check` 106 JS files
- Performance/build ผ่าน; source ใหญ่สุด 147.3 KB (เพดาน 150 KB)

## [2.5.0] — 2026-11-10

รอบที่สิบ: ตรวจสุขภาพข้อมูลในเครื่องและล้างเฉพาะรายการซ้ำ/ว่างโดยต้องยืนยันก่อน

### เพิ่ม
- 🩺 ตรวจซ้ำ/ว่าง/เก่า/งานเกินกำหนด/นัดเก่า พร้อมคะแนนสุขภาพ 0–100 และเกรด A–D
- การ์ดสรุปผลและรายงาน Markdown ไทย/อังกฤษในแชท
- 🧹 ล้างรายการซ้ำ/ว่างแบบยืนยันก่อน; เก็บรายการล่าสุดในกลุ่มซ้ำ และไม่แตะความจำเก่า งาน หรือนัดหมาย
- `core/health.js` API + `docs/HEALTH.md`; 12 unit tests และ browser smoke สำหรับรายงาน/ล้างข้อมูล

### ความเป็นส่วนตัวและความปลอดภัย
- วิเคราะห์ในเครื่องทั้งหมด — ไม่มีการอัปโหลดข้อมูล
- การสแกนไม่ลบข้อมูล; รายการที่ไม่ปลอดภัยต่อการล้างแสดงเป็นคำแนะนำเท่านั้น

## [2.4.0] — 2026-11-10

รอบที่เก้า: ซิงก์ข้ามเครื่องที่ "รู้ว่าชนกัน" และส่งออกรายงานออกไปใช้ต่อได้

### เพิ่ม
**X1 — ซิงก์แบบ conflict-aware**
- `core/sync-merge.js`: `mergeRecordSets` + `mergeSyncBundle` รองรับ 4 กลยุทธ์
  `newest` (ค่าเริ่มต้น) / `prefer-local` / `prefer-remote` / `keep-both`
- คีย์ต่อชุด: facts=ข้อความ, notes/todos=เวลา+ข้อความ, tasks=`id`, events=`uid`
  และ `recordTime` (ts/updatedAt/at/createdAt; events ใช้ `start`) ใช้ตัดสินฝั่งที่แก้ล่าสุด
- รายงานผล `{data, collections, conflicts, totals}` + `summarizeSync` (ไทย/อังกฤษ) +
  `describeConflicts` + `deviceId()` (เก็บใน `no7.device.id`)
- หน้าตั้งค่า: เลือกกลยุทธ์ + ตารางความขัดแย้ง (`#sync-report`) + ประกาศในแชทเมื่อชนกัน
- `mergeBundle` เปลี่ยนไปใช้ตัวรวมใหม่ (personas ยัง additive) — `TaskStore.merge` ยังกัน tombstone
- `docs/SYNC.md`

**X2 — ส่งออกรายงาน (Markdown / CSV)**
- `core/report-export.js`: `escapeCsv` (กัน formula injection), `toCsv`, `weeklyCsv`, `digestCsv`,
  `reportMarkdown`, `dateStamp`, `datedFilename`, `downloadText`
- ปุ่ม ⬇️ Markdown / ⬇️ CSV บนการ์ดสรุปวันนี้และรายงานสัปดาห์ — ชื่อไฟล์มีวันที่, CSV มี BOM
  สำหรับ Excel ไทย; ถ้าเบราว์เซอร์โหลดไฟล์ไม่ได้จะคัดลอกไปคลิปบอร์ดแทน
- `docs/REPORTS.md`

### เปลี่ยน
- `perf-budget.json`: `source.maxFileKb` 140 → 150 KB (main.js 140.5 KB หลังเพิ่มปุ่มส่งออก/รายงานซิงก์)
- เอกสารรวม 31 ไฟล์

## [2.3.0] — 2026-11-10

รอบที่แปด: งานหลายเครื่องมือเห็นผลระหว่างทาง (ไม่ต้องรอคำตอบจบ) และมองภาพรวมสัปดาห์เพื่อวางแผนต่อ

### เพิ่ม
**W1 — ผลเครื่องมือแบบ progressive**
- ฟองคำตอบแยกเป็น `.msg-text` + `.msg-cards`: event `result` วาดการ์ดทันทีที่เครื่องมือคืนค่า
  (กำหนด `data-count` ไว้ตรวจสอบ), หลายเครื่องมือต่อคำสั่ง = หลายการ์ดในฟองเดียว
- ระหว่างลูปแสดง `ได้ผลแล้ว — กำลังสรุป…` / `เก็บผลแล้ว N อย่าง — กำลังสรุป…`
- คำตอบสุดท้ายและข้อความ error เขียนเฉพาะ `.msg-text` → การ์ดที่วาดไปแล้วไม่หาย

**W2 — รายงานรายสัปดาห์**
- `core/weekly.js`: `startOfWeek`/`weekRange` (เริ่มจันทร์ 00:00, half-open), `buildWeekly`
  (ปิดได้/เพิ่มใหม่/เกินกำหนด/ครบกำหนดสัปดาห์หน้า/นัดหมาย/ความจำใหม่/เครื่องมือ+failure rate/
  latency แชท) + เทียบสัปดาห์ก่อน + ข้อเสนอโฟกัส + `weeklyMarkdown`
- tool `weekly` (dynamic, risk 0) + ปุ่ม "📆 รายงานสัปดาห์" + การ์ด `#weekly-card`
- `docs/WEEKLY.md`

### เปลี่ยน
- เครื่องมือในหน้าเครื่องมือ = 30 (28 เดิม + `digest` + `weekly`) และเพิ่มตามปลั๊กอิน

## [2.2.0] — 2026-11-10

รอบที่เจ็ด: ทำให้ข้อมูลที่สะสมไว้ "หาเจอ" และ "ย้ายเครื่องได้" — command palette ที่ค้นทุกอย่าง,
ไฟล์สำรอง schema ใหม่ที่ตรวจสอบได้ และกู้คืนแบบ dry-run ก่อนเขียนทับ

### เพิ่ม
**V1 — ค้นหาทุกอย่าง (⌘/Ctrl+K)**
- `core/search.js`: `buildIndex` (ความจำ/โน้ต/รายการ/งาน/นัด/เครื่องมือ/เมนู/คำสั่ง) + `searchIndex`
  (exact > prefix > substring > token, น้ำหนักชนิด, โบนัสความใหม่/pinned) + จำกัดผลลัพธ์ต่อชนิด
- `groupResults`, `matchRanges`, `highlightRanges` (ตำแหน่งบนข้อความดิบ — ปลอดภัยกับวรรณยุกต์ไทย),
  `defaultPaletteExtras()` (เมนู 7 หน้า + 3 คำสั่ง)
- UI `#palette`: เปิดด้วย ⌘/Ctrl+K, ↑↓/Enter/Esc, คลิกพื้นหลังปิด, ไฮไลต์คำค้นด้วย `<mark>`
- การกระทำ: เปลี่ยนหน้า, ค้นความจำทันที, แสดงงาน/นัด/เครื่องมือ, `สรุปวันนี้`, `หยุดทุกอย่าง`, เริ่มแชทใหม่
- `docs/SEARCH.md`

**V2 — สำรอง / กู้คืน (schema 2)**
- `core/backup.js`: `createBackup` (+ counts + checksum), `redactSettings`/`hasSecrets`,
  `validateBackup` (string/object, migrate export รุ่นเก่า, เตือนเมื่อ checksum ไม่ตรง),
  `summarizeBackup`, `mergeRecords` (last-write-wins ต่อคอลเลกชัน), `planRestore`/`describePlan`
- UI: ส่งออกเป็น schema 2 (ไม่มีคีย์), นำเข้าไฟล์ด้วย `FileReader` → dry-run สรุปในกล่องยืนยัน → merge
- `docs/BACKUP.md`

### เปลี่ยน
- `Ctrl/Cmd+K` เปิด command palette (เดิมโฟกัสช่องแชท) · `Esc` ปิด palette ก่อน modal อื่น
- `downloadJson` คืนสถานะและไม่ล้มในสภาพแวดล้อมที่ไม่มี object URL

### แก้
- กัน `tasks`/`calendar` ถูกอ้างก่อนประกาศในโค้ด digest (TDZ) ด้วย closure

## [2.1.0] — 2026-11-10

รอบที่หก: "ทำงานหลายขั้น" กลายเป็นสิ่งที่มองเห็นและหยุดได้, No7 สรุปวันให้ทุกเช้า,
และผู้ใช้ต่อยอดเครื่องมือของตัวเองได้ด้วยปลั๊กอิน HTTP โดยไม่ต้องแตะโค้ด

### เพิ่ม
**U1 — Timeline + หยุดกลางทาง**
- `core/timeline.js`: `AgentTimeline` แปลง event เป็นขั้นตอน (running/ok/error/denied/cancelled)
  + `summary()`, `headline()`, `toRows()`, `toMarkdown()`
- `core/agent.js`: `cancel()` ตรวจธง 3 จุด (ก่อนรอบใหม่ / หลังได้คำตอบ / หลังกล่องยืนยัน)
  → event `cancelled` และผลลัพธ์ `{ cancelled: true }` พร้อมสรุปสิ่งที่ทำไปแล้ว
- UI: แผง `#run-timeline` เห็นทุกขั้นสด ๆ, ปุ่ม ⏹ และ `Esc` เรียก `stopAll()` (ยกเลิกงาน + หยุดเสียง)
- `docs/AGENT.md`

**U2 — สรุปประจำวัน**
- `core/digest.js`: `buildDigest` จัดกลุ่มเกินกำหนด/วันนี้/นัดหมาย/48 ชม./งานถัดไป/ความจำใหม่/ไม่มีกำหนด
  + `digestMarkdown` + `toMs` (รับ ISO string จาก TaskStore) + `shouldAutoDigest`
- tool `digest` (dynamic, risk 0) ให้ AI ตอบ "วันนี้มีอะไรต้องทำ" ได้เอง
- UI: ปุ่ม 🌅 สรุปวันนี้ + การ์ด + โพสต์ในแชท + สรุปอัตโนมัติครั้งแรกของวันหลัง 07:00 (opt-in)
- `docs/DIGEST.md`

**U3 — ปลั๊กอินเครื่องมือ HTTP**
- `core/custom-tools.js`: JSON-defined tools (`plugin__<id>`), `renderTemplate` (ไม่มี eval),
  `fillArgs` (เฉพาะพารามิเตอร์ที่ประกาศ), `buildHttpTool` (fetch inject ได้)
- ความปลอดภัย: https เท่านั้น, บล็อก localhost/วง LAN, `assertSafeUrl` ตรวจซ้ำตอนยิงจริง,
  timeout 10 วิ, ตัด response 64 KB, risk ≥ 1 ต้องยืนยัน
- UI: ช่อง JSON + ตัวอย่าง/ตรวจสอบ/บันทึก + รายการ + ลงทะเบียนผ่าน `refreshDynamicTools()`
- `docs/PLUGINS.md`

### เปลี่ยน
- เครื่องมือในหน้าเครื่องมือ = 29 (28 เดิม + `digest`) และเพิ่มตามปลั๊กอินที่เปิด
- `tools-note` แสดงตัวหารจาก `allToolIds()` (รวม dynamic)

### แก้
- digest ต้องแปลง `due` ที่เป็น ISO string ก่อนเปรียบเทียบเวลา (เดิมงานหายจากสรุป)
- digest tool สร้างด้วย closure แทน getter เพื่อไม่ให้แตะ `tasks` ก่อนประกาศ (TDZ)

## [2.0.0] — 2026-11-10

รอบที่ห้า: ยกระดับจาก "ผู้ช่วยที่ใช้ได้" → "ผู้ช่วยที่ไว้ใจได้ทุกวัน" — เสียงพรีเมียม, สมองในเครื่อง
สองภาษา, ด่านคุณภาพที่วัดได้ และการอัปเดตที่ไม่ต้องโหลดใหม่ทั้งแอป

### เพิ่ม
**T1 — เสียงพรีเมียม + แคช**
- `core/tts.js`: provider `elevenlabs` (multilingual v2, `xi-api-key`, mp3_44100_128),
  ค่าเริ่มต้นต่อ provider, `resolveTTSConfig` ไม่พาค่าเก่าข้าม provider
- `AudioCache` (20 รายการ / 5 MB, key = provider|voice|model|lang|text) — ผลลัพธ์ `{engine, cached}`
- server `POST /api/tts` รองรับ ElevenLabs · `docs/VOICE.md` อัปเดต

**T2 — สมองในเครื่อง (Ollama / LM Studio)**
- `core/local-models.js`: `LOCAL_PRESETS`, `probeLocal` (timeout 4s, cache 60s), `matchModel`/`pickBestModel`,
  `warmModel`, `offlineChainSettings`, `normalizeOfflineBrain`
- สลับอัตโนมัติเมื่อออฟไลน์ → `costMode: private`, `provider: ollama`, ไม่ใช้คีย์
- server `/api/local-models` + `/warm` พร้อม guard กัน SSRF (`NO7_LOCAL_ALLOW_REMOTE=1` สำหรับกรณีพิเศษ)
- UI แผง "🧠 สมองในเครื่อง" (สแกน/อุ่นเครื่อง/สถานะ) · `docs/LOCAL_MODELS.md`

**T3 — สองภาษา ไทย/อังกฤษ**
- `core/i18n.js`: `LANGS`, `DICT` th/en (คีย์ตรงกันบังคับด้วยเทสต์), `t()` + interpolation, `applyI18n`,
  `langOf`, `detectLang`, `viewTitle`
- `settings.uiLang` + `#set-uilang` — สลับทันทีไม่ต้องรีโหลด, อัปเดต `<html lang>`
- ~90 จุดผ่าน `data-i18n` / `-placeholder` / `-title` · `docs/I18N.md`

**T4 — คุณภาพที่วัดได้**
- `tools/perf.js` + `perf-budget.json` + `npm run perf` (source + gzip bundle, exit 1 เมื่อเกิน) เข้า CI
- E2E เพิ่มเส้นทางงานซ้ำ (เลื่อนรอบ) → 97 checks · `docs/QUALITY.md`

**T5 — อัปเดตเวอร์ชัน + release**
- `desktop/updater.js`: opt-in `NO7_AUTO_UPDATE=1` (packaged เท่านั้น), feed/channel/delay ปรับได้,
  แจ้งเตือนทุกขั้น, ติดตั้งตอนปิดแอป, เมนู tray "ตรวจอัปเดต"
- `.github/workflows/release.yml`: verify → matrix linux/mac/win → draft GitHub Release + `latest*.yml`
- `build.publish` (GitHub) + `electron-updater` · `docs/BUILD.md` §2.1

### เปลี่ยน
- เวอร์ชัน 2.0.0 (`package.json`, lock, `MCP_CLIENT_INFO`, diagnostics) — `window.NO7_VERSION` มาจาก build
- CI รัน `npm run perf` หลัง build

### แก้
- `renderTTSVoiceOptions` ถูกประกาศซ้อนในฟังก์ชัน → ย้ายไป module scope
- เปลี่ยน provider แล้วไม่พา model/voice เดิมข้าม (กันค่าไม่ตรง)

## [1.5.0] — 2026-11-10

รอบที่สี่: ลงลึกที่อุปกรณ์และความต่อเนื่อง — งานซ้ำที่เตือนได้แม้ปิดแอป, รู้จักหน้าต่างบนจอ
พร้อมสูตรอัตโนมัติ, Phone-Link ครบวงจร (hello/eyes/voice) และ MCP OAuth ที่ไม่ต้องมี redirect

### เพิ่ม
**S1 — งานซ้ำ + เตือนผ่าน server**
- `core/tasks.js`: `normalizeRecurrence` (daily/weekdays/weekly/monthly/hourly + interval/weekday/at),
  `nextOccurrence`, `describeRecurrence`; `complete()` บนงานซ้ำเลื่อนรอบถัดไปแทนการปิด (`repeatCount`)
- tool `task` รับ `repeat` · UI เลือกความถี่ + แสดง 🔁 + รอบถัดไป
- server: `PUT /api/reminders`, `GET /api/reminders/due|upcoming|status`, `POST /api/reminders/ack`,
  tick `NO7_REMINDER_TICK_MS`, ส่ง Telegram (`TELEGRAM_REMINDER_CHAT_ID`) และเลื่อนงานซ้ำเอง
- แอป push งานขึ้น server + poll due ทุก 60 วิ/ตอนกลับมาโฟกัส + แสดงสถานะ server
- `NO7_DATA_DIR` สำหรับแยกข้อมูล (ใช้ในเทสต์) · `docs/TASKS.md`

**S2 — Desktop awareness + automation**
- `core/desktop.js`: อ่าน/จับคู่/โฟกัสหน้าต่าง (powershell/osascript/wmctrl), recipes 5 ขั้น
  (open_app/open_url/focus_window/wait/notify) ≤8 ขั้น, dry-run, `RecipeStore` (localStorage)
- Electron IPC `no7:list-windows` / `no7:focus-window` (คำสั่งคงที่ ไม่มี shell)
- tool ใหม่ `desktop` + `run_recipe` — **28 tools** · หน้า 🖥️ เดสก์ท็อป · `docs/DESKTOP.md`

**S3 — Phone-Link ครบวงจร**
- `POST/GET /api/link/hello` (capabilities + `.no7/devices.json`),
  `POST/GET /api/link/eyes` (อารมณ์ + ttl → stale), `POST /api/link/voice`,
  `GET /api/link/voice?since`, `/voice/status`, `POST /voice/ack` (คิว ≤2 MB)
- client: `helloDevice`, `sendEyes`, `getEyes`, `sendVoiceChunk`, `pullVoice`, `voiceStatus`, `ackVoice`
- ESP32 header: `hello` / `onEyes`+`pollEyes` / `sendEyes` / `sendVoice` · แผงในหน้า 🔗 อุปกรณ์
- `docs/DEVICES.md`, `docs/PHONE_LINK.md`

**S4 — MCP OAuth: device flow + DCR**
- `core/oauth.js`: `requestDeviceCode`, `requestDeviceToken`, `pollDeviceToken`
  (pending/slow_down/expired_token/access_denied/timeout), `registerClient` (RFC 7591), `oauthMethodFor`
- server proxies `/api/oauth/device` และ `/api/oauth/register`; `/api/oauth/token` ส่ง `device_code`
- UI: ช่อง Device/Registration URL + ปุ่ม 🔢 ล็อกอินด้วยรหัส (แสดงรหัส/ลิงก์) + 🆕 ขอ client id
- `docs/OAUTH.md`

### เปลี่ยน
- `MCP_CLIENT_INFO.version` = 1.5.0, diagnostics ใช้ 1.5.0
- tool ทั้งหมด **28 ตัว** (auto 28, hub 21) — อัปเดตเทสต์/smoke ตามจำนวนจริง
- `/api/link/status` รายงาน device/eyes/voice เพิ่ม

### ตัวเลข
- 266 unit tests · 82 end-to-end checks · 75 JS files · 28 tools + MCP tools แบบ dynamic · 20 docs

## [1.4.0] — 2026-11-10

รอบที่สาม: ให้ No7 ออกไปทำงานนอกแอป — MCP แบบ local process + OAuth, บอท Telegram/LINE,
ควบคุมคอมพิวเตอร์แบบมี allowlist และงาน/แจ้งเตือนที่ตามข้ามเครื่องได้

### เพิ่ม
**R6 — MCP ลึกขึ้น**
- stdio bridge ที่ companion server: ประกาศ `MCP_STDIO_SERVERS`, spawn/cache process, newline JSON-RPC,
  timeout 25 วิ, stderr tail, `GET /api/mcp/stdio`
- client รองรับ `transport: 'stdio'` + UI เลือก server ที่ประกาศไว้
- OAuth 2.0 + PKCE (`core/oauth.js`): authorize URL builder, token exchange/refresh, `TokenStore`,
  `OAuthSession` (single-flight refresh), `/api/oauth/token` proxy, `oauth-callback.html`, ปุ่ม 🔑 ในหน้าตั้งค่า
- `docs/OAUTH.md` + อัปเดต `docs/MCP.md`

**R7 — บอทแชท**
- `server/bots.js`: normalize Telegram/LINE, ตรวจ signature, `BotSessions` (TTL 2 ชม.),
  คำสั่ง `/start` `/help` `/clear` `/tools`, ตัดข้อความยาวเป็นก้อน
- `POST /api/telegram/webhook` (secret header, ACK ก่อนแล้วตอบ async), `POST /api/line/webhook`,
  `GET /api/bots/status`
- หน้าตั้งค่า: แผงบอท + ปุ่มคัดลอก webhook URL · `docs/BOTS.md`

**R8 — Computer control**
- `core/control.js`: policy ปิดโดยค่าเริ่มต้น, allowlist แบบ glob, deny patterns, กัน shell operator,
  rate limit ต่อนาที, `ControlAudit` (`no7.control.audit.v1`)
- tool ใหม่ `control_run` (risk 3) — 26 tools
- Electron: preload expose `openApp`/`copyText`/`notify`/`runCommand`/`controlInfo`,
  main process รัน `execFile` แบบไม่มี shell ภายใต้ `NO7_CONTROL_ALLOW_COMMANDS`
- หน้าตั้งค่า: switch, allowlist 2 ชุด, rate, audit log · `docs/CONTROL.md`

**R9 — งาน + เตือนข้ามเครื่อง**
- `core/tasks.js`: `TaskStore`, `parseDue` (ISO/±เวลา/คำไทย), `mergeTaskLists` (LWW + tombstone),
  `TaskScheduler` (ทุก 30 วิ → Notification + แชท) + `no7.tasks.v1`
- tool ใหม่ `task` (risk 1) + แผงงานในแท็บตารางนัด (เพิ่ม/เสร็จ/ลบ/กรอง/สถิติ)
- ซิงก์งานผ่าน `collectBundle`/`mergeBundle` · `docs/TASKS.md`

### เปลี่ยน
- `MCP_CLIENT_INFO.version` = 1.4.0 และ diagnostics ใช้ 1.4.0
- tool ทั้งหมด **26 ตัว** (auto mode 26, hub 19) — อัปเดตเทสต์/smoke ตามจำนวนจริง

### แก้ไข
- คุณภาพโค้ด: กัน `${...}` ในเทมเพลตไปรบกวน regex escape ของ `matchesGlob` (ใช้ค่าคงที่นอกเทมเพลต)
- `replyLine`/`sendTelegramMessage` ส่ง arguments ครบเมื่อไม่ inject fetch (เดิม fallback ตัด options ทิ้ง)

### ตัวเลข
- 232 unit tests · 72 end-to-end checks · 70 JS files · 26 tools + MCP tools แบบ dynamic

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
