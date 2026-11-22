// Preparación del entorno de compilación dentro de una función de Vercel.
// El sistema de archivos es de sólo lectura salvo /tmp: la caché de trabajo va a /tmp y la
// caché precompilada en el despliegue (.vercel-cache) se usa como semilla de sólo lectura.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let ready = null;

function toolchainBin(){
  const bin = path.join(ROOT, 'toolchain', 'bin');
  try { fs.accessSync(path.join(bin, 'avr-gcc'), fs.constants.X_OK); return bin; }
  catch {
    // Si el despliegue perdió los permisos de ejecución, copiamos el toolchain a /tmp.
    const dst = '/tmp/banco-toolchain';
    if (!fs.existsSync(path.join(dst, 'bin', 'avr-gcc'))) {
      fs.cpSync(path.join(ROOT, 'toolchain'), dst, { recursive: true });
      execFileSync('chmod', ['-R', 'u+x', path.join(dst, 'bin'), path.join(dst, 'avr', 'bin'), path.join(dst, 'libexec')]);
    }
    return path.join(dst, 'bin');
  }
}

export function load(){
  if (!ready) ready = (async () => {
    if (fs.existsSync(path.join(ROOT, 'toolchain'))) process.env.AVR_BIN ||= toolchainBin();
    process.env.BANCO_VENDOR ||= path.join(ROOT, 'vendor');
    process.env.BANCO_CACHE ||= '/tmp/banco-uno-cache';
    if (fs.existsSync(path.join(ROOT, '.vercel-cache'))) process.env.BANCO_CACHE_SEED ||= path.join(ROOT, '.vercel-cache');
    return import('../server/build.js');
  })().catch(e => { ready = null; throw e; });
  return ready;
}

export function send(res, code, body){
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(res, e, BuildError){
  if (BuildError && e instanceof BuildError) return send(res, 200, { ok: false, diagnostics: [{ file: '', line: 0, col: 0, type: 'error', message: e.message, es: e.message }] });
  console.error(e);
  send(res, 500, { ok: false, diagnostics: [{ file: '', line: 0, col: 0, type: 'error', message: 'Error interno del compilador', es: 'Error interno del compilador. Revisa los registros del servidor.' }] });
}
