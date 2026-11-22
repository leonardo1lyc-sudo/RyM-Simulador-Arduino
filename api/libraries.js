import { load, send, fail } from './_runtime.js';

export default async function handler(req, res){
  try {
    const b = await load();
    const libs = await b.builtinLibraries();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    send(res, 200, libs.map(l => ({ name: l.name, version: l.version, headers: l.headers })));
  } catch (e) { fail(res, e); }
}
