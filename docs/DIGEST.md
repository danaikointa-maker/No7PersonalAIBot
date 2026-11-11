# 🌅 สรุปประจำวัน (Daily digest)

รวมทุกอย่างที่ "ต้องรู้วันนี้" ไว้ในที่เดียว — งานเกินกำหนด, งานครบวันนี้, นัดหมาย, งานถัดไป,
ความจำใหม่ และงานที่ยังไม่กำหนดเวลา

## 1) ใช้งาน

| ทาง | ทำอะไร |
|---|---|
| ปุ่ม **🌅 สรุปวันนี้** (หน้าตารางนัด) | สร้างสรุป + ลงในการ์ด + โพสต์ในแชท |
| ถาม No7 ตรง ๆ ("วันนี้มีอะไรต้องทำ") | AI เรียก tool `digest` เอง (risk 0 ไม่ต้องยืนยัน) |
| เปิด **สรุปอัตโนมัติทุกเช้า** | ครั้งแรกของวันหลัง 07:00 (บันทึกวันสุดท้ายใน `no7.digest.last`) |

> autoplay เปิดเฉพาะเมื่อผู้ใช้เปิดเอง (`settings.digestAuto`, ค่าเริ่มต้นปิด)

## 2) รูปแบบผลลัพธ์

```js
buildDigest({ tasks, events, memories, now, lang })
// → {
//   date, lang, headline, big, unit,
//   sections: [{ id, emoji, title, items: [{ label, meta, kind, id }], more? }],
//   counts: { tasks, overdue, today, events, memories, done },
//   empty, generatedAt, markdown
// }
```

| section | เกณฑ์ |
|---|---|
| `overdue` ⏰ | มี `due` และเลยเวลาแล้ว (ไม่นับของวันนี้) |
| `today` 🎯 | `due` ตรงกับวันนี้ (เรียงตามเวลา) |
| `events` 📅 | นัดหมายที่ `start` ตรงกับวันนี้ |
| `soon` 🔭 | ครบกำหนดภายใน 48 ชม. (ไม่รวมวันนี้) |
| `upcoming` 🗓 | ไกลกว่า 48 ชม. (แสดง 5 + `more` ถ้าเกิน) |
| `memories` 🧠 | ความจำที่เพิ่มภายใน 24 ชม. (สูงสุด 5) |
| `later` 📥 | งานที่ยังไม่กำหนดเวลา (5 + `more`) |

- ตัวเลือกที่ไม่มีข้อมูลจะถูกตัดออก — วันว่างจะได้ `empty: true` และข้อความให้กำลังใจแทน
- `due` รับได้ทั้ง **ISO string** (รูปแบบที่ `TaskStore` เก็บ) และ timestamp — แปลงด้วย `toMs()`
- `digestMarkdown(digest)` ให้ข้อความ markdown พร้อมคัดลอก/ส่งเข้า Telegram

## 3) tool `digest` (dynamic)

`digestTool({ tasks, calendar, memory, lang })` สร้าง tool ที่ **ดึงข้อมูลสด** ตอนถูกเรียก
(ไม่ cache) และลงทะเบียนผ่าน `refreshDynamicTools()` รวมกับ MCP + ปลั๊กอิน

```json
{ "emoji": "🌅", "label": "สรุปวันนี้", "desc": "สรุปงานค้าง …", "params": {}, "meta": { "category": "read", "risk": 0 } }
```

- risk 0 → ไม่ต้องยืนยัน และไม่ติด permission gate หมวด `act`
- ผลลัพธ์มี `title/big/lines` (ให้ `renderCard` วาดการ์ด) + `markdown` + `counts`

## 4) ข้อจำกัด

- ใช้วันตาม timezone ของเครื่อง (ไม่มี timezone ต่อผู้ใช้)
- ยังไม่รวมข้อมูลสุขภาพ/การเงิน (metrics ภายในไม่ถูกใส่ในสรุป)
- การแจ้งเตือนอัตโนมัติทำงานตอนเปิดแอปเท่านั้น (ไม่ใช่ push เบื้องหลัง)
