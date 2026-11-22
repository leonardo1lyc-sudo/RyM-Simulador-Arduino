import { load, send, fail } from './_runtime.js';

export default async function handler(req, res){
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  let b;
  try {
    b = await load();
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new b.BuildError('JSON no válido.'); } }
    if (!body || typeof body !== 'object') throw new b.BuildError('JSON no válido.');
    const t0 = Date.now();
    const result = await b.compileSketch(body);
    result.ms = Date.now() - t0;
    send(res, 200, result);
  } catch (e) { fail(res, e, b && b.BuildError); }
}
