# ESP32 client (Phone-Link)

`no7_link.h` เป็น header เดียว ไม่ต้อง build component แยก

## ต้องมี library

- `ArduinoJson` (>= 6)
- `HTTPClient`, `WiFi` (มากับ core ESP32)
- mbedTLS (มากับ ESP-IDF)

## ตั้งค่า

1. เปิด companion server บน PC: `npm run server` (พอร์ต 8787)
2. ในแอป No7 (มือถือ/PC) → **🔗 อุปกรณ์** → `🎲 ขอรหัสจาก server` → จะได้ `code` และ `secret` (hex 64)
3. เก็บค่าลง NVS ของบอร์ด (ไม่ควร hardcode ใน source):

```cpp
#include <Preferences.h>
Preferences prefs;
prefs.begin("no7", false);
String code   = prefs.getString("code", "");
String secret = prefs.getString("secret", "");
```

4. ใน `setup()`:

```cpp
#include "no7_link.h"
No7Link link;

link.begin("http://192.168.1.10:8787", code, secret);
link.onCommand([](const String& cmd, const String& args, const String& id) {
  if (cmd == "ping")   link.report(id, true, "{\"pong\":true}");
  if (cmd == "eyes")   { /* เปลี่ยนอารมณ์ตา 14 แบบตาม args.emotion */ link.report(id, true, "{}"); }
  if (cmd == "say")    { /* TTS/เสียงพูด */ link.report(id, true, "{}"); }
  if (cmd == "time")   { link.report(id, true, "{\"time\":\"" + String(millis() / 1000) + "\"}"); }
  if (cmd == "sleep")  { /* เข้าโหมดพัก */ link.report(id, true, "{}"); }
});
```

5. ใน `loop()` เรียก `link.loop();`

## หมายเหตุ

- บอร์ดเป็นฝ่าย **ดึงคำสั่ง** (poll) ทุก 3 วินาที — ไม่ต้องเปิดพอร์ตเข้า บอร์ดจึงอยู่หลัง NAT ได้
- ลายเซ็นคำนวณจาก `"METHOD\n/path\nbody"` ต้องตรงกับฝั่ง server เป๊ะ (ตัด query string ออก)
- ถ้าเซิร์ฟเวอร์ตอบ 401 ให้ตรวจ: `code` ตรงกับ pairing ที่ยังไม่ถูกล้าง, `secret` hex 64 ตัว, เวลาไม่เพี้ยน, path ไม่มี query
- ฝั่งบอร์ดควรมี allowlist คำสั่งของตัวเองอีกชั้น ก่อนสั่งงาน GPIO/รีเลย์
