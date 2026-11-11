# 🔄 ซิงก์ข้ามเครื่อง (conflict-aware)

ซิงก์ผ่าน companion server ของคุณเอง (`PUT/GET /api/sync`, header `X-No7-Sync`)
— ไม่มีคลาวด์ ไม่มีบัญชี ข้อมูลเดินทางระหว่างเครื่องคุณเท่านั้น

## กลยุทธ์เมื่อข้อมูลชนกัน

| id | ภาษาไทย | พฤติกรรม |
| --- | --- | --- |
| `newest` (ค่าเริ่มต้น) | เอาของที่แก้ล่าสุด | ฝั่งที่ `recordTime` มากกว่าชนะ |
| `prefer-local` | เก็บของเครื่องนี้เสมอ | ไม่ทับข้อมูลเครื่องนี้ด้วยของอีกเครื่อง |
| `prefer-remote` | รับของอีกเครื่องเสมอ | เหมาะเมื่อเครื่องนี้เป็น "สำเนา" |
| `keep-both` | เก็บทั้งสองเวอร์ชัน | เก็บของเดิม + เพิ่มสำเนาอีกฝั่งที่ต่อท้าย `(จากอีกเครื่อง)` และตั้ง `mergedFrom` |

เลือกได้ที่ ⚙️ ตั้งค่า → 🔄 ซิงก์ข้ามเครื่อง → "เมื่อข้อมูลชนกัน"
ค่าถูกบันทึกใน `settings.syncStrategy`

## เวลาที่ใช้ตัดสิน

`recordTime(record)` = ค่ามากสุดของ `ts`, `updatedAt`, `at`, `createdAt` (number หรือ ISO string)
`events` ใช้ `start` เป็นเวลาหลัก (นัดหมายที่เลื่อนเวลาถือว่าแก้ล่าสุด)

## คีย์ของแต่ละชุด

| ชุด | คีย์ | หมายเหตุ |
| --- | --- | --- |
| `facts` | `text` | MemoryStore กันซ้ำด้วยข้อความ — id ต่างกันได้ตามเครื่อง |
| `notes` | `ts｜text` | คีย์มีเวลา → เก็บเป็นรายการต่อท้าย (ไม่ชนกัน) |
| `todos` | `ts｜text` | เช่นเดียวกับ notes |
| `tasks` | `id` | ใช้ `TaskStore.merge` (tombstone ของรายการที่ลบยังทำงาน) |
| `events` | `uid` | ถ้าไม่มี uid ใช้ `start｜title` |

## รายงานผล

`mergeSyncBundle(local, remote, { strategy })` คืน

```js
{
  strategy: 'newest',
  data: { facts, notes, todos, tasks, events },   // ชุดที่รวมแล้ว
  collections: { facts: { label, added, updated, kept, conflicts }, ... },
  conflicts: [{ collection, label, key, winner, localAt, remoteAt, local, remote }],
  totals: { added, updated, kept, conflicts },
}
```

หน้าตั้งค่าแสดง `summarizeSync(report, lang)` และตารางความขัดแย้ง
(`describeConflicts()`) เมื่อมีรายการชนกัน พร้อมประกาศในแชทหนึ่งครั้ง

## ข้อจำกัดที่รู้อยู่

- `notes`/`todos` ไม่มีตัวระบุถาวร → ถ้าสองเครื่องสร้างข้อความเดียวกันในวินาทีเดียวกันจะรวมเป็นรายการเดียว
- `personas` ยังเป็น additive (ไม่มีเวลาอัปเดต) — ซ้ำเฉพาะเมื่อชื่อ+system ต่างกัน
- ไม่มี UI กู้คืนย้อนหลัง (undo) — ใช้ `prefer-local` / `keep-both` กันข้อมูลหายก่อนซิงก์
- `keep-both` สร้าง id ใหม่ทุกครั้งที่ชน → ซิงก์ซ้ำจะไม่เพิ่มสำเนาซ้ำเพราะครั้งถัดไปไม่มีคู่ที่ชนแล้ว
- ซิงก์ครั้งเดียวต่อการกดปุ่ม ไม่มี background sync

## API ที่เกี่ยวข้อง

| ฟังก์ชัน | ไฟล์ |
| --- | --- |
| `mergeRecordSets`, `mergeSyncBundle`, `summarizeSync`, `describeConflicts`, `recordTime`, `deviceId` | `web/src/core/sync-merge.js` |
| `collectBundle`, `pushBundle`, `pullBundle`, `mergeBundle` | `web/src/core/sync.js` |
