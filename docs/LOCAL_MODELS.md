# 🧠 สมองในเครื่อง (Ollama / LM Studio)

No7 ใช้โมเดลในเครื่องได้สองทาง:

1. **เลือกเป็นสมองหลัก** — ตั้งค่าปกติ (`provider = ollama`, `baseUrl = http://localhost:11434`)
2. **เป็นสมองสำรองเมื่อออฟไลน์** (v2.0) — เปิด `offlineBrain` ไว้ แล้วเมื่อ `navigator.onLine === false`
   No7 จะสลับไปใช้โมเดลในเครื่องเป็นตัวเดียวให้อัตโนมัติ (ไม่รอ timeout ของคลาวด์)

```
ออนไลน์:  [gemini/openai/pollinations] ─► ถ้าพัง → pollinations ฟรี → ollama
ออฟไลน์ + เปิด offlineBrain: [ollama ตามที่เลือก] เท่านั้น (costMode = private)
```

## 1) เตรียมเซิร์ฟเวอร์โมเดล

```bash
# Ollama
ollama serve
ollama pull llama3.1            # หรือ qwen2.5:7b / gemma3

# LM Studio
# เปิด Local Server (Developer tab) → พอร์ต 1234
```

## 2) ตรวจ + เลือกในแอป

**⚙️ ตั้งค่า → 🧠 สมองในเครื่อง**

| ปุ่ม/ช่อง | ทำอะไร |
|---|---|
| ชนิด | Ollama (`:11434`) หรือ LM Studio (`:1234`) |
| Base URL | ที่อยู่เซิร์ฟเวอร์ (จะถูก normalize ตัด `/` ท้าย) |
| 🔍 ตรวจโมเดลในเครื่อง | เรียก `GET /api/tags` (Ollama) หรือ `/v1/models` (LM Studio) |
| ใช้โมเดลนี้ | บันทึกเป็น `offlineBrain.model` |
| 🔥 อุ่นเครื่อง | ยิงคำขอสั้น ๆ ให้โมเดลโหลดเข้า RAM (ครั้งแรกช้า) |
| ใช้เมื่อออฟไลน์ | เปิด/ปิดสวิตช์ `offlineBrain.enabled` |

- ผลตรวจถูกแคช **60 วินาที** (`LocalModelCache`) — กดซ้ำไม่ยิงถี่
- ถ้า companion server ไม่ทำงาน จะลองยิงตรงจากเบราว์เซอร์ (อาจติด CORS — ตั้ง `OLLAMA_ORIGINS=*` ถ้าจำเป็น)

## 3) API / โมดูล

`web/src/core/local-models.js`

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `normalizeLocalTarget({kind, baseUrl})` | เติม preset + ตรวจ URL/ว่าเป็นวง LAN ส่วนตัว |
| `parseModelList(kind, json)` | รวม `/api/tags` และ `/v1/models` เป็นรูปแบบเดียว |
| `matchModel(models, q)` / `pickBestModel` | ค้นหา/เลือกโมเดล (คะแนนตรงตัว > ขึ้นต้น > มีคำอยู่ข้างใน) |
| `probeLocal({targets})` | ตรวจทุกเป้าหมายพร้อมกัน (timeout 4 วิ/เป้า) |
| `warmModel({kind, baseUrl, model})` | อุ่นเครื่องผ่าน `/api/chat` หรือ `/v1/chat/completions` |
| `offlineChainSettings(settings, {online})` | คืน settings ที่สลับไปใช้โมเดลในเครื่องเมื่อออฟไลน์ |
| `describeLocalBrain(settings)` | ข้อความสรุปสำหรับ UI |

Server proxy:

| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/local-models` | `{targets:[{kind,baseUrl}], timeoutMs}` → `{results, models, best}` |
| POST | `/api/local-models/warm` | `{kind, baseUrl, model, timeoutMs}` → `{ok, ms, model}` |

```bash
curl -X POST http://localhost:8787/api/local-models -d '{"targets":[{"kind":"ollama"}]}'
```

## 4) ความปลอดภัย (SSRF guard)

- proxy ยอมให้ไปถึงเฉพาะ **localhost / 127.x / 10.x / 192.168.x / 172.16–31.x** เท่านั้น
- ถ้าต้องชี้ไปเครื่องอื่น ให้ตั้ง `NO7_LOCAL_ALLOW_REMOTE=1` ที่ server (เข้าใจความเสี่ยงเอง)
- รับเฉพาะ `http/https`, timeout สูงสุด 15 วิ (probe) / 300 วิ (warm)
- ไม่มีการส่ง API key หรือข้อมูลผู้ใช้ไปกับคำขอนี้

## 5) ข้อจำกัด

- โมเดลในเครื่องคุณภาพ/ความเร็วขึ้นกับฮาร์ดแวร์ — 7B บน CPU จะช้ากว่าคลาวด์มาก
- No7 ไม่ได้ดาวน์โหลดโมเดลให้ (ใช้ `ollama pull` เอง) — กันกินดิสก์โดยไม่ถาม
- การสลับไปสมองในเครื่องเกิดตอน `offline` เท่านั้น; ถ้าเน็ตมีแต่ผู้ให้บริการล่ม ยังใช้ chain เดิม (คลาวด์ → ฟรี → ollama)
- การสตรีมทำได้ถ้าเซิร์ฟเวอร์โมเดลรองรับ (Ollama/LM Studio รองรับทั้งคู่)
