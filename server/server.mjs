// KURSI KAND room server: static file host + WebSocket signaling/relay, ranked matchmaking,
// spectating and the daily-challenge leaderboard. Zero dependencies (Node 18+).
//   node server/server.mjs            (PORT=8787 by default, serves ../dist if it exists)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DIST = path.resolve(__dirname, '../dist');
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ------------------------------------------------------------------ tiny persistent db
let db = { ratings: {}, daily: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
} catch {
  /* fresh */
}
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFile(DB_FILE, JSON.stringify(db), () => {});
}, 5000);

// ------------------------------------------------------------------ minimal WebSocket (RFC 6455)
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) return null;
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const client = { socket, room: null, role: null, id: crypto.randomUUID(), alive: true, buf: Buffer.alloc(0), handlers: [] };
  socket.on('data', (chunk) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    for (;;) {
      const f = parseFrame(client.buf);
      if (!f) break;
      client.buf = client.buf.subarray(f.len);
      if (f.op === 8) {
        socket.end();
        return;
      }
      if (f.op === 9) sendFrame(socket, f.payload, 10);
      if (f.op === 1) client.handlers.forEach((h) => h(f.payload.toString('utf8')));
    }
  });
  return client;
}

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const op = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  if (len > 1 << 20) throw new Error('frame too big');
  const maskOff = off;
  if (masked) off += 4;
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskOff + (i % 4)];
  return { op, payload, len: off + len };
}

function sendFrame(socket, data, op = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | op;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | op;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  if (!socket.destroyed) socket.write(Buffer.concat([head, payload]));
}

const send = (c, m) => c && sendFrame(c.socket, JSON.stringify(m));

// ------------------------------------------------------------------ rooms
const rooms = new Map(); // code -> { host, guest, spectators:Set, cfg, specLog: [] }
const queue = []; // ranked queue

function code4() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  while (rooms.has(c));
  return c;
}

function pairInRoom(room) {
  send(room.host, { t: 'peer', role: 'host', code: room.code, ranked: !!room.ranked, opp: room.guestInfo });
  send(room.guest, { t: 'peer', role: 'guest', code: room.code, ranked: !!room.ranked, opp: room.hostInfo });
}

function other(c) {
  const r = c.room && rooms.get(c.room);
  if (!r) return null;
  return r.host === c ? r.guest : r.host;
}

function leave(c) {
  const qi = queue.indexOf(c);
  if (qi >= 0) queue.splice(qi, 1);
  const r = c.room && rooms.get(c.room);
  if (!r) return;
  if (c.role === 'spectator') {
    r.spectators.delete(c);
    return;
  }
  const o = other(c);
  send(o, { t: 'opponentLeft' });
  for (const s of r.spectators) send(s, { t: 'opponentLeft' });
  rooms.delete(r.code);
}

function onMessage(c, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  switch (m.t) {
    case 'host': {
      const code = code4();
      rooms.set(code, { code, host: c, guest: null, spectators: new Set(), specLog: [], cfg: null, hostInfo: m.info ?? null });
      c.room = code;
      c.role = 'host';
      send(c, { t: 'room', code });
      break;
    }
    case 'join': {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return send(c, { t: 'error', msg: 'Room not found' });
      if (r.guest) return send(c, { t: 'error', msg: 'Room is full (you can spectate)' });
      r.guest = c;
      r.guestInfo = m.info ?? null;
      c.room = r.code;
      c.role = 'guest';
      pairInRoom(r);
      break;
    }
    case 'spectate': {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return send(c, { t: 'error', msg: 'Room not found' });
      r.spectators.add(c);
      c.room = r.code;
      c.role = 'spectator';
      send(c, { t: 'spectating', code: r.code });
      for (const d of r.specLog) send(c, { t: 'spec', data: d });
      break;
    }
    case 'signal':
    case 'relay': {
      const o = other(c);
      if (o) send(o, m);
      break;
    }
    case 'spec': {
      const r = c.room && rooms.get(c.room);
      if (!r || r.host !== c) return;
      r.specLog.push(m.data);
      if (r.specLog.length > 2000) r.specLog.shift();
      for (const s of r.spectators) send(s, m);
      break;
    }
    case 'queue': {
      c.rankId = String(m.id || c.id).slice(0, 64);
      c.rating = db.ratings[c.rankId]?.r ?? 1000;
      c.name = String(m.name || 'NETA').slice(0, 16);
      queue.push(c);
      send(c, { t: 'queued', rating: c.rating });
      matchmake();
      break;
    }
    case 'result': {
      // both players report; we only apply when the two reports agree
      const r = c.room && rooms.get(c.room);
      if (!r || !r.ranked) return;
      r.reports = r.reports || {};
      r.reports[c.role] = m.winner;
      if (r.reports.host !== undefined && r.reports.guest !== undefined && r.reports.host === r.reports.guest && !r.applied) {
        r.applied = true;
        const hw = r.reports.host === 0;
        const a = r.host.rankId;
        const b = r.guest.rankId;
        const ra = db.ratings[a]?.r ?? 1000;
        const rb = db.ratings[b]?.r ?? 1000;
        const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
        const k = 32;
        const na = Math.round(ra + k * ((hw ? 1 : 0) - ea));
        const nb = Math.round(rb + k * ((hw ? 0 : 1) - (1 - ea)));
        db.ratings[a] = { r: na, name: r.host.name, g: (db.ratings[a]?.g ?? 0) + 1 };
        db.ratings[b] = { r: nb, name: r.guest.name, g: (db.ratings[b]?.g ?? 0) + 1 };
        dirty = true;
        send(r.host, { t: 'rating', r: na, d: na - ra });
        send(r.guest, { t: 'rating', r: nb, d: nb - rb });
      }
      break;
    }
    case 'ping':
      send(c, { t: 'pong', ts: m.ts });
      break;
  }
}

function matchmake() {
  queue.sort((a, b) => a.rating - b.rating);
  for (let i = 0; i + 1 < queue.length; i++) {
    const a = queue[i];
    const b = queue[i + 1];
    if (Math.abs(a.rating - b.rating) < 400 || queue.length === 2) {
      queue.splice(i, 2);
      const code = code4();
      const r = { code, host: a, guest: b, spectators: new Set(), specLog: [], ranked: true, hostInfo: { name: a.name, rating: a.rating }, guestInfo: { name: b.name, rating: b.rating } };
      rooms.set(code, r);
      a.room = b.room = code;
      a.role = 'host';
      b.role = 'guest';
      pairInRoom(r);
      i--;
    }
  }
}

// ------------------------------------------------------------------ http
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((res) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        res(JSON.parse(d || '{}'));
      } catch {
        res({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size, queue: queue.length });
  if (url.pathname === '/api/daily' && req.method === 'POST') {
    const b = await body(req);
    const day = String(b.day || '').slice(0, 8);
    const score = Math.max(0, Math.min(1e6, Number(b.score) || 0));
    const id = String(b.id || '').slice(0, 64);
    if (!day || !id) return json(res, 400, { error: 'bad' });
    const board = (db.daily[day] ||= {});
    if (!board[id] || board[id].s < score) board[id] = { s: score, n: String(b.name || 'NETA').slice(0, 16), c: String(b.char || '').slice(0, 16) };
    dirty = true;
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/daily') {
    const day = url.searchParams.get('day') || '';
    const board = Object.values(db.daily[day] || {})
      .sort((a, b) => b.s - a.s)
      .slice(0, 50);
    return json(res, 200, { day, board });
  }
  if (url.pathname === '/api/ranked') {
    const top = Object.values(db.ratings)
      .sort((a, b) => b.r - a.r)
      .slice(0, 50);
    return json(res, 200, { top });
  }
  if (url.pathname === '/api/rating') {
    const id = url.searchParams.get('id') || '';
    return json(res, 200, db.ratings[id] || { r: 1000, g: 0 });
  }
  // static files (production build)
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST, 'index.html'), (e2, d2) => {
        if (e2) {
          res.writeHead(404);
          return res.end('Not found (run npm run build first)');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': p.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/ws')) return socket.destroy();
  const c = wsAccept(req, socket);
  if (!c) return socket.destroy();
  c.handlers.push((raw) => {
    try {
      onMessage(c, raw);
    } catch (e) {
      console.error(e);
    }
  });
  socket.on('close', () => leave(c));
  socket.on('error', () => leave(c));
});

server.listen(PORT, () => console.log(`KURSI KAND server on http://localhost:${PORT}`));
