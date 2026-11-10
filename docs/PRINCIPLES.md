# หลักการจากสองโปรเจคเดิม → อยู่ตรงไหนในโค้ดนี้

## จาก PersonalAIBot-ESP32

| หลักการเดิม | สถานะ | ที่ implement |
|---|---|---|
| Real-time voice (mic 16 kHz ขึ้น / 24 kHz ลง) | 🔄 ทดแทนด้วย Web Speech API | `web/src/core/voice.js` |
| GraphRAG-lite: BM25 + importance | ✅ คงสูตรเดิม k1=1.2, b=0.5 | `memory.js` → `search()` |
| ตัดคำไทย: strip tone mark + bigram + FNV hash | ✅ | `memory.js` → `tokenize()` |
| ยิ่งพูดบ่อยยิ่งจำ (importance ถ่วงคะแนน) | ✅ | `memory.js` → `addFact(text, importance)` |
| Dedupe ข้อเท็จจริงซ้ำ (Jaccard) | ✅ threshold 0.75 | `memory.js` → `addFact()` |
| Episodic log (บันทึกบทสนทนาแยกจากข้อเท็จจริง) | ✅ | `memory.js` → `logTurn()` / `recentLog()` |
| Consolidation ด้วย Flash-Lite | ⏭ heuristic แทน (ประหยัดโควตา) | `main.js` → `learnFrom()` |
| 42 tools + การ์ดบนจอ | 🔄 10 tools ที่ไม่ต้องใช้คีย์ | `tools.js`, `ui/cards.js` |
| Tool schema ใน prompt ให้โมเดลเรียกเอง | ✅ บล็อก ```tool {...}``` | `prompt.js` + `tools.js → extractToolCall()` |
| Personas 8 แบบ / กฎ ค่ะ-ครับ | ✅ 8 personas | `personas.js` |
| Fallback แบบ quota-aware (429/503/404) | ✅ | `ai-providers.js` → `ModelFallback` |
| คีย์ผิดไม่สลับรุ่นให้ (401/403) | ✅ | `ModelFallback.recordError()` |
| Eyes 14 emotions + subtitle ไทย | ✅ canvas ไม่ต้องใช้จอ TFT | `ui/avatar.js` |
| State machine (IDLE/LISTENING/THINKING/SPEAKING/ERROR/SLEEP/SETUP/CONNECTING) | ✅ derive จาก fact | `state.js` |
| Phone-link HMAC (มือถือสั่งบอร์ด) | ✅ ฝั่งแอป + server | `main.js` (`pair-btn`), `server/server.js` |
| PC Studio / mobile flasher | ⏭ อยู่นอกขอบเขต | — |
| Timers / reminders / todo / notes | 🔄 todo/note/timer | `tools.js` |

## จาก uncle-desktop

| หลักการเดิม | สถานะ | ที่ implement |
|---|---|---|
| Multi-brain: Ollama/OpenAI/Gemini/Mistral/DeepSeek/Pollinations | ✅ 5 ช่องทาง (เพิ่ม Mistral/DeepSeek ได้ทันทีใน `PROVIDERS`) | `ai-providers.js` |
| ใช้ฟรีได้โดยไม่ต้องมีคีย์ | ✅ Pollinations เป็นค่าเริ่มต้น | `ai-providers.js` |
| TTS หลายเจ้า (Edge/Kokoro/OpenAI/SAPI/say) | 🔄 มี abstraction + native bridge | `voice.js` → `speakNative()` |
| STT หลายเจ้า (Whisper local/Gemini/OpenAI) | 🔄 ใช้ของระบบก่อน | `voice.js` → `listenOnce()` |
| Push-to-talk / wake word / always-listen | ✅ push-to-talk + hotkey ระดับระบบ | `main.js` `#mic-btn`, `desktop/main.js` |
| ตัวละครแสดงอารมณ์บนจอ | ✅ 14 emotions | `ui/avatar.js` |
| Companion ลอยบนเดสก์ท็อป ลากย้ายได้ | ✅ overlay + always-on-top + tray | `desktop/main.js`, `web/overlay.html` |
| Settings 7 แท็บ | 🔄 รวมเป็นหน้าเดียวโดยไม่เสียฟังก์ชันหลัก | `web/index.html#view-settings` |
| Hotkey ระดับระบบ | ✅ `Ctrl/Cmd+Shift+Space` | `desktop/main.js` |
| Auto-update / ตัวติดตั้ง | ⏭ ใช้ electron-builder (ยังไม่ตั้ง server update) | `package.json#build` |
| Computer-control agent (UI Automation) | ⏭ ระยะ 3 | — |
| MCP (Gmail/Calendar) | ⏭ ระยะ 2 | — |
| Telegram / phone vibecode | ⏭ ระยะ 2 (server มีที่ให้ต่อ) | `server/` |

## สิ่งที่ "ไม่ยกมา" และเหตุผล

- **โค้ด ESP32 / FreeRTOS / PlatformIO** — repo ต้นทางเหลือแค่ docs แล้ว จึงออกแบบใหม่บนเว็บเต็มตัว
- **การถือ Gemini API key บนบอร์ด** — แอปนี้เก็บ key ในเครื่องผู้ใช้และให้ผู้ใช้เลือกผู้ให้บริการ
- **7 แท็บ settings** — บนมือถือเป็นการทรมาน UX จึงยุบเหลือหน้าเดียวแบบเลื่อนลง แล้วจัดกลุ่มด้วยหัวข้อ
