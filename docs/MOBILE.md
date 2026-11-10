# มือถือ & PWA (R1 — Mobile hardening)

## ติดตั้ง

| แพลตฟอร์ม | วิธี |
|---|---|
| Android / Chrome | เมนู ⋮ → "ติดตั้งแอป" |
| iOS / Safari | ปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม" |
| PC / Chrome-Edge | ไอคอนติดตั้งในแถบที่อยู่ |

manifest มี **shortcuts** (กดค้างที่ไอคอนแอป): แชทใหม่ · ความจำ · ตารางนัด · อุปกรณ์
— เปิดด้วย `?view=memory` แล้วแอปจะพาไปหน้านั้นทันที

## ออฟไลน์

- service worker (Workbox) precache UI ทั้งหมด → เปิดแอปได้แม้ไม่มีเน็ต
- แถบเหลืองบนสุดจะขึ้นเมื่อ `navigator.onLine === false` และหายเองเมื่อกลับมาออนไลน์
- งานที่ทำได้ออฟไลน์: ความจำ (ค้น/เพิ่ม/ปักหมุด), โน้ต, รายการงาน, ปฏิทิน, persona, ตั้งค่า, pairing (ถ้ามี crypto.subtle)
- งานที่ต้องรอเน็ต: แชทกับ AI, เครื่องมือที่ดึงข้อมูล (อากาศ/ราคา/RSS), ซิงก์, สั่งอุปกรณ์

## แผง "ความสามารถของอุปกรณ์นี้"

ตรวจจาก API จริง แล้วบอกว่า ✅/➖ พร้อมเหตุผล:

`microphone` · `speechRecognition` · `speechSynthesis` · `wakeWord` · `notifications` ·
`clipboard` · `share` · `vibration` · `battery` · `network` · `secureContext` ·
`standalone` · `persistentStorage` · `crypto` · `fileSystemAccess`

- **ขอสิทธิ์ไมโครโฟน** — เรียก `getUserMedia` แล้วปิด track ทันที (ให้ STT ใช้ได้โดยไม่ต้องรอ error)
- **ขอสิทธิ์แจ้งเตือน** — `Notification.requestPermission()`
- ถ้า `secureContext` เป็น false (เปิดผ่าน `http://192.168.x.x`) ไมค์/HMAC จะถูกปิด — ใช้ `npm run server` + tunnel ที่มี TLS หรือ build เป็นแอป

## พื้นที่จัดเก็บ

- แสดงขนาดต่อส่วน (ความจำ/ปฏิทิน/persona/โน้ต/ตั้งค่า) และโควตาที่เบราว์เซอร์รายงาน
- **ขอพื้นที่ถาวร** (`navigator.storage.persist()`) — กันเบราว์เซอร์ล้างข้อมูลเมื่อเครื่องใกล้เต็ม
- ถ้าเขียนไม่สำเร็จเพราะ quota: แอปไม่พัง แต่ขึ้นแบนเนอร์แนะนำ "ส่งออกความจำแล้วลบของเก่า"
- ล้างเป็นรายกลุ่มได้: สถิติ / โน้ต-งาน

## Capacitor (แอปจริง)

```bash
npm run mobile:add:android && npm run mobile:sync
```

สิทธิ์ที่ต้องประกาศ (ดู `mobile/README.md`): `RECORD_AUDIO`, `INTERNET`, `POST_NOTIFICATIONS` (Android) และ
`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` (iOS)

## ข้อจำกัดที่รู้ตัว

- iOS Safari: STT ต้องเริ่มจาก user gesture (ปุ่ม) — wake word ต่อเนื่องจะหยุดเมื่อแอปอยู่เบื้องหลัง
- Android WebView บางรุ่นไม่มี speech engine → ตรวจได้จากแผงความสามารถ (➖ speechRecognition)
- wake word ทำงานเฉพาะตอนเปิดแอปอยู่ (ไม่มี background service ในเบราว์เซอร์)
- persistent storage ไม่ได้แปลว่าไม่มีทางถูกลบ 100% (ผู้ใช้ล้างข้อมูลเองได้เสมอ)
