// Proyectos: exportar e importar el circuito como .json (formato propio de RyM Simu) y convertir
// diagramas diagram.json de Wokwi. También abre un .zip con sketch.ino + diagram.json.
import { unzipSync, strFromU8 } from 'fflate';

export const FORMAT = 'rym-simu';

export function exportProject(state){
  const strip = (k, v) => k.startsWith('_') ? undefined : v;
  return JSON.stringify({ format: FORMAT, version: 1, board: state.board, comps: state.comps, wires: state.wires, counters: state.counters, nextId: state.nextId, code: state.code, files: state.files || {} }, strip, 2);
}

/* ---------- Wokwi ---------- */
const WK_BOARDS = {
  'wokwi-arduino-uno': 'uno', 'wokwi-arduino-nano': 'nano', 'wokwi-arduino-mega': 'mega',
  'wokwi-esp32-devkit-v1': 'esp32', 'board-esp32-devkit-c-v4': 'esp32', 'board-esp32-s3-devkitc-1': 'esp32s3', 'board-esp32-c3-devkitm-1': 'esp32c3', 'board-ai-thinker-esp32-cam': 'esp32cam',
};
const LED_COLOR = { red: 'rojo', green: 'verde', blue: 'azul', yellow: 'amarillo', orange: 'naranja', white: 'blanco', limegreen: 'verde', purple: 'azul', cyan: 'azul', magenta: 'rojo' };
function ohms(v){ if (v == null) return 220; const m = /^([\d.]+)\s*([kKmM]?)/.exec(String(v)); if (!m) return 220; return Math.round(+m[1] * (m[2] === 'k' || m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'm' ? 1e-3 : 1)); }
// tipo de Wokwi -> [tipo propio, pines {de Wokwi: propio}, props(attrs)]
const WK_PARTS = {
  'wokwi-led': ['led', { A: 'a', C: 'k' }, a => ({ color: LED_COLOR[(a.color || 'red').toLowerCase()] || 'rojo' })],
  'wokwi-resistor': ['res', { 1: 'a', 2: 'b' }, a => ({ ohms: ohms(a.value) })],
  'wokwi-pushbutton': ['btn', { '1.l': 'a', '1.r': 'a', '2.l': 'b', '2.r': 'b' }],
  'wokwi-pushbutton-6mm': ['btn', { '1.l': 'a', '1.r': 'a', '2.l': 'b', '2.r': 'b' }],
  'wokwi-potentiometer': ['pot', { GND: 'p1', SIG: 'w', VCC: 'p3' }],
  'wokwi-slide-potentiometer': ['pot', { GND: 'p1', SIG: 'w', VCC: 'p3' }],
  'wokwi-servo': ['servo', { GND: 'gnd', 'V+': 'vcc', PWM: 'sig' }],
  'wokwi-buzzer': ['buzzer', { 1: 'n', 2: 'p' }],
  'wokwi-lcd1602': a => a.pins === 'i2c' ? ['lcdi2c', {}, () => ({ address: parseInt(a.i2cAddress || '0x27') || 0x27 })] : ['lcd', {}],
  'wokwi-lcd2004': a => ['lcd2004', {}, () => ({ address: parseInt(a.i2cAddress || '0x27') || 0x27, color: 'azul' })],
  'wokwi-ssd1306': ['oled', { DATA: 'SDA', CLK: 'SCL' }],
  'wokwi-dht22': ['dht', { SDA: 'DATA' }, () => ({ model: 'DHT22', temp: 24, hum: 55 })],
  'wokwi-dht11': ['dht', { SDA: 'DATA' }, () => ({ model: 'DHT11', temp: 24, hum: 55 })],
  'wokwi-hc-sr04': ['sr04', {}],
  'wokwi-pir-motion-sensor': ['pir', {}],
  'wokwi-photoresistor-sensor': ['ldrmod', { AO: 'S', DO: 'S' }],
  'wokwi-rgb-led': ['rgb', { R: 'r', G: 'g', B: 'b', COM: 'k' }],
  'wokwi-slide-switch': ['sw', { 1: 'a', 2: 'c', 3: 'b' }],
  'wokwi-relay-module': ['relay', {}],
  'wokwi-ky-040': ['encoder', {}],
  'wokwi-membrane-keypad': ['keypad', {}],
  'wokwi-tm1637-7segment': ['tm1637', {}],
  'wokwi-7segment': ['seg7', { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e', F: 'f', G: 'g', DP: 'dp', 'COM.1': 'COM1', 'COM.2': 'COM2' }, a => ({ common: a.common === 'anode' ? 'anode' : 'cathode', color: 'rojo' })],
  'wokwi-ir-receiver': ['irrx', { DAT: 'S' }],
  'wokwi-ir-remote': ['irremote', {}],
  'wokwi-ds18b20': ['ds18b20', { VCC: 'VDD' }],
  'wokwi-max7219-matrix': ['max7219', { 'V+': 'VCC' }],
  'wokwi-neopixel': ['neostrip', { VDD: 'VCC', VSS: 'GND' }, () => ({ n: 1 })],
  'wokwi-led-ring': ['neoring', {}, a => ({ n: Math.min(10, +a.pixels || 8) })],
  'wokwi-analog-joystick': ['joy', { VCC: 'V5', VERT: 'VRy', HORZ: 'VRx', SEL: 'SW' }],
  'wokwi-ntc-temperature-sensor': ['ntc', { OUT: 'S' }],
  'wokwi-gas-sensor': ['gas', { AOUT: 'AO', DOUT: 'DO' }],
  'wokwi-flame-sensor': ['flame', { AOUT: 'AO', DOUT: 'DO' }],
  'wokwi-small-sound-sensor': ['sound', { AOUT: 'AO', DOUT: 'DO' }],
  'wokwi-big-sound-sensor': ['sound', { AOUT: 'AO', DOUT: 'DO' }],
  'wokwi-tilt-switch': ['tilt', { OUT: 'S' }],
  'wokwi-mpu6050': ['mpu6050', {}],
  'wokwi-microsd-card': ['sdcard', { DO: 'MISO', DI: 'MOSI' }],
  'wokwi-ili9341': ['ili9341', { RST: 'RESET', 'D/C': 'DC' }],
  'wokwi-stepper-motor': null,
  'wokwi-breadboard': ['bb830', 'bb'], 'wokwi-breadboard-half': ['bb400', 'bb'], 'wokwi-breadboard-mini': ['bb170', 'bb'],
};
const BB_TOP = { a: 'j', b: 'i', c: 'h', d: 'g', e: 'f' }, BB_BOT = { f: 'e', g: 'd', h: 'c', i: 'b', j: 'a' };
function bbPin(p){ // "12t.a" -> "j12"; "tp.3" -> "tp3"
  let m = /^(\d+)([tb])\.([a-j])$/.exec(p); if (m) return (m[2] === 't' ? BB_TOP : BB_BOT)[m[3]] + m[1];
  m = /^([tb][pn])\.(\d+)$/.exec(p); if (m) return m[1] + m[2];
  return null;
}
function boardPin(BRD, p){
  const T = BRD.terms; let id = p;
  if (/^\d+$/.test(id)) id = 'D' + id;
  id = id.replace(/^3\.3V/, '3V3').replace(/^TX0?$/, BRD.esp32 ? 'D1' : 'D1').replace(/^RX0?$/, BRD.esp32 ? 'D3' : 'D0');
  if (T[id]) return id;
  const base = id.replace(/\.\d+$/, '');
  if (T[base]) return base;
  if (T[base + '.1']) return base + '.1';
  if (/^GND/.test(id)) return Object.keys(T).find(k => /^GND/.test(k)) || null;
  return null;
}
export function fromWokwi(d, TYPES, BOARDS){
  const notes = []; const parts = d.parts || [];
  const bpart = parts.find(p => WK_BOARDS[p.type]);
  const board = bpart ? WK_BOARDS[bpart.type] : 'uno'; const BRD = BOARDS[board];
  if (!bpart) notes.push('El diagrama no tiene una placa conocida: se usa Arduino Uno.');
  const r = BRD.rect || { x: 40, y: 200 }; const bx = bpart ? +bpart.left || 0 : 0, by = bpart ? +bpart.top || 0 : 0;
  const K = 1.7, ox = r.x - bx * K, oy = r.y - by * K;
  const comps = [], ids = new Map(), counters = {}; let nextId = 1;
  for (const p of parts) {
    if (p === bpart) continue;
    let m = WK_PARTS[p.type]; if (typeof m === 'function') m = m(p.attrs || {});
    if (!m || !TYPES[m[0]]) { notes.push(`«${p.type}» (${p.id}) no está en RyM Simu y se omitió.`); continue; }
    const [type, pins, props] = m; counters[type] = (counters[type] || 0) + 1;
    const c = { id: nextId++, type, x: Math.round((ox + (+p.left || 0) * K) / 10) * 10, y: Math.round((oy + (+p.top || 0) * K) / 10) * 10, rot: ((Math.round((+p.rotate || 0) / 90) * 90) % 360 + 360) % 360, name: TYPES[type].prefix + counters[type], props: { ...TYPES[type].props(), ...(props ? props(p.attrs || {}) : {}) } };
    if (TYPES[type].breadboard) { c.x = Math.max(c.x, r.x); }
    comps.push(c); ids.set(p.id, { c, pins });
  }
  const term = ref => {
    const i = ref.indexOf(':'); if (i < 0) return null; const pid = ref.slice(0, i), pin = ref.slice(i + 1);
    if (bpart && pid === bpart.id) { const b = boardPin(BRD, pin); return b ? 'B:' + b : null; }
    const e = ids.get(pid); if (!e) return null;
    const def = TYPES[e.c.type];
    let t = e.pins === 'bb' ? bbPin(pin) : (e.pins[pin] || pin);
    if (t && !def.terms[t]) { const k = Object.keys(def.terms).find(k => k.toLowerCase() === String(t).toLowerCase()); t = k || null; }
    return t ? `C${e.c.id}:${t}` : null;
  };
  const wires = []; let lost = 0; const COL = { red: '#e53935', black: '#212121', green: '#2e7d32', yellow: '#f9a825', blue: '#1565c0', orange: '#ef6c00', purple: '#8e24aa', white: '#e0e0e0', gray: '#9e9e9e', grey: '#9e9e9e', cyan: '#00acc1', magenta: '#d81b60', brown: '#6d4c41', violet: '#8e24aa', gold: '#c9a227', limegreen: '#7cb342' };
  for (const cn of d.connections || []) {
    const a = term(cn[0]), b = term(cn[1]);
    if (!a || !b) { lost++; continue; }
    if (a === b || wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) continue;
    wires.push({ id: nextId++, a, b, pts: [], color: COL[String(cn[2] || '').toLowerCase()] || ['#2e7d32', '#f9a825', '#1565c0', '#ef6c00', '#8e24aa'][wires.length % 5] });
  }
  if (lost) notes.push(`${lost} conexión${lost > 1 ? 'es' : ''} no se pudo traducir (pines de piezas omitidas o desconocidos).`);
  return { board, comps, wires, counters, nextId: nextId + 100, notes };
}

// Lee el texto de un .json y devuelve { board, comps, wires, counters, nextId, code?, notes }
export function parseDiagram(text, TYPES, BOARDS){
  let d; try { d = JSON.parse(text); } catch { throw new Error('El archivo .json no es válido.'); }
  if (d && Array.isArray(d.comps) && Array.isArray(d.wires)) {
    const comps = d.comps.filter(c => TYPES[c.type]); const okIds = new Set(comps.map(c => c.id));
    const wires = d.wires.filter(w => [w.a, w.b].every(k => k.startsWith('B:') || okIds.has(+(/^C(\d+):/.exec(k) || [])[1])));
    for (const c of comps) c.props = { ...TYPES[c.type].props(), ...(c.props || {}) };
    const maxId = Math.max(0, ...comps.map(c => c.id), ...wires.map(w => w.id));
    const notes = comps.length < d.comps.length ? [`${d.comps.length - comps.length} componente(s) desconocidos se omitieron.`] : [];
    return { board: BOARDS[d.board] ? d.board : 'uno', comps, wires, counters: d.counters || {}, nextId: Math.max(d.nextId || 0, maxId + 1), code: typeof d.code === 'string' ? d.code : null, files: d.files && typeof d.files === 'object' ? d.files : null, notes };
  }
  if (d && Array.isArray(d.parts)) return { ...fromWokwi(d, TYPES, BOARDS), code: null };
  throw new Error('No reconozco el formato: se espera un circuito de RyM Simu o un diagram.json de Wokwi.');
}

// Archivos elegidos por el usuario (.ino, .json, .zip) -> { code, diagram, libs, names }
export async function readProjectFiles(files){
  const out = { code: null, diagram: null, names: [], libsTxt: null, extra: {} };
  const take = (name, text) => {
    const n = name.split('/').pop();
    if (/\.ino$/i.test(n) && out.code == null) { out.code = text; out.names.push(n); }
    else if (/\.json$/i.test(n) && !/package|library\.json/i.test(n) && out.diagram == null) { out.diagram = text; out.names.push(n); }
    else if (/^libraries\.txt$/i.test(n)) out.libsTxt = text;
    else if (/\.(h|cpp|c)$/i.test(n)) out.extra[n] = text;
  };
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      let z; try { z = unzipSync(new Uint8Array(await f.arrayBuffer())); } catch { throw new Error(`${f.name}: no es un .zip válido.`); }
      for (const [p, data] of Object.entries(z)) if (!p.endsWith('/') && !p.startsWith('__MACOSX')) take(p, strFromU8(data));
    } else take(f.name, await f.text());
  }
  return out;
}
