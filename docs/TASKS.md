# งาน + แจ้งเตือนข้ามอุปกรณ์

No7 จำได้ว่า "ต้องทำอะไร เมื่อไหร่" — เก็บในเครื่อง, เตือนตามเวลา, และตามไปทุกเครื่องผ่าน `/api/sync`
โดยไม่ต้องมีบัญชีหรือคลาวด์

## โครงข้อมูล (`no7.tasks.v1`)

```json
{
  "id": "t_lx2a_9f3k1",
  "title": "ส่งรายงาน",
  "notes": "",
  "due": "2026-11-11T09:00:00.000Z",
  "done": false,
  "doneAt": null,
  "priority": 2,
  "tags": ["งาน"],
  "createdAt": 1762750000000,
  "updatedAt": 1762750000000,
  "notifiedAt": null,
  "deleted": false,
  "device": "desktop"
}
```

- `priority`: 0 ปกติ · 1 สำคัญ · 2 ด่วน · 3 ด่วนมาก
- `recurrence`: `{freq, interval, weekday, at}` หรือ `null` (รายละเอียดด้านล่าง)
- `deleted: true` = **tombstone** (การลบต้องเดินทางข้ามเครื่องได้ จึงไม่ลบทิ้งจริงจนกว่าจะซิงก์แล้ว)
- `notifiedAt` กันเตือนซ้ำ; ถ้าแก้ `due` ใหม่จะรีเซ็ตให้เตือนอีกครั้ง

## เวลาที่รับได้ (`parseDue`)

| รูปแบบ | ตัวอย่าง |
|---|---|
| ISO / วันที่เต็ม | `2026-11-11T09:00` |
| สัมพัทธ์ | `+30m`, `+2h`, `+3d`, `+45 นาที` |
| ภาษาไทย | `วันนี้ 18:00`, `พรุ่งนี้ 09:30`, `มะรืน 08:00` |
| เวลาอย่างเดียว | `09:00` (ถ้าเลยเวลาแล้ว → พรุ่งนี้) |

## งานซ้ำ (recurrence)

```js
{ freq: 'daily'|'weekdays'|'weekly'|'monthly'|'hourly', interval: 1..90, weekday: 0-6, at: 'HH:MM' }
```

- `daily` — ทุกวัน (ตามเวลาเดิม), `weekdays` — จันทร์–ศุกร์ (ข้ามเสาร์–อาทิตย์ให้อัตโนมัติ)
- `weekly` — ทุกสัปดาห์, ระบุ `weekday` ได้ (0 = อาทิตย์), `interval` = ทุก N สัปดาห์
- `hourly` — ทุก N ชั่วโมง, `monthly` — ทุก N เดือน
- ปิดงานซ้ำ (`complete`) → **ไม่ปิดจริง** แต่เลื่อน `due` ไปรอบถัดไป (`repeatCount + 1`) และล้าง `notifiedAt`
- `describeRecurrence()` แปลงเป็นข้อความไทย เช่น "ทุกสัปดาห์ (จันทร์)"

## เตือนผ่าน server (ดังแม้ปิดแอป)

```
แอป (เปิดอยู่) ──PUT /api/reminders──▶ server (ไฟล์ .no7/reminders.json)
                                        │ tick ทุก NO7_REMINDER_TICK_MS (default 30s)
                                        ├─▶ Telegram (ถ้าตั้ง TELEGRAM_REMINDER_CHAT_ID)
                                        └─▶ คิวให้ไคลเอนต์ดึง: GET /api/reminders/due
```

| Endpoint | หน้าที่ |
|---|---|
| `PUT /api/reminders` | ลงทะเบียน/อัปเดตงานที่มีเวลา (LWW ต่อ id) |
| `GET /api/reminders/due` | งานที่ถึงเวลาและยังไม่แจ้ง |
| `GET /api/reminders/upcoming?days=7` | งานที่กำลังจะมาถึง |
| `POST /api/reminders/ack` | ยืนยันว่าแจ้งแล้ว (กันซ้ำ) |
| `GET /api/reminders/status` | จำนวนงาน, ถัดไป, สถานะ Telegram |

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_REMINDER_CHAT_ID=123456789 NO7_REMINDER_TICK_MS=30000 npm run server
```

- งานซ้ำจะถูก **เลื่อนรอบถัดไปอัตโนมัติหลังแจ้ง** (server ไม่ต้องรอไคลเอนต์)
- แอปที่เปิดอยู่จะ poll `/api/reminders/due` ทุก 60 วินาที + ตอนกลับมาโฟกัส แล้วแสดง Notification + ข้อความในแชท
- ข้อมูลเก็บที่ `.no7/reminders.json` (เปลี่ยนโฟลเดอร์ได้ด้วย `NO7_DATA_DIR`)

## การใช้งาน

- **หน้าต่าง/แชท:** แท็บ `📅 ตารางนัด` → *งานที่ต้องทำ* (เพิ่ม/ติ๊กเสร็จ/ลบ/กรอง: ค้างอยู่ วันนี้ เกินกำหนด เสร็จแล้ว ทั้งหมด)
- **ด้วยเสียง/ข้อความ:** "เตือนฉันส่งรายงานพรุ่งนี้ 9 โมง" → Agent เรียก tool `task`
- **tool `task`** (risk 1): `action = add | list | done | remove`
  - `add` รับ `title`, `when` (ISO/+30m/พรุ่งนี้ 09:00), `priority` 0–3
  - `list` รับ `filter = open | today | overdue | done | all`

## การเตือน

`TaskScheduler` ตรวจทุก 30 วินาที (`intervalMs`) — งานที่ `due <= now` และยังไม่เคยเตือนจะ:

1. แสดง `Notification` (ถ้าเบราว์เซอร์อนุญาต)
2. ขึ้นข้อความในแชท + subtitle
3. บันทึก `notifiedAt` กันซ้ำ

grace window 60 นาที — ถ้าเปิดแอปช้าเกิน 1 ชั่วโมงจะไม่ยิงเตือนย้อนหลัง

## ซิงก์ข้ามเครื่อง

`collectBundle()` แนบ `tasks` ไปกับ `/api/sync` และ `mergeBundle()` เรียก `TaskStore.merge()`:

- **last-write-wins** ต่อ `id` (เทียบ `updatedAt`)
- tombstone ของฝั่งที่ใหม่กว่าจะลบงานในอีกเครื่อง
- คืนจำนวนที่เปลี่ยน เพื่อแสดงใน UI (`งาน ±n`)

## ข้อจำกัด

- ในเบราว์เซอร์เตือนได้เฉพาะตอนเปิดแอป/แท็บอยู่ — ถ้าต้องการให้ดังแม้ปิดแอป ใช้ Telegram ผ่าน server (`TELEGRAM_REMINDER_CHAT_ID`)
- ฝั่ง server ไม่มีระบบบัญชี/แยกผู้ใช้ — ถ้าใช้หลายคน ให้แยก server หรือใช้ token ของ sync
- ยังไม่มีการมอบหมายงานให้ผู้อื่น และยังไม่มี RRULE เต็มรูปแบบ (เช่น "ทุกวันที่ 15" หรือ "ทุก 2 สัปดาห์วันอังคาร" ต้องใช้ `weekly` + `weekday` + `interval`)
- การซิงก์เป็น manual (กดอัปโหลด/ดาวน์โหลด) เหมือนข้อมูลอื่น
