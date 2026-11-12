// MCP (Model Context Protocol) client — ต่อ No7 เข้ากับเซิร์ฟเวอร์ภายนอก
// (Gmail, ปฏิทิน, ไฟล์, ฐานข้อมูล ...) ด้วย JSON-RPC 2.0 over HTTP
//
// ทำงานได้ 2 ทาง:
//   1) ผ่าน companion server `POST /api/mcp` (ค่าเริ่มต้น) — เลี่ยง CORS และซ่อน key
//   2) ตรงจากเบราว์เซอร์ (`transport: 'direct'`) — สำหรับเซิร์ฟเวอร์ที่เปิด CORS
//   3) stdio ผ่าน server (`transport: 'stdio'`) — MCP process local ที่ประกาศใน MCP_STDIO_SERVERS
//
// รองรับผลลัพธ์ทั้ง application/json และ text/event-stream (Streamable HTTP)

import { TokenStore, OAuthSession } from './oauth.js';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_CLIENT_INFO = { name: 'no7-personal-ai', version: '2.42.1' };
export const MCP_CACHE_KEY = 'no7.mcp.tools.v1';

export class McpError extends Error {
  constructor(message, { code = null, data = null } = {}) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;
  }
}

/** แปลงชื่อให้เป็น id ที่ปลอดภัย: `mcp__server__tool` */
export function mcpToolId(serverId, toolName) {
  const slug = (v) => String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x';
  return `mcp__${slug(serverId)}__${slug(toolName)}`;
}

/** parse body ที่เป็นได้ทั้ง JSON และ SSE (เลือก message สุดท้ายที่ตรงกับ id) */
export function parseMcpBody(text = '', id = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const obj = JSON.parse(raw);
      return Array.isArray(obj) ? pickMessage(obj, id) : obj;
    } catch { /* ลองแบบ SSE ต่อ */ }
  }
  const messages = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = /^data:\s*(.+)$/.exec(line.trim());
    if (!m || m[1].trim() === '[DONE]') continue;
    try { messages.push(JSON.parse(m[1])); } catch { /* ข้ามบรรทัดเสีย */ }
  }
  return pickMessage(messages, id);
}

function pickMessage(messages, id) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  if (id == null) return messages[messages.length - 1];
  return messages.find((m) => m && m.id === id) || messages[messages.length - 1];
}

/** รวม content ของ tools/call ให้เป็นข้อความ + การ์ดที่ UI แสดงได้ */
export function flattenToolResult(result) {
  const items = Array.isArray(result?.content) ? result.content : [];
  const texts = [];
  const lines = [];
  for (const item of items) {
    if (!item) continue;
    if (item.type === 'text' && item.text) {
      texts.push(String(item.text));
      lines.push(...String(item.text).split(/\n+/).filter(Boolean).slice(0, 8));
    } else if (item.type === 'resource' && item.resource?.text) {
      texts.push(String(item.resource.text));
      lines.push(`📄 ${item.resource.uri || 'resource'}`);
    } else if (item.type === 'image') {
      lines.push(`🖼️ image ${item.mimeType || ''}`.trim());
    }
  }
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    const json = JSON.stringify(result.structuredContent);
    texts.push(json);
    if (!lines.length) lines.push(json.slice(0, 200));
  }
  const text = texts.join('\n').trim();
  return {
    title: result?.isError ? 'MCP: ผิดพลาด' : 'MCP',
    big: (lines[0] || text.split(/\n/)[0] || 'เสร็จแล้ว').slice(0, 120),
    lines: lines.slice(1),
    text: text.slice(0, 4000),
    isError: !!result?.isError,
  };
}

function normalizeTool(tool = {}) {
  return {
    name: String(tool.name || ''),
    description: String(tool.description || ''),
    inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object', properties: {} },
  };
}

function schemaParams(schema) {
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return { input: 'JSON object ตาม schema ของเครื่องมือนี้' };
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const type = v?.type || 'any';
    const desc = v?.description ? ` — ${v.description}` : '';
    out[k] = `${type}${desc}`;
  }
  return Object.keys(out).length ? out : { input: 'JSON object ตาม schema ของเครื่องมือนี้' };
}

export class McpClient {
  /**
   * @param {{id?: string, name?: string, url?: string, apiKey?: string, headers?: object,
   *          transport?: 'proxy'|'direct'|'stdio', serverUrl?: string|(() => string),
   *          getToken?: () => Promise<string|null>, fetchImpl?: Function, timeoutMs?: number}} opts
   */
  constructor(opts = {}) {
    this.id = opts.id || opts.name || 'mcp';
    this.name = opts.name || this.id;
    this.url = String(opts.url || '').trim();
    this.apiKey = opts.apiKey || '';
    this.headers = opts.headers || {};
    this.transport = ['direct', 'stdio'].includes(opts.transport) ? opts.transport : 'proxy';
    this.getToken = typeof opts.getToken === 'function' ? opts.getToken : null;
    this.serverUrl = typeof opts.serverUrl === 'function' ? opts.serverUrl : () => opts.serverUrl || '';
    this.fetchImpl = opts.fetchImpl || ((...a) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.sessionId = null;
    this.serverInfo = null;
    this._id = 0;
    this.initialized = false;
  }

  _timeoutSignal() {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(this.timeoutMs);
    return undefined;
  }

  /** ส่ง JSON-RPC ผ่าน proxy หรือตรง พร้อม fallback */
  async _authToken() {
    if (!this.getToken) return '';
    try { return (await this.getToken()) || ''; } catch { return ''; }
  }

  async _send(payload) {
    const base = String(this.serverUrl() || '').replace(/\/$/, '');
    if (this.transport === 'stdio') {
      if (!base) throw new McpError('stdio transport ต้องมี companion server (ตั้งค่า serverUrl)');
      return this._sendStdio(base, payload);
    }
    if (this.transport === 'proxy' && base) {
      try {
        return await this._sendProxy(base, payload);
      } catch (err) {
        // proxy ใช้ไม่ได้ (เซิร์ฟเวอร์ยังไม่รัน) → ลองตรงหนึ่งครั้ง
        if (!/HTTP 4\d\d/.test(err.message)) {
          return this._sendDirect(payload);
        }
        throw err;
      }
    }
    return this._sendDirect(payload);
  }

  async _sendStdio(base, payload) {
    const res = await this.fetchImpl(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        transport: 'stdio',
        server: this.stdioServer || this.id,
        payload,
        timeoutMs: this.timeoutMs,
      }),
      signal: this._timeoutSignal(),
    });
    if (!res.ok) throw new McpError(`stdio proxy HTTP ${res.status}`, { code: res.status });
    const envelope = await res.json();
    if (envelope.error) throw new McpError(envelope.error, { code: envelope.status || 0 });
    return parseMcpBody(envelope.body, payload.id);
  }

  async _sendProxy(base, payload) {
    const token = this.apiKey ? '' : await this._authToken();
    const res = await this.fetchImpl(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: this.url,
        apiKey: this.apiKey,
        token: token || undefined,
        headers: this.headers,
        sessionId: this.sessionId,
        payload,
      }),
      signal: this._timeoutSignal(),
    });
    if (!res.ok) throw new McpError(`proxy HTTP ${res.status}`, { code: res.status });
    const envelope = await res.json();
    if (envelope.status >= 400 && !envelope.body) {
      throw new McpError(`MCP server HTTP ${envelope.status}`, { code: envelope.status });
    }
    const sid = envelope.headers?.['mcp-session-id'];
    if (sid) this.sessionId = sid;
    return parseMcpBody(envelope.body, payload.id);
  }

  async _sendDirect(payload) {
    const token = this.apiKey ? '' : await this._authToken();
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      ...(!this.apiKey && token ? { authorization: `Bearer ${token}` } : {}),
      ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
      ...this.headers,
    };
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: this._timeoutSignal(),
    });
    const sid = res.headers?.get?.('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!res.ok) throw new McpError(`MCP server HTTP ${res.status}`, { code: res.status });
    const text = await res.text();
    return parseMcpBody(text, payload.id);
  }

  async rpc(method, params, { notify = false } = {}) {
    const payload = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    if (!notify) payload.id = ++this._id;
    const msg = await this._send(payload);
    if (notify) return null;
    if (!msg) throw new McpError('MCP server ไม่ตอบกลับ');
    if (msg.error) {
      throw new McpError(msg.error.message || 'MCP error', { code: msg.error.code, data: msg.error.data });
    }
    return msg.result;
  }

  /** handshake ตามสเปก: initialize → notifications/initialized */
  async initialize() {
    if (this.initialized) return this.serverInfo;
    const result = await this.rpc('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: false } },
      clientInfo: MCP_CLIENT_INFO,
    });
    this.serverInfo = result?.serverInfo || null;
    try {
      await this.rpc('notifications/initialized', undefined, { notify: true });
    } catch { /* notification ล้มเหลวไม่เป็นไร */ }
    this.initialized = true;
    return this.serverInfo;
  }

  async listTools() {
    await this.initialize();
    const tools = [];
    let cursor;
    let guard = 0;
    do {
      const result = await this.rpc('tools/list', cursor ? { cursor } : {});
      for (const t of result?.tools || []) tools.push(normalizeTool(t));
      cursor = result?.nextCursor;
    } while (cursor && guard++ < 20);
    return tools;
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return this.rpc('tools/call', { name, arguments: args || {} });
  }
}

/**
 * Registry — รวมเครื่องมือจากทุก MCP server เป็น tool ที่ Agent เรียกได้
 * cache รายชื่อ tool ไว้ใน localStorage เพื่อให้เปิดแอปแล้วใช้ได้ทันที
 */
export class McpRegistry {
  constructor({
    settings = () => ({}),
    serverUrl = () => '',
    storage = null,
    fetchImpl = null,
    timeoutMs = 20000,
  } = {}) {
    this.getSettings = typeof settings === 'function' ? settings : () => settings;
    this.getServerUrl = typeof serverUrl === 'function' ? serverUrl : () => serverUrl;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.timeoutMs = timeoutMs;
    this.servers = new Map(); // id -> {client, tools, error, serverInfo}
    this.tokenStore = new TokenStore({ storage: this.storage });
    this.sessions = new Map();
    this.loadCache();
  }

  loadCache() {
    this.cache = {};
    try {
      const raw = this.storage?.getItem(MCP_CACHE_KEY);
      if (raw) this.cache = JSON.parse(raw) || {};
    } catch { this.cache = {}; }
    return this.cache;
  }

  saveCache() {
    try { this.storage?.setItem(MCP_CACHE_KEY, JSON.stringify(this.cache)); } catch { /* quota */ }
  }

  /** รายการ server จาก settings (เปิด/ปิดได้ทีละตัว) */
  configs() {
    const list = this.getSettings()?.mcpServers;
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && s.enabled !== false && (s.url || s.transport === 'stdio'))
      .map((s) => ({
        id: String(s.id || s.name || s.url),
        name: String(s.name || s.id || 'MCP'),
        url: String(s.url || ''),
        apiKey: String(s.apiKey || ''),
        transport: ['direct', 'stdio'].includes(s.transport) ? s.transport : 'proxy',
        oauth: s.oauth && typeof s.oauth === 'object' && s.oauth.tokenUrl ? s.oauth : null,
      }));
  }

  clientFor(cfg) {
    let getToken = null;
    if (cfg.oauth?.tokenUrl) {
      const session = new OAuthSession({
        name: cfg.id,
        tokenUrl: cfg.oauth.tokenUrl,
        clientId: cfg.oauth.clientId || '',
        clientSecret: cfg.oauth.clientSecret || '',
        serverUrl: this.getServerUrl,
        store: this.tokenStore,
        fetchImpl: this.fetchImpl,
      });
      getToken = () => session.getAccessToken();
      this.sessions.set(cfg.id, session);
    } else if (this.sessions.has(cfg.id)) {
      this.sessions.delete(cfg.id);
    }
    return new McpClient({
      ...cfg,
      serverUrl: this.getServerUrl,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      stdioServer: cfg.id,
      getToken,
    });
  }

  /** ต่อทุก server + ดึง tools (ใช้ cache ถ้าดึงไม่ได้) */
  async refresh() {
    const results = [];
    const next = new Map();
    for (const cfg of this.configs()) {
      const client = this.clientFor(cfg);
      try {
        const tools = await client.listTools();
        next.set(cfg.id, { client, tools, serverInfo: client.serverInfo, error: null, at: Date.now() });
        this.cache[cfg.id] = { tools, serverInfo: client.serverInfo, at: Date.now() };
        results.push({ id: cfg.id, name: cfg.name, ok: true, count: tools.length });
      } catch (err) {
        const cached = this.cache[cfg.id]?.tools || [];
        next.set(cfg.id, { client, tools: cached, serverInfo: client.serverInfo, error: err.message, at: Date.now() });
        results.push({ id: cfg.id, name: cfg.name, ok: false, error: err.message, count: cached.length, cached: cached.length > 0 });
      }
    }
    this.servers = next;
    // ลบ cache ของ server ที่ถูกถอดออก
    const live = new Set(this.configs().map((c) => c.id));
    for (const id of Object.keys(this.cache)) if (!live.has(id)) delete this.cache[id];
    this.saveCache();
    return results;
  }

  /** session OAuth ของ server (สร้างถ้ายังไม่มี) */
  oauthSession(id) {
    const cfg = this.configs().find((c) => c.id === id);
    if (!cfg?.oauth) return null;
    if (!this.sessions.has(id)) this.clientFor(cfg);
    return this.sessions.get(id) || null;
  }

  /** server config ตาม id (ใช้กับ UI) */
  configFor(id) {
    return this.configs().find((c) => c.id === id) || null;
  }

  /** ใช้ cache ที่เคยดึงไว้ (ไม่ยิงเน็ต) — เรียกตอนบูตเพื่อให้ tool พร้อมทันที */
  hydrateFromCache() {
    this.servers = new Map();
    for (const cfg of this.configs()) {
      const entry = this.cache[cfg.id];
      if (!entry?.tools?.length) continue;
      this.servers.set(cfg.id, {
        client: this.clientFor(cfg),
        tools: entry.tools,
        serverInfo: entry.serverInfo || null,
        error: null,
        at: entry.at || 0,
      });
    }
    return this.servers.size;
  }

  connected() {
    return [...this.servers.values()].some((s) => !s.error);
  }

  /** tool definitions ในรูปแบบของ tools.js */
  toolDefs() {
    const defs = {};
    for (const [serverId, entry] of this.servers) {
      const cfg = this.configs().find((c) => c.id === serverId);
      const serverName = cfg?.name || serverId;
      for (const tool of entry.tools || []) {
        const id = mcpToolId(serverId, tool.name);
        defs[id] = {
          emoji: '🔌',
          label: `${serverName}: ${tool.name}`,
          desc: tool.description || `เครื่องมือ ${tool.name} จาก ${serverName}`,
          params: schemaParams(tool.inputSchema),
          meta: { category: 'mcp', risk: 2 },
          serverId,
          toolName: tool.name,
          inputSchema: tool.inputSchema,
          async run(args = {}) {
            const client = entry.client;
            const result = await client.callTool(tool.name, args);
            const flat = flattenToolResult(result);
            return { ...flat, title: `${serverName}: ${tool.name}` };
          },
        };
      }
    }
    return defs;
  }

  /** สถานะสำหรับ UI */
  status() {
    const cfgs = this.configs();
    const rows = cfgs.map((cfg) => {
      const entry = this.servers.get(cfg.id);
      return {
        id: cfg.id,
        name: cfg.name,
        url: cfg.url,
        transport: cfg.transport,
        tools: entry?.tools?.length || this.cache[cfg.id]?.tools?.length || 0,
        error: entry?.error || null,
        serverName: entry?.serverInfo?.name || this.cache[cfg.id]?.serverInfo?.name || '',
      };
    });
    return { servers: rows, totalTools: rows.reduce((n, r) => n + r.tools, 0) };
  }
}
