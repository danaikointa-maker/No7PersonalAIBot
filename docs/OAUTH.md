# OAuth 2.0 + PKCE

No7 ต่อกับบริการที่ต้องล็อกอิน (Gmail, Google Calendar, Drive) ด้วย **Authorization Code + PKCE**
โดยไม่ต้องมี client secret ในเบราว์เซอร์ และไม่มี token ออกไปนอกเครื่องคุณ

## ลำดับการทำงาน

```
หน้าตั้งค่า (MCP row)  ──กด 🔑──▶  startOAuth()
      │  สร้าง verifier/challenge (S256) + state
      │  เก็บ {id, verifier, state, redirectUri} ใน sessionStorage
      ▼
window.open(authorizeUrl?client_id&redirect_uri&scope&state&code_challenge…)
      ▼  ผู้ใช้ล็อกอิน/ให้สิทธิ์
oauth-callback.html?code=…&state=…
      │  postMessage({type:'no7-oauth', url}) → หน้าหลัก (same-origin เท่านั้น)
      ▼
exchangeCode() → POST /api/oauth/token (companion server) → token endpoint
      ▼
TokenStore (localStorage: no7.oauth.v1)  →  McpClient แนบ Bearer อัตโนมัติ
```

## ฟังก์ชันหลัก (`web/src/core/oauth.js`)

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `createPkcePair()` | สร้าง `verifier` + `challenge` = BASE64URL(SHA-256(verifier)) |
| `randomState()` | state สุ่ม กัน CSRF |
| `buildAuthorizeUrl()` | ประกอบ URL (`response_type=code`, scope, state, PKCE, extra params) |
| `parseCallback(url)` | อ่าน `code` / `state` / `error` จาก redirect |
| `requestToken()` | แลกหรือต่ออายุ token (ผ่าน proxy หรือยิงตรง) |
| `TokenStore` | เก็บ/อ่าน/ลบ token แยกตาม server |
| `OAuthSession` | รวมทุกอย่าง: token ที่ยังไม่หมดอายุ, ต่ออายุอัตโนมัติ, แลก code |
| `requestDeviceCode()` | ขอ device code + user code (RFC 8628) ผ่าน proxy `/api/oauth/device` |
| `pollDeviceToken()` | poll จนได้ token จัดการ `authorization_pending`/`slow_down`/`expired_token`/`access_denied` |
| `registerClient()` | Dynamic Client Registration (RFC 7591) ผ่าน proxy `/api/oauth/register` |
| `oauthMethodFor()` | เลือกวิธีล็อกอิน: `device` → `pkce` → `none` |

## ล็อกอินด้วยรหัส (Device Authorization Grant)

เหมาะกับ MCP server ที่ไม่รับ redirect URI (เช่น server ที่รันบนเครื่องเดียวกัน หรือ CLI)

```
หน้าตั้งค่า MCP row ──กด 🔢──▶ startDeviceLogin(cfg)
      │  (ถ้ายังไม่มี client id + มี Registration URL → registerClient())
      │  requestDeviceCode() → POST /api/oauth/device → provider
      ▼
แสดง: "ไปที่ https://…/device แล้วกรอกรหัส ABCD-EFGH (หมดอายุ 10 นาที)"
      │  เปิดลิงก์ในหน้าต่างใหม่ (ถ้าถูกบล็อก ผู้ใช้เปิดเองได้)
      ▼
pollDeviceToken() ทุก interval วินาที
      │  authorization_pending → รอต่อ
      │  slow_down            → interval +5 วิ (ไม่เกิน 60)
      │  expired_token / access_denied → หยุดพร้อมข้อความไทย
      ▼
TokenStore (no7.oauth.v1) → McpClient แนบ Bearer → refreshMcp()
```

- ไม่ต้องมี `redirect_uri`, ไม่ต้องมี client secret ในเบราว์เซอร์ (public client + `token_endpoint_auth_method: none`)
- ค่าเริ่มต้น: `expires_in` 600 วิ, `interval` 5 วิ (clamp 1–60)
- เพดานการ poll: `maxAttempts` 200 ครั้ง / จนถึง `expiresAt`
- ถ้าหมดเวลาแล้วยังไม่ยืนยัน → ขึ้น "หมดเวลารอการยืนยันรหัส — ลองใหม่"

### Dynamic Client Registration

ถ้า server ประกาศ `registration_endpoint` (MCP spec 2025) ใส่ **Registration URL** ในหน้าตั้งค่า แล้วกด
`🆕 ขอ client id` — No7 จะส่ง:

```json
{
  "client_name": "No7 Personal AI Bot",
  "redirect_uris": ["https://<origin>/oauth-callback.html"],
  "grant_types": ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "software_id": "no7-personal-ai-bot",
  "software_version": "1.5"
}
```

แล้วเก็บ `client_id` (และ `client_secret` ถ้าได้มา) ไว้ใน settings ของ server นั้น

## ต่ออายุ token

- `isExpired(tokens)` ถือว่าหมดอายุเมื่อเหลือ **60 วินาที** (skew) — เรียกก่อนยิงทุกครั้ง
- ถ้าหมดอายุและมี `refresh_token` → `OAuthSession.getAccessToken()` ต่ออายุให้
- ถ้าถูกเรียกพร้อมกันหลายคำขอ จะต่ออายุ **ครั้งเดียว** (promise เดียว) แล้วทุกคนใช้ token ใหม่
- ถ้าต่ออายุไม่สำเร็จ → คืน `null` → MCP call จะได้ `401` และ UI แจ้งให้ล็อกอินใหม่

## ความปลอดภัย

| ประเด็น | การจัดการ |
|---|---|
| client secret | ไม่เก็บในเบราว์เซอร์ (PKCE แทน) — ถ้าจำเป็นใส่ได้ที่ server เท่านั้น |
| token | `localStorage` ของเครื่อง, ไม่ซิงก์, ไม่ขึ้น git |
| redirect hijack | `redirect_uri` ตรงกับที่ลงทะเบียน + `state` ต้องตรงกับที่เก็บไว้ |
| postMessage | รับเฉพาะ `event.origin === location.origin` และ `type === 'no7-oauth'` |
| หน้าต่างป๊อปอัป | `window.open` พร้อม `noopener` โดยพฤติกรรมของเบราว์เซอร์; callback ปิดตัวเอง |
| proxy ปลายทาง | `/api/oauth/token|device|register` รับเฉพาะ `http(s)` และส่งเฉพาะฟิลด์ที่กำหนด (ไม่ส่ง `client_secret` ใน query/body ของ device flow) |
| device code | รหัสสั้นมี age (`expires_in`) และใช้ได้ครั้งเดียวฝั่ง provider — No7 ไม่เก็บ device code ลงดิสก์ |

## ข้อจำกัด

- ต้องเปิดแอปผ่าน `https://` หรือ `localhost` (crypto.subtle + popup)
- provider ที่บังคับ client secret (ไม่มี PKCE) ต้องตั้ง secret ที่ companion server
- ถ้า provider ไม่ยอมให้ redirect ไป `.../oauth-callback.html` ให้ลงทะเบียน URI นั้นใน console ของผู้ให้บริการ
