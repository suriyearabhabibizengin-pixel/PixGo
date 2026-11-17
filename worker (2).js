// PixGo çok oyunculu sunucu: Cloudflare Worker + Durable Object (WebSocket)
// Tek bir "global" oda var. Pikseller ve sohbet burada tutulur, herkese dağıtılır.

const SIZES = [1000000, 903168, 1222200]; // Dünya 1, 2, 3 hücre sayısı
const WSTRIDE = 2097152;                  // key = dünya * WSTRIDE + hücre
const CHUNK = 4096;                       // kayıt bloğu (hücre)
const MAX_COLOR = 30;
const SNAP_BATCH = 4000;
const CHAT_KEEP = 60;
const FLUSH_MS = 3000;

function cleanName(s) {
  s = String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  return s || 'Oyuncu';
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.chunks = new Map();     // chunkId -> Map(key -> [renk, isimId])
    this.names = [];             // isimId -> isim
    this.nameIdx = new Map();    // isim -> isimId
    this.chat = [];
    this.dirty = new Set();
    this.namesDirty = false;
    this.chatDirty = false;
    this.alarmSet = false;
    this.rate = new WeakMap();
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.ctx.blockConcurrencyWhile(async () => { await this.load(); });
  }

  async load() {
    const st = this.ctx.storage;
    this.names = (await st.get('names')) || ['Bilinmeyen'];
    this.names.forEach((n, i) => this.nameIdx.set(n, i));
    this.chat = (await st.get('chat')) || [];
    const all = await st.list({ prefix: 'c:' });
    for (const [k, obj] of all) {
      const id = Number(k.slice(2));
      const m = new Map();
      for (const key in obj) m.set(Number(key), obj[key]);
      this.chunks.set(id, m);
    }
  }

  nameId(n) {
    let id = this.nameIdx.get(n);
    if (id === undefined) {
      if (this.names.length >= 65000) return 0;
      id = this.names.length;
      this.names.push(n);
      this.nameIdx.set(n, id);
      this.namesDirty = true;
    }
    return id;
  }

  setPixel(w, i, c, nid) {
    const key = w * WSTRIDE + i;
    const cid = Math.floor(key / CHUNK);
    let m = this.chunks.get(cid);
    if (!m) { m = new Map(); this.chunks.set(cid, m); }
    m.set(key, [c, nid]);
    this.dirty.add(cid);
  }

  schedule() {
    if (this.alarmSet) return;
    this.alarmSet = true;
    this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
  }

  async alarm() {
    this.alarmSet = false;
    const st = this.ctx.storage;
    const ids = [...this.dirty];
    this.dirty.clear();
    for (let a = 0; a < ids.length; a += 100) {
      const entries = {};
      for (const cid of ids.slice(a, a + 100)) {
        const obj = {};
        for (const [key, v] of this.chunks.get(cid)) obj[key] = v;
        entries['c:' + cid] = obj;
      }
      await st.put(entries);
    }
    if (this.namesDirty) { this.namesDirty = false; await st.put('names', this.names); }
    if (this.chatDirty) { this.chatDirty = false; await st.put('chat', this.chat); }
  }

  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    this.sendInit(server);
    this.broadcastOnline();
    return new Response(null, { status: 101, webSocket: client });
  }

  online() {
    return this.ctx.getWebSockets().filter(s => s.readyState === 1).length;
  }

  broadcastOnline() {
    const msg = JSON.stringify({ t: 'online', n: this.online() });
    for (const s of this.ctx.getWebSockets()) { try { s.send(msg); } catch (e) {} }
  }

  sendInit(ws) {
    ws.send(JSON.stringify({ t: 'hello', names: this.names, online: this.online() }));
    let r = [];
    for (const m of this.chunks.values()) {
      for (const [key, v] of m) {
        r.push([Math.floor(key / WSTRIDE), key % WSTRIDE, v[0], v[1]]);
        if (r.length >= SNAP_BATCH) { ws.send(JSON.stringify({ t: 'snap', r, last: false })); r = []; }
      }
    }
    ws.send(JSON.stringify({ t: 'snap', r, last: true }));
    ws.send(JSON.stringify({ t: 'chath', list: this.chat }));
  }

  allow(ws, cost, perSec, burst) {
    const now = Date.now();
    let b = this.rate.get(ws);
    if (!b) { b = { px: burst, pt: now, ct: 0 }; this.rate.set(ws, b); }
    if (cost === 'chat') {
      if (now - b.ct < 800) return false;
      b.ct = now;
      return true;
    }
    b.px = Math.min(burst, b.px + (now - b.pt) / 1000 * perSec);
    b.pt = now;
    if (b.px < cost) return false;
    b.px -= cost;
    return true;
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 200000) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'b' && Array.isArray(m.r)) {
      const r = m.r.slice(0, 2000);
      if (!this.allow(ws, r.length, 20000, 40000)) return;
      const name = cleanName(m.n);
      const nid = this.nameId(name);
      const ok = [];
      for (const p of r) {
        if (!Array.isArray(p)) continue;
        const w = p[0], i = p[1], c = p[2];
        if (!Number.isInteger(w) || w < 0 || w >= SIZES.length) continue;
        if (!Number.isInteger(i) || i < 0 || i >= SIZES[w]) continue;
        if (!Number.isInteger(c) || c < 1 || c > MAX_COLOR) continue;
        this.setPixel(w, i, c, nid);
        ok.push([w, i, c]);
      }
      if (!ok.length) return;
      this.schedule();
      const out = JSON.stringify({ t: 'b', n: name, r: ok });
      for (const s of this.ctx.getWebSockets()) {
        if (s !== ws) { try { s.send(out); } catch (e) {} }
      }
      return;
    }

    if (m.t === 'chat') {
      const text = String(m.m || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
      if (!text || !this.allow(ws, 'chat')) return;
      const msg = { t: 'chat', n: cleanName(m.n), m: text, ts: Date.now() };
      this.chat.push({ n: msg.n, m: msg.m, ts: msg.ts });
      if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP);
      this.chatDirty = true;
      this.schedule();
      const out = JSON.stringify(msg);
      for (const s of this.ctx.getWebSockets()) { try { s.send(out); } catch (e) {} }
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code, reason); } catch (e) {}
    this.broadcastOnline();
  }

  async webSocketError(ws) {
    this.broadcastOnline();
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket gerekli', { status: 426 });
      }
      const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      const origin = req.headers.get('Origin') || '';
      if (allowed.length && !allowed.includes(origin)) {
        return new Response('Bu adres izinli değil', { status: 403 });
      }
      const id = env.ROOM.idFromName('global');
      return env.ROOM.get(id).fetch(req);
    }
    return new Response('PixGo sunucusu çalışıyor ✅', {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};
