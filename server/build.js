// Compilación de sketches de Arduino Uno con avr-gcc y el núcleo oficial ArduinoCore-avr.
// Reproduce lo esencial de arduino-cli: preprocesado del .ino, resolución de librerías por #include,
// núcleo precompilado y enlace a un .hex.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const VENDOR = process.env.BANCO_VENDOR || path.join(ROOT, 'vendor');
const CORE = path.join(VENDOR, 'ArduinoCore-avr');
const CACHE = process.env.BANCO_CACHE || path.join(os.tmpdir(), 'banco-uno-cache');
const TOOL = n => (process.env.AVR_BIN ? path.join(process.env.AVR_BIN, n) : n);

const MCU = ['-mmcu=atmega328p', '-DF_CPU=16000000L', '-DARDUINO=10819', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR'];
const CFLAGS = ['-c', '-g', '-Os', '-w', '-std=gnu11', '-ffunction-sections', '-fdata-sections', '-MMD', ...MCU];
const CXXFLAGS = ['-c', '-g', '-Os', '-w', '-std=gnu++11', '-fpermissive', '-fno-exceptions', '-ffunction-sections', '-fdata-sections', '-fno-threadsafe-statics', '-Wno-error=narrowing', ...MCU];
const SFLAGS = ['-c', '-g', '-x', 'assembler-with-cpp', ...MCU];
const SRC_EXT = new Set(['.c', '.cpp', '.S']);
export const TEXT_EXT = new Set(['.h', '.hh', '.hpp', '.c', '.cpp', '.cc', '.cxx', '.S', '.inl', '.tpp', '.ipp', '.properties', '.txt']);

/* ---------- utilidades ---------- */
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
async function walk(dir, recursive){
  const out = [];
  let ents; try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (recursive && !e.name.startsWith('.') && e.name !== 'examples' && e.name !== 'extras') out.push(...await walk(p, true)); }
    else out.push(p);
  }
  return out;
}

/* ---------- caché de objetos compilados ---------- */
async function compileObj(src, includes, label){
  const ext = path.extname(src);
  const flags = ext === '.c' ? CFLAGS : ext === '.S' ? SFLAGS : CXXFLAGS;
  const tool = ext === '.c' || ext === '.S' ? TOOL('avr-gcc') : TOOL('avr-g++');
  const inc = includes.map(i => '-I' + i);
  // Clave: contenido del fichero + flags + includes (los headers incluidos se cubren con el hash del conjunto de includes)
  const content = await fs.readFile(src);
  const key = sha([tool, flags.join(' '), includes.join('|'), label, content.toString('binary')].join('\0'));
  const obj = path.join(CACHE, 'obj', key + '.o');
  if (fss.existsSync(obj)) return obj;
  await fs.mkdir(path.dirname(obj), { recursive: true });
  const tmp = obj + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  await run(tool, [...flags, ...inc, src, '-o', tmp], { timeout: 60000, maxBuffer: 4 << 20 });
  await fs.rename(tmp, obj);
  return obj;
}

/* ---------- núcleo precompilado ---------- */
let corePromise = null;
export function buildCore(){
  if (!corePromise) corePromise = (async () => {
    const coreDir = path.join(CORE, 'cores', 'arduino');
    const variant = path.join(CORE, 'variants', 'standard');
    const files = (await walk(coreDir, false)).filter(f => SRC_EXT.has(path.extname(f)));
    const objs = [];
    for (const f of files) objs.push(await compileObj(f, [coreDir, variant], 'core'));
    const lib = path.join(CACHE, 'core-' + sha(objs.join('|')) + '.a');
    if (!fss.existsSync(lib)) {
      const tmp = lib + '.tmp' + process.pid;
      await run(TOOL('avr-gcc-ar'), ['rcs', tmp, ...objs]).catch(() => run(TOOL('avr-ar'), ['rcs', tmp, ...objs]));
      await fs.rename(tmp, lib);
    }
    return { lib, includes: [coreDir, variant] };
  })().catch(e => { corePromise = null; throw e; });
  return corePromise;
}

/* ---------- librerías ---------- */
// Librerías incluidas en el servidor: las del núcleo AVR y las oficiales que estén en vendor/.
export async function builtinLibraries(){
  const dirs = [];
  for (const base of [path.join(CORE, 'libraries'), path.join(VENDOR, 'libraries')]) {
    let ents = []; try { ents = await fs.readdir(base, { withFileTypes: true }); } catch {}
    for (const e of ents) if (e.isDirectory()) dirs.push(path.join(base, e.name));
  }
  for (const name of ['Servo', 'LiquidCrystal']) { const d = path.join(VENDOR, name); if (fss.existsSync(d)) dirs.push(d); }
  const libs = [];
  for (const d of dirs) libs.push(await describeLibrary(d, 'builtin'));
  return libs;
}
async function describeLibrary(dir, origin){
  const hasSrc = fss.existsSync(path.join(dir, 'src'));
  const srcRoot = hasSrc ? path.join(dir, 'src') : dir;
  const headers = (await walk(srcRoot, false)).filter(f => /\.(h|hh|hpp)$/.test(f)).map(f => path.basename(f));
  let version = '', name = path.basename(dir);
  try {
    const props = await fs.readFile(path.join(dir, 'library.properties'), 'utf8');
    const n = /^name=(.*)$/m.exec(props); if (n) name = n[1].trim();
    const v = /^version=(.*)$/m.exec(props); if (v) version = v[1].trim();
    if (/^architectures=(.*)$/m.test(props)) { const a = /^architectures=(.*)$/m.exec(props)[1]; if (!/\*|avr/.test(a)) return { name, version, dir, srcRoot, hasSrc, headers, origin, incompatible: a.trim() }; }
  } catch {}
  return { name, version, dir, srcRoot, hasSrc, headers, origin };
}
async function librarySources(lib){
  if (lib.hasSrc) return (await walk(lib.srcRoot, true)).filter(f => SRC_EXT.has(path.extname(f)));
  const root = (await walk(lib.dir, false)).filter(f => SRC_EXT.has(path.extname(f)));
  const util = (await walk(path.join(lib.dir, 'utility'), false)).filter(f => SRC_EXT.has(path.extname(f)));
  return [...root, ...util];
}
const INCLUDE_RE = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm;
async function includesOf(file){
  const txt = await fs.readFile(file, 'utf8').catch(() => '');
  return [...txt.matchAll(INCLUDE_RE)].map(m => path.basename(m[1]));
}

/* ---------- preprocesado del .ino ---------- */
const KEYWORDS = new Set(['if', 'else', 'while', 'for', 'switch', 'do', 'return', 'sizeof', 'catch', 'case', 'new', 'delete']);
export function inoToCpp(src, name = 'sketch.ino'){
  // Máscara del código sin comentarios, cadenas ni directivas (mismas posiciones)
  const n = src.length; const m = src.split('');
  let i = 0, lineStart = true;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { lineStart = true; i++; continue; }
    if (lineStart && c === '#') { while (i < n && src[i] !== '\n') { if (src[i] === '\\' && src[i + 1] === '\n') { m[i] = ' '; i += 2; continue; } m[i] = ' '; i++; } continue; }
    if (c !== ' ' && c !== '\t' && c !== '\r') lineStart = false;
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') m[i++] = ' '; continue; }
    if (c === '/' && src[i + 1] === '*') { m[i++] = ' '; m[i++] = ' '; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') m[i] = ' '; i++; } if (i < n) { m[i++] = ' '; m[i++] = ' '; } continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { m[i] = ' '; i++; } m[i] = ' '; i++; } i++; continue; }
    i++;
  }
  const mask = m.join('');
  const protos = []; let firstDef = -1; let depth = 0; let segStart = 0;
  for (let k = 0; k < n; k++) {
    const c = mask[k];
    if (c === '{') {
      if (depth === 0) {
        const seg = mask.slice(segStart, k);
        const mm = /([A-Za-z_][\w:<>,\s\*&]*?[\s\*&])([A-Za-z_]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(const)?\s*$/.exec(seg);
        if (mm && !KEYWORDS.has(mm[2]) && !/\b(struct|class|enum|union|namespace|typedef)\b/.test(mm[1]) && !/[=]/.test(seg.slice(seg.lastIndexOf(mm[0])))) {
          const ret = mm[1].replace(/\s+/g, ' ').trim();
          if (ret && !KEYWORDS.has(ret)) {
            const params = mm[3].replace(/\s+/g, ' ').trim();
            const startIdx = segStart + seg.search(/\S/);
            if (firstDef < 0) firstDef = startIdx;
            protos.push(`${ret} ${mm[2]}(${params});`);
          }
        }
      }
      depth++;
    } else if (c === '}') { depth = Math.max(0, depth - 1); if (depth === 0) segStart = k + 1; }
    else if (c === ';' && depth === 0) segStart = k + 1;
    else if (depth === 0 && c === '\n' && /^\s*#/.test(src.slice(k + 1, src.indexOf('\n', k + 1) < 0 ? n : src.indexOf('\n', k + 1)))) segStart = k + 1;
  }
  const q = JSON.stringify(name);
  if (firstDef < 0 || !protos.length) return `#include <Arduino.h>\n#line 1 ${q}\n${src}\n`;
  const lineOf = idx => src.slice(0, idx).split('\n').length;
  const insLine = lineOf(firstDef);
  const lines = src.split('\n');
  const before = lines.slice(0, insLine - 1).join('\n');
  const after = lines.slice(insLine - 1).join('\n');
  return `#include <Arduino.h>\n#line 1 ${q}\n${before}\n${protos.join('\n')}\n#line ${insLine} ${q}\n${after}\n`;
}

/* ---------- validación de entrada ---------- */
export function checkSource(text, where){
  for (const mm of text.matchAll(/^\s*#\s*include(?:_next)?\s*[<"]([^>"]+)[>"]/gm)) {
    const p = mm[1];
    if (p.startsWith('/') || p.includes('..') || /^[A-Za-z]:/.test(p) || p.includes('\\')) throw new BuildError(`#include no permitido en ${where}: "${p}". Solo se aceptan nombres de cabecera relativos.`);
  }
  if (/^\s*#\s*include(?:_next)?\s*(?![<"\s])/m.test(text) || /^\s*#\s*include(?:_next)?\s+(?![<"])\S/m.test(text)) throw new BuildError(`#include con macros no permitido en ${where}. Escribe el nombre entre < > o " ".`);
  if (/\.incbin\b|#\s*embed\b/.test(text)) throw new BuildError(`Directiva no permitida en ${where}.`);
}
export class BuildError extends Error {}
function safeRel(p){
  const norm = path.posix.normalize(String(p).replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!norm || norm.startsWith('..') || norm.includes('/../')) throw new BuildError(`Ruta de archivo no válida: ${p}`);
  return norm;
}

/* ---------- traducción de errores frecuentes ---------- */
const TRANSLATE = [
  [/'(.+?)' was not declared in this scope/, (m) => `'${m[1]}' no está declarado en este ámbito`],
  [/expected '(.+?)' before '(.+?)'/, (m) => `se esperaba '${m[1].replace(/ or /g, ' o ')}' antes de '${m[2]}'`],
  [/expected '(.+?)' at end of input/, (m) => `falta '${m[1]}' al final del archivo`],
  [/expected (.+?) before '(.+?)'/, (m) => `se esperaba ${m[1].replace(/ or /g, ' o ')} antes de '${m[2]}'`],
  [/(.+?): No such file or directory/, (m) => `no se encuentra ${m[1]}. Si es una librería, cárgala en la pestaña Librerías.`],
  [/redefinition of '(.+?)'/, (m) => `'${m[1]}' está definido dos veces`],
  [/too few arguments to function '(.+?)'/, (m) => `faltan argumentos en la llamada a ${m[1]}`],
  [/too many arguments to function '(.+?)'/, (m) => `sobran argumentos en la llamada a ${m[1]}`],
  [/undefined reference to `(.+?)'/, (m) => `referencia sin definir a ${m[1]} (falta el código de una función o una librería)`],
  [/'(.+?)' does not name a type/, (m) => `'${m[1]}' no es un tipo conocido (¿falta un #include o una librería?)`],
  [/stray '(.+?)' in program/, (m) => `carácter extraño '${m[1]}' en el programa`],
];
function translate(msg){ for (const [re, f] of TRANSLATE) { const m = re.exec(msg); if (m) return f(m); } return null; }
function parseDiagnostics(out, dirs){
  const diags = [];
  let text = out;
  for (const [abs, rel] of dirs) text = text.split(abs + '/').join(rel);
  for (const line of text.split('\n')) {
    const m = /^(.+?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)$/.exec(line);
    if (m) diags.push({ file: m[1], line: +m[2], col: m[3] ? +m[3] : 0, type: m[4] === 'fatal error' ? 'error' : m[4], message: m[5], es: translate(m[5]) });
    else { const u = /undefined reference to/.exec(line); if (u) diags.push({ file: '', line: 0, col: 0, type: 'error', message: line.replace(/^.*?: /, ''), es: translate(line) }); }
  }
  return { diags, log: text };
}

/* ---------- compilación completa ---------- */
const MAX_FILE = 512 * 1024;
export async function compileSketch({ sketch, files = {}, libraries = [] }){
  if (typeof sketch !== 'string' || !sketch.trim()) throw new BuildError('El sketch está vacío.');
  if (sketch.length > MAX_FILE) throw new BuildError('El sketch es demasiado grande.');
  checkSource(sketch, 'sketch.ino');
  const core = await buildCore();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'banco-build-'));
  const dirMap = [];
  try {
    const sketchDir = path.join(work, 'sketch'); await fs.mkdir(sketchDir);
    dirMap.push([sketchDir, '']);
    await fs.writeFile(path.join(sketchDir, 'sketch.ino.cpp'), inoToCpp(sketch));
    for (const [rel, txt] of Object.entries(files)) { // pestañas extra del sketch (.h/.cpp)
      const r = safeRel(rel); if (r.includes('/')) throw new BuildError('Las pestañas del sketch no pueden estar en carpetas.');
      if (!TEXT_EXT.has(path.extname(r))) continue;
      checkSource(String(txt), r); await fs.writeFile(path.join(sketchDir, r), String(txt));
    }
    // librerías del usuario
    const userLibs = [];
    let total = 0;
    for (const lib of libraries.slice(0, 30)) {
      const name = String(lib.name || 'Libreria').replace(/[^\w.\- ]/g, '_').slice(0, 60);
      const dir = path.join(work, 'libraries', name.replace(/\s/g, '_'));
      for (const [rel, txt] of Object.entries(lib.files || {})) {
        const r = safeRel(rel); if (!TEXT_EXT.has(path.extname(r))) continue;
        const t = String(txt); total += t.length; if (total > 8 * MAX_FILE) throw new BuildError('Las librerías cargadas son demasiado grandes (máximo 4 MB).');
        checkSource(t, `${name}/${r}`);
        await fs.mkdir(path.dirname(path.join(dir, r)), { recursive: true });
        await fs.writeFile(path.join(dir, r), t);
      }
      dirMap.push([dir, `${name}/`]);
      userLibs.push(await describeLibrary(dir, 'user'));
    }
    const allLibs = [...userLibs, ...await builtinLibraries()]; // las del usuario tienen prioridad
    const byHeader = new Map();
    for (const l of allLibs) for (const h of l.headers) if (!byHeader.has(h)) byHeader.set(h, l);

    // resolución de dependencias por #include
    const sketchFiles = [path.join(sketchDir, 'sketch.ino.cpp'), ...(await walk(sketchDir, false)).filter(f => !f.endsWith('sketch.ino.cpp'))];
    const used = []; const usedSet = new Set(); const scanned = new Set();
    const queue = [...sketchFiles];
    const localHeaders = new Set((await walk(sketchDir, false)).map(f => path.basename(f)));
    const coreHeaders = new Set((await walk(core.includes[0], false)).map(f => path.basename(f)));
    const missing = [];
    while (queue.length) {
      const f = queue.shift(); if (scanned.has(f)) continue; scanned.add(f);
      for (const h of await includesOf(f)) {
        if (localHeaders.has(h) || coreHeaders.has(h)) continue;
        const l = byHeader.get(h);
        if (!l) { if (!/^(avr|util|stdlib|stdio|string|math|inttypes|stdint|stdbool|stddef|ctype|limits|errno|setjmp|stdarg|assert|time|alloca)\b|^(new|cstdlib|cstring|cmath)$/.test(h.replace(/\.h$/, '')) && !missing.includes(h)) missing.push(h); continue; }
        if (l.incompatible) throw new BuildError(`La librería ${l.name} no es compatible con AVR (architectures=${l.incompatible}).`);
        if (!usedSet.has(l)) { usedSet.add(l); used.push(l); queue.push(...await librarySources(l)); queue.push(...(await walk(l.srcRoot, l.hasSrc)).filter(x => /\.(h|hpp)$/.test(x))); }
      }
    }
    for (const l of used) if (l.origin === 'builtin') dirMap.push([l.dir, `${l.name}/`]);
    dirMap.push([core.includes[0], 'Arduino/'], [core.includes[1], 'Arduino/variant/']);
    const includes = [...core.includes, sketchDir, ...used.flatMap(l => l.hasSrc ? [l.srcRoot] : [l.dir, path.join(l.dir, 'utility')])];

    // compilación
    const objs = []; let log = '';
    const tryCompile = async (f, label) => {
      try { objs.push(await compileObj(f, includes, label)); }
      catch (e) { log += (e.stderr || e.message || '') + '\n'; }
    };
    for (const f of (await walk(sketchDir, false)).filter(f => SRC_EXT.has(path.extname(f)) || f.endsWith('.ino.cpp'))) await tryCompile(f, 'sketch');
    if (!log) for (const l of used) for (const f of await librarySources(l)) await tryCompile(f, 'lib:' + l.name);
    if (log) {
      const { diags, log: clean } = parseDiagnostics(log, dirMap);
      if (missing.length && !diags.some(d => /No such file/.test(d.message))) diags.unshift({ file: 'sketch.ino', line: 0, col: 0, type: 'error', message: `Missing headers: ${missing.join(', ')}`, es: `No se encontró ${missing.join(', ')}. Carga la librería en la pestaña Librerías.` });
      return { ok: false, diagnostics: diags, log: clean, libraries: used.map(l => ({ name: l.name, version: l.version, origin: l.origin })) };
    }
    // enlace
    const elf = path.join(work, 'sketch.elf');
    try {
      await run(TOOL('avr-gcc'), ['-w', '-Os', '-g', '-Wl,--gc-sections', '-mmcu=atmega328p', '-o', elf, ...objs, core.lib, '-L' + work, '-lm'], { timeout: 60000, maxBuffer: 4 << 20 });
    } catch (e) {
      const { diags, log: clean } = parseDiagnostics(e.stderr || e.message, dirMap);
      return { ok: false, diagnostics: diags.length ? diags : [{ file: '', line: 0, col: 0, type: 'error', message: clean.trim().slice(0, 500), es: null }], log: clean };
    }
    const hexFile = path.join(work, 'sketch.hex');
    await run(TOOL('avr-objcopy'), ['-O', 'ihex', '-R', '.eeprom', elf, hexFile]);
    const { stdout } = await run(TOOL('avr-size'), ['-A', elf]);
    const sec = n => { const m = new RegExp('^\\' + n + '\\s+(\\d+)', 'm').exec(stdout); return m ? +m[1] : 0; };
    const flash = sec('.text') + sec('.data'), ram = sec('.data') + sec('.bss');
    const result = { ok: true, hex: await fs.readFile(hexFile, 'utf8'), size: { flash, flashMax: 32256, ram, ramMax: 2048 },
      libraries: used.map(l => ({ name: l.name, version: l.version, origin: l.origin })) };
    if (ram > 2048) { result.ok = false; result.diagnostics = [{ file: '', line: 0, col: 0, type: 'error', message: 'not enough memory', es: `Las variables ocupan ${ram} bytes y el Uno solo tiene 2048 bytes de RAM.` }]; }
    if (flash > 32256) { result.ok = false; result.diagnostics = [{ file: '', line: 0, col: 0, type: 'error', message: 'sketch too big', es: `El programa ocupa ${flash} bytes y el Uno solo tiene 32 256 bytes de flash disponibles.` }]; }
    return result;
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
