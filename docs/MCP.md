# MCP — ต่อ No7 เข้ากับเครื่องมือภายนอก

No7 พูดภาษาเดียวกับ [Model Context Protocol](https://modelcontextprotocol.io) (JSON-RPC 2.0 over HTTP)
ทำให้เครื่องมือจากภายนอก — Gmail, Google Calendar, ไฟล์ในเครื่อง, ฐานข้อมูล, Home Assistant —
กลายเป็นเครื่องมือที่ Agent เรียกใช้ได้เหมือนเครื่องมือในเครื่อง (ปัจจุบันมี 24 ตัว)

## หลักการ

```
ผู้ใช้ → Agent loop → permission gate (หมวด mcp, risk 2) → runTool()
      → McpRegistry → McpClient (JSON-RPC) → POST /api/mcp (companion server) → MCP server
```

- **ไม่ต้องแก้โค้ดเมื่อเพิ่มเครื่องมือ** — server ประกาศ `tools/list` มาเท่าไร No7 ก็ได้เท่านั้น
- **ผ่าน companion server เป็นค่าเริ่มต้น** (`transport: 'proxy'`) เพื่อเลี่ยง CORS และไม่ให้ API key ไปโผล่ในหน้าเว็บ
  ถ้า server เปิด CORS เอง ใช้ `transport: 'direct'` ได้
- **ผลลัพธ์ถูกแปลงเป็นการ์ด** แบบเดียวกับเครื่องมืออื่น (`title`, `big`, `lines`) พร้อม `text` สำหรับให้ LLM อ่านต่อ

## วิธีเพิ่ม server

1. เปิด companion server: `npm run server` (พอร์ต 8787)
2. หน้าตั้งค่า → **ปลั๊กอิน MCP** → กรอกชื่อ + URL ของ MCP endpoint
   - Streamable HTTP: `http://localhost:3100/mcp`
   - ใส่ API key ถ้า server ต้องใช้ (`Authorization: Bearer …`)
3. กด **➕ เพิ่ม server** → ระบบจะ handshake + ดึงรายการเครื่องมือทันที
4. กด **🔄 ค้นหาเครื่องมือ** เมื่อ server เพิ่มเครื่องมือใหม่
5. เปิด/ปิด server ทีละตัวได้ด้วยสวิตช์ — ปิดแล้วเครื่องมือจะหายจาก prompt/grid ทันที

## สิ่งที่ client ทำ (ตามสเปก)

| ขั้น | JSON-RPC | หมายเหตุ |
|---|---|---|
| handshake | `initialize` | ส่ง `protocolVersion: 2024-11-05`, `clientInfo: no7-personal-ai` |
| ยืนยัน | `notifications/initialized` | เป็น notification (ไม่มี `id`) |
| ค้นหา | `tools/list` | รองรับ `nextCursor` (pagination) |
| เรียก | `tools/call` | `{ name, arguments }` |

- รับผลได้ทั้ง `application/json` และ `text/event-stream` (แกะบรรทัด `data:`)
- จำ `mcp-session-id` ที่ server ส่งกลับ แล้วแนบไปทุก request ถัดไป
- timeout 20 วินาทีต่อคำขอ (`AbortSignal.timeout`)
- error จาก server (`error.code`, `error.message`) → `McpError` แล้ว Agent จะบอกผู้ใช้และเสนอทางเลือกอื่น
- ถ้า proxy ใช้ไม่ได้ (server ยังไม่รัน) จะลองยิงตรงหนึ่งครั้งก่อนยอมแพ้

## รายชื่อเครื่องมือที่ได้

id ในระบบคือ `mcp__<server>__<tool>` เช่น `mcp__gmail__send_email`

- ปรากฏใน **แท็บเครื่องมือ** (เฉพาะโหมดที่อนุญาตหมวด `mcp`)
- ปรากฏใน system prompt ผ่าน `describeTools()` พร้อม schema ของพารามิเตอร์
- ถูกบันทึกใน `localStorage` key `no7.mcp.tools.v1` → เปิดแอปใหม่แล้วใช้ได้ทันทีโดยไม่ต้องรอเน็ต
  (ถ้าดึงสดไม่สำเร็จ จะใช้ cache + แจ้งเตือนในหน้าตั้งค่า)

## สิทธิ์และความปลอดภัย

- หมวดใหม่ **🔌 MCP / บริการภายนอก** (risk 2) ในหน้าตั้งค่า → สิทธิ์
- ค่าเริ่มต้น: autonomy `ask-risky` → **ถามยืนยันก่อนเรียกทุกครั้ง** (เพราะเครื่องมือภายนอกเขียนข้อมูลได้จริง)
- ปิดหมวด `mcp` = Agent ถูกบอกว่าหมวดนี้ปิด จึงไม่พยายามเรียก
- API key เก็บใน `localStorage` ของเครื่องนั้น (ไม่ขึ้น git, ไม่ส่งออกนอกจาก header ไปยัง server ปลายทาง)
- proxy รับเฉพาะ `http/https` และส่งต่อ header แบบ allow-list (`authorization`, `mcp-session-id`, headers ที่ผู้ใช้กำหนด)

## ข้อจำกัด

- ยังไม่รองรับ stdio transport (MCP server แบบ process local) — ต้องมี HTTP endpoint
  (ใช้ `npx @modelcontextprotocol/inspector` หรือ proxy แบบ `mcp-proxy` ห่อ stdio เป็น HTTP ได้)
- ยังไม่มี OAuth flow ของ MCP (ใช้ API key/token ที่ผู้ใช้ใส่เอง)
- SSE แบบ long-lived stream ที่ server push เอง (server-initiated) ยังไม่รองรับ — เรียกเป็น request/response
- ต้องมี companion server เว้นแต่ MCP server จะเปิด CORS ให้เบราว์เซอร์โดยตรง

## ตัวอย่างทดสอบเร็ว

```bash
# MCP server ตัวอย่าง (HTTP)
npx -y @modelcontextprotocol/server-everything --transport http --port 3100
# ชี้ URL ไปที่ http://localhost:3100/mcp ในหน้าตั้งค่า
```

```bash
# ยิงผ่าน proxy ตรง ๆ (debug)
curl -s localhost:8787/api/mcp -H 'content-type: application/json' -d '{
  "url": "http://localhost:3100/mcp",
  "payload": {"jsonrpc":"2.0","id":1,"method":"initialize",
    "params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}
}'
```
