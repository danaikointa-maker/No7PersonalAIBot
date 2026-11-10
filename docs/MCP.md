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
- **stdio** (`transport: 'stdio'`) สำหรับ MCP server ที่เป็น process ในเครื่อง — ประกาศที่ server เท่านั้น (ดูหัวข้อถัดไป)
- **OAuth 2.0 + PKCE** สำหรับ server ที่ต้องล็อกอิน (Gmail/Drive) — ดู [`docs/OAUTH.md`](./OAUTH.md)
- **ผลลัพธ์ถูกแปลงเป็นการ์ด** แบบเดียวกับเครื่องมืออื่น (`title`, `big`, `lines`) พร้อม `text` สำหรับให้ LLM อ่านต่อ

## stdio server (process ในเครื่อง)

MCP หลายตัวแจกมาแบบ stdio (ไม่ใช่ HTTP) — companion server spawn ให้และแปลงเป็น JSON-RPC ผ่าน `/api/mcp`

```bash
# ประกาศ server ที่อนุญาต (เท่านั้น — เบราว์เซอร์สั่งรันคำสั่งเองไม่ได้)
MCP_STDIO_SERVERS='{"everything":{"command":"npx","args":["-y","@modelcontextprotocol/server-everything"]},"gmail":{"command":"npx","args":["-y","@modelcontextprotocol/server-gmail"],"env":{"GMAIL_TOKEN":"…"}}}' \
  npm run server
```

- `GET /api/mcp/stdio` → รายชื่อ id/command/args + `running` (ไม่ส่ง env ออกมา)
- `POST /api/mcp` ด้วย `{ "transport": "stdio", "server": "everything", "payload": { …jsonrpc… } }`
- process ถูก cache ไว้ (spawn ครั้งเดียว), stderr เก็บ 2KB ท้ายไว้ใน error message, timeout 25 วินาที
- หน้าตั้งค่า → ปลั๊กอิน MCP → ช่องทาง **stdio** → เลือก server จากรายการที่ server ประกาศไว้

## OAuth 2.0 (PKCE)

server ที่ต้องล็อกอิน ใส่ค่าในหน้าตั้งค่า (ช่อง OAuth) แล้วกด **🔑 ล็อกอิน**:

| ช่อง | ตัวอย่าง |
|---|---|
| Authorize URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Client ID | `xxx.apps.googleusercontent.com` |
| Scopes | `https://www.googleapis.com/auth/gmail.readonly` |

- ใช้ Authorization Code + **PKCE (S256)**, `state` กัน CSRF
- แลก/ต่ออายุ token ผ่าน `POST /api/oauth/token` ของ companion server (เลี่ยง CORS)
- token เก็บใน `localStorage` key `no7.oauth.v1` แยกตาม server, ต่ออายุอัตโนมัติก่อนหมดอายุ 60 วินาที
- หน้ากลับ (`oauth-callback.html`) ส่งผลกลับหน้าหลักด้วย `postMessage` แล้วปิดตัวเอง — ไม่มีข้อมูลลับใน URL ของแอป

ดูรายละเอียดที่ [`docs/OAUTH.md`](./OAUTH.md)

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

- stdio ต้องประกาศ server ที่ `MCP_STDIO_SERVERS` ของ companion server — ยังเพิ่มจากหน้าเว็บไม่ได้ (เจตนา: กันการสั่งรันคำสั่งจากเบราว์เซอร์)
- OAuth flow เป็นแบบ client-side (PKCE) ไม่มี refresh token rotation แบบเข้มงวด และยังไม่รองรับ dynamic client registration ของ MCP
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
