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

## 4) Barge-in (พูดขัดจังหวะ)

`web/src/core/bargein.js` — ฟังไมค์ระหว่างที่ No7 พูด แล้วหยุดทันทีเมื่อผู้ใช้แทรก

| โหมด | หยุดเมื่อ |
|---|---|
| `off` | ไม่ฟัง |
| `keyword` (ค่าเริ่มต้น) | ได้ยินคำสั่งหยุด: `หยุด`, `เดี๋ยว`, `รอ`, `ฟังก่อน`, `stop`, `wait`, `hold on`, `cancel` |
| `any` | ได้ยินเสียงพูดอะไรก็ได้ |

- `isEcho()` กันเสียงตัวเอง: ถ้าข้อความที่ได้ยินเป็นส่วนหนึ่งของประโยคที่กำลังพูด (ตรงตัว หรือตัวอักษรซ้ำ >85%) จะไม่นับ
- `setSpoken(sentence)` ถูกเรียกทุกประโยคจาก `SpeechQueue.onSentence` เพื่ออัปเดตประโยคอ้างอิง
- ระหว่างพูด: `wakeWord.pause()` + barge-in ฟัง; จบ/หยุด: `bargeIn.stop()` แล้ว `wakeWordResume()`
- เมื่อถูกขัดจังหวะ → `stopSpeaking()` ล้างคิว + หยุดเสียง + แสดงข้อความ "✋ หยุดให้แล้ว"
- ต้องมี `SpeechRecognition` (Chrome/Edge/Android) และ secure context

## 5) TTS provider router

`web/src/core/tts.js` — เลือกเอนจินเสียงได้ 4 แบบ (ตั้งค่า → เสียงและการตอบ)

| Provider | การทำงาน |
|---|---|
| `system` | Web Speech ของเครื่อง (ฟรี, ออฟไลน์ได้, คุณภาพตาม OS) |
| `openai` | `POST /api/tts` → `${baseUrl}/audio/speech` คืน `audio/mpeg` แล้วเล่นผ่าน `<audio>` |
| `elevenlabs` | `POST /api/tts` → `${baseUrl}/text-to-speech/{voice}?output_format=mp3_44100_128` (`xi-api-key`) |
| `off` | ไม่มีเสียง |

- ค่าที่ใช้: `ttsVoice`, `ttsModel`, `ttsBaseUrl`, `ttsApiKey`, `ttsCache`
- **ค่าเริ่มต้นต่อ provider** (`resolveTTSConfig`): `openai` → `tts-1`/`alloy`, `elevenlabs` → `eleven_multilingual_v2`/`Rachel`
  (ถ้าใส่ voice ของอีกเจ้ามา จะถูกแทนด้วยค่าเริ่มต้นให้อัตโนมัติ)
- ไม่ใส่ API key ในแอปก็ได้ — server ใช้ `OPENAI_API_KEY` / `ELEVENLABS_API_KEY` ของตัวเอง
  (เบราว์เซอร์ฝาก key ไว้ใน localStorage เท่านั้น) · `ELEVENLABS_BASE_URL` ใช้ชี้ proxy ได้
- base URL เปลี่ยนได้ → ใช้ผู้ให้บริการที่เข้ากันได้ (LocalAI, LM Studio, Groq TTS, proxy ภายใน) โดยไม่ต้องแก้โค้ด
- รายชื่อเสียงแนะนำอยู่ใน `TTS_VOICES` และถูกเติมเป็น `datalist` ให้ช่อง "เสียง"
- **fallback**: ถ้าเรียก API ไม่สำเร็จ (`onFallback`) จะกลับไปใช้เสียงเครื่องทันทีและแจ้งในซับไทเทิล ไม่ทำให้บทสนทนาขาด
- `stop()` หยุดทั้ง `<audio>` และเสียงเครื่อง

### แคชเสียง (`AudioCache`)

```js
const tts = new TTSRouter({ settings: () => settings, voice });
await tts.speak('สวัสดีครับ');    // → { engine:'elevenlabs', cached:false }
await tts.speak('สวัสดีครับ');    // → { engine:'elevenlabs', cached:true }  (ไม่ยิงเน็ตซ้ำ)
tts.cacheStats();                 // { entries, bytes, hits, misses, maxEntries, maxBytes }
tts.clearCache();
```

- LRU ในหน่วยความจำ: 20 รายการ / 5 MB (`maxEntries`, `maxBytes` ตั้งได้ผ่าน constructor)
- key = `provider|voice|model|lang|text` — เปลี่ยนเสียง/โมเดล = ไม่ใช้ของเก่าปนกัน
- เก็บเป็น `Blob` แล้วสร้าง object URL ใหม่ทุกครั้งที่เล่น → revoke ได้โดยไม่ทำให้แคชพัง
- ปิดได้ด้วย `ttsCache: false` ในหน้าตั้งค่า
- ข้อความใหญ่เกิน 5 MB จะไม่ถูกแคช (กันหน่วยความจำบวม)

## 6) การปรับเสียง

หน้าตั้งค่า → เสียงและการตอบ:
- ความเร็ว (`rate` 0.6–1.6) และ pitch (0.6–1.6)
- เลือกเสียงจากรายการเสียงไทยของเครื่อง (ถ้าไม่มี จะแสดงเสียงทั้งหมดให้เลือก)
- ปุ่ม "ทดสอบเสียง" และ "หยุด"

ค่าถูกส่งเข้า `voice.speak(text, {lang, rate, pitch, voiceName})`
บน Electron ยังใช้ engine ของ Chromium (มีเสียงระบบของ OS) — ถ้าต้องการเสียงระดับพรีเมียมให้ใช้ native TTS ผ่าน preload (จุดต่อพร้อมแล้วที่ `voice.js → speakNative`)

## 7) ข้อจำกัด

- Web Speech STT บน Android WebView บางรุ่นไม่มี → ต้องใช้ native plugin (ดู `mobile/README.md`)
- wake word ต้องเปิดแอปค้างไว้ (ไม่ใช่ background service) — เป็นข้อจำกัดของเบราว์เซอร์
- barge-in ต้องใช้ `SpeechRecognition` — iOS Safari ยังไม่รองรับ (ใช้ปุ่ม ⏹ แทน)
- TTS คุณภาพสูงต้องออนไลน์และมี API key; โหมดออฟไลน์ใช้เสียงเครื่องเท่านั้น
- แคชเสียงอยู่ในหน่วยความจำ (หายเมื่อรีเฟรช) — ยังไม่ลง IndexedDB เพราะเสี่ยงกินพื้นที่ผู้ใช้โดยไม่ถาม
- ElevenLabs คิดตามตัวอักษร → แคชช่วยลดค่าใช้จ่ายเมื่อพูดประโยคเดิมซ้ำ (เช่น ทักทาย/ยืนยัน)
