# บอทแชท — Telegram / LINE

No7 คุยได้จากแอปแชทที่คนใช้จริง โดยใช้ companion server เป็นตัวรับ webhook
**token และ secret อยู่ที่ server เท่านั้น** ไม่เคยถูกส่งไปเบราว์เซอร์

```
Telegram ──webhook──▶ POST /api/telegram/webhook ─┐
LINE ─────webhook──▶ POST /api/line/webhook ──────┤▶ handleBotMessage()
                                                   │   ├─ คำสั่ง (/start /help /clear /tools) → ตอบทันที
                                                   │   └─ ข้อความ → AI (pollinations/openai/gemini/ollama)
                                                   ▼
                                   sendMessage / reply (ผ่าน API ของผู้ให้บริการ)
```

## Telegram

1. สร้างบอทกับ [@BotFather](https://t.me/BotFather) → ได้ token
2. ตั้ง env ตอนรัน server:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC \
   TELEGRAM_WEBHOOK_SECRET=ตั้งอะไรก็ได้ที่เดายาก \
   NO7_BOT_PROVIDER=pollinations \
   npm run server
   ```
3. ลงทะเบียน webhook (ต้องเป็น https ที่ Telegram เข้าถึงได้ — ใช้ tunnel เช่น cloudflared/ngrok):
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://<your-domain>/api/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```
4. ทักบอทแล้วพิมพ์ `/start`

- Telegram ต้องการ response เร็ว → server ตอบ `200 {"ok":true}` ทันทีก่อน แล้วประมวลผลเบื้องหลัง
- ตรวจ header `X-Telegram-Bot-Api-Secret-Token` ทุกครั้ง (ถ้าตั้ง secret) — ไม่ตรง = `401`
- ไม่ได้ตั้ง token = `503` พร้อมบอกว่าต้องตั้งอะไร

## LINE

1. สร้าง Messaging API channel → เอา **Channel access token** และ **Channel secret**
2. ```bash
   LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_CHANNEL_SECRET=yyy npm run server
   ```
3. ใส่ Webhook URL `https://<your-domain>/api/line/webhook` ใน LINE console → กด Verify
4. เพิ่มบอทเป็นเพื่อนแล้วพิมพ์ข้อความ

- ตรวจ `X-Line-Signature` = `BASE64(HMAC-SHA256(channelSecret, rawBody))` แบบ constant-time — ไม่ตรง = `401`
- ใช้ `replyToken` (ตอบได้ครั้งเดียวภายใน ~30 วินาที) จึงตอบทีละข้อความตามลำดับ
- ไม่ได้ตั้ง token/secret = `503`

## คำสั่งในแชท

| คำสั่ง | ผล |
|---|---|
| `/start` | ทักทาย + วิธีใช้ |
| `/help` | รายการคำสั่ง |
| `/clear` | ล้างบริบทของแชทนั้น |
| `/tools` | อธิบายว่าในแอปมีเครื่องมืออะไร |

พิมพ์คุยปกติได้เลย — ประวัติ 16 ข้อความล่าสุดต่อห้อง เก็บใน memory ของ server (TTL 2 ชั่วโมง, สูงสุด 200 ห้อง)

## API

| Endpoint | ใช้ทำอะไร |
|---|---|
| `GET /api/bots/status` | สถานะว่าตั้ง token อะไรแล้ว + 10 ครั้งล่าสุด (ไม่มีความลับ) |
| `POST /api/telegram/webhook` | รับ update จาก Telegram |
| `POST /api/line/webhook` | รับ event จาก LINE (ตรวจ signature) |

หน้าตั้งค่า → **บอทแชท** แสดงสถานะและปุ่มคัดลอก webhook URL ให้

## ข้อจำกัด

- ไม่มี rich UI (ปุ่ม/inline keyboard/carousel) — เป็นข้อความล้วน
- ต้องมี URL สาธารณะ (https) สำหรับ webhook — ใน LAN ใช้ tunnel
- เครื่องมือที่ต้องใช้บริบทของแอป (ความจำในเครื่อง, สั่งอุปกรณ์) ยังต้องทำในแอป No7
- การตอบใช้สมองตัวเดียวกับ server (`NO7_BOT_PROVIDER`) ไม่ใช่ค่าที่ผู้ใช้เลือกในเบราว์เซอร์
