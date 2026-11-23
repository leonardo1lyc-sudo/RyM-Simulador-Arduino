// Banco Uno: editor de circuitos + emulación AVR en vivo (Arduino Uno, Nano y Mega 2560).
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { Board, PinState, FREQ } from './emulator.js';
import { BOARDS } from './boards.js';
import { Esp32Link, PAGE_SHIM } from './esp32link.js';
import { HD44780, PCF8574Lcd, I2CBus } from './lcd.js';
import { TYPES, LIBRARY, LED_COLORS, RES_VALUES, fmt, fmtOhm, icon, ldrOhms } from './components.js';
import { SSD1306, oledImage } from './modules.js';
import { EXAMPLES } from './examples.js';
import { initAI } from './ai.js';
import { listLibraries, saveLibrary, deleteLibrary, importZip, importFiles } from './libs.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ======================= Placa ======================= */
const MAXP = 70; // pines del Mega; Uno y Nano usan los primeros
let esp = null, espVer = -1, webShown = false, bootPressed = false, webPath = '/'; // ESP32: red y Bluetooth simulados
let BRD = BOARDS.uno, BPIN = BRD.terms, NP = BRD.pins.length;
const pinName = p => BRD.pinName(p);
const pinTitle = id => BRD.title(id);
function drawBoard(){
  $('#boardLayer').innerHTML = BRD.draw();
  $('#svg').setAttribute('viewBox', `0 0 ${BRD.canvasW} 700`);
  $('#boardSel').value = BRD.id;
}
function setBoard(id){ BRD = BOARDS[id] || BOARDS.uno; BPIN = BRD.terms; NP = BRD.pins.length; pinCache.clear(); drawBoard(); }

/* ======================= Estado del editor ======================= */
let state = null, sel = null, drawing = null, drag = null;
const compById = id => state.comps.find(c => c.id === id);
function rot(x, y, r){ switch (((r % 360) + 360) % 360) { case 90: return [-y, x]; case 180: return [-x, -y]; case 270: return [y, -x]; default: return [x, y]; } }
function termDef(c, t){ const def = TYPES[c.type]; const o = def.dynTerms ? def.dynTerms(c)[t] : null; return o || def.terms[t]; } // posición que depende de las opciones (p. ej. largo de una tira)
function termPos(key){
  if (key.startsWith('B:')) { const p = BPIN[key.slice(2)]; return p ? { x: p.x, y: p.y, dx: p.dx, dy: p.dy } : null; }
  const m = /^C(\d+):(\w+)$/.exec(key); if (!m) return null; const c = compById(+m[1]); if (!c) return null;
  const d = termDef(c, m[2]); if (!d) return null;
  const [x, y] = rot(d.x, d.y, c.rot), [dx, dy] = rot(d.dx, d.dy, c.rot);
  return { x: c.x + x, y: c.y + y, dx, dy };
}
function termLabel(key){
  if (key.startsWith('B:')) return key.slice(2).replace(/\.\d/, '');
  const m = /^C(\d+):(\w+)$/.exec(key); const c = compById(+m[1]); return c ? `${c.name} ${TYPES[c.type].terms[m[2]].name}` : key;
}

/* ======================= Circuito ======================= */
const circuit = { ver: -1, map: new Map(), n: 0, node(k){ const v = this.map.get(k); return v === undefined ? -2 : v; } };
let structVer = 0;
const io = { pins: Array.from({ length: MAXP }, () => ({ mode: 'INPUT', val: 0, duty: null })) }; // vista eléctrica de los pines
function rebuildCircuit(){
  const parent = new Map();
  const find = k => { let r = k; while (parent.get(r) !== r) r = parent.get(r); return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const keys = [...new Set([...Object.keys(BPIN).map(id => 'B:' + id), ...(BRD.keys || []), ...BRD.supplies.map(s => 'B:' + s[0])])]; // incluye pines sin terminal (GPIO0 del ESP32)
  for (const c of state.comps) for (const t in TYPES[c.type].terms) keys.push(`C${c.id}:${t}`);
  for (const k of keys) parent.set(k, k);
  for (const net of BRD.nets) for (const k of net.slice(1)) union('B:' + net[0], 'B:' + k);
  for (const w of state.wires) if (parent.has(w.a) && parent.has(w.b)) union(w.a, w.b);
  // protoboards: tiras internas y patas apoyadas sobre un agujero
  const holes = new Map(), isHole = new Set();
  for (const c of state.comps) {
    const def = TYPES[c.type]; if (def.nets) for (const g of def.nets(c)) for (const t of g.slice(1)) union(`C${c.id}:${g[0]}`, `C${c.id}:${t}`);
    if (def.breadboard) for (const t in def.terms) { const k = `C${c.id}:${t}`, p = termPos(k); isHole.add(k); holes.set(`${Math.round(p.x)},${Math.round(p.y)}`, k); }
  }
  if (holes.size) for (const c of state.comps) if (!TYPES[c.type].breadboard) for (const t in TYPES[c.type].terms) {
    const k = `C${c.id}:${t}`, p = termPos(k), hx = Math.round(p.x / 10) * 10, hy = Math.round(p.y / 10) * 10;
    const h = Math.abs(p.x - hx) <= 4 && Math.abs(p.y - hy) <= 4 && holes.get(`${hx},${hy}`); if (h) union(k, h);
  }
  const live = new Set(); for (const k of keys) if (!isHole.has(k)) live.add(find(k)); // tiras vacías de la protoboard: fuera del sistema
  const gnd = find('B:GND.1'); const idx = new Map(); circuit.map = new Map(); let n = 0;
  const count = new Map();
  for (const k of keys) { const r = find(k); if (!isHole.has(k)) count.set(r, (count.get(r) || 0) + 1); if (r === gnd) { circuit.map.set(k, -1); continue; } if (!live.has(r)) { circuit.map.set(k, -2); continue; } if (!idx.has(r)) idx.set(r, n++); circuit.map.set(k, idx.get(r)); }
  circuit.wired = new Set(keys.filter(k => count.get(find(k)) > 1));
  circuit.n = n; circuit.ver = structVer; elecDirty = true;
  mapDevices();
}
function structChanged(){ structVer++; rebuildCircuit(); scheduleSave(); }
let elecDirty = true;

function solve(mode){ // mode: {pwm:'avg'|'low'|'inst', high:Set}
  const n = circuit.n; const node = k => circuit.map.get(k);
  const diodeOn = new Map(); let res;
  let prevV = lastSol && lastSol.ver === circuit.ver && lastSol.V.length === n ? lastSol.V : null;
  for (let iter = 0; iter < 30; iter++) {
    let usedPrev = false;
    const Gm = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n), gReal = new Float64Array(n);
    for (let i = 0; i < n; i++) Gm[i][i] += 1e-12;
    const G2 = (i, j, g) => { if (i >= 0) { Gm[i][i] += g; gReal[i] += g; } if (j >= 0) { Gm[j][j] += g; gReal[j] += g; } if (i >= 0 && j >= 0) { Gm[i][j] -= g; Gm[j][i] -= g; } };
    const SRC = (i, V, R, real = true) => { if (!(i >= 0)) return; Gm[i][i] += 1 / R; b[i] += V / R; if (real) gReal[i] += 1 / R; };
    const pinV = [];
    for (let p = 0; p < NP; p++) {
      const s = io.pins[p], i = node('B:' + pinName(p));
      if (s.mode === 'OUTPUT') {
        const VIO = BRD.vio || 5; let V = s.val * VIO;
        if (s.duty != null && mode.pwm !== 'inst') V = mode.pwm === 'avg' ? s.duty * VIO : (mode.high && mode.high.has(p) ? VIO : 0);
        pinV[p] = V; SRC(i, V, 25);
      } else if (s.mode === 'INPUT_PULLUP') SRC(i, BRD.vio || 5, 35000);
      else SRC(i, 0, 1e8, false);
    }
    for (const [id, V, R] of BRD.supplies) SRC(node('B:' + id), V, R);
    if (bootPressed && BRD.esp32) SRC(node('B:D' + (BRD.bootPin ?? 0)), 0, 100); // botón BOOT del ESP32
    const diodes = [];
    const driven = new Map(); for (let p = 0; p < NP; p++) if (pinV[p] !== undefined) { const i = node('B:' + pinName(p)); if (i >= 0 && !driven.has(i)) driven.set(i, pinV[p] / (BRD.vio || 5)); else if (i === -1) driven.set(-1, 0); }
    const prev = i => { usedPrev = true; return i < 0 || !prevV ? 0 : prevV[i] || 0; };
    const E = {
      dt: mode.dt ?? (running ? 1e-4 : 0), // paso de tiempo para condensadores (0 = detenido: circuito abierto)
      isrc: (f, t, I) => { if (f >= 0) b[f] -= I; if (t >= 0) b[t] += I; }, // fuente de corriente de f a t
      src: (a, g, Vs, R) => { const gg = 1 / Math.max(0.01, R); G2(a, g, gg); if (a >= 0) b[a] += Vs * gg; if (g >= 0) b[g] -= Vs * gg; },
      prev,
      level: i => driven.has(i) ? driven.get(i) : i < 0 ? 0 : (prev(i) > 2.5 ? 1 : 0),
      res: (a, bb, R) => G2(a, bb, 1 / Math.max(0.01, R)),
      diode: (id, a, k, vf, ron) => {
        diodes.push({ id, a, k, vf, ron });
        if (diodeOn.get(id)) { const g = 1 / ron; G2(a, k, g); if (a >= 0) b[a] += g * vf; if (k >= 0) b[k] -= g * vf; }
        else { const g = 1e-9; if (a >= 0) Gm[a][a] += g; if (k >= 0) Gm[k][k] += g; if (a >= 0 && k >= 0) { Gm[a][k] -= g; Gm[k][a] -= g; } }
      },
    };
    for (const c of state.comps) TYPES[c.type].elec(c, t => node(`C${c.id}:${t}`), E);
    const V = gauss(Gm, b, n);
    const v = i => i >= 0 ? V[i] : 0;
    let changed = false; const dI = new Map();
    for (const d of diodes) {
      const on = diodeOn.get(d.id) || false, vd = v(d.a) - v(d.k);
      if (!on && vd > d.vf + 1e-6) { diodeOn.set(d.id, true); changed = true; }
      else if (on && vd < d.vf) { diodeOn.set(d.id, false); changed = true; }
      dI.set(d.id, on ? Math.max(0, (vd - d.vf) / d.ron) : 0);
    }
    const pinI = []; for (let p = 0; p < NP; p++) if (pinV[p] !== undefined) pinI[p] = (pinV[p] - v(node('B:' + pinName(p)))) / 25;
    res = { V, gReal, dI, pinI, i5V: (5 - v(node(BRD.terms['5V'] ? 'B:5V' : 'B:VIN'))) / 0.05, i3V: (3.3 - v(node('B:3V3'))) / 0.5, v, ver: circuit.ver };
    let moved = false;
    if (usedPrev) { if (!prevV) moved = true; else for (let i = 0; i < n; i++) if (Math.abs(V[i] - prevV[i]) > 1e-3) { moved = true; break; } }
    prevV = V;
    if (!changed && !moved) break;
  }
  return res;
}
function gauss(A, b, n){
  for (let c = 0; c < n; c++) {
    let p = c, m = Math.abs(A[c][c]); for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r][c]); if (v > m) { m = v; p = r; } }
    if (m < 1e-300) continue;
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; }
    const piv = A[c][c];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / piv; if (f === 0) continue; const Ar = A[r], Ac = A[c]; for (let k = c; k < n; k++) Ar[k] -= f * Ac[k]; b[r] -= f * b[c]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = Math.abs(A[r][r]) < 1e-300 ? 0 : s / A[r][r]; }
  return x;
}
const voltage = (sol, key) => { const n = circuit.node(key); return !sol || n < 0 ? 0 : sol.V[n] || 0; };
const isFloating = (sol, key) => { const n = circuit.node(key); return n >= 0 && sol.gReal[n] < 1e-9; };

/* ======================= Emulador y dispositivos ======================= */
let uno = null, running = false, hexLoaded = null, lastFrame = 0, speed = 1;
const track = Array.from({ length: MAXP }, () => ({ high: 0, edge: 0, toggles: 0 }));
let frameStart = 0;
const devices = { servos: [], lcds: [], buzzers: [], i2c: [], sim: [], step: [] };
const simDevs = new Map(); // id de componente -> modelo de dispositivo (modules.js)
const lcdModels = new Map();  // id de componente -> HD44780
const servoAngles = new Map();
let bounceQueue = [];

function pinOfTerm(key){ // pin del Arduino unido a ese terminal (o -1)
  const n = circuit.node(key); if (n < 0) return -1;
  for (let p = 0; p < NP; p++) if (circuit.node('B:' + pinName(p)) === n) return p;
  return -1;
}
function mapDevices(){
  devices.servos = []; devices.lcds = []; devices.buzzers = []; devices.i2c = []; devices.sim = [];
  devices.step = state ? state.comps.filter(c => TYPES[c.type].step) : [];
  pinCache.clear();
  for (const id of [...simDevs.keys()]) if (!state.comps.some(c => c.id === id)) simDevs.delete(id);
  for (const c of state.comps) {
    const T = t => `C${c.id}:${t}`;
    const def = TYPES[c.type];
    if (def.device) {
      let d = simDevs.get(c.id); if (!d || d.c !== c) { d = def.device(c, devApi(c)); d.c = c; if (d.reset) d.reset(); simDevs.set(c.id, d); }
      else if (d.remap) d.remap(); // cables cambiados: vuelve a buscar sus pines
      devices.sim.push(d);
    }
    if (c.type === 'oled') {
      if (!c._oled) c._oled = new SSD1306(c.props.address);
      const m = c._oled; m.address = c.props.address;
      m.ready = () => circuit.node(T('SDA')) === circuit.node('B:' + BRD.i2c.sda) && circuit.node(T('SCL')) === circuit.node('B:' + BRD.i2c.scl) && devApi(c).powered('VCC', 'GND', 2.8);
      devices.i2c.push({ c, bp: m });
    }
    if (c.type === 'servo') devices.servos.push({ c, sig: pinOfTerm(T('sig')), rise: 0 });
    if (c.type === 'buzzer') devices.buzzers.push({ c, pin: pinOfTerm(T('p')) >= 0 ? pinOfTerm(T('p')) : pinOfTerm(T('n')) });
    if (def.passive) devices.buzzers.push({ c, pin: pinOfTerm(T(def.passive)) });
    if (c.type === 'lcd' || c.type === 'lcdi2c') { if (!lcdModels.has(c.id)) lcdModels.set(c.id, new HD44780()); }
    if (c.type === 'lcd') devices.lcds.push({ c, lcd: lcdModels.get(c.id), rs: pinOfTerm(T('RS')), e: pinOfTerm(T('E')), d: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map(t => pinOfTerm(T(t))) });
    if (c.type === 'lcdi2c') {
      let dev = devices.i2c.find(d => d.c === c);
      const lcd = lcdModels.get(c.id);
      dev = { c, lcd, bp: (c._bp && c._bp.lcd === lcd) ? c._bp : new PCF8574Lcd(lcd, c.props.address) };
      c._bp = dev.bp; dev.bp.address = c.props.address;
      dev.bp.ready = () => circuit.node(T('SDA')) === circuit.node('B:' + BRD.i2c.sda) && circuit.node(T('SCL')) === circuit.node('B:' + BRD.i2c.scl) && powered(c);
      devices.i2c.push(dev);
    }
  }
  if (uno && uno.bus) uno.bus.devices = devices.i2c.map(d => d.bp);
}
const pinCache = new Map();
function pinOf(key){ let p = pinCache.get(key); if (p === undefined) { p = pinOfTerm(key); pinCache.set(key, p); } return p; }
const apiCache = new Map();
function devApi(c){
  let a = apiCache.get(c); if (a) return a;
  const T = t => `C${c.id}:${t}`;
  a = {
    pin: t => pinOf(T(t)),
    node: t => circuit.node(T(t)),
    nodeOf: (o, t) => circuit.node(`C${o.id}:${t}`),
    powered: (vcc, gnd, min = 4) => !!lastSol && voltage(lastSol, T(vcc)) - voltage(lastSol, T(gnd)) > min,
    state: p => uno ? uno.state[p] : PinState.Input,
    now: () => uno ? uno.cycles : 0,
    schedule: (at, fn) => { if (uno) uno.schedule(at, fn); },
    drive: () => { elecDirty = true; dispDirty = true; if (uno && running) applyInputs(uno.cycles); },
    running: () => running && !!uno,
    serialWrite: (bytes, n = 0) => { if (uno) { uno.serialWrite(bytes, n); if (!n) rxFlash = performance.now(); } },
    board: () => BRD,
    setInput: (p, h) => { if (uno) uno.setInput(p, h); },
    others: () => devices.sim,
    click: () => playClick(),
  };
  apiCache.set(c, a); return a;
}
function powered(c){
  const sol = lastSol; if (!sol) return false;
  if (c.type === 'lcdi2c') return voltage(sol, `C${c.id}:VCC`) - voltage(sol, `C${c.id}:GND`) > 4;
  if (c.type === 'lcd') return voltage(sol, `C${c.id}:VDD`) - voltage(sol, `C${c.id}:VSS`) > 4;
  if (c.type === 'servo') return voltage(sol, `C${c.id}:vcc`) - voltage(sol, `C${c.id}:gnd`) > 4;
  return true;
}

function onPin(p, s, old, cyc){
  const t = track[p];
  if (old === PinState.High) t.high += cyc - t.edge;
  t.edge = cyc; t.toggles++;
  const pin = io.pins[p];
  pin.mode = s === PinState.High || s === PinState.Low ? 'OUTPUT' : s === PinState.InputPullUp ? 'INPUT_PULLUP' : 'INPUT';
  pin.val = s === PinState.High ? 1 : 0;
  if (pin.uart && pin.mode !== 'OUTPUT') { pin.mode = 'OUTPUT'; pin.val = 1; }
  for (const d of devices.sim) if (d.onPin) d.onPin(p, s, old, cyc); // después de actualizar io.pins: el modelo puede resolver el circuito al instante
  elecDirty = true; dispDirty = true;
  for (const d of devices.servos) if (d.sig === p) {
    if (s === PinState.High) d.rise = cyc;
    else if (old === PinState.High && d.rise) { const us = (cyc - d.rise) / 16; if (us > 400 && us < 2700 && powered(d.c)) servoAngles.set(d.c.id, clamp((us - 544) / (2400 - 544) * 180, 0, 180)); }
  }
  for (const d of devices.lcds) if (d.e === p && old === PinState.High && s === PinState.Low) {
    if (!powered(d.c)) continue;
    const hi = q => q >= 0 && uno.state[q] === PinState.High ? 1 : 0;
    const rs = hi(d.rs);
    if (d.d[0] >= 0 && d.d[1] >= 0 && d.d[2] >= 0 && d.d[3] >= 0 && !d.lcd.eightBitForced4) {
      let v = 0; for (let i = 0; i < 8; i++) v |= hi(d.d[i]) << i; d.lcd.pulse8(rs, v);
    } else { let v = 0; for (let i = 0; i < 4; i++) v |= hi(d.d[4 + i]) << i; d.lcd.pulse4(rs, v); }
  }
}
let lastSol = null, floatWarn = new Set(), capCyc = 0;
function applyInputs(cyc){
  // rebotes del pulsador
  if (bounceQueue.length) {
    const due = bounceQueue.filter(e => e.at <= cyc); if (due.length) { bounceQueue = bounceQueue.filter(e => e.at > cyc); for (const e of due) { e.c.props.contact = e.v; } elecDirty = true; }
  }
  // TX de un puerto serie por hardware activo (TXEN): el pin queda como salida en reposo alto
  BRD.uarts.forEach((u, i) => {
    const us = uno.usarts[i]; if (!us || !u) return;
    const on = !!(uno.cpu.data[us.config.UCSRB] & 0x08), pin = io.pins[u.tx];
    if (on && pin.mode !== 'OUTPUT') { pin.mode = 'OUTPUT'; pin.val = 1; pin.uart = true; elecDirty = true; dispDirty = true; }
    else if (!on && pin.uart) { pin.uart = false; pin.mode = 'INPUT'; pin.val = 0; elecDirty = true; dispDirty = true; }
  });
  const dtc = Math.max(1e-7, (cyc - capCyc) / FREQ); capCyc = cyc;
  if (!elecDirty) return;
  elecDirty = false;
  const sol = solve({ pwm: 'inst', dt: dtc }); lastSol = sol;
  for (const c of devices.step) if (TYPES[c.type].step(c, t => voltage(sol, `C${c.id}:${t}`), dtc)) { elecDirty = true; dispDirty = true; } // condensadores cargándose
  for (const d of devices.sim) if (d.update && d.update(t => voltage(sol, `C${d.c.id}:${t}`))) { elecDirty = true; dispDirty = true; }
  for (let p = 0; p < NP; p++) {
    const key = 'B:' + pinName(p); const v = voltage(sol, key);
    if (io.pins[p].mode === 'OUTPUT') floatWarn.delete(p);
    else {
      let hi = v > (BRD.vio || 5) / 2;
      if (isFloating(sol, key)) { hi = Math.random() < 0.5; if (circuit.wired.has(key)) floatWarn.add(p); }
      else floatWarn.delete(p);
      uno.setInput(p, hi);
    }
    if (BRD.analog[p] !== undefined) uno.setAnalog(p, isFloating(sol, key) ? 1.5 + Math.random() * 2 : clamp(v, 0, 5));
  }
}

/* ======================= Simulación ======================= */
const serialEl = $('#serialOut');
let serialBuf = '', txFlash = 0, rxFlash = 0;
function startSim(hex){
  hex = hex || hexLoaded; if (!hex) return;
  hexLoaded = hex;
  uno = new Board(hex, BRD);
  uno.bus = new I2CBus(uno.twi);
  for (const m of lcdModels.values()) m.reset();
  for (const c of state.comps) if (c.type === 'servo') servoAngles.set(c.id, 90);
  io.pins.forEach(p => { p.mode = 'INPUT'; p.val = 0; p.duty = null; p.uart = false; });
  track.forEach(t => { t.high = 0; t.edge = 0; t.toggles = 0; });
  mapDevices();
  uno.pinListeners.push(onPin);
  esp = BRD.esp32 ? new Esp32Link((bytes, n) => uno && uno.serialWrite(bytes, n)) : null; webShown = false; $('#webView').srcdoc = ''; updateWebPanel();
  if (esp) esp.onServer = () => webGo('/');
  const dec = new TextDecoder(); uno.onSerial = (b, n) => { if (esp && (n === 3 || (n && n === BRD.btUart))) esp.onByte(n, b); if (!n) { serialBuf += dec.decode(new Uint8Array([b]), { stream: true }); txFlash = performance.now(); } for (const d of devices.sim) if (d.hwRx && d.hwRx() === n) d.rx(b); };
  uno.onSpi = b => { let r = 0xFF; for (const d of devices.sim) if (d.onSpi) { const v = d.onSpi(b); if (typeof v === 'number') r &= v; } return r; };
  for (const d of simDevs.values()) if (d.reset) d.reset();
  for (const c of state.comps) if (c._oled) c._oled.reset();
  for (const c of state.comps) if (TYPES[c.type].step) c._vc = 0; // condensadores descargados
  floatWarn.clear(); elecDirty = true; frameStart = 0; running = true; speed = 1; capCyc = uno.cycles;
  lastFrame = performance.now();
  setStatus('run');
}
function stopSim(){ running = false; uno = null; esp = null; $('#webView').srcdoc = ''; updateWebPanel(); for (const d of simDevs.values()) if (d.reset) d.reset(); if (state) for (const c of state.comps) if (TYPES[c.type].step) c._vc = 0; io.pins.forEach(p => { p.mode = 'INPUT'; p.val = 0; p.duty = null; p.uart = false; }); elecDirty = true; setStatus('stop'); stopTone(); }
function setStatus(s, extra){
  const st = $('#status'), run = $('#run');
  st.className = 'chip' + (s === 'run' ? ' on' : s === 'error' ? ' bad' : s === 'busy' ? ' busy' : '');
  st.textContent = extra || (s === 'run' ? 'Simulando' : s === 'error' ? 'Error de compilación' : s === 'busy' ? 'Compilando…' : 'Detenido');
  run.classList.toggle('running', s === 'run'); run.textContent = s === 'run' ? '■ Detener' : '▶ Simular';
}

function frame(now){
  const dt = Math.min(now - lastFrame, 50); lastFrame = now;
  if (running && uno) {
    const start = uno.cycles; if (!frameStart) frameStart = start;
    const target = start + dt * (FREQ / 1000) * speed;
    const t0 = performance.now();
    // ejecuta en bloques de 0,1 ms y corta si el navegador no da abasto
    while (uno.cycles < target) {
      uno.runUntil(Math.min(target, uno.cycles + 32000), 1600, applyInputs);
      if (performance.now() - t0 > 22) break;
    }
    const spent = performance.now() - t0;
    if (uno.cycles < target - 1000) speed = Math.max(0.05, speed * 0.9); else if (spent < 12 && speed < 1) speed = Math.min(1, speed * 1.05);
    // ciclo de trabajo (PWM) de cada pin en este cuadro
    const cyc = uno.cycles, span = cyc - frameStart;
    if (span > 0) for (let p = 0; p < NP; p++) {
      const t = track[p]; const pin = io.pins[p];
      if (uno.state[p] === PinState.High) t.high += cyc - t.edge;
      t.edge = cyc;
      const prevDuty = pin.duty;
      pin.duty = pin.mode === 'OUTPUT' && t.toggles >= 2 ? clamp(t.high / span, 0, 1) : null;
      if ((prevDuty == null) !== (pin.duty == null) || (pin.duty != null && Math.abs(pin.duty - prevDuty) > 0.004)) dispDirty = true;
      pin.freq = t.toggles >= 2 ? t.toggles / 2 / (span / FREQ) : 0;
      t.high = 0; t.toggles = 0;
    }
    frameStart = cyc;
    $('#clock').textContent = `t = ${fmt(uno.cycles / FREQ, 2)} s` + (speed < 0.97 ? ` · ${Math.round(speed * 100)} %` : '');
  }
  if (serialBuf) { serialAppend(serialBuf); serialBuf = ''; }
  updateBtPanel();
  if (esp) { esp.check(performance.now()); if (esp.ver !== espVer) { espVer = esp.ver; updateWebPanel(); } }
  renderDynamic();
  requestAnimationFrame(frame);
}

/* ======================= Vista por cuadro ======================= */
let dispDirty = true, display = null, lastWarnHTML = '';
function computeDisplay(){
  if (circuit.ver !== structVer) rebuildCircuit();
  const pwmPins = []; for (let p = 0; p < NP; p++) if (io.pins[p].mode === 'OUTPUT' && io.pins[p].duty != null) pwmPins.push(p);
  let avg = solve({ pwm: 'avg' });
  if (!running) {
    lastSol = avg;
    let ch = false; for (const d of devices.sim) if (d.update && d.update(t => voltage(avg, `C${d.c.id}:${t}`))) ch = true;
    if (ch) { avg = solve({ pwm: 'avg' }); lastSol = avg; }
  }
  const led = new Map(), peak = new Map();
  let pinI = avg.pinI;
  if (!pwmPins.length) { for (const [id, I] of avg.dI) { led.set(id, I); peak.set(id, I); } }
  else {
    const low = solve({ pwm: 'low' }); const all = solve({ pwm: 'low', high: new Set(pwmPins) });
    for (const [id, I] of low.dI) { led.set(id, I); peak.set(id, Math.max(I, all.dI.get(id) || 0)); }
    for (const p of pwmPins) {
      const d = io.pins[p].duty; const hs = pwmPins.length === 1 ? all : solve({ pwm: 'low', high: new Set([p]) });
      for (const [id, I] of hs.dI) led.set(id, led.get(id) + d * (I - low.dI.get(id)));
    }
    pinI = all.pinI;
  }
  display = { sol: avg, led, peak, pinI };
  dispDirty = false;
}
const q = s => document.querySelector(s);
function renderDynamic(){
  if (dispDirty || elecDirty || !display || !running) computeDisplay();
  const D = display; const warns = []; const now = performance.now();
  for (const c of state.comps) {
    if (c.type === 'led') {
      const I = D.led.get(c.id) || 0, pk = D.peak.get(c.id) || 0, bri = clamp(I / 0.012, 0, 1) ** 0.55;
      const lit = q(`[data-lit="${c.id}"]`), glow = q(`[data-glow="${c.id}"]`);
      if (lit) { lit.setAttribute('opacity', (bri * 0.95).toFixed(3)); glow.setAttribute('opacity', (bri * 0.85).toFixed(3)); }
      if (pk > 0.025) warns.push(`${c.name}: circulan ${fmt(pk * 1000, 0)} mA. Un LED real se daña por encima de ~20 mA. Pon una resistencia en serie (220 Ω es lo habitual).`);
    } else if (c.type === 'rgb') {
      const ch = ['r', 'g', 'b'].map(k => clamp((D.led.get(c.id + ':' + k) || 0) / 0.010, 0, 1) ** 0.55);
      const mx = Math.max(...ch);
      const col = `rgb(${ch.map(v => Math.round(mx ? 255 * v / mx : 0)).join(',')})`;
      const lit = q(`[data-lit="${c.id}"]`), glow = q(`[data-glow="${c.id}"]`);
      if (lit) { lit.setAttribute('fill', col); lit.setAttribute('opacity', (mx * 0.95).toFixed(3)); glow.setAttribute('fill', col); glow.setAttribute('opacity', (mx * 0.85).toFixed(3)); }
      for (const k of ['r', 'g', 'b']) if ((D.peak.get(c.id + ':' + k) || 0) > 0.03) warns.push(`${c.name}: el canal ${({ r: 'rojo', g: 'verde', b: 'azul' })[k]} recibe demasiada corriente. Usa una resistencia por color.`);
    } else if (c.type === 'btn') {
      const cap = q(`[data-cap="${c.id}"]`); if (cap) { cap.setAttribute('r', c.props.pressed ? 11 : 13); cap.setAttribute('fill', c.props.pressed ? '#61686f' : '#3c4146'); }
    } else if (c.type === 'pot') {
      const k = q(`[data-knob="${c.id}"]`); if (k) k.setAttribute('transform', `rotate(${-135 + 270 * c.props.pos} 0 -2)`);
    } else if (c.type === 'servo') {
      const target = servoAngles.has(c.id) ? servoAngles.get(c.id) : 90;
      c._ang = c._ang == null ? target : c._ang + clamp(target - c._ang, -9, 9); // ~0,1 s / 60°
      const h = q(`[data-horn="${c.id}"]`); if (h) h.setAttribute('transform', `rotate(${c._ang - 90} 22 0)`);
      const a = q(`[data-angle="${c.id}"]`); if (a) a.textContent = Math.round(c._ang) + '°';
      if (running && !powered(c)) warns.push(`${c.name}: el servo no tiene alimentación. Conecta V+ a 5V y GND a GND.`);
    } else if (c.type === 'buzzer' || TYPES[c.type].passive) {
      const d = devices.buzzers.find(b => b.c === c); const f = d && d.pin >= 0 && running ? io.pins[d.pin].freq || 0 : 0;
      const on = f > 30 && f < 20000; const w = q(`[data-waves="${c.id}"]`); if (w) w.setAttribute('opacity', on ? 0.5 + 0.5 * Math.sin(now / 60) ** 2 : 0);
      c._freq = on ? f : 0;
    } else if (c.type === 'lcd' || c.type === 'lcdi2c') renderLcd(c, D.sol, warns);
    else if (c.type === 'oled') renderOled(c, warns, now);
    else if (c.type === 'max7219') renderMatrix(c, warns);
    const def = TYPES[c.type];
    if (def.render) def.render(c, renderCtx(c, D, warns, now));
  }
  const buzz = state.comps.find(c => (c.type === 'buzzer' || TYPES[c.type].passive || TYPES[c.type].sound) && c._freq);
  if (buzz) playTone(buzz._freq); else stopTone();
  const pinI = D.pinI || [];
  for (let p = 0; p < NP; p++) if (pinI[p] !== undefined && Math.abs(pinI[p]) > 0.04) warns.push(`${pinName(p)}: el pin entrega ${fmt(Math.abs(pinI[p]) * 1000, 0)} mA y el máximo del ${BRD.chipName} es 40 mA. Revisa si hay un corto o falta una resistencia.`);
  if (D.sol && D.sol.i5V > 0.5) warns.push(`Cortocircuito: ${BRD.terms['5V'] ? '5V' : 'VIN'} está unido directamente a GND.`);
  if (D.sol && D.sol.i3V > 0.15) warns.push('Cortocircuito: 3,3 V está unido a GND o muy cargado.');
  if (running) for (const p of floatWarn) warns.push(`${pinName(p)}: la entrada queda flotante (sin nada que la fije a ${BRD.vio === 3.3 ? '3,3 V' : '5V'} o a GND) y lee valores al azar. Usa INPUT_PULLUP o una resistencia pull-down.`);
  for (const p of [BRD.uarts[0].rx, BRD.uarts[0].tx]) if (running && circuit.wired.has('B:D' + p)) { warns.push(`${BRD.label('D' + p)}: estos pines los usa el puerto serie (USB). Evita conectar cosas ahí si usas Serial.`); break; }
  if (esp) { for (const w of esp.warn) warns.push(w); }
  const html = warns.map(w => `<div class="warn">${esc(w).replace(/^([^:]+:)/, '<b>$1</b>')}</div>`).join('');
  if (html !== lastWarnHTML) { $('#warnings').innerHTML = html; lastWarnHTML = html; }
  // LEDs y pines de la placa
  const outLvl = p => { const s = io.pins[p]; return running && s.mode === 'OUTPUT' ? (s.duty != null ? s.duty : s.val) : null; };
  let lOn = outLvl(BRD.ledPin ?? 13); lOn = lOn == null ? 0 : BRD.ledActiveLow ? 1 - lOn : lOn;
  const [lr, lg, lb] = BRD.ledColor || [255, 190, 40];
  $('#bL').setAttribute('fill', lOn > 0.02 ? `rgba(${lr},${lg},${lb},${0.35 + 0.65 * lOn})` : BRD.ledOff || '#4a3d1a');
  if (BRD.rgbPin != null) { // LED RGB WS2812 de la placa (S3, C3)
    const c = running && esp && esp.rgb ? esp.rgb : [0, 0, 0], m = Math.max(...c), el = $('#bRGB');
    if (m < 1) { el.setAttribute('fill', '#e8e8e4'); el.setAttribute('filter', 'none'); }
    else { const k = 255 / m; el.setAttribute('fill', `rgb(${c.map(v => Math.round(v * k)).join(',')})`); el.setAttribute('opacity', String(Math.min(1, 0.45 + m / 80))); el.setAttribute('filter', 'url(#glowS)'); }
  }
  if (BRD.flashPin != null) { const f = outLvl(BRD.flashPin) || 0; const el = $('#bF'); el.setAttribute('fill', f > 0.02 ? `rgba(255,255,235,${0.5 + 0.5 * f})` : '#d8d2b0'); el.setAttribute('filter', f > 0.02 ? 'url(#glowS)' : 'none'); }
  $('#bTX').setAttribute('fill', now - txFlash < 60 ? '#ffbe28' : '#4a3d1a');
  $('#bRX').setAttribute('fill', now - rxFlash < 120 ? '#ffbe28' : '#4a3d1a');
  for (let p = 0; p < NP; p++) {
    const el = q(`[data-pinled="${pinName(p)}"]`); if (!el) continue;
    const s = io.pins[p]; const lvl = running && s.mode === 'OUTPUT' ? (s.duty != null ? s.duty : s.val) : 0;
    el.setAttribute('fill', lvl > 0.02 ? `rgba(255,120,40,${0.3 + 0.7 * lvl})` : '#0c0c0c');
  }
  updateProps(false);
}
function renderCtx(c, D, warns, now){
  const T = t => `C${c.id}:${t}`; const api = devApi(c);
  return {
    q, now, running, warn: w => warns.push(w), V: t => voltage(D.sol, T(t)), powered: api.powered, led: id => D.led.get(id), dev: x => simDevs.get(x.id),
    wired: t => circuit.wired.has(T(t)),
    drivenBy: t => { const p = pinOf(T(t)); return p >= 0 && io.pins[p].mode === 'OUTPUT' ? p : -1; },
  };
}
function renderOled(c, warns, now){
  const m = c._oled; const img = q(`[data-oled="${c.id}"]`); if (!m || !img) return;
  const pw = running && devApi(c).powered('VCC', 'GND', 2.8);
  const key = m.version + '|' + pw;
  if (img.dataset.key !== key && (!c._oledT || now - c._oledT > 40)) { img.dataset.key = key; c._oledT = now; img.setAttribute('href', oledImage(m, pw)); }
  if (running && !(m.ready && m.ready())) warns.push(`${c.name}: la pantalla OLED debe ir con SDA a ${BRD.i2c.sda}, SCL a ${BRD.i2c.scl}, VCC a 5V y GND a GND.`);
}
function renderMatrix(c, warns){
  const m = c._max; if (!m) return;
  const pw = running && devApi(c).powered('VCC', 'GND', 4);
  const key = m.version + '|' + pw; if (c._mxKey === key) return; c._mxKey = key;
  const op = (0.35 + 0.65 * (m.intensity + 1) / 16).toFixed(2);
  for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { const el = q(`[data-dot="${c.id}:${r}:${k}"]`); if (el) el.setAttribute('opacity', pw && m.lit(r, k) ? op : 0); }
  if (running && !pw) warns.push(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
}
function renderLcd(c, sol, warns){
  const lcd = lcdModels.get(c.id); const txt = q(`[data-lcdtxt="${c.id}"]`), bg = q(`[data-lcdbg="${c.id}"]`); if (!lcd || !txt) return;
  const on = running && powered(c);
  let light, contrast = 1;
  if (c.type === 'lcd') {
    light = on && voltage(sol, `C${c.id}:A`) - voltage(sol, `C${c.id}:K`) > 2.6;
    const v0 = voltage(sol, `C${c.id}:V0`) - voltage(sol, `C${c.id}:VSS`);
    contrast = isFloating(sol, `C${c.id}:V0`) ? 0.15 : clamp(1.15 - v0 / 3, 0, 1);
    if (running && on && isFloating(sol, `C${c.id}:V0`)) warns.push(`${c.name}: V0 (contraste) no está conectado y el texto casi no se ve. Únelo a GND o al cursor de un potenciómetro.`);
  } else { light = on && c._bp && c._bp.backlight; if (running && !(c._bp && c._bp.ready())) warns.push(`${c.name}: el módulo I2C debe ir con SDA a ${BRD.i2c.sda}, SCL a ${BRD.i2c.scl}, VCC a 5V y GND a GND.`); }
  if (running && !on) warns.push(`${c.name}: la pantalla no tiene alimentación (${c.type === 'lcd' ? 'VDD a 5V y VSS a GND' : 'VCC a 5V y GND a GND'}).`);
  const blinkOn = Math.floor(performance.now() / 400) % 2 === 0;
  const key = [lcd.version, on, light, contrast.toFixed(2), lcd.displayOn, lcd.cursor && blinkOn, lcd.blink && blinkOn].join('|');
  if (txt.dataset.key === key) return; txt.dataset.key = key;
  bg.setAttribute('fill', light ? '#9ad600' : on ? '#5d7a14' : '#2f3a12');
  if (!on || !lcd.displayOn) { txt.innerHTML = ''; return; }
  const pix = `rgba(18,40,8,${(0.12 + 0.88 * contrast).toFixed(2)})`, ghost = `rgba(18,40,8,${(0.06 * contrast).toFixed(3)})`;
  const cw = 14.2, ch = 30, x0 = -113.6, y0 = -33, pw = 2.4, ph = 3.1;
  let s = '';
  const cur = lcd.cursorPos();
  for (let r = 0; r < 2; r++) for (let col = 0; col < 16; col++) {
    const x = x0 + col * cw, y = y0 + r * ch; const code = lcd.charAt(col, r);
    s += `<rect x="${x}" y="${y}" width="${pw * 5}" height="${ph * 8}" fill="${ghost}"/>`;
    let rows = null;
    if (code < 16) { rows = []; for (let i = 0; i < 8; i++) rows.push(lcd.cgram[(code & 7) * 8 + i]); }
    else rows = FONT5x8(code);
    if (rows) for (let i = 0; i < 8; i++) for (let b = 0; b < 5; b++) if (rows[i] & (16 >> b)) s += `<rect x="${(x + b * pw).toFixed(1)}" y="${(y + i * ph).toFixed(1)}" width="${pw - 0.3}" height="${ph - 0.3}" fill="${pix}"/>`;
    if (cur && cur.col === col && cur.row === r) {
      if (lcd.cursor && blinkOn) s += `<rect x="${x}" y="${y + 7 * ph}" width="${pw * 5}" height="${ph - 0.3}" fill="${pix}"/>`;
      if (lcd.blink && blinkOn) s += `<rect x="${x}" y="${y}" width="${pw * 5}" height="${ph * 8}" fill="${pix}"/>`;
    }
  }
  txt.innerHTML = s;
}
// Fuente 5×7 de la ROM A00 del HD44780 (columnas, bit 0 = fila superior), caracteres 0x20..0x7F
const FONT_HEX = '0000000000 00005F0000 0007000700 147F147F14 242A7F2A12 2313086462 3649552250 0005030000 001C224100 0041221C00 14083E0814 08083E0808 0050300000 0808080808 0060600000 2010080402 '
  + '3E5149453E 00427F4000 4261514946 2141454B31 1814127F10 2745454539 3C4A494930 0171090503 3649494936 064949291E 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906 '
  + '324979413E 7E1111117E 7F49494936 3E41414122 7F4141221C 7F49494941 7F09090901 3E4149497A 7F0808087F 00417F4100 2040413F01 7F08142241 7F40404040 7F020C027F 7F0408107F 3E4141413E '
  + '7F09090906 3E4151215E 7F09192946 4649494931 01017F0101 3F4040403F 1F2040201F 3F4038403F 6314081463 0708700807 6151494543 007F414100 0204081020 0041417F00 0402010204 4040404040 '
  + '0001020400 2054545478 7F48444438 3844444420 384444487F 3854545418 087E090102 0C5252523E 7F08040478 00447D4000 2040443D00 7F10284400 00417F4000 7C04180478 7C08040478 3844444438 '
  + '7C14141408 081414187C 7C08040408 4854545420 043F444020 3C4040207C 1C2040201C 3C4030403C 4428102844 0C5050503C 4464544C44 0008364100 00007F0000 0041360800 08082A1C08 081C2A0808';
const FONT = FONT_HEX.split(' ').map(h => [0, 1, 2, 3, 4].map(i => parseInt(h.substr(i * 2, 2), 16)));
const toRows = cols => { const rows = []; for (let r = 0; r < 8; r++) { let bits = 0; for (let b = 0; b < 5; b++) if ((cols[b] >> r) & 1) bits |= 16 >> b; rows.push(bits); } return rows; };
const fontCache = new Map();
function FONT5x8(code){
  if (fontCache.has(code)) return fontCache.get(code);
  let rows;
  if (code >= 0x20 && code <= 0x7F) rows = toRows(FONT[code - 0x20]);
  else if (code === 0xDF) rows = toRows([0x00, 0x06, 0x09, 0x09, 0x06]);
  else if (code === 0xFF) rows = [31, 31, 31, 31, 31, 31, 31, 31];
  else rows = [0, 0, 0, 0, 0, 0, 0, 0];
  fontCache.set(code, rows); return rows;
}

/* ======================= Sonido ======================= */
let audio = null, osc = null, soundOn = false;
function playTone(f){
  if (!soundOn) return;
  try {
    if (!audio) audio = new AudioContext();
    if (!osc) { osc = audio.createOscillator(); const g = audio.createGain(); g.gain.value = 0.05; osc.type = 'square'; osc.connect(g).connect(audio.destination); osc.start(); }
    osc.frequency.setTargetAtTime(f, audio.currentTime, 0.01);
  } catch {}
}
function playClick(){
  if (!soundOn) return;
  try { if (!audio) audio = new AudioContext(); const t = audio.currentTime; const o = audio.createOscillator(), g = audio.createGain(); o.type = 'square'; o.frequency.value = 180; g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.035); } catch {}
}
function stopTone(){ if (osc) { try { osc.stop(); } catch {} osc = null; } }
$('#sound').onclick = () => { soundOn = !soundOn; $('#sound').setAttribute('aria-pressed', soundOn); $('#sound').textContent = soundOn ? '🔊 Sonido' : '🔇 Sonido'; if (!soundOn) stopTone(); else if (!audio) { try { audio = new AudioContext(); } catch {} } };

/* ======================= Dibujo de componentes ======================= */
// capas para protoboards: su dibujo y sus agujeros quedan debajo de los componentes (que se pueden agarrar encima)
const layerBefore = (id, ref) => { let g = document.getElementById(id); if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.id = id; ref.before(g); } return g; };
const bbLayer = layerBefore('bbLayer', $('#compLayer')), holeLayer = layerBefore('holeLayer', $('#compLayer'));
function renderComps(){
  let s = '', u = '';
  for (const c of state.comps) {
    const t = TYPES[c.type]; const [bx, by, bw, bh] = typeof t.box === 'function' ? t.box(c) : t.box;
    const isSel = sel && sel.kind === 'comp' && sel.id === c.id;
    const g = `<g class="comp${isSel ? ' sel' : ''}" data-comp="${c.id}" transform="translate(${c.x},${c.y}) rotate(${c.rot})"><rect class="outline" x="${bx - 4}" y="${by - 4}" width="${bw + 8}" height="${bh + 8}" rx="6"/>${t.svg(c)}</g>`;
    if (t.under) u += g; else s += g;
  }
  $('#compLayer').innerHTML = s; bbLayer.innerHTML = u;
  renderTerms(); renderWires(); dispDirty = true;
}
function renderTerms(){
  let s = '';
  for (const id in BPIN) { const p = BPIN[id]; s += `<circle class="term" data-term="B:${id}" cx="${p.x}" cy="${p.y}" r="7"><title>${pinTitle(id)}</title></circle>`; }
  let h = '';
  for (const c of state.comps) { const r = TYPES[c.type].termR || 6.5; let o = ''; for (const t in TYPES[c.type].terms) { const k = `C${c.id}:${t}`, p = termPos(k); o += `<circle class="term" data-term="${k}" cx="${p.x}" cy="${p.y}" r="${r}"><title>${esc(c.name)}: ${esc(TYPES[c.type].terms[t].name)}</title></circle>`; } if (TYPES[c.type].under) h += o; else s += o; }
  $('#termLayer').innerHTML = s; holeLayer.innerHTML = h;
}
function wirePath(a, pts, b){
  if (!pts.length) { const dist = Math.hypot(b.x - a.x, b.y - a.y); const k = Math.min(90, dist * 0.4 + 18); return `M${a.x} ${a.y} C${a.x + a.dx * k} ${a.y + a.dy * k} ${b.x + b.dx * k} ${b.y + b.dy * k} ${b.x} ${b.y}`; }
  return 'M' + [a, ...pts.map(([x, y]) => ({ x, y })), b].map(p => `${p.x} ${p.y}`).join(' L');
}
function renderWires(){
  let s = '';
  for (const w of state.wires) {
    const a = termPos(w.a), b = termPos(w.b); if (!a || !b) continue;
    const d = wirePath(a, w.pts, b); const isSel = sel && sel.kind === 'wire' && sel.id === w.id;
    s += `<path class="wire-shadow" d="${d}"/><path class="wire${isSel ? ' sel' : ''}" d="${d}" stroke="${w.color}"/><path class="wire-hit" data-wire="${w.id}" d="${d}"><title>${esc(termLabel(w.a))} ↔ ${esc(termLabel(w.b))}</title></path>`;
    s += `<circle cx="${a.x}" cy="${a.y}" r="3.5" fill="${w.color}" stroke="rgba(0,0,0,.4)"/><circle cx="${b.x}" cy="${b.y}" r="3.5" fill="${w.color}" stroke="rgba(0,0,0,.4)"/>`;
  }
  if (drawing) { const a = termPos(drawing.from); const c = drawing.cur || a; s += `<path class="preview" d="${wirePath(a, drawing.pts, { x: c.x, y: c.y, dx: 0, dy: 0 })}"/>`; }
  $('#wireLayer').innerHTML = s;
}

/* ======================= Panel de propiedades ======================= */
const WIRE_COLORS = ['#e53935', '#212121', '#2e7d32', '#f9a825', '#1565c0', '#ef6c00', '#8e24aa', '#e0e0e0'];
let propsKey = '';
function updateProps(force){
  const box = $('#props');
  $('#rotate').disabled = !(sel && sel.kind === 'comp'); $('#del').disabled = !sel;
  if (!sel) { box.hidden = true; propsKey = ''; return; }
  const key = sel.kind + sel.id;
  if (sel.kind === 'wire') {
    const w = state.wires.find(w => w.id === sel.id); if (!w) { sel = null; box.hidden = true; return; }
    if (force || propsKey !== key) {
      box.innerHTML = `<h4>Cable <span>${esc(termLabel(w.a))} ↔ ${esc(termLabel(w.b))}</span></h4><div class="swatches">${WIRE_COLORS.map(c => `<button type="button" data-wcolor="${c}" class="${c === w.color ? 'on' : ''}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div><div class="row"><button class="btn small danger" data-act="del">Eliminar cable</button></div>`;
      box.hidden = false; propsKey = key;
    }
    return;
  }
  const c = compById(sel.id); if (!c) { sel = null; box.hidden = true; return; }
  if (force || propsKey !== key) {
    let h = `<h4>${esc(c.name)} <span>${TYPES[c.type].label}</span></h4>`;
    if (c.type === 'led') h += `<label>Color<select id="pColor">${Object.keys(LED_COLORS).map(k => `<option value="${k}" ${k === c.props.color ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)} (Vf ${fmt(LED_COLORS[k].vf, 1)} V)</option>`).join('')}</select></label>`;
    if (c.type === 'res') h += `<label>Resistencia<select id="pOhms">${RES_VALUES.map(v => `<option value="${v}" ${v === c.props.ohms ? 'selected' : ''}>${fmtOhm(v)}</option>`).join('')}${RES_VALUES.includes(c.props.ohms) ? '' : `<option selected value="${c.props.ohms}">${fmtOhm(c.props.ohms)}</option>`}</select></label><label>Valor exacto (Ω)<input type="number" id="pOhmsN" min="1" max="10000000" value="${c.props.ohms}"></label>`;
    if (c.type === 'pot') h += `<label>Posición del cursor<input type="range" id="pPos" min="0" max="1000" value="${Math.round(c.props.pos * 1000)}"></label><label>Valor total<select id="pPotOhms">${[1000, 10000, 50000, 100000].map(v => `<option value="${v}" ${v === c.props.ohms ? 'selected' : ''}>${fmtOhm(v)}</option>`).join('')}</select></label>`;
    if (c.type === 'btn') h += `<label class="check"><input type="checkbox" id="pLatch" ${c.props.latch ? 'checked' : ''}> Queda pulsado al hacer clic</label><label class="check"><input type="checkbox" id="pBounce" ${c.props.bounce ? 'checked' : ''}> Simular rebote del contacto</label>`;
    if (c.type === 'ldr') h += `<label>Luz ambiente<input type="range" id="pLux" min="0" max="1000" value="${Math.round(Math.log10(c.props.lux + 1) / 5 * 1000)}"></label>`;
    if (c.type === 'lcdi2c') h += `<label>Dirección I2C<select id="pAddr">${[0x27, 0x3F, 0x20, 0x26].map(a => `<option value="${a}" ${a === c.props.address ? 'selected' : ''}>0x${a.toString(16).toUpperCase()}</option>`).join('')}</select></label>`;
    const def = TYPES[c.type];
    for (const o of def.options || []) h += `<label>${o.label}<select data-prop="${o.prop}" data-num="${o.num ? 1 : ''}">${o.values.map(([val, lab]) => `<option value="${val}" ${val === c.props[o.prop] ? 'selected' : ''}>${lab}</option>`).join('')}</select></label>`;
    for (const k of def.controls || []) h += `<label>${k.label} <output data-out="${k.prop}">${ctrlText(k, c.props[k.prop])}</output><input type="range" data-prop="${k.prop}" data-ctl="1" min="${k.min}" max="${k.max}" step="${k.step}" value="${c.props[k.prop]}"></label>`;
    for (const k of def.checks || []) h += `<label class="check"><input type="checkbox" data-prop="${k.prop}" ${c.props[k.prop] ? 'checked' : ''}> ${k.label}</label>`;
    if (c.type === 'joy') h += `<label class="check"><input type="checkbox" data-prop="pressed" ${c.props.pressed ? 'checked' : ''}> Pulsador del joystick apretado</label>`;
    h += `<div class="readout" id="pRead"></div><div class="row"><button class="btn small" data-act="rot">⟳ Girar</button><button class="btn small danger" data-act="del">Eliminar</button></div>`;
    box.innerHTML = h; box.hidden = false; propsKey = key;
  }
  const r = $('#pRead'); if (!r) return;
  const D = display, sol = D && D.sol; const v = k => voltage(sol, k);
  let txt = '';
  if (c.type === 'led') txt = `Corriente media: ${fmt((D.led.get(c.id) || 0) * 1000, 1)} mA\nTensión: ${fmt(v(`C${c.id}:a`) - v(`C${c.id}:k`), 2)} V`;
  if (c.type === 'rgb') txt = ['r', 'g', 'b'].map(k => `${k.toUpperCase()}: ${fmt((D.led.get(c.id + ':' + k) || 0) * 1000, 1)} mA`).join('\n');
  if (c.type === 'res') { const dv = v(`C${c.id}:a`) - v(`C${c.id}:b`); txt = `Caída: ${fmt(Math.abs(dv), 2)} V\nCorriente: ${fmt(Math.abs(dv) / c.props.ohms * 1000, 2)} mA`; }
  if (c.type === 'pot') txt = `Cursor: ${fmt(c.props.pos * 100, 0)} %\nTensión en el cursor: ${fmt(v(`C${c.id}:w`), 2)} V`;
  if (c.type === 'btn') txt = c.props.pressed ? 'Estado: pulsado (cerrado)' : 'Estado: suelto (abierto)';
  if (c.type === 'sw') txt = `Posición: común unido al extremo ${c.props.pos ? 2 : 1}`;
  if (c.type === 'ldr') txt = `Luz: ${Math.round(c.props.lux)} lux\nResistencia: ${fmtOhm(ldrOhms(c.props.lux))}`;
  if (c.type === 'servo') txt = `Ángulo: ${Math.round(c._ang ?? 90)}°`;
  if (c.type === 'buzzer') txt = c._freq ? `Sonando a ${Math.round(c._freq)} Hz` : 'En silencio';
  if (c.type === 'lcd' || c.type === 'lcdi2c') { const l = lcdModels.get(c.id); txt = l ? `Modo: ${l.eightBit ? '8' : '4'} bits · ${l.displayOn ? 'pantalla encendida' : 'pantalla apagada'}` : ''; }
  if (TYPES[c.type].readout) txt = TYPES[c.type].readout(c, t => v(`C${c.id}:${t}`));
  if (r.textContent !== txt) r.textContent = txt;
}
function ctrlText(k, v){ return k.pct ? Math.round(v * 100) + ' %' : (Number.isInteger(k.step) ? Math.round(v) : fmt(+v, 1)) + (k.unit ? ' ' + k.unit : ''); }

/* ======================= Interacción con el lienzo ======================= */
const svg = $('#svg');
function svgPt(e){ const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
const snap = v => Math.round(v / 10) * 10;
function setHint(msg){
  $('#hint').textContent = msg ? msg : drawing ? `Cable desde ${termLabel(drawing.from)}: clic en otro terminal para terminar, clic en vacío añade un codo, Esc cancela.`
    : sel && sel.kind === 'comp' ? 'Arrastra para mover. R gira, Supr elimina.' : 'Clic en un terminal para empezar un cable. Arrastra los componentes para moverlos.';
}
function select(s){ sel = s; renderComps(); updateProps(true); setHint(); }
function pressKey(c, k){ c.props.key = k; elecDirty = true; dispDirty = true; const d = simDevs.get(c.id); if (d && d.press) d.press(); }
function setPressed(c, pressed){
  if (c.props.pressed === pressed) return;
  c.props.pressed = pressed;
  if (c.props.bounce && uno && running) { // rebote: 3-6 transiciones durante ~2 ms
    const t = uno.cycles; let v = pressed; const n = 3 + Math.floor(Math.random() * 4);
    bounceQueue = bounceQueue.filter(e => e.c !== c);
    for (let i = 0; i < n; i++) { v = !v; bounceQueue.push({ c, at: t + (i + 1) * (2000 + Math.random() * 6000), v }); }
    bounceQueue.push({ c, at: t + (n + 1) * 8000, v: pressed });
    c.props.contact = pressed; // el primer contacto es inmediato; luego rebota
  } else c.props.contact = pressed;
  elecDirty = true; dispDirty = true;
}
svg.addEventListener('pointerdown', e => {
  const pt = svgPt(e); const t = e.target;
  const term = t.closest('[data-term]'), ctrl = t.closest('[data-ctrl]'), comp = t.closest('[data-comp]'), wire = t.closest('[data-wire]');
  if (term) {
    const k = term.dataset.term;
    if (!drawing) { drawing = { from: k, pts: [], cur: pt }; sel = null; updateProps(true); }
    else if (k !== drawing.from) {
      if (!state.wires.some(w => (w.a === drawing.from && w.b === k) || (w.b === drawing.from && w.a === k)))
        state.wires.push({ id: state.nextId++, a: drawing.from, b: k, pts: drawing.pts, color: pickWireColor(drawing.from, k) });
      drawing = null; structChanged();
    }
    renderWires(); setHint(); e.preventDefault(); return;
  }
  if (drawing) { drawing.pts.push([snap(pt.x), snap(pt.y)]); renderWires(); return; }
  if (ctrl) {
    if (ctrl.dataset.ctrl === 'reset') { if (hexLoaded) startSim(); return; }
    if (ctrl.dataset.ctrl === 'boot') { bootPressed = true; elecDirty = true; dispDirty = true; drag = { kind: 'boot' }; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    const c = compById(+ctrl.dataset.id);
    if (ctrl.dataset.ctrl === 'tap') { const d = simDevs.get(c.id); if (d && d.tap) d.tap(ctrl.dataset); dispDirty = true; }
    else if (ctrl.dataset.ctrl === 'card') { c.props.near = !c.props.near; renderComps(); elecDirty = true; dispDirty = true; scheduleSave(); updateProps(true); }
    else if (ctrl.dataset.ctrl === 'key') { pressKey(c, +ctrl.dataset.key); drag = { kind: 'key', c }; }
    else if (ctrl.dataset.ctrl === 'joy') {
      const [lx, ly] = rot(pt.x - c.x, pt.y - c.y, -c.rot);
      const kx = c.props.x * 16 - 4, ky = -c.props.y * 16;
      if (Math.hypot(lx - kx, ly - ky) < 9) { c.props.pressed = true; drag = { kind: 'joybtn', c }; } else drag = { kind: 'joy', c };
      elecDirty = true; dispDirty = true;
    }
    else if (ctrl.dataset.ctrl === 'btn') { setPressed(c, c.props.latch ? !c.props.pressed : true); drag = { kind: 'btn', c }; }
    else if (ctrl.dataset.ctrl === 'sw') { c.props.pos = c.props.pos ? 0 : 1; const l = q(`[data-lever="${c.id}"]`); if (l) l.setAttribute('x', c.props.pos ? 2 : -20); elecDirty = true; dispDirty = true; scheduleSave(); }
    else drag = { kind: 'pot', c, y: pt.y, x: pt.x, pos: c.props.pos };
    svg.setPointerCapture(e.pointerId); if (!sel || sel.id !== c.id || sel.kind !== 'comp') { sel = { kind: 'comp', id: c.id }; updateProps(true); setHint(); }
    e.preventDefault(); return;
  }
  if (comp) { const c = compById(+comp.dataset.comp); drag = { kind: 'move', c, ox: pt.x - c.x, oy: pt.y - c.y, moved: false, riders: TYPES[c.type].breadboard ? ridersOf(c) : [] }; svg.setPointerCapture(e.pointerId); select({ kind: 'comp', id: c.id }); return; }
  if (wire) { select({ kind: 'wire', id: +wire.dataset.wire }); return; }
  if (sel) select(null);
});
svg.addEventListener('pointermove', e => {
  const pt = svgPt(e);
  if (drawing) { drawing.cur = pt; renderWires(); }
  if (!drag) return;
  if (drag.kind === 'move') {
    const nx = clamp(snap(pt.x - drag.ox), 20, BRD.canvasW - 20), ny = clamp(snap(pt.y - drag.oy), 20, 680);
    if (nx !== drag.c.x || ny !== drag.c.y) {
      for (const r of drag.riders) { r.x += nx - drag.c.x; r.y += ny - drag.c.y; q(`[data-comp="${r.id}"]`).setAttribute('transform', `translate(${r.x},${r.y}) rotate(${r.rot})`); } // lo que está enchufado se mueve con la protoboard
      drag.c.x = nx; drag.c.y = ny; drag.moved = true; q(`[data-comp="${drag.c.id}"]`).setAttribute('transform', `translate(${nx},${ny}) rotate(${drag.c.rot})`); renderTerms(); renderWires();
    }
  } else if (drag.kind === 'joy') {
    const c = drag.c; let [lx, ly] = rot(pt.x - c.x, pt.y - c.y, -c.rot); lx += 4;
    let x = lx / 18, y = -ly / 18; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    c.props.x = clamp(x, -1, 1); c.props.y = clamp(y, -1, 1); elecDirty = true; dispDirty = true;
  } else if (drag.kind === 'pot') { drag.c.props.pos = clamp(drag.pos + ((drag.y - pt.y) + (pt.x - drag.x)) / 160, 0, 1); elecDirty = true; dispDirty = true; const r = $('#pPos'); if (r) r.value = Math.round(drag.c.props.pos * 1000); }
});
const endDrag = () => { if (!drag) return; if (drag.kind === 'boot') { bootPressed = false; elecDirty = true; dispDirty = true; drag = null; return; } if (drag.kind === 'btn' && !drag.c.props.latch) setPressed(drag.c, false);
  if (drag.kind === 'key') pressKey(drag.c, -1);
  if (drag.kind === 'joy') { drag.c.props.x = 0; drag.c.props.y = 0; elecDirty = true; dispDirty = true; } // el resorte lo centra
  if (drag.kind === 'joybtn') { drag.c.props.pressed = false; elecDirty = true; dispDirty = true; }
  if (drag.kind === 'move' && drag.moved && state.comps.some(c => TYPES[c.type].breadboard)) { structChanged(); dispDirty = true; } /* conexiones por protoboard */ if (drag.kind !== 'btn') scheduleSave(); drag = null; };
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('wheel', e => { const k = e.target.closest('[data-ctrl="pot"]'); if (!k) return; e.preventDefault(); const c = compById(+k.dataset.id); c.props.pos = clamp(c.props.pos - Math.sign(e.deltaY) * 0.03, 0, 1); elecDirty = true; dispDirty = true; scheduleSave(); }, { passive: false });

function pickWireColor(a, b){ const s = a + b; if (/GND|:gnd|:VSS|:K\b/.test(s)) return '#212121'; if (/5V|3V3|IOREF|VIN|:vcc|:VCC|:VDD/.test(s)) return '#e53935'; return ['#2e7d32', '#f9a825', '#1565c0', '#ef6c00', '#8e24aa'][state.wires.length % 5]; }
function deleteSel(){
  if (!sel) return;
  if (sel.kind === 'wire') state.wires = state.wires.filter(w => w.id !== sel.id);
  else { const pre = `C${sel.id}:`; state.comps = state.comps.filter(c => c.id !== sel.id); state.wires = state.wires.filter(w => !w.a.startsWith(pre) && !w.b.startsWith(pre)); lcdModels.delete(sel.id); }
  sel = null; structChanged(); renderComps(); updateProps(true); setHint();
}
function ridersOf(bb){ // componentes con alguna pata en un agujero de esta protoboard
  const pos = new Set(Object.keys(TYPES[bb.type].terms).map(t => { const p = termPos(`C${bb.id}:${t}`); return `${Math.round(p.x)},${Math.round(p.y)}`; }));
  return state.comps.filter(c => c !== bb && !TYPES[c.type].breadboard && Object.keys(TYPES[c.type].terms).some(t => { const p = termPos(`C${c.id}:${t}`); return pos.has(`${Math.round(p.x / 10) * 10},${Math.round(p.y / 10) * 10}`); }));
}
function rotateSel(){ if (!sel || sel.kind !== 'comp') return; const c = compById(sel.id); c.rot = (c.rot + 90) % 360; structChanged(); renderComps(); }
$('#del').onclick = deleteSel; $('#rotate').onclick = rotateSel;
document.addEventListener('keydown', e => {
  if (e.target.closest('textarea,input,select,.cm-editor')) return;
  if (e.key === 'Escape') { if (drawing) { drawing = null; renderWires(); } else select(null); setHint(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSel(); }
  if ((e.key === 'r' || e.key === 'R') && sel) rotateSel();
});
$('#props').addEventListener('click', e => {
  const b = e.target.closest('[data-act],[data-wcolor]'); if (!b) return;
  if (b.dataset.act === 'del') deleteSel();
  else if (b.dataset.act === 'rot') rotateSel();
  else if (b.dataset.wcolor) { const w = state.wires.find(w => w.id === sel.id); w.color = b.dataset.wcolor; renderWires(); updateProps(true); scheduleSave(); }
});
$('#props').addEventListener('change', e => { if (e.target.dataset.ctl && sel && sel.kind === 'comp') renderComps(); });
$('#props').addEventListener('input', e => {
  if (!sel || sel.kind !== 'comp') return; const c = compById(sel.id); const id = e.target.id; const v = e.target.value;
  if (id === 'pColor') { c.props.color = v; renderComps(); }
  if (id === 'pOhms' || id === 'pOhmsN') { const n = Math.round(+v); if (n >= 1 && n <= 1e7) { c.props.ohms = n; renderComps(); if (id === 'pOhms') { const nn = $('#pOhmsN'); if (nn) nn.value = n; } } }
  if (id === 'pPotOhms') { c.props.ohms = +v; renderComps(); }
  if (id === 'pPos') c.props.pos = +v / 1000;
  if (id === 'pLatch') { c.props.latch = e.target.checked; setPressed(c, false); renderComps(); }
  if (id === 'pBounce') c.props.bounce = e.target.checked;
  if (id === 'pLux') { c.props.lux = Math.pow(10, +v / 1000 * 5) - 1; const lbl = q(`[data-comp="${c.id}"] .clabel`); if (lbl) lbl.textContent = `${c.name} · ${Math.round(c.props.lux)} lx`; }
  if (id === 'pAddr') { c.props.address = +v; renderComps(); mapDevices(); }
  const dp = e.target.dataset.prop;
  if (dp) {
    const k = (TYPES[c.type].controls || []).find(k => k.prop === dp);
    if (e.target.type === 'checkbox') c.props[dp] = e.target.checked;
    else if (k || e.target.dataset.num) c.props[dp] = +v; else c.props[dp] = v;
    if (k) { const o = q(`[data-out="${dp}"]`); if (o) o.textContent = ctrlText(k, c.props[dp]); }
    else { renderComps(); mapDevices(); }
  }
  elecDirty = true; dispDirty = true; scheduleSave();
});

/* ======================= Biblioteca de componentes ======================= */
function renderLibrary(){
  const qy = $('#search').value.trim().toLowerCase(); let h = '';
  for (const cat of LIBRARY) {
    const items = cat.items.map(it => typeof it === 'string' ? { type: it, name: TYPES[it].label } : it).filter(it => !qy || it.name.toLowerCase().includes(qy) || cat.cat.toLowerCase().includes(qy));
    if (!items.length) continue;
    h += `<div class="cat"><h3>${cat.cat}</h3><div class="items">` + items.map(it => it.soon
      ? `<div class="item soon" title="Próximamente"><svg viewBox="0 0 44 34" aria-hidden="true"><rect x="6" y="5" width="32" height="24" rx="4" fill="none" stroke="currentColor" stroke-dasharray="3 3"/></svg><span>${it.name}</span><em>próximamente</em></div>`
      : `<button type="button" class="item" draggable="true" data-add="${it.type}">${icon(it.type)}<span>${it.name}</span></button>`).join('') + `</div></div>`;
  }
  $('#library').innerHTML = h || '<p class="note">Ningún componente coincide con la búsqueda.</p>';
}
$('#search').addEventListener('input', renderLibrary);
$('#library').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) addComp(b.dataset.add); });
$('#library').addEventListener('dragstart', e => { const b = e.target.closest('[data-add]'); if (b) { e.dataTransfer.setData('text/plain', b.dataset.add); e.dataTransfer.effectAllowed = 'copy'; } });
$('#stage').addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
$('#stage').addEventListener('drop', e => { e.preventDefault(); const t = e.dataTransfer.getData('text/plain'); if (TYPES[t]) { const p = svgPt(e); addComp(t, snap(p.x), snap(p.y)); } });
function addComp(type, x, y){
  if (x === undefined) {
    const ox = BRD.canvasW - 1100;
    const spots = [[720, 110], [860, 110], [1000, 110], [720, 300], [880, 300], [1000, 300], [720, 470], [880, 470], [1000, 470], [660, 620], [840, 620]].map(([sx, sy]) => [sx + ox, sy]);
    const free = spots.find(([sx, sy]) => !state.comps.some(c => Math.abs(c.x - sx) < 80 && Math.abs(c.y - sy) < 80)) || [640 + ox + Math.random() * 380 | 0, 80 + Math.random() * 500 | 0];
    [x, y] = free.map(snap);
  }
  state.counters[type] = (state.counters[type] || 0) + 1;
  const c = { id: state.nextId++, type, x, y, rot: 0, name: TYPES[type].prefix + state.counters[type], props: TYPES[type].props() };
  state.comps.push(c); structChanged(); select({ kind: 'comp', id: c.id });
}

/* ======================= Editor de código ======================= */
const hl = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syn-kw)', fontWeight: '500' },
  { tag: [tags.typeName, tags.standard(tags.typeName)], color: 'var(--syn-type)' },
  { tag: [tags.number, tags.bool], color: 'var(--syn-num)' },
  { tag: [tags.string, tags.character], color: 'var(--syn-str)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--syn-pre)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syn-fn)' },
  { tag: tags.macroName, color: 'var(--syn-pre)' },
]);
const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--code-bg)', color: 'var(--ink)', fontSize: '13px' },
  '.cm-content': { fontFamily: 'var(--f-code)', caretColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--gutter)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' }, '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)' },
});
let liveTimer = 0;
const editor = new EditorView({
  parent: $('#editor'),
  extensions: [basicSetup, cpp(), syntaxHighlighting(hl), editorTheme, lintGutter(), keymap.of([indentWithTab, { key: 'Mod-Enter', run: () => { compileAndRun(); return true; } }]),
    EditorView.updateListener.of(u => { if (u.docChanged) onCodeChange(); })],
});
function onCodeChange(){
  state.code = editor.state.doc.toString(); scheduleSave(); $('#codeState').textContent = '· sin compilar';
  clearTimeout(liveTimer);
  if ($('#live').checked && running) liveTimer = setTimeout(() => compileAndRun(true), 1200);
}
function setCode(code){ editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } }); }

/* ======================= Compilación ======================= */
let compileSeq = 0;
async function compileAndRun(fromLive){
  const seq = ++compileSeq; const code = editor.state.doc.toString();
  setStatus('busy');
  const libs = (await listLibraries()).filter(l => l.enabled).map(l => ({ name: l.name, files: l.files }));
  let res;
  try {
    const r = await fetch('api/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketch: code, libraries: libs, board: BRD.id }) });
    res = await r.json();
  } catch (e) { res = { ok: false, diagnostics: [{ line: 0, type: 'error', message: String(e), es: 'No se pudo contactar con el servidor de compilación.' }] }; }
  if (seq !== compileSeq) return;
  showDiagnostics(res);
  if (!res.ok) { setStatus(running ? 'run' : 'error', running ? 'Simulando (código anterior)' : 'Error de compilación'); return; }
  $('#codeState').textContent = '· compilado';
  const prevSerial = fromLive;
  if (!prevSerial) serialEl.textContent = ''; else serialAppend('\n— reiniciado con el código nuevo —\n');
  startSim(res.hex);
}
function showDiagnostics(res){
  const box = $('#err'), info = $('#buildInfo');
  const diags = (res.diagnostics || []).filter(d => d.type !== 'note');
  if (res.ok) {
    box.hidden = true;
    const s = res.size; const libs = (res.libraries || []).map(l => l.name).join(', ');
    info.textContent = `Programa: ${s.flash.toLocaleString('es')} bytes (${Math.round(s.flash / s.flashMax * 100)} % de la flash) · Variables: ${s.ram.toLocaleString('es')} bytes (${Math.round(s.ram / s.ramMax * 100)} % de la RAM)${libs ? ' · Librerías: ' + libs : ''}${res.cached ? ' · en caché' : ''}`;
    info.hidden = false;
  } else {
    info.hidden = true;
    box.innerHTML = diags.slice(0, 8).map(d => `<div class="diag"><button type="button" class="lnk" data-line="${d.file === 'sketch.ino' ? d.line : 0}">${d.file && d.line ? esc(d.file) + ':' + d.line : 'Error'}</button> ${esc(d.es || d.message)}${d.es && d.es !== d.message ? `<small>${esc(d.message)}</small>` : ''}</div>`).join('') || 'Error desconocido al compilar.';
    box.hidden = false;
    $('#codeState').textContent = '· con errores';
  }
  const doc = editor.state.doc;
  editor.dispatch(setDiagnostics(editor.state, diags.filter(d => d.file === 'sketch.ino' && d.line >= 1 && d.line <= doc.lines).map(d => {
    const ln = doc.line(d.line); const from = Math.min(ln.to, ln.from + Math.max(0, (d.col || 1) - 1));
    return { from, to: Math.max(from, ln.to), severity: d.type === 'warning' ? 'warning' : 'error', message: d.es || d.message };
  })));
}
$('#err').addEventListener('click', e => { const b = e.target.closest('[data-line]'); if (!b || !+b.dataset.line) return; const ln = editor.state.doc.line(+b.dataset.line); editor.dispatch({ selection: { anchor: ln.from }, scrollIntoView: true }); editor.focus(); });
$('#run').onclick = () => running ? stopSim() : compileAndRun();
$('#reset').onclick = () => { if (hexLoaded) { serialAppend('\n— reinicio —\n'); startSim(); } else compileAndRun(); };

/* ======================= Monitor serie ======================= */
function serialAppend(s){
  let t = serialEl.textContent + s; if (t.length > 20000) t = t.slice(-16000);
  serialEl.textContent = t; if ($('#autoscroll').checked) serialEl.scrollTop = serialEl.scrollHeight;
}
$('#clr').onclick = () => { serialEl.textContent = ''; };
$('#serialForm').addEventListener('submit', e => {
  e.preventDefault(); const v = $('#serialIn').value + ($('#nl').checked ? '\n' : '');
  if (uno) { uno.serialWrite([...new TextEncoder().encode(v)]); rxFlash = performance.now(); }
  $('#serialIn').value = '';
});

/* ======================= Navegador (WiFi simulado del ESP32) ======================= */
function updateWebPanel(){
  const show = !!(esp && (esp.wifi || esp.ap || esp.port));
  if ($('#webPanel').hidden === show) $('#webPanel').hidden = !show;
  if (!esp) return;
  const w = esp.wifi, st = [];
  if (w) st.push(w.connected ? `conectado a «${w.ssid}» · IP 192.168.1.50` : `conectando a «${w.ssid}»…`);
  if (esp.ap) st.push(`punto de acceso «${esp.ap}» · 192.168.4.1`);
  if (esp.port) st.push(`servidor en el puerto ${esp.port}`);
  for (const e of esp.events.splice(0)) serialAppend(`\n[${e}]\n`);
  $('#wifiState').textContent = st.join(' · ');
}
function webShow(html){ $('#webView').srcdoc = PAGE_SHIM + html; }
function webResolve(href){ try { const u = new URL(href || '/', 'http://h' + webPath); return u.pathname + u.search; } catch { return '/'; } }
function webGo(href, method = 'GET', body = ''){
  if (!esp || !running) { webShow('<p style="font:14px sans-serif;color:#666">Inicia la simulación para ver las páginas del ESP32.</p>'); return; }
  const path = webResolve(href); $('#webUrl').value = `http://${esp.host()}${path}`;
  esp.request(method, path, body, r => {
    if (r.timeout) { webShow(`<p style="font:14px sans-serif;color:#a33">El ESP32 no respondió a <b>${esc(path)}</b>.<br>¿Llamas a <code>server.handleClient()</code> en <code>loop()</code> y no hay un <code>delay()</code> largo?</p>`); return; }
    if (r.status >= 300 && r.status < 400 && r.headers.location) { webGo(r.headers.location); return; }
    webPath = path.split('?')[0];
    if (/^image\//.test(r.type)) webShow(`<body style="margin:0;background:#111;display:grid;place-items:center;height:100vh"><img src="${imageOf(r)}" style="max-width:100%"></body>`);
    else if (/html/.test(r.type)) webShow(r.body);
    else webShow(`<pre style="font:13px ui-monospace,monospace;white-space:pre-wrap;margin:8px">${esc(r.body)}</pre>`);
  });
}
// La cámara simulada no tiene imagen real: el cuadro que entrega esp_camera_fb_get() lleva la resolución y el
// número de foto, y aquí se dibuja una escena de prueba con esos datos.
function imageOf(r){
  const m = /BANCOCAM:(\d+):(\d+):(\d+):(\d+)/.exec(r.body || '');
  return m ? cameraFrame(+m[1], +m[2], +m[3], +m[4]) : cameraFrame(320, 240, 0, 0);
}
function cameraFrame(W, H, n, flags){
  const k = Math.min(1, 640 / W), w = Math.round(W * k), h = Math.round(H * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.save(); if (flags & 2) { g.translate(w, 0); g.scale(-1, 1); } if (flags & 1) { g.translate(0, h); g.scale(1, -1); }
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#6fa8dc'); sky.addColorStop(0.62, '#cfe2f3'); sky.addColorStop(0.62, '#7a9a5a'); sky.addColorStop(1, '#4f6b3a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const t = (n || 0) * 0.35;
  g.fillStyle = '#ffd966'; g.beginPath(); g.arc(w * (0.15 + 0.7 * ((Math.sin(t) + 1) / 2)), h * 0.2, h * 0.08, 0, 7); g.fill();
  g.fillStyle = '#b45f06'; g.fillRect(w * 0.55, h * 0.38, w * 0.25, h * 0.26); g.fillStyle = '#990000'; g.beginPath(); g.moveTo(w * 0.52, h * 0.39); g.lineTo(w * 0.675, h * 0.24); g.lineTo(w * 0.83, h * 0.39); g.fill();
  g.fillStyle = '#3d2b1f'; g.fillRect(w * 0.64, h * 0.5, w * 0.07, h * 0.14);
  g.fillStyle = '#38761d'; g.beginPath(); g.arc(w * 0.25, h * 0.45, h * 0.13, 0, 7); g.fill(); g.fillStyle = '#5b3a1e'; g.fillRect(w * 0.24, h * 0.5, w * 0.02, h * 0.13);
  g.restore();
  const f = Math.max(10, Math.round(h / 16)); g.font = `${f}px monospace`; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h - f * 1.8, w, f * 1.8);
  g.fillStyle = '#fff'; g.fillText(`Cámara simulada · ${W}×${H}${n ? ' · foto ' + n : ''} · ${new Date().toLocaleTimeString()}`, f * 0.6, h - f * 0.6);
  return cv.toDataURL('image/jpeg', 0.85);
}
window.addEventListener('message', e => {
  const d = e.data; if (!d || e.source !== $('#webView').contentWindow) return;
  if (d.banco === 'nav') webGo(d.href, d.method, d.body);
  if (d.banco === 'img') {
    const reply = m => $('#webView').contentWindow.postMessage({ banco: 'img', id: d.id, ...m }, '*');
    if (!esp || !running) { reply({}); return; }
    esp.request('GET', webResolve(d.href), '', r => reply(!r.timeout && r.status === 200 && /^image\//.test(r.type) ? { src: imageOf(r) } : {}));
  }
  if (d.banco === 'fetch') {
    const reply = m => $('#webView').contentWindow.postMessage({ banco: 'resp', id: d.id, ...m }, '*');
    if (!esp || !running) { reply({ error: 'sin conexión' }); return; }
    esp.request(d.method, webResolve(d.href), d.body, r => r.timeout ? reply({ error: 'tiempo agotado' }) : reply({ status: r.status, headers: r.headers, body: r.body }));
  }
});
$('#webForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#webUrl').value.replace(/^https?:\/\/[^/]*/, '') || '/'; webGo(v); });

/* ======================= Celular (Bluetooth HC-05) ======================= */
// ESP32: BluetoothSerial usa el mismo panel que el HC-05
const espBt = { c: { name: 'ESP32', props: { baud: 'Bluetooth' } }, get rxText(){ return esp ? esp.btText : ''; }, set rxText(v){ if (esp) esp.btText = v; },
  send(t){ if (!esp || !esp.bt || !uno || !running) return false; uno.serialWrite([...new TextEncoder().encode(t)], 1); rxFlash = performance.now(); return true; } };
function btDev(){ if (esp && esp.bt) { espBt.c.name = `ESP32 «${esp.bt}»`; return espBt; } const c = state.comps.find(c => c.type === 'hc05'); return c ? simDevs.get(c.id) : null; }
function updateBtPanel(){
  const d = btDev(); const panel = $('#btPanel');
  if (panel.hidden === !!d) { panel.hidden = !d; if (d) $('#btName').textContent = `${d.c.name} · ${d.c.props.baud} baudios`; }
  if (d && d.rxText) { btAppend(d.rxText); d.rxText = ''; }
}
function btAppend(s){ const el = $('#btOut'); let t = el.textContent + s; if (t.length > 8000) t = t.slice(-6000); el.textContent = t; el.scrollTop = el.scrollHeight; }
$('#btClr').onclick = () => { $('#btOut').textContent = ''; };
$('#btForm').addEventListener('submit', e => {
  e.preventDefault(); const d = btDev(); if (!d) return;
  const v = $('#btIn').value + ($('#btNl').checked ? '\n' : '');
  if (!d.send(v)) { btAppend('\n[no se envió: inicia la simulación, alimenta el módulo y conecta TXD a un pin del Arduino]\n'); return; }
  $('#btIn').value = '';
});

/* ======================= Pestañas y librerías ======================= */
for (const t of document.querySelectorAll('[data-tab]')) t.addEventListener('click', () => {
  for (const o of document.querySelectorAll('[data-tab]')) o.setAttribute('aria-selected', o === t);
  $('#codeView').hidden = t.dataset.tab !== 'code'; $('#libView').hidden = t.dataset.tab !== 'libs'; $('#aiView').hidden = t.dataset.tab !== 'ai'; $('.side').classList.toggle('ai-on', t.dataset.tab === 'ai');
  if (t.dataset.tab === 'libs') renderLibs();
});
let builtinLibs = null;
async function renderLibs(){
  const mine = await listLibraries();
  $('#myLibs').innerHTML = mine.length ? mine.map(l => `<li><label class="check"><input type="checkbox" data-lib-toggle="${esc(l.name)}" ${l.enabled ? 'checked' : ''}> <b>${esc(l.name)}</b> ${l.version ? `<span class="ver">${esc(l.version)}</span>` : ''}</label><code>${l.headers.map(h => '#include &lt;' + esc(h) + '&gt;').join(' ')}</code><span class="meta">${Object.keys(l.files).length} archivos</span><button type="button" class="btn small danger" data-lib-del="${esc(l.name)}">Quitar</button></li>`).join('')
    : '<li class="empty">Todavía no cargaste ninguna librería. Sube el .zip tal como lo descargas de GitHub o del sitio del fabricante.</li>';
  $('#libCount').textContent = mine.length ? `(${mine.length})` : '';
  if (!builtinLibs) { try { builtinLibs = await (await fetch('api/libraries')).json(); } catch { builtinLibs = []; } }
  $('#builtinLibs').innerHTML = builtinLibs.map(l => `<li><b>${esc(l.name)}</b> ${l.version ? `<span class="ver">${esc(l.version)}</span>` : ''}<code>${l.headers.map(h => '&lt;' + esc(h) + '&gt;').join(' ')}</code></li>`).join('');
}
function libMsg(t, bad){ const m = $('#libMsg'); m.textContent = t; m.className = 'libmsg' + (bad ? ' bad' : ''); m.hidden = !t; }
$('#zipIn').addEventListener('change', async e => {
  for (const f of e.target.files) { try { const lib = await importZip(f); await saveLibrary(lib); libMsg(`Librería ${lib.name} cargada (${lib.headers.join(', ')}).`); } catch (err) { libMsg(`${f.name}: ${err.message}`, true); } }
  e.target.value = ''; renderLibs();
});
$('#filesIn').addEventListener('change', async e => {
  try { const lib = await importFiles(e.target.files, $('#libName').value.trim()); await saveLibrary(lib); libMsg(`Librería ${lib.name} cargada (${lib.headers.join(', ')}).`); } catch (err) { libMsg(err.message, true); }
  e.target.value = ''; renderLibs();
});
$('#myLibs').addEventListener('click', async e => {
  const d = e.target.closest('[data-lib-del]'); if (d) { await deleteLibrary(d.dataset.libDel); libMsg(''); renderLibs(); }
});
$('#myLibs').addEventListener('change', async e => {
  const t = e.target.closest('[data-lib-toggle]'); if (!t) return;
  const lib = (await listLibraries()).find(l => l.name === t.dataset.libToggle); if (lib) { lib.enabled = t.checked; await saveLibrary(lib); }
});

/* ======================= Guardado local y ejemplos ======================= */
const SAVE_KEY = 'banco-uno-v2'; let saveTimer = 0;
function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state, (k, v) => k.startsWith('_') ? undefined : v)); } catch {} }, 400); }
function loadState(){ try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && Array.isArray(s.comps) && typeof s.code === 'string') return s; } catch {} return null; }
function exampleState(name){ const ex = EXAMPLES[name]; const c = ex.build(); return { board: ex.board || 'uno', code: ex.code, comps: c.comps, wires: c.wires, counters: c.counters, nextId: 100 }; }
function applyState(s, run = true){
  stopSim(); lcdModels.clear(); servoAngles.clear(); bounceQueue = [];
  state = s; if (!BOARDS[state.board]) state.board = 'uno'; setBoard(state.board);
  state.wires = state.wires.filter(w => [w.a, w.b].every(k => !k.startsWith('B:') || BPIN[k.slice(2)]));
  for (const c of state.comps) if (c.type === 'btn') c.props.contact = c.props.pressed = false;
  sel = null; drawing = null; setCode(state.code); structChanged(); renderComps(); updateProps(true); setHint();
  serialEl.textContent = ''; $('#err').hidden = true; $('#buildInfo').hidden = true;
  if (run) compileAndRun();
}
const exSel = $('#example');
exSel.innerHTML = '<option value="">Cargar ejemplo…</option>' + Object.entries(EXAMPLES).map(([k, v]) => `<option value="${k}">${v.title}</option>`).join('');
$('#boardSel').innerHTML = Object.values(BOARDS).map(b => `<option value="${b.id}">${b.name}</option>`).join('');
$('#boardSel').addEventListener('change', e => {
  const id = e.target.value; if (id === state.board) return;
  const lost = state.wires.filter(w => [w.a, w.b].some(k => k.startsWith('B:') && !BOARDS[id].terms[k.slice(2)])).length;
  applyState({ ...state, board: id });
  if (lost) setHint(`Se quitaron ${lost} cable${lost > 1 ? 's' : ''} conectado${lost > 1 ? 's' : ''} a pines que el ${BOARDS[id].name} no tiene.`);
});
/* Descarga del sketch como .ino (el IDE de Arduino lo abre y pide crear su carpeta) */
function sketchName(code){
  const m = code.match(/^\s*\/\/\s*(.+)$/m);
  const base = (m ? m[1] : 'sketch').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return (/^[A-Za-z]/.test(base) ? base : 'sketch_' + base).replace(/_$/, '') || 'sketch';
}
function downloadIno(){
  const code = editor.state.doc.toString();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
  a.download = sketchName(code) + '.ino';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#download').addEventListener('click', downloadIno);
exSel.addEventListener('change', e => { if (e.target.value) { applyState(exampleState(e.target.value)); e.target.value = ''; } });

/* ======================= Arranque ======================= */
renderLibrary();
applyState(loadState() || exampleState('completo'));
initAI({ TYPES, BOARDS, getState: () => state, applyState, wireColor: (a, b, i) => { const s = a + b; if (/GND|:gnd|:VSS|:K\b/.test(s)) return '#212121'; if (/5V|3V3|IOREF|VIN|:vcc|:VCC|:VDD/.test(s)) return '#e53935'; return ['#2e7d32', '#f9a825', '#1565c0', '#ef6c00', '#8e24aa'][i % 5]; } });
requestAnimationFrame(t => { lastFrame = t; requestAnimationFrame(frame); });
window.__banco = { TYPES, get state(){ return state; }, simDevs, refresh: () => { elecDirty = true; dispDirty = true; }, btSend: t => { const d = btDev(); return d ? d.send(t) : false; }, get uno(){ return uno; }, io, lcdModels, servoAngles, compileAndRun, applyState, exampleState, get display(){ return display; }, setPressed, pressKey, listLibraries, saveLibrary };
