// Servidor de RyM Simu: sirve la web y compila sketches.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { compileSketch, builtinLibraries, buildCore, BuildError } from './build.js';

const PORT = +process.env.PORT || 8080;
const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'web');
const MAX_BODY = 6 * 1024 * 1024;
const MAX_PARALLEL = +process.env.BANCO_PARALLEL || 2;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };

// caché de resultados (LRU simple)
const cache = new Map();
const CACHE_MAX = 200;
function cacheGet(k){ const v = cache.get(k); if (v) { cache.delete(k); cache.set(k, v); } return v; }
function cacheSet(k, v){ cache.set(k, v); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }

// cola de compilación
let active = 0; const waiting = [];
async function withSlot(fn){
  if (active >= MAX_PARALLEL) { if (waiting.length > 20) throw new BuildError('El servidor está ocupado. Prueba de nuevo en unos segundos.'); await new Promise(r => waiting.push(r)); }
  active++;
  try { return await fn(); } finally { active--; const n = waiting.shift(); if (n) n(); }
}

function send(res, code, body, type = 'application/json'){
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}
async function readBody(req){
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new BuildError('La petición es demasiado grande (máximo 6 MB).'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (url.pathname === '/api/libraries' && req.method === 'GET') {
      const libs = await builtinLibraries();
      return send(res, 200, libs.map(l => ({ name: l.name, version: l.version, headers: l.headers })));
    }
    if (url.pathname === '/api/compile' && req.method === 'POST') {
      const raw = await readBody(req);
      let body; try { body = JSON.parse(raw); } catch { throw new BuildError('JSON no válido.'); }
      const key = crypto.createHash('sha1').update(raw).digest('hex');
      const hit = cacheGet(key); if (hit) return send(res, 200, { ...hit, cached: true });
      const t0 = Date.now();
      const result = await withSlot(() => compileSketch(body));
      result.ms = Date.now() - t0;
      if (result.ok) cacheSet(key, result);
      return send(res, 200, result);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método no permitido' });
    // archivos estáticos
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    const file = path.join(WEB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(WEB)) return send(res, 403, 'Prohibido', 'text/plain');
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'No encontrado', 'text/plain');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    if (e instanceof BuildError) return send(res, 200, { ok: false, diagnostics: [{ file: '', line: 0, col: 0, type: 'error', message: e.message, es: e.message }] });
    console.error(e);
    send(res, 500, { ok: false, diagnostics: [{ file: '', line: 0, col: 0, type: 'error', message: 'Error interno del compilador', es: 'Error interno del compilador. Revisa los registros del servidor.' }] });
  }
});

server.listen(PORT, () => {
  console.log(`RyM Simu escuchando en http://localhost:${PORT}`);
  buildCore().then(() => console.log('Núcleo de Arduino AVR compilado y en caché.')).catch(e => console.error('No se pudo compilar el núcleo:', e.stderr || e.message));
});
