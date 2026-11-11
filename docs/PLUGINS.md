# 🧩 ปลั๊กอินเครื่องมือ HTTP

ให้ No7 เรียก API ของคุณเองได้ โดยไม่ต้องแก้โค้ด — ประกาศเป็น JSON ในหน้า **🧰 เครื่องมือ**

```json
[
  {
    "id": "catfact",
    "label": "เกร็ดแมว",
    "emoji": "🐱",
    "desc": "ดึงเกร็ดเกี่ยวกับแมวแบบสุ่ม",
    "method": "GET",
    "url": "https://catfact.ninja/fact",
    "risk": 0
  },
  {
    "id": "todo_post",
    "label": "ส่งงานเข้า API",
    "emoji": "📮",
    "desc": "POST รายการงานไปยัง endpoint ของคุณ",
    "method": "POST",
    "url": "https://example.com/api/items",
    "risk": 2,
    "params": { "title": { "desc": "ชื่องาน", "required": true } },
    "body": { "title": "{{title}}" }
  }
]
```

## 1) ฟิลด์ที่รองรับ

| ฟิลด์ | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `id` | — | `a-z0-9_` 2–31 ตัว ขึ้นต้นด้วยตัวอักษร (ใช้เป็น `plugin__<id>`) |
| `label` / `emoji` | — / `🔌` | ชื่อและไอคอนที่ผู้ใช้เห็น |
| `desc` | `METHOD host` | คำอธิบายให้ AI เลือกใช้ถูก |
| `method` | `GET` | `GET` หรือ `POST` เท่านั้น |
| `url` | — | ใส่ `{{param}}` ได้ — ค่าจะถูก **URL-encode** ให้ |
| `query` | `{}` | query string เพิ่มเติม (ค่าซ้ำจะถูก `set`) |
| `headers` | `{}` | header เพิ่ม (ชื่อต้องเป็น a-z0-9-) |
| `body` | — | (POST) object ที่จะส่งเป็น JSON — ส่งเฉพาะฟิลด์ที่ประกาศ |
| `params` | `{}` | สูงสุด 10 ตัว: `desc`, `required`, `default` |
| `risk` | `1` | 0–3 → risk ≥ 1 ต้องยืนยันก่อนรัน |
| `category` | ตาม risk | `read` / `act` / `message` / `control` (ใช้กับ permission gate) |
| `timeoutMs` | 10000 | สูงสุด 10 วิ |
| `maxBytes` | 65536 | ตัด response ที่ยาวเกิน |
| `allowInsecure` | false | ยอมให้ใช้ `http://` (ไม่แนะนำ) |
| `allowPrivate` | false | ยอมให้ยิงเข้า localhost/วง LAN (ไม่แนะนำ) |

## 2) ความปลอดภัย

| ความเสี่ยง | มาตรการ |
|---|---|
| ขโมยข้อมูลออกนอกเครื่อง | **https เท่านั้น** + ไม่รับ `http` เว้นแต่เปิดเอง |
| SSRF เข้าเครื่อง/router | บล็อก `localhost`, `127.x`, `10.x`, `192.168.x`, `172.16–31.x` (ตรวจซ้ำตอนยิงจริง) |
| ยิงช้า/ค้าง | `AbortController` timeout 10 วิ |
| Response ยักษ์ | ตัดที่ 64 KB |
| Prompt injection ผ่านพารามิเตอร์ | ค่าถูก encode ใน URL, ส่งได้เฉพาะ declared params, ไม่มี eval/JS |
| เรียกโดยไม่ตั้งใจ | `risk ≥ 1` → กล่องยืนยัน + permission gate ตามหมวด |

ตรวจ **สองรอบ**: ตอนบันทึก (`validateCustomTools`) และตอนยิงจริง (`assertSafeUrl`)
เพราะ URL ที่ประกอบจากพารามิเตอร์อาจเปลี่ยน host ได้

## 3) API ของโมดูล (`core/custom-tools.js`)

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `normalizeCustomTool(raw)` | ตรวจ/เติมค่าเริ่มต้น → `{ tool, errors, ok }` |
| `validateCustomTools(jsonOrArray)` | ตรวจทั้งชุด (array / JSON string / `{tools}`) + กัน id ซ้ำ + จำกัดจำนวน |
| `renderTemplate(tpl, args)` | แทน `{{var}}` (encode) — ไม่มี eval |
| `fillArgs(tool, args)` | ตรวจ required, เติม default, ตัดฟิลด์ที่ไม่ประกาศ |
| `buildHttpTool(tool, {fetchImpl})` | ได้ tool ที่ `run(args)` ใช้กับ registry (`fetch` inject ได้เพื่อเทสต์) |
| `customToolDefs(input)` | → `{ defs: { plugin__id: tool }, errors, tools }` |

ผสานกับ MCP ผ่าน `refreshDynamicTools()` ใน `main.js`:
`MCP tools + plugin__* + digest` ถูกลงทะเบียนพร้อมกัน (ถ้าปลั๊กอินชุดใหม่ invalid ทั้งชุดจะไม่ถูกใช้)

## 4) ข้อจำกัด

- ไม่มี OAuth/secret ต่อปลั๊กอิน — เก็บ token ใน `headers` ได้ แต่จะอยู่ใน localStorage (อย่าใส่คีย์สำคัญ)
- รองรับแค่ JSON/text response (ไม่รองรับ binary/ไฟล์)
- ไม่มี retry/rate-limit ต่อปลั๊กอิน (ใช้ `withRetry` ของแชทไม่ได้)
- CORS: เรียกจากเบราว์เซอร์ตรง ๆ — endpoint ต้องอนุญาต origin ของแอป หรือใช้ companion server
- ยังไม่มี UI ฟอร์มกรอกทีละช่อง (ใช้ JSON อย่างเดียว)
