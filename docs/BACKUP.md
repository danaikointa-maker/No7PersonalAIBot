# 💾 สำรอง / กู้คืนข้อมูล

ทุกอย่างของ No7 อยู่ในเครื่อง (localStorage) — ไฟล์สำรองเดียวจึงย้ายเครื่อง/กู้หลังล้างข้อมูลได้ครบ
โดยไม่ต้องพึ่งคลาวด์และ **ไม่พาความลับออกไป**

## 1) ใช้งาน

| ปุ่ม (หน้า ⚙️ ตั้งค่า) | ทำอะไร |
|---|---|
| **ส่งออกข้อมูล** | ดาวน์โหลด `no7-backup-YYYY-MM-DD.json` (schema 2, ไม่มีคีย์) |
| **นำเข้าข้อมูลสำรอง** | เลือกไฟล์ → แสดงสรุป dry-run → ยืนยัน → รวมข้อมูล (merge) |

หลังนำเข้าจะเห็นสถานะ เช่น `✅ นำเข้าแล้ว: +12 ใหม่ · 3 อัปเดต`

## 2) รูปแบบไฟล์ (schema 2)

```json
{
  "app": "no7-personal-ai",
  "schema": 2,
  "version": "2.2.0",
  "createdAt": "2026-11-10T04:00:00.000Z",
  "includeSecrets": false,
  "counts": { "facts": 12, "log": 40, "notes": 3, "todos": 0, "tasks": 5, "events": 2, "personas": 0, "healthHistory": 30 },
  "data": { "settings": {}, "facts": [], "log": [], "notes": [], "todos": [], "tasks": [], "events": [], "personas": [], "healthHistory": [] },
  "checksum": 1234567890
}
```

- `log` สำรองทุกข้อความที่เก็บในเครื่อง (ไม่มีการตัดเก่าอัตโนมัติ); ไฟล์ยังมีเพดาน 20 MiB เพื่อป้องกันไฟล์ใหญ่/ผิดรูป
- `checksum` (FNV-1a) ช่วยตรวจว่าไฟล์ถูกแก้/เสีย — ถ้าไม่ตรงจะ **เตือน** แต่ยังนำเข้าได้
- ค่าเริ่มต้นตัด `apiKey`, `ttsApiKey`, `syncToken` และ `mcpServers[].apiKey` ออก
- `includeSecrets: true` = เก็บคีย์ไว้ (ใช้เฉพาะย้ายเครื่องเอง)
- เมื่อนำเข้าไฟล์ที่ redacted หรือคีย์ว่าง ระบบรักษา credentials ปัจจุบันในเครื่องไว้ (รวม MCP server ที่จับคู่ด้วย id/name/url) พร้อมแสดงคำเตือน; คีย์ที่มีค่าในไฟล์และเลือกเองยังถูกนำเข้าได้

ไฟล์นำเข้าต้องไม่เกิน 20 MiB; UI ปฏิเสธก่อนอ่านไฟล์หากเกิน และ API ตรวจ UTF-8 bytes ก่อน parse เช่นกัน คอลเลกชันต้องเป็น array และไม่เกินเพดานป้องกัน malformed payload: facts/log 100,000 · healthHistory 1,000,000 · personas 100 · notes/todos/tasks/events 50,000 ต่อชุด ไม่มีการตัดประวัติเก่าเงียบ ๆ; ถ้าไฟล์ export ใหญ่กว่า 20 MiB จะแจ้งเตือนและไม่สร้างไฟล์ แถวที่ไม่ใช่ object จะถูกข้ามในแผน restore โดยไม่ทำให้ทั้งแผนล้ม

## 3) กู้คืนแบบ merge vs replace

| โหมด | พฤติกรรม |
|---|---|
| `merge` (ค่าเริ่มต้นใน UI) | รวมตามคีย์: ความจำใช้ `id`/ข้อความ, งานใช้ `id`, นัดใช้ `uid` … ถ้าซ้ำให้ **ตัวที่ `ts/updatedAt` ใหม่กว่าชนะ** |
| `replace` | ล้างของเดิมในคอลเลกชันนั้นแล้วใส่ของไฟล์ (ใช้ผ่าน API `planRestore(..., {mode:'replace'})`) |

ตารางคีย์/เวลาใน `COLLECTIONS`:

| คอลเลกชัน | คีย์ | เวลา |
|---|---|---|
| `facts` | `id` หรือ `text` | `ts` |
| `log` | role + ts + ข้อความ | `ts` |
| `notes` / `todos` | ts + ข้อความ | `ts` |
| `tasks` | `id` | `updatedAt` → `createdAt` |
| `events` | `uid` → start+title | `start` |
| `personas` | `id` | `updatedAt` |
| `healthHistory` | `date` | วันตามปฏิทิน |

`healthHistory` เก็บเฉพาะ snapshot summary ที่ whitelist แล้ว (`date`, `score`, `grade`, `issues`) ไม่เก็บข้อความส่วนตัว และไม่ตัดวันเก่าอัตโนมัติ; restore แบบ merge ใช้วันที่เป็นคีย์ (ค่าจากไฟล์ชนะเมื่อวันตรงกัน)

## 4) API (`core/backup.js`)

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `createBackup(state, {includeSecrets, version})` | สร้าง payload + counts + checksum; normalize log ทุกข้อความที่เก็บไว้ ไม่ตัดเก่าตามจำนวน |
| `redactSettings` / `hasSecrets` | ตัด/ตรวจความลับ |
| `validateBackup(input)` | รับ string/object → `{ok, errors, warnings, backup, migrated}` |
| `migrateBackup(input)` | รองรับ export รุ่นเก่า (ก่อนมี `app/schema`) |
| `summarizeBackup(backup)` | จำนวนต่อคอลเลกชัน + total |
| `mergeRecords(local, incoming, meta)` | last-write-wins → `{list, added, updated, kept}` |
| `planRestore(backup, local, {mode})` | dry-run: `actions`, `values`, `settings`, `warnings` |
| `describePlan(plan)` | ข้อความสำหรับกล่องยืนยัน |

## 5) ข้อจำกัด

- `log` สำรองและ restore ทุกข้อความที่ผ่าน normalization (มีเพดาน byte 20 MiB ของไฟล์ ไม่ใช่จำนวนข้อความ); รับเฉพาะ role `user`/`assistant`, text ≤ 2,000 ตัวอักษร และ timestamp ที่ใช้ได้; ฟิลด์ metadata อื่นถูกทิ้ง
- ไฟล์สำรองไม่รวม: ปลั๊กอินที่ผู้ใช้เพิ่ม (อยู่ใน settings → รวมแล้ว), ข้อมูลใน server/Telegram
- `personas` รวมเฉพาะ Persona Studio ที่ผู้ใช้สร้างเอง; built-in ถูกป้องกันไม่ให้เขียนทับ และจำกัด 100 รายการพร้อม sanitize ฟิลด์ก่อน merge
- `healthHistory` เป็นข้อมูลสรุปในเครื่องเท่านั้น; ไม่มีการอัปโหลดอัตโนมัติและรวมในไฟล์เฉพาะเมื่อผู้ใช้กดส่งออกข้อมูล
- ไม่มีการเข้ารหัสไฟล์ — ถ้าใส่ `includeSecrets` ควรเก็บไฟล์ให้ปลอดภัย
