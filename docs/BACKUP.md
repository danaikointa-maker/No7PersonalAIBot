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
  "counts": { "facts": 12, "log": 40, "notes": 3, "todos": 0, "tasks": 5, "events": 2, "personas": 0 },
  "data": { "settings": {}, "facts": [], "log": [], "notes": [], "todos": [], "tasks": [], "events": [], "personas": [] },
  "checksum": 1234567890
}
```

- `log` เก็บ 500 ข้อความล่าสุด (ไฟล์ไม่บวม)
- `checksum` (FNV-1a) ช่วยตรวจว่าไฟล์ถูกแก้/เสีย — ถ้าไม่ตรงจะ **เตือน** แต่ยังนำเข้าได้
- ค่าเริ่มต้นตัด `apiKey`, `ttsApiKey`, `syncToken` และ `mcpServers[].apiKey` ออก
- `includeSecrets: true` = เก็บคีย์ไว้ (ใช้เฉพาะย้ายเครื่องเอง)

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

## 4) API (`core/backup.js`)

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `createBackup(state, {includeSecrets, version})` | สร้าง payload + counts + checksum |
| `redactSettings` / `hasSecrets` | ตัด/ตรวจความลับ |
| `validateBackup(input)` | รับ string/object → `{ok, errors, warnings, backup, migrated}` |
| `migrateBackup(input)` | รองรับ export รุ่นเก่า (ก่อนมี `app/schema`) |
| `summarizeBackup(backup)` | จำนวนต่อคอลเลกชัน + total |
| `mergeRecords(local, incoming, meta)` | last-write-wins → `{list, added, updated, kept}` |
| `planRestore(backup, local, {mode})` | dry-run: `actions`, `values`, `settings`, `warnings` |
| `describePlan(plan)` | ข้อความสำหรับกล่องยืนยัน |

## 5) ข้อจำกัด

- `personas` ยังไม่ถูกกู้คืนผ่าน UI (โครงสร้างไฟล์รองรับแล้ว)
- `log` (ประวัติแชท) ถูกเขียนลงไฟล์ แต่การนำเข้าใช้เฉพาะ `facts` — ประวัติแชทไม่ถูกกู้
- ไฟล์สำรองไม่รวม: ปลั๊กอินที่ผู้ใช้เพิ่ม (อยู่ใน settings → รวมแล้ว), persona ที่สร้างเอง (ยังไม่ apply), ข้อมูลใน server/Telegram
- ไม่มีการเข้ารหัสไฟล์ — ถ้าใส่ `includeSecrets` ควรเก็บไฟล์ให้ปลอดภัย
