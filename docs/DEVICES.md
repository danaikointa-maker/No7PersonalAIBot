# Device Hub — สั่งงาน PC / ESP32 ผ่าน Phone-Link

```
┌──────────────┐   1. POST /api/link/command  (HMAC)     ┌──────────────┐
│  แอป No7     │ ───────────────────────────────────────► │   server/    │
│ (มือถือ/PC)  │ ◄─── GET /api/link/status (online?) ──── │  command q   │
└──────────────┘                                          └──────┬───────┘
                                                                 │ 2. GET /api/link/poll (HMAC)
                                                                 ▼
                                                          ┌──────────────┐
                                                          │ PC agent /   │
                                                          │ ESP32 board  │
                                                          └──────┬───────┘
                                                                 │ 3. POST /api/link/result
                                                                 ▼
                                                          results → แอปอ่าน
```

## ลายเซ็น

```
signature = HMAC_SHA256(secret, "METHOD\n/path\nbody")   // hex lowercase
headers: X-No7-Code: <code>   X-No7-Signature: <signature>
```

- `path` ตัด query string ออก (server ใช้ `pathname`)
- `body` คือ JSON string ดิบที่ส่งไป (GET = `''`)
- server ยังรับลายเซ็นแบบเก่า (body เดียว) เพื่อความเข้ากันได้ แต่ของใหม่ใช้ canonical ข้างบน
- ตรวจด้วย `timingSafeEqual` และคืน `401` เมื่อไม่ผ่าน

## Endpoints

| Method | Path | ใครเรียก | ทำอะไร |
|---|---|---|---|
| POST | `/api/pair` | แอป | ขอรหัสจับคู่ → `{code, secret, proof}` |
| POST | `/api/link/command` | แอป | เข้าคิวคำสั่ง `{command, args}` |
| GET | `/api/link/poll` | อุปกรณ์ | ดึงคำสั่งที่ยังไม่ส่ง (แล้วทำเครื่องหมายว่าส่งแล้ว) |
| GET | `/api/link/status` | แอป | `online` (เห็นภายใน 30 วิ), pending, delivered |
| POST | `/api/link/result` | อุปกรณ์ | รายงานผล `{id, ok, data}` |
| GET | `/api/link/results` | แอป | ผลลัพธ์ทั้งหมด (`?since=<ts>`) |

## คำสั่งมาตรฐาน (QUICK_COMMANDS)

| command | args | ความหมาย |
|---|---|---|
| `ping` | — | ทักทาย/ทดสอบ |
| `status` | — | ขอสถานะอุปกรณ์ |
| `eyes` | `{emotion}` | แสดงอารมณ์บนจอ (ตรงกับ 14 emotions) |
| `say` | `{text}` | ให้อุปกรณ์พูด |
| `time` | — | บอกเวลา |
| `sleep` | — | เข้าโหมดพัก |

อุปกรณ์สามารถเพิ่มคำสั่งของตัวเองได้ — แอปส่ง `command` เป็น string อิสระ

## ในแอป

เมนู **🔗 อุปกรณ์**
- `🎲 ขอรหัสจาก server` — เรียก `/api/pair` แล้วเติมช่อง code/secret ให้
- `＋ เพิ่มอุปกรณ์` — เก็บ `{name, baseUrl, code, secret}` ใน `localStorage['no7.devices.v1']`
- การ์ดอุปกรณ์: `🔌 ทดสอบ` (GET /api/health), `📊 สถานะ`, คำสั่งด่วน, `ลบ`
- log ด้านล่างแสดงทุกคำขอ (สำเร็จ/ล้มเหลว)

AI ใช้ได้ผ่าน tool `device_command` — หมวด **control / risk 3** จึงต้องยืนยันก่อนทุกครั้ง (ยกเว้นตั้ง autonomy = allow-all)

## ความปลอดภัย

- `secret` เก็บในเครื่องผู้ใช้ (localStorage) — ไม่ถูกส่งไปที่อื่นนอกจาก server ที่ระบุ
- ถ้า `crypto.subtle` ไม่มี (เปิดผ่าน `http://` ที่ไม่ใช่ localhost) การเซ็นจะถูกปฏิเสธพร้อมข้อความชัดเจน
- server เก็บ `pairings` ในหน่วยความจำ (รีสตาร์ทแล้วหาย) — ต้องจับคู่ใหม่; เก็บลงดิสก์เป็นงานถัดไป
- คำสั่งที่อันตรายไม่ควรถูกทำโดยอัตโนมัติ: ให้ฝั่งอุปกรณ์ตรวจ allowlist ของตัวเองอีกชั้น

## ตัวอย่างฝั่งอุปกรณ์

- `devices/esp32/no7_link.h` — header สำหรับ Arduino/ESP32 (mbedTLS HMAC + poll loop)
- `devices/esp32/README.md` — วิธีต่อกับ server และการตั้งค่า NVS
