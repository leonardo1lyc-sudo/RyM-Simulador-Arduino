// Librerías del usuario: importación desde .zip o archivos sueltos y guardado en IndexedDB.
import { unzipSync, strFromU8 } from 'fflate';

const TEXT_EXT = /\.(h|hh|hpp|c|cpp|cc|cxx|S|inl|tpp|ipp|properties)$/;
const MAX_TOTAL = 4 * 1024 * 1024;
const DB = 'banco-uno', STORE = 'libraries';

function openDb(){
  return new Promise((res, rej) => {
    let req; try { req = indexedDB.open(DB, 1); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
}
async function tx(mode, fn){
  const db = await openDb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
}
const memory = new Map(); // respaldo si IndexedDB no está disponible
export async function listLibraries(){
  try { const all = await tx('readonly', s => s.getAll()); return (all || []).sort((a, b) => a.name.localeCompare(b.name)); }
  catch { return [...memory.values()]; }
}
export async function saveLibrary(lib){ memory.set(lib.name, lib); try { await tx('readwrite', s => s.put(lib)); } catch {} }
export async function deleteLibrary(name){ memory.delete(name); try { await tx('readwrite', s => s.delete(name)); } catch {} }

function describe(name, files){
  const props = Object.entries(files).find(([p]) => /(^|\/)library\.properties$/.test(p));
  let version = '';
  if (props) { const n = /^name=(.*)$/m.exec(props[1]); if (n) name = n[1].trim(); const v = /^version=(.*)$/m.exec(props[1]); if (v) version = v[1].trim(); }
  const hasSrc = Object.keys(files).some(p => p.startsWith('src/'));
  const headers = Object.keys(files).filter(p => /\.(h|hh|hpp)$/.test(p) && (hasSrc ? /^src\/[^/]+$/.test(p) : !p.includes('/'))).map(p => p.split('/').pop());
  if (!headers.length) throw new Error('No encontré ningún archivo .h en la raíz de la librería ni en src/.');
  return { name: name.replace(/[^\w.\- ]/g, '_').slice(0, 60), version, files, headers, enabled: true, added: Date.now() };
}

export async function importZip(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  let entries; try { entries = unzipSync(buf); } catch { throw new Error('El archivo no es un .zip válido.'); }
  const paths = Object.keys(entries).filter(p => !p.endsWith('/') && !p.startsWith('__MACOSX'));
  // Si todo está dentro de una carpeta (p. ej. "LiquidCrystal_I2C-master/"), se quita ese prefijo
  const first = paths[0] ? paths[0].split('/')[0] : '';
  const strip = paths.length && paths.every(p => p.startsWith(first + '/')) ? first.length + 1 : 0;
  const files = {}; let total = 0;
  for (const p of paths) {
    const rel = p.slice(strip);
    if (!TEXT_EXT.test(rel) || /^(examples|extras|test|tests)\//i.test(rel)) continue;
    const txt = strFromU8(entries[p]); total += txt.length;
    if (total > MAX_TOTAL) throw new Error('La librería supera los 4 MB de código fuente.');
    files[rel] = txt;
  }
  const base = (strip ? first : file.name.replace(/\.zip$/i, '')).replace(/-(master|main)$/i, '');
  return describe(base, files);
}

export async function importFiles(fileList, name){
  const files = {}; let total = 0;
  for (const f of fileList) {
    if (!TEXT_EXT.test(f.name)) continue;
    const txt = await f.text(); total += txt.length;
    if (total > MAX_TOTAL) throw new Error('Los archivos superan los 4 MB.');
    files[f.name] = txt;
  }
  if (!Object.keys(files).length) throw new Error('Elige archivos .h, .cpp o .c.');
  const h = Object.keys(files).find(p => p.endsWith('.h'));
  return describe(name || (h ? h.replace(/\.h$/, '') : 'MiLibreria'), files);
}
