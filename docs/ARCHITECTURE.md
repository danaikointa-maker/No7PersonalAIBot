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
| `tools.js` | registry + การ์ดผลลัพธ์ + parser บล็อก `tool` | ESP32 42 tools, Uncle MCP/computer-control |
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

## เส้นทางการคุยหนึ่งครั้ง

```
ผู้ใช้ (พิมพ์/พูด)
  └► respond(text)
       ├─ memory.search(text)        ← BM25 top-6
       ├─ buildSystemPrompt(...)     ← persona + ความจำ + tool catalog
       ├─ AIProvider.chat(...)       ← Pollinations/Gemini/OpenAI/Ollama
       ├─ มี ```tool {...}``` ไหม?
       │    ├─ มี → runTool() → provider.chat(สรุปผล) → การ์ด + เสียง
       │    └─ ไม่มี → ข้อความปกติ
       ├─ memory.logTurn() + learnFrom()   ← สกัดข้อเท็จจริงแบบ heuristic
       └─ speak(answer)                     ← TTS ไทย + subtitle
```

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

## ข้อจำกัดที่รู้ตัว (v0.1)

- tool round-trip ทำได้ **1 ครั้งต่อคำถาม** (ยังไม่ใช่ agent loop หลายก้าว)
- ความจำยังไม่มีการ consolidate ด้วย LLM (ใช้ heuristic + Jaccard dedupe) — คุมต้นทุนและทำให้ออฟไลน์ได้
- `learnFrom()` เป็น regex ภาษาไทย/อังกฤษพื้นฐาน ไม่ได้เข้าใจบริบท
- ยังไม่มี MCP client, computer-control, Telegram (อยู่ใน ROADMAP ระยะ 2)
