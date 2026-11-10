# Connectors & Sync

## ปฏิทิน (ในเครื่อง)

`web/src/core/calendar.js` — `CalendarStore`

- เก็บที่ `localStorage['no7.calendar.v1']` (เรียงตามเวลา, uid กันซ้ำ)
- `parseIcs()` / `toIcs()` รองรับ VEVENT: SUMMARY, DTSTART/DTEND (มี/ไม่มี `VALUE=DATE`), LOCATION, DESCRIPTION, UID
  (ไม่รองรับ RRULE และ VTIMEZONE เชิงลึก — เวลาถูกแปลงเป็นเวลาท้องถิ่นตามที่ระบุ)
- `upcoming({days, limit})` คืนนัดในช่วงที่ต้องการ, `formatWhen()` แสดง "วันนี้ 14:30" / "พรุ่งนี้ …"
- UI: เมนู **📅 ตารางนัด** — เพิ่ม/ลบ, นำเข้า `.ics`, ส่งออก `.ics`, ปุ่ม "วันนี้"
- tools: `calendar_add` (risk 1 → ต้องยืนยันตามระดับอิสระ), `calendar_list` (อ่านอย่างเดียว)
- `parseWhen()` รับ `+30`, `+2h`, `14:30`, `2026-11-12 14:30`, ISO

## ฟีดข่าวและสรุปหน้าเว็บ

`web/src/core/net.js`

| ฟังก์ชัน | ทำอะไร |
|---|---|
| `fetchText(url)` | ลอง `fetch` ตรงก่อน ถ้า CORS บล็อกจะอ้อมผ่าน `GET /api/fetch?url=` ของ server |
| `parseRss(xml)` | แยก `<item>`/`<entry>` แบบ regex — ใช้ได้ทั้งเบราว์เซอร์และ node (ไม่ต้องมี DOMParser) |
| `stripHtml(html)` | ตัดแท็ก/สคริปต์/สไตล์ ให้เหลือข้อความ |
| `pageMeta(html)` | ดึง title + description (รวม og:description) |

tools:
- `rss_read` — `{url, limit}` → ชื่อฟีด + พาดหัว
- `summarize_url` — `{url, focus}` → ดึงหน้าเว็บ (ไม่เกิน 6,000 ตัวอักษร) แล้วให้ AI สรุป 3–5 ประโยค

ข้อจำกัด: ฟีด/เว็บจำนวนมากปิด CORS → ต้องเปิด `npm run server` ในวงเดียวกัน (หรือ host ส่วนตัว)

## ซิงก์ข้ามเครื่อง (self-hosted)

```
มือถือ ──PUT /api/sync──► server (.no7/sync.json) ◄──GET /api/sync── PC
```

- token: ตั้ง `NO7_SYNC_TOKEN` ที่ server → client ส่ง `X-No7-Sync`
  ถ้าไม่ตั้ง จะเปิดให้ทุกเครื่องใน LAN (server เตือนตอนบูต)
- bundle (`collectBundle`): memory (facts+log), personas ที่สร้างเอง, calendar, todos, notes, reminders, settings
  — **ตัด `apiKey` และ `syncToken` ออกเสมอ**
- `mergeBundle` เป็นแบบ additive: facts เข้าผ่าน `memory.importData` (dedupe เอง), persona กันซ้ำด้วย id/ชื่อ+system,
  นัดกันซ้ำด้วย uid, todo/note กันซ้ำด้วย `text|ts`
- UI: ตั้งค่า → 🔄 ซิงก์ข้ามเครื่อง (ที่อยู่ server, token, ทดสอบ, อัปโหลด, ดึง+ผสาน)

### ตัวอย่างเรียกด้วยมือ

```bash
curl -X PUT http://localhost:8787/api/sync \
  -H 'Content-Type: application/json' -H "X-No7-Sync: $NO7_SYNC_TOKEN" \
  -d '{"version":1,"memory":{"facts":[{"text":"ผู้ใช้ชอบกาแฟดำ"}]}}'

curl http://localhost:8787/api/sync -H "X-No7-Sync: $NO7_SYNC_TOKEN"
```

## MCP / เครื่องมือภายนอก

นอกจากคอนเนกเตอร์ในเครื่องแล้ว No7 ต่อกับ MCP server ได้ (Gmail, ปฏิทิน, ไฟล์, ฐานข้อมูล)
ผ่าน JSON-RPC 2.0 over HTTP — ดูรายละเอียดที่ [`docs/MCP.md`](./MCP.md)

- เพิ่ม server ที่หน้าตั้งค่า → ปลั๊กอิน MCP (ชื่อ + URL + API key)
- เครื่องมือที่ค้นพบจะกลายเป็น `mcp__<server>__<tool>` และเรียกผ่าน permission gate หมวด `mcp` (risk 2 = ถามก่อน)
- ต้องมี companion server (`npm run server`) เป็น proxy เว้นแต่ MCP server เปิด CORS เอง

## ข้อจำกัดที่รู้ตัว

- ยังไม่มี conflict resolution ระดับ field — ใช้การรวมแบบ additive (ปลอดภัยกว่า แต่ไม่ลบข้อมูลตามอีกเครื่อง)
- ไฟล์แนบ/รูปไม่ถูกซิงก์
- `summarize_url` ใช้โควตาของสมองที่ตั้งไว้ (1 คำขอต่อการสรุป)
