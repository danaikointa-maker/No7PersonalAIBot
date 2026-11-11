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
| POST | `/api/link/hello` | อุปกรณ์ | ลงทะเบียนตัวเอง + capabilities → `{protocol, features, eyesTtlMs}` |
| GET | `/api/link/hello` | ทั้งคู่ | อ่านข้อมูลอุปกรณ์ที่ลงทะเบียนไว้ |
| POST | `/api/link/eyes` | ทั้งคู่ | เก็บอารมณ์/ตาล่าสุด `{emotion, intensity, ttlMs}` |
| GET | `/api/link/eyes` | ทั้งคู่ | อ่านอารมณ์ล่าสุด + `stale`/`ageMs` |
| POST | `/api/link/voice` | อุปกรณ์ | ต่อคิวเสียง `{chunk(base64), mime, seq, final}` (≤256 KB/chunk, ≤2 MB/อุปกรณ์) |
| GET | `/api/link/voice?since=` | PC | ดึง chunk ที่ยังไม่ได้เล่น |
| GET | `/api/link/voice/status` | PC | จำนวน chunk/bytes ที่ค้าง + `lastSeq` + `dropped` |
| POST | `/api/link/voice/ack` | PC | เล่นถึง seq ไหนแล้ว `{upto}` → ล้างคิว |

### hello / eyes / voice (รอบ v1.5)

```
อุปกรณ์                      server                        แอป/PC
   │ POST hello(caps) ─────────►│                             │
   │◄─ protocol/features ───────│                             │
   │                            │◄──── POST eyes(emotion) ────│  (หรือบอร์ดส่งเอง)
   │ GET eyes (1 วิ) ──────────►│                             │
   │◄─ eyes + stale ────────────│                             │
   │ POST voice(chunk) ────────►│◄──── GET voice?since ───────│
   │                            │──── POST voice/ack ────────►│
```

- **capabilities**: `mic`, `speaker`, `eyes`, `screen`, `buttons`, `voice` (บูลีน) — ส่งซ้ำแล้วไม่ระบุ = คงค่าเดิม
- **eyes**: `ttlMs` 1–60 วิ (default 15) — เกินเวลาแล้ว `stale: true` ให้จอหรี่ตาได้เอง
- **voice**: base64 ใน JSON, mime ที่รับ: `audio/ogg|opus|pcm|wav|webm|mpeg`; เกินเพดานแล้วทิ้ง chunk เก่าสุด (`dropped` บอกจำนวน)
- ข้อมูลอุปกรณ์เก็บที่ `.no7/devices.json` (`NO7_DATA_DIR`) — eyes/voice อยู่ในหน่วยความจำ (เร็ว เปลี่ยนบ่อย)

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
- server เก็บ `pairings` ในหน่วยความจำ (รีสตาร์ทแล้วหาย) — ต้องจับคู่ใหม่; ส่วนข้อมูลอุปกรณ์ (`hello`) เก็บลง `.no7/devices.json` แล้ว
- คิวเสียงมีเพดาน (2 MB / 40 chunk) เพื่อกันหน่วยความจำบวม — ไคลเอนต์ควร ack ทุกครั้งที่เล่นจบ
- คำสั่งที่อันตรายไม่ควรถูกทำโดยอัตโนมัติ: ให้ฝั่งอุปกรณ์ตรวจ allowlist ของตัวเองอีกชั้น

## ตัวอย่างฝั่งอุปกรณ์

- `devices/esp32/no7_link.h` — header สำหรับ Arduino/ESP32 (mbedTLS HMAC + poll loop)
- `devices/esp32/README.md` — วิธีต่อกับ server และการตั้งค่า NVS
