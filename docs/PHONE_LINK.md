# Phone-Link: จับคู่มือถือ ↔ PC ↔ ESP32 ด้วย HMAC

หลักการเดิมของ ESP32: มือถือถือกุญแจลับ (HMAC) แล้วส่งคำสั่งผ่านลิงก์ที่พิสูจน์ตัวตนได้
ไม่ต้องพึ่งบัญชี/คลาวด์ และคำสั่งปลอมจากเครื่องอื่นในวง Wi-Fi เดียวกันจะไม่ผ่าน

## 1) สร้างคู่

ในแอป: **⚙️ ตั้งค่า → เชื่อมต่อ (Phone-Link / ESP32) → สร้างรหัสจับคู่**

แอปสร้างให้:
```
รหัสจับคู่: 84-13-07
HMAC proof: 3f9a1c...   (8 ไบต์แรกของ HMAC-SHA256(secret, "pair:<code>"))
```

`secret` (32 ไบต์สุ่ม) ถูกเก็บใน `localStorage['no7.pairing.v1']` ของเครื่องนั้นเท่านั้น

## 2) ฝั่ง server (ทางเลือก)

```bash
curl -X POST http://localhost:8787/api/pair -d '{"name":"esp32-s3"}'
# → {"code":"123456","secret":"<hex 64>","proof":"<hex>","expiresIn":600}
```

## 3) การเรียกที่มีลายเซ็น

ทุกคำขอแนบ header:
```
X-No7-Code: 123456
X-No7-Signature: HMAC_SHA256(secret, <raw JSON body>) → hex
```

ตัวอย่าง (Node):

```js
import crypto from 'node:crypto';
const body = JSON.stringify({ tool: 'air', args: { city: 'Bangkok' } });
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
await fetch('http://<pc-ip>:8787/api/tools/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-No7-Code': code, 'X-No7-Signature': sig },
  body,
});
```

Server ตรวจด้วย `timingSafeEqual` (กัน timing attack) และถ้าลายเซ็นไม่ตรงจะตอบ `401`

## 4) ต่อ ESP32 เข้ากับแอปนี้

ESP32 ไม่ต้องถือ Gemini key อีกต่อไป — ให้บอร์ดเป็น "ปาก+หู" และให้แอปเป็น "สมอง":

```
[ESP32]  ไมค์ → STT (หรือส่ง PCM ขึ้น)  ──┐
                                          ├──► แอป No7 (มือถือ/PC)
[ESP32]  จอ eyes + subtitle  ◄───────────┘     ├─ AI + memory + tools
                                                └─ /api/tools/run (เซิร์ฟเวอร์ในบ้าน)
```

ลำดับที่แนะนำ (ใช้ของที่มีอยู่แล้วใน repo นี้):
1. บอร์ดเรียก `GET /api/tools` เพื่อรู้ว่ามีอะไรให้ใช้
2. บอร์ดเรียก `POST /api/tools/run` พร้อมลายเซ็น เพื่อดึงข้อมูลจริง (อากาศ/PM2.5/คริปโต)
3. ข้อความที่พูด → ส่งเข้าแอป (พิมพ์ผ่าน UI หรือ `POST /api/chat`) แล้วรับข้อความตอบกลับไปแสดง/อ่านออกเสียง

## 5) ข้อควรระวัง

- `secret` ไม่ควรอยู่ใน firmware แบบ plain text ถ้าบอร์ดถูกจับได้ — พิจารณา NVS + เข้ารหัส flash
- ใช้เฉพาะในวง LAN ที่เชื่อถือได้ หรือใส่ TLS ผ่าน reverse proxy
- `pairings` ของ server อยู่ในหน่วยความจำ (รีสตาร์ทแล้วหาย) — ระยะถัดไปจะเก็บลงไฟล์ `.no7/pairings.json`
- รหัส 6 หลักมีไว้ให้มนุษย์อ่าน/พิมพ์ ไม่ใช่ความลับหลัก — ความลับจริงคือ `secret` 32 ไบต์
