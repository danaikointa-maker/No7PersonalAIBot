# สถาปัตยกรรม — No7 Personal AI Bot v0.1

## หลักคิดเดียวที่ตัดสินทุกอย่าง

> **UI + core เขียนครั้งเดียวใน `web/` แล้วให้ 3 host ห่อมันไป**
> ไม่มี business logic ซ้ำใน Electron หรือ Capacitor — host ทำหน้าที่แค่ "ให้ความสามารถที่เว็บไม่มี"

```
                 ┌──────────────────────────────┐
                 │        web/  (ชุดเดียว)      │
                 │  index.html · overlay.html   │
                 │  core/  ui/  styles.css      │
                 └──────────────┬───────────────┘
                                │  vite build → dist/
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  เบราว์เซอร์/PWA          desktop/ (Electron)      mobile/ (Capacitor)
  มือถือ + PC ผ่าน URL     tray · overlay · hotkey   APK/IPA · native mic
        │                       │                       │
        └───────────────────────┴───────────┬───────────┘
                                            ▼
                              server/ (ทางเลือก)
                     static + AI proxy + /api/tools + /api/pair
                                            │
                                     ESP32 / Phone-Link
```

## โมดูลใน `web/src/core`

| ไฟล์ | หน้าที่ | ที่มาจากหลักการ |
|---|---|---|
| `state.js` | state machine ที่ **derive จากข้อเท็จจริง** (ไม่สะสม event) | ESP32 AgentController |
| `memory.js` | BM25 GraphRAG-lite + episodic log, ตัดคำไทย bigram | ESP32 memory/ |
| `tools.js` | registry 19 tools + การ์ดผลลัพธ์ + parser บล็อก `tool` + TOOL_META หมวด/ความเสี่ยง | ESP32 42 tools, Uncle MCP/computer-control |
| `agent.js` | agent loop หลายขั้น + ประตูอนุญาต + ร่องรอยขั้นตอน | ใหม่ (จาก Uncle computer-control 30 steps) |
| `permissions.js` | หมวดสิทธิ์ 5 แบบ + ระดับอิสระ + กติกายืนยัน | ใหม่ (จำเป็นเมื่อให้ AI ลงมือทำ) |
| `modes.js` | 5 บทบาท + การกรองเครื่องมือ + ตรวจจับเจตนา | รวมคอนเซ็บ "เลือกทั้งหมด" |
| `ai-providers.js` | 5 ผู้ให้บริการ + fallback quota-aware | Uncle multi-brain, ESP32 ModelFallback |
| `voice.js` | STT/TTS abstraction + native bridge | ESP32 audio pipeline, Uncle TTS/STT |
| `personas.js` | 8 โปรไฟล์ + กฎ ค่ะ/ครับ | ESP32 personas, Uncle characters |
| `prompt.js` | ประกอบ system prompt (persona + memory + tool catalog) | รวมทั้งสองฝั่ง |
| `settings.js` | เก็บค่าทั้งหมดในเครื่อง | Uncle 7-tab settings (ย่อเหลือ 1 หน้า) |
| `platform.js` | ตรวจว่า runtime เป็น web/desktop/mobile | ใหม่ (จำเป็นเพราะใช้ชุดเดียว) |
| `ui/avatar.js` | ตา 14 อารมณ์บน canvas | ESP32 Cozmo eyes |
| `ui/cards.js` | การ์ดผลลัพธ์เครื่องมือ | ESP32 on-screen cards |

## State machine (derived, ไม่มีทางเพี้ยน)

```
SETUP ──(มี provider)──► IDLE ◄──────────────┐
                          │                  │
        mic ──────────────┼──► LISTENING     │
        ส่งคำถาม ─────────┼──► CONNECTING    │
        tool ทำงาน ───────┼──► THINKING      │
        TTS เล่น ─────────┼──► SPEAKING      │
        error ────────────┴──► ERROR ────────┘
        เงียบ 5 นาที ─────────► SLEEP
```

ลำดับความสำคัญ: `ERROR > SETUP > CONNECTING > SPEAKING > LISTENING > THINKING > SLEEP > IDLE`

ทำไมต้อง derive: บน ESP32 มี task หลายตัว (audio, network, display) ถ้าเก็บ state เป็น event จะ drift
วิธีนี้คำนวณใหม่จาก fact ทุกครั้ง → ไม่มีทางค้างสถานะผิด และมือถือที่สลับแอปบ่อยก็ไม่พัง

## Permission gate (หัวใจของ "ให้ทำได้ทุกอย่าง" อย่างปลอดภัย)

```
tool ──► หมวดถูกปิดอยู่? ──ใช่──► บล็อก + บอกโมเดลให้บอกผู้ใช้ไปเปิดสิทธิ์
             │ไม่
             ▼
        risk ≥ 1 ? ──ไม่──► รันเลย
             │ใช่
             ▼
   autonomy = allow-all ? ──ใช่──► รันเลย
             │ไม่
             ▼
   ขึ้นกล่องยืนยัน ──► อนุญาต / อนุญาตตลอด session / ไม่อนุญาต
                          │ไม่อนุญาต ► หยุดทั้งงาน + ตอบกลับอย่างสุภาพ
```

- `risk 0` อ่านอย่างเดียว — ไม่ต้องถาม
- `risk 1` เปลี่ยนแปลงเล็กน้อย (เตือน/คัดลอก/เปิดลิงก์) — ถามตามระดับอิสระ
- `risk 2` ส่งข้อมูลออก (ร่างอีเมล/SMS/LINE) — ถามเสมอ ยกเว้น allow-all
- `risk 3` ควบคุมเครื่อง (เปิดแอป) — ถามเสมอ ยกเว้น allow-all

## เส้นทางการคุยหนึ่งครั้ง

```
ผู้ใช้ (พิมพ์/พูด)
  └► respond(text)
       ├─ resolveProviderChain(settings)   ← free / quality / private / mixed
       ├─ Agent.run(userText)              ← สูงสุด N ขั้น
       │    ├─ chat()  → chatWithFallback  ← ไล่สมองตาม chain, 401 = หยุด
       │    ├─ มี ```tool {...}``` ไหม?
       │    │    ├─ ไม่มี → คำตอบสุดท้าย → จบ
       │    │    └─ มี → ตรวจสิทธิ์ → ยืนยัน? → runTool() → ป้อนผลกลับ → วนต่อ
       │    └─ คืน { text, trace, steps, blocked }
       ├─ การ์ดผลลัพธ์ + ร่องรอยขั้นตอนในแชท
       ├─ memory.logTurn() + learnFrom()   ← สกัดข้อเท็จจริงแบบ heuristic
       └─ speak(answer)                     ← TTS ไทย + subtitle
```

## บทบาท (modes) และการกรองเครื่องมือ

| โหมด | หมวดเครื่องมือ | น้ำเสียง |
|---|---|---|
| ✨ ทั้งหมด (auto) | ทุกหมวด | สลับบทบาทตามเจตนา (detectMode) |
| 💛 เพื่อนคุย | read, memory, act | ฟังก่อน ถามกลับ สั้น เป็นธรรมชาติ |
| 💼 งาน | read, memory, act, message | กระชับ มีโครงสร้าง ระบุสมมติฐาน |
| 📅 ชีวิตประจำวัน | read, memory, act, message | กระตือรือร้นเรื่องเวลา/นัด |
| 🏠 อุปกรณ์ | read, memory, control | ตรวจสอบก่อนสั่ง ยืนยันเมื่อไม่ชัด |

## ทำไมเลือก Web Speech API แทน Gemini Live

ESP32 ใช้ Gemini Live (WebSocket PCM 16k/24k) เพราะบอร์ดไม่มี OS ให้ใช้
แต่มือถือ/PC มี speech engine อยู่ในตัว: ฟรี, ทำงานออฟไลน์ได้บางเครื่อง, latency ต่ำ, และไม่ต้องถือ API key ค้างไว้
โครง `voice.js` แยก STT/TTS ออกมาแล้ว จึงสลับไป Gemini Live หรือ Edge TTS/Kokoro ภายหลังได้โดยไม่แตะ UI (ดู ROADMAP)

## ที่เก็บข้อมูล

| ข้อมูล | ที่อยู่ | หมายเหตุ |
|---|---|---|
| ตั้งค่า | `localStorage['no7.settings.v1']` | API key อยู่ในเครื่องเท่านั้น, export ตัด key ออก |
| ความจำ | `no7.memory.facts.v1` / `no7.memory.log.v1` | สูงสุด 2,000 ข้อเท็จจริง / 500 บทสนทนา |
| todo / note | `no7.todos.v1` / `no7.notes.v1` | |
| คู่มือ pairing | `no7.pairing.v1` | secret เก็บในเครื่องผู้สร้าง |

## ข้อจำกัดที่รู้ตัว (v0.2)

- agent loop ยังไม่มี memory ของ trace ข้ามคำขอ (ทุกคำขอเริ่มใหม่)
- ยังไม่มีการสตรีมคำตอบแบบ token ต่อ token (รอทั้งก้อนแล้วจึงพูด)
- ความจำยังไม่มีการ consolidate ด้วย LLM (ใช้ heuristic + Jaccard dedupe) — คุมต้นทุนและทำให้ออฟไลน์ได้
- `learnFrom()` เป็น regex ภาษาไทย/อังกฤษพื้นฐาน ไม่ได้เข้าใจบริบท
- ยังไม่มี MCP client, computer-control, Telegram (อยู่ใน ROADMAP ระยะ 2)
