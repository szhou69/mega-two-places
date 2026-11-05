// Minimal MCP Streamable HTTP client (JSON-RPC over POST, handles JSON or SSE replies).
export class Mcp {
  constructor(url, log = () => {}) { this.url = url; this.sid = null; this.id = 0; this.log = log; }
  async rpc(method, params, notify = false) {
    const body = notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++this.id, method, params };
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
    if (this.sid) headers["mcp-session-id"] = this.sid;
    const r = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
    const sid = r.headers.get("mcp-session-id"); if (sid) this.sid = sid;
    if (notify) return null;
    const text = await r.text();
    let msg;
    if ((r.headers.get("content-type") || "").includes("text/event-stream")) {
      for (const line of text.split("\n")) if (line.startsWith("data:")) { const m = JSON.parse(line.slice(5)); if (m.id === body.id) msg = m; }
    } else msg = JSON.parse(text);
    this.log({ method, params, status: r.status, reply: msg });
    if (!msg) throw new Error(`no reply (${r.status}): ${text.slice(0, 300)}`);
    if (msg.error) throw new Error(JSON.stringify(msg.error));
    return msg.result;
  }
  async init() {
    const res = await this.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "two-places-worker", version: "1" } });
    await this.rpc("notifications/initialized", {}, true);
    return res;
  }
  tools() { return this.rpc("tools/list", {}); }
  async call(name, args) { return this.rpc("tools/call", { name, arguments: args }); }
}
export function payload(res) {
  if (res.structuredContent) return res.structuredContent;
  const t = (res.content || []).map(c => c.text).join("\n");
  try { return JSON.parse(t); } catch { return t; }
}
