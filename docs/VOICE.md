# เสียง (Voice 2.0) — ฟัง พูด และปลุกด้วยชื่อ

## ภาพรวมเส้นทางเสียง

```
🎤 ไมค์ (Web Speech STT, th-TH)
   └► triggerListen() ──► respond(text)
                            ├─ สตรีม token จาก AI (SSE)
                            │    ├─ UI: บับเบิลโตขึ้นทีละคำ + ▍
                            │    └─ SentenceSplitter → SpeechQueue → 🔊 พูดทีละประโยค
                            └─ จบ → subtitle เต็มประโยค

🎙 Wake word "No7" (ฟังเบื้องหลัง) ──► triggerListen()
```

## 1) สตรีมมิ่งคำตอบ

| ผู้ให้บริการ | วิธี | หมายเหตุ |
|---|---|---|
| Pollinations | `POST /openai` + `stream:true` (SSE) | ค่าเริ่มต้น ฟรี |
| OpenAI / OpenAI-compatible | `POST /chat/completions` + `stream:true` | ใช้ API key |
| Ollama | `POST /api/chat` + `stream:true` (NDJSON) | ในเครื่อง |
| Gemini | `:streamGenerateContent?alt=sse` | ใช้ API key |

ถ้าปลายทางไม่ส่ง `body` แบบ stream (proxy บางตัวตัดทิ้ง) ระบบจะถอยไปขอคำตอบก้อนเดียวอัตโนมัติ
ถ้าสมองตัวแรกพัง **ก่อน** ที่จะส่ง token แรก จะสลับไปตัวถัดไปใน chain ได้ ถ้าส่งไปแล้วจะไม่สลับ (กันข้อความปนกัน)

## 2) พูดก่อนคำตอบจบ

- `SentenceSplitter` ตัดเมื่อเจอ `.!?。！？` หรือ Thai `ฯ` หรือเมื่อยาวเกิน 140 ตัวอักษร (ตัดที่ช่องว่างหรือตัดแข็ง)
- `SpeechQueue` พูดเรียงทีละประโยค ไม่ทับกัน และ `stop()` ล้างคิวทันที
- **กันเสียงหลอน**: ถ้าข้อความที่สตรีมมาเริ่มมี ` ``` ` หรือ `{` (ท่าทางจะเป็น tool call) จะหยุดพูดทันที
  เพราะนั่นไม่ใช่คำตอบที่จะให้ผู้ใช้ฟัง
- ปิดได้ที่ตั้งค่า → "เริ่มพูดก่อนคำตอบจบ"

## 3) Wake word

- ใช้ `SpeechRecognition` แบบ `continuous + interimResults` และเริ่มใหม่เองเมื่อ `onend`
- คำที่จับ: `โน เซเว่น`, `โน่เซเว่น`, `นัมเบอร์เซเวน`, `โน7`, `no 7`, `no seven`, `hey no7`
- cooldown 2.5 วินาที กันเรียกซ้ำ
- **หยุดฟังชั่วคราวขณะ No7 พูด** (`wakeWord.pause()` → `resume()`) เพื่อไม่ให้ได้ยินเสียงตัวเอง
- ถ้าเบราว์เซอร์ปฏิเสธไมค์ (`not-allowed`) จะปิดสวิตช์ให้เองและแจ้งในหน้าตั้งค่า
- ต้องเป็น secure context (`https://` หรือ `localhost`) เหมือน STT ทั้งหมด

## 4) การปรับเสียง

หน้าตั้งค่า → เสียงและการตอบ:
- ความเร็ว (`rate` 0.6–1.6) และ pitch (0.6–1.6)
- เลือกเสียงจากรายการเสียงไทยของเครื่อง (ถ้าไม่มี จะแสดงเสียงทั้งหมดให้เลือก)
- ปุ่ม "ทดสอบเสียง" และ "หยุด"

ค่าถูกส่งเข้า `voice.speak(text, {lang, rate, pitch, voiceName})`
บน Electron ยังใช้ engine ของ Chromium (มีเสียงระบบของ OS) — ถ้าต้องการเสียงระดับพรีเมียมให้ใช้ native TTS ผ่าน preload (จุดต่อพร้อมแล้วที่ `voice.js → speakNative`)

## 5) ข้อจำกัด

- Web Speech STT บน Android WebView บางรุ่นไม่มี → ต้องใช้ native plugin (ดู `mobile/README.md`)
- wake word ต้องเปิดแอปค้างไว้ (ไม่ใช่ background service) — เป็นข้อจำกัดของเบราว์เซอร์
- ยังไม่มีการตรวจจับเสียงพูดขัดจังหวะ (barge-in) ระหว่างที่ No7 พูด — ใช้ปุ่ม ⏹ แทน
