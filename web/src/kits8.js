// Tanda 5b: sensor de color TCS3200, acelerómetro y giroscopio MPU6050 (GY-521), pantalla TFT
// SPI de 2,2" (ILI9341), motor amarillo con reductora, servo MG996R y piezas del «Arduino casero»
// (cristal de cuarzo, tiras de pines macho y hembra, borneras).
import { PinState } from './emulator.js';
import { header, pcb, hole, smdLed, glowAttr, tiny, label, fmt } from './modules.js';
import { setOut } from './kits7.js';

const MS = 16000;
const isHigh = (api, t) => { const p = api.pin(t); return p >= 0 ? api.state(p) === PinState.High : api.volts(t, 'GND') > 2.5; };

/* =========================================================================
   Sensor de color TCS3200 / TCS230
   ========================================================================= */
const TCL = header(['S0', 'S1', 'OE', 'GND'], { x0: -62, y0: -21, dir: 'left', len: 14, labels: { S0: 'S0 (escala de frecuencia)', S1: 'S1 (escala de frecuencia)', OE: 'OE (LOW = salida activa)', GND: 'GND' } });
const TCR = header(['S3', 'S2', 'OUT', 'VCC'], { x0: 62, y0: -21, dir: 'right', len: 14, labels: { S3: 'S3 (filtro de color)', S2: 'S2 (filtro de color)', OUT: 'OUT (onda cuadrada)', VCC: 'VCC (5 V)' } });
const FILTERS = { '00': 'rojo', '01': 'azul', '10': 'sin filtro', '11': 'verde' };
function tcsFreq(c, api){
  const s0 = isHigh(api, 'S0'), s1 = isHigh(api, 'S1');
  const scale = s0 && s1 ? 1 : s0 ? 0.2 : s1 ? 0.02 : 0;
  const f = (isHigh(api, 'S2') ? 1 : 0) + '' + (isHigh(api, 'S3') ? 1 : 0);
  const { r, g, b } = c.props, light = c.props.leds ? 1 : 0.35;
  const ch = { '00': r, '01': b, '11': g, '10': (r + g + b) / 3 * 1.15 }[f] / 255;
  return { scale, filter: f, hz: scale * (600 + 120000 * ch * light) };
}
function tcsDevice(c, api){
  let gen = 0;
  const tick = my => {
    if (my !== gen || !api.running()) return;
    const en = api.powered('VCC', 'GND', 2.7) && !isHigh(api, 'OE');
    const { hz } = en ? tcsFreq(c, api) : { hz: 0 };
    c._en = en && hz > 0;
    if (!c._en) { if (c._out !== undefined) { c._out = undefined; api.drive(); } api.schedule(api.now() + 0.5 * MS, () => tick(my)); return; }
    setOut(c, api, 'OUT', '_out', c._out ? 0 : 1); c._hz = hz;
    api.schedule(api.now() + Math.max(40, 8e6 / hz), () => tick(my));
  };
  return {
    reset(){ gen++; c._out = undefined; c._en = false; const my = gen; api.schedule(api.now() + 16, () => tick(my)); },
  };
}

/* =========================================================================
   MPU6050 (GY-521): acelerómetro y giroscopio por I2C
   ========================================================================= */
const MPU = header(['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'], { x0: -50, y0: -49, dir: 'left', len: 14,
  labels: { VCC: 'VCC (3,3–5 V)', GND: 'GND', SCL: 'SCL (A5; 21 en el Mega)', SDA: 'SDA (A4; 20 en el Mega)', XDA: 'XDA (I2C auxiliar)', XCL: 'XCL (I2C auxiliar)', AD0: 'AD0 (LOW: 0x68 · HIGH: 0x69)', INT: 'INT (interrupción)' } });
const s16 = v => { v = Math.round(v); return Math.max(-32768, Math.min(32767, v)); };
function mpuDevice(c, api){
  const R = new Uint8Array(128); let ptr = 0, first = false;
  const init = () => { R.fill(0); R[0x6B] = 0x40; R[0x75] = 0x68; };
  init();
  const sample = () => {
    const d = Math.PI / 180, roll = c.props.roll * d, pitch = c.props.pitch * d;
    const afs = (R[0x1C] >> 3) & 3, gfs = (R[0x1B] >> 3) & 3;
    const a = [-Math.sin(pitch), Math.sin(roll) * Math.cos(pitch), Math.cos(roll) * Math.cos(pitch)].map(g => s16(g * (16384 >> afs) + (c.props.noise ? (Math.random() - 0.5) * 60 : 0)));
    const t = s16((c.props.temp - 36.53) * 340);
    const g = [c.props.gx, c.props.gy, c.props.gz].map(v => s16(v * 131 / (1 << gfs) + (c.props.noise ? (Math.random() - 0.5) * 8 : 0)));
    const out = []; for (const v of [...a, t, ...g]) out.push((v >> 8) & 255, v & 255);
    return out;
  };
  let snap = null;
  const read = r => {
    if (r >= 0x3B && r <= 0x48) { if (r === 0x3B || !snap) snap = (R[0x6B] & 0x40) ? new Array(14).fill(0) : sample(); return snap[r - 0x3B]; }
    if (r === 0x3A) return 0x01;
    return R[r];
  };
  const write = (r, v) => {
    if (r === 0x6B && (v & 0x80)) { init(); return; }
    if (r === 0x75 || r === 0x3A || (r >= 0x3B && r <= 0x60)) return;
    R[r] = v;
  };
  return {
    i2c: {
      get address(){ return api.volts('AD0', 'GND') > 1.6 ? 0x69 : 0x68; },
      ready: () => api.powered('VCC', 'GND', 2.8) && api.node('SDA') === api.boardNode(api.board().i2c.sda) && api.node('SCL') === api.boardNode(api.board().i2c.scl),
      begin(w){ first = w; if (!w) snap = null; },
      write(b){ if (first) { ptr = b & 0x7F; first = false; } else { write(ptr, b); ptr = (ptr + 1) & 0x7F; } },
      read(){ const v = read(ptr); ptr = (ptr + 1) & 0x7F; return v; },
    },
    reset(){ init(); ptr = 0; },
    get asleep(){ return !!(R[0x6B] & 0x40); },
  };
}
function horizon(c){ // indicador de actitud (rolido y cabeceo)
  const p = Math.max(-60, Math.min(60, c.props.pitch)) * 0.35;
  return `<g transform="translate(54 0)"><clipPath id="hz${c.id}"><circle r="24"/></clipPath><g clip-path="url(#hz${c.id})"><g data-hz="${c.id}" transform="rotate(${-c.props.roll}) translate(0 ${p})"><rect x="-60" y="-80" width="120" height="80" fill="#4a90d9"/><rect x="-60" y="0" width="120" height="80" fill="#a8743c"/><line x1="-60" y1="0" x2="60" y2="0" stroke="#fff" stroke-width="1.5"/></g></g>` +
    `<circle r="24" fill="none" stroke="#222" stroke-width="3"/><path d="M-12 0 h8 l4 4 l4 -4 h8" stroke="#ffd21f" stroke-width="2" fill="none"/></g>`;
}

/* =========================================================================
   Pantalla TFT SPI 2,2" 240×320 (ILI9341)
   ========================================================================= */
const TFT = header(['VCC', 'GND', 'CS', 'RESET', 'DC', 'MOSI', 'SCK', 'LED', 'MISO'], { x0: -92, y0: -56, dir: 'left', len: 14,
  labels: { VCC: 'VCC (5 V; regulador a 3,3 V en el módulo)', GND: 'GND', CS: 'CS (selección)', RESET: 'RESET', DC: 'DC / RS (dato o comando)', MOSI: 'SDI (MOSI: 11; 51 en el Mega)', SCK: 'SCK (13; 52 en el Mega)', LED: 'LED (luz de fondo, a 3,3–5 V)', MISO: 'SDO (MISO, opcional)' },
  texts: { MOSI: 'SDI', MISO: 'SDO', RESET: 'RST', DC: 'D/C' } });
const W = 240, H = 320;
function tftDevice(c, api){
  let cmd = -1, args = [], xs = 0, xe = W - 1, ys = 0, ye = H - 1, x = 0, y = 0, hi = -1, csLow = false;
  const st = () => c._tft || (c._tft = { fb: new Uint8ClampedArray(W * H * 4).fill(255), ver: 0, mad: 0, on: false, sleep: true, inv: false });
  const hwReset = () => { const s = st(); s.mad = 0; s.on = false; s.sleep = true; s.inv = false; s.ver++; cmd = -1; xs = 0; xe = W - 1; ys = 0; ye = H - 1; };
  const pixel = v => {
    const s = st(), m = s.mad, mv = m & 0x20, mx = m & 0x40, my = m & 0x80;
    const a = mv ? y : x, b = mv ? x : y;
    const px = mx ? a : W - 1 - a, py = my ? H - 1 - b : b;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      let r = (v >> 11) & 31, g = (v >> 5) & 63, bl = v & 31; if (!(m & 0x08)) [r, bl] = [bl, r];
      const i = (py * W + px) * 4, f = s.fb; f[i] = r << 3 | r >> 2; f[i + 1] = g << 2 | g >> 4; f[i + 2] = bl << 3 | bl >> 2; f[i + 3] = 255; s.ver++;
    }
    if (++x > xe) { x = xs; if (++y > ye) y = ys; }
  };
  const command = b => {
    const s = st(); cmd = b; args = []; hi = -1;
    if (b === 0x01) { hwReset(); s.fb.fill(255); }
    else if (b === 0x11) s.sleep = false; else if (b === 0x10) s.sleep = true;
    else if (b === 0x29) s.on = true; else if (b === 0x28) s.on = false;
    else if (b === 0x20) s.inv = false; else if (b === 0x21) s.inv = true;
    else if (b === 0x2C) { x = xs; y = ys; }
    s.ver++;
  };
  const data = b => {
    const s = st();
    if (cmd === 0x2C || cmd === 0x3C) { if (hi < 0) hi = b; else { pixel(hi << 8 | b); hi = -1; } return; }
    args.push(b);
    if (cmd === 0x2A && args.length === 4) { xs = args[0] << 8 | args[1]; xe = args[2] << 8 | args[3]; }
    else if (cmd === 0x2B && args.length === 4) { ys = args[0] << 8 | args[1]; ye = args[2] << 8 | args[3]; }
    else if (cmd === 0x36 && args.length === 1) { s.mad = b; s.ver++; }
  };
  return {
    reset(){ hwReset(); st().fb.fill(255); },
    onPin(p, s){
      if (p === api.pin('RESET') && s === PinState.Low) { hwReset(); }
      if (p === api.pin('CS')) { const low = s === PinState.Low; if (low !== csLow) { csLow = low; hi = -1; } }
    },
    onSpi(b){
      const { mosi, sck } = api.board().spi;
      if (api.pin('MOSI') !== mosi || api.pin('SCK') !== sck || api.state(api.pin('CS')) !== PinState.Low) return undefined;
      if (!api.powered('VCC', 'GND', 3)) return 0;
      const dc = api.pin('DC'); if (dc < 0) return 0;
      if (api.state(dc) === PinState.Low) command(b); else data(b);
      c._act = performance.now(); return 0;
    },
  };
}

/* =========================================================================
   Tipos
   ========================================================================= */
const gpin = (x, y, x2, y2) => `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#c8b46a" stroke-width="3"/><rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#1a1a1a"/>`;
const HDR_MAX = 20;
const hdrTerms = () => { const t = {}; for (let i = 1; i <= HDR_MAX; i++) t['P' + i] = { x: (i - 1) * 20, y: -14, dx: 0, dy: -1, name: `Pin ${i}` }; return t; };
const COUNT = Array.from({ length: HDR_MAX }, (_, i) => [i + 1, `1×${i + 1}`]);
function headerType(female){
  return {
    label: female ? 'Tira de pines hembra' : 'Tira de pines macho', prefix: female ? 'J' : 'P', cat: 'Pasivos',
    terms: hdrTerms(), activeTerms: c => Array.from({ length: c.props.n }, (_, i) => 'P' + (i + 1)),
    box: c => [-10, -22, c.props.n * 20, 34], props: () => ({ n: 6 }), iconProps: () => ({ n: 4 }),
    options: [{ prop: 'n', label: 'Cantidad de pines', values: COUNT, num: true }],
    svg(c){
      const n = c.props.n; let s = `<rect x="-10" y="-10" width="${n * 20}" height="20" rx="2" fill="${female ? '#16171a' : '#1d1e21'}"/>`;
      for (let i = 0; i < n; i++) s += female ? `<rect x="${i * 20 - 4}" y="-4" width="8" height="8" fill="#000" stroke="#444"/><line x1="${i * 20}" y1="-10" x2="${i * 20}" y2="-14" stroke="#c8b46a" stroke-width="3"/>`
        : `<rect x="${i * 20 - 2.5}" y="-14" width="5" height="10" fill="#e0c060"/><rect x="${i * 20 - 2.5}" y="10" width="5" height="10" fill="#e0c060"/>`;
      return s + label(-12, 4, c.name, 'end');
    },
    elec(){},
    readout: c => `${c.props.n} pines de 2,54 mm. Cada pin es independiente: sirve para enchufar módulos o sacar cables.`,
  };
}
function bornera(){
  const t = {}; for (let i = 1; i <= 3; i++) { t['W' + i] = { x: (i - 1) * 24, y: -30, dx: 0, dy: -1, name: `Tornillo ${i} (cable)` }; t['P' + i] = { x: (i - 1) * 24, y: 26, dx: 0, dy: 1, name: `Pata ${i} (a la placa)` }; }
  return {
    label: 'Bornera 5,02 mm', prefix: 'X', cat: 'Pasivos',
    terms: t, activeTerms: c => Array.from({ length: c.props.n }, (_, i) => ['W' + (i + 1), 'P' + (i + 1)]).flat(),
    nets: c => Array.from({ length: c.props.n }, (_, i) => ['W' + (i + 1), 'P' + (i + 1)]),
    box: c => [-14, -32, c.props.n * 24 + 4, 62], props: () => ({ n: 2 }),
    options: [{ prop: 'n', label: 'Polos', values: [[2, '2 polos'], [3, '3 polos']], num: true }],
    svg(c){
      const n = c.props.n; let s = `<rect x="-12" y="-18" width="${n * 24}" height="36" rx="2" fill="#2d6a3e" stroke="#1d4a2a"/>`;
      for (let i = 0; i < n; i++) { const x = i * 24; s += `<circle cx="${x}" cy="-6" r="7" fill="#c9cdd1" stroke="#7d868b"/><line x1="${x - 5}" y1="-6" x2="${x + 5}" y2="-6" stroke="#555" stroke-width="2"/><rect x="${x - 6}" y="5" width="12" height="9" fill="#13311d"/>` + gpin(x, 18, x, 26) + `<line x1="${x}" y1="-13" x2="${x}" y2="-30" stroke="#c8b46a" stroke-width="2" stroke-dasharray="2 2"/>`; }
      return s + label(n * 24 - 6, -22, c.name, 'start');
    },
    elec(c, T, E){ for (let i = 1; i <= c.props.n; i++) E.res(T('W' + i), T('P' + i), 0.01); },
    readout: () => 'Bornera de tornillo de paso 5,02 mm: cada tornillo queda unido a su pata.',
  };
}
export const KITS8 = {
  tcs3200: {
    label: 'Sensor de color TCS3200 / TCS230', prefix: 'COL', cat: 'Sensores',
    terms: { ...TCL.terms, ...TCR.terms }, box: [-80, -68, 160, 122], props: () => ({ r: 220, g: 40, b: 40, leds: true }),
    controls: [{ prop: 'r', label: 'Objeto: rojo', min: 0, max: 255, step: 1 }, { prop: 'g', label: 'Objeto: verde', min: 0, max: 255, step: 1 }, { prop: 'b', label: 'Objeto: azul', min: 0, max: 255, step: 1 }],
    checks: [{ prop: 'leds', label: 'LEDs blancos del módulo encendidos' }],
    svg(c){
      let s = pcb(-48, -48, 96, 96, '#151617', '#000') + hole(-40, -40) + hole(40, 40);
      for (const [x, y] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) s += `<circle cx="${x}" cy="${y}" r="13" fill="#eef2f4" stroke="#b9c2c7" stroke-width="2" opacity=".9"/><circle data-tled="${c.id}" cx="${x}" cy="${y}" r="10" fill="#fffbe8" opacity="0" filter="url(#glowS)"/>`;
      s += `<rect x="-7" y="-7" width="14" height="14" fill="#3a2a1a"/><rect x="-4" y="-4" width="8" height="8" fill="#7a5a9a"/>` + tiny(0, 18, 'TCS3200', '#ccc', 'middle', 5.5);
      s += `<g data-swatch="${c.id}"><rect x="-30" y="52" width="60" height="12" rx="3" fill="rgb(${c.props.r},${c.props.g},${c.props.b})" stroke="#555"/></g>` + tiny(0, 61, 'objeto', '#fff', 'middle', 6);
      return s + TCL.svg + TCR.svg + label(0, -56, `${c.name} · <tspan data-tcs="${c.id}">color</tspan>`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), c.props.leds ? 180 : 2500); for (const t of ['S0', 'S1', 'S2', 'S3']) E.res(T(t), T('GND'), 100000); E.res(T('OE'), T('GND'), 100000);
      if (c._en && c._out !== undefined) E.src(T('OUT'), T('GND'), c._out ? Math.max(0, E.prev(T('VCC')) - E.prev(T('GND'))) : 0, 100);
    },
    device: tcsDevice,
    readout(c){
      const f = c._last; return `Objeto RGB(${c.props.r}, ${c.props.g}, ${c.props.b})${f ? `\nFiltro: ${FILTERS[f.filter]} · escala ${f.scale ? f.scale * 100 + ' %' : 'apagado'} · ${f.hz ? Math.round(f.hz) + ' Hz' : 'sin salida'}` : ''}\nS0/S1: escala (H/L = 20 %). S2/S3: L/L rojo, H/H verde, L/H azul. Mide con pulseIn(OUT, LOW): menos µs = más color.`;
    },
    render(c, k){
      const on = k.powered('VCC', 'GND', 2.7); for (const e of document.querySelectorAll(`[data-tled="${c.id}"]`)) e.setAttribute('opacity', on && c.props.leds ? 0.9 : 0);
      const sw = k.q(`[data-swatch="${c.id}"] rect`); if (sw) sw.setAttribute('fill', `rgb(${c.props.r},${c.props.g},${c.props.b})`);
      if (k.running) { const d = k.api(c); c._last = tcsFreq(c, d); const t = k.q(`[data-tcs="${c.id}"]`); if (t) t.textContent = c._en ? `filtro ${FILTERS[c._last.filter]} · ${Math.round(c._last.hz)} Hz` : 'salida apagada'; }
      if (k.running && !on) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
      else if (k.running && !k.wired('OE')) k.warn(`${c.name}: OE está suelto; conéctalo a GND para activar la salida.`);
    },
  },
  mpu6050: {
    label: 'Acelerómetro y giroscopio MPU6050', prefix: 'IMU', cat: 'Sensores',
    terms: MPU.terms, box: [-82, -62, 172, 124], props: () => ({ roll: 0, pitch: 0, gx: 0, gy: 0, gz: 0, temp: 25, noise: true }),
    controls: [{ prop: 'roll', label: 'Rolido (inclinación lateral)', min: -180, max: 180, step: 1, unit: '°' }, { prop: 'pitch', label: 'Cabeceo (adelante / atrás)', min: -90, max: 90, step: 1, unit: '°' },
      { prop: 'gx', label: 'Giro X', min: -250, max: 250, step: 5, unit: '°/s' }, { prop: 'gy', label: 'Giro Y', min: -250, max: 250, step: 5, unit: '°/s' }, { prop: 'gz', label: 'Giro Z', min: -250, max: 250, step: 5, unit: '°/s' },
      { prop: 'temp', label: 'Temperatura', min: -40, max: 85, step: 0.5, unit: '°C' }],
    checks: [{ prop: 'noise', label: 'Ruido de medición (como el real)' }],
    svg(c){
      let s = pcb(-50, -58, 80, 116, '#1d5fb0', '#13417a') + hole(-40, 46) + hole(20, 46);
      s += `<rect x="-22" y="-12" width="24" height="24" fill="#1b1b1b"/>` + tiny(-10, 3, 'MPU', '#bbb', 'middle', 6) + `<rect x="10" y="20" width="12" height="8" fill="#d68b2a"/>` + smdLed(`data-imuled="${c.id}"`, 14, -40, '#3cff7a');
      s += `<path d="M-10 -40 v-12 M-10 -40 h12" stroke="#fff" stroke-width="1.4"/>` + tiny(-10, -54, 'Y', '#fff', 'middle', 6) + tiny(5, -37, 'X', '#fff', 'start', 6) + tiny(-10, 40, 'GY-521', '#e9f1ff', 'middle', 6);
      return s + MPU.svg + horizon(c) + label(20, -64, `${c.name} · <tspan data-imu="${c.id}">0x68</tspan>`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 1200); E.res(T('SDA'), T('VCC'), 4700); E.res(T('SCL'), T('VCC'), 4700); E.res(T('AD0'), T('GND'), 4700); E.res(T('XDA'), T('VCC'), 4700); E.res(T('XCL'), T('VCC'), 4700); },
    device: mpuDevice,
    readout(c){
      const d = Math.PI / 180, ax = -Math.sin(c.props.pitch * d), ay = Math.sin(c.props.roll * d) * Math.cos(c.props.pitch * d), az = Math.cos(c.props.roll * d) * Math.cos(c.props.pitch * d);
      return `Aceleración: X ${fmt(ax, 2)} g · Y ${fmt(ay, 2)} g · Z ${fmt(az, 2)} g\nGiro: ${c.props.gx} / ${c.props.gy} / ${c.props.gz} °/s · ${fmt(c.props.temp, 1)} °C\nI2C: SDA→A4, SCL→A5 (Mega 20/21). Librerías: Adafruit MPU6050 o MPU6050 (Electronic Cats), o Wire directo.`;
    },
    render(c, k){
      const g = k.q(`[data-hz="${c.id}"]`); if (g) g.setAttribute('transform', `rotate(${-c.props.roll}) translate(0 ${Math.max(-60, Math.min(60, c.props.pitch)) * 0.35})`);
      glowAttr(k.q(`[data-imuled="${c.id}"]`), k.powered('VCC', 'GND', 2.8));
      const t = k.q(`[data-imu="${c.id}"]`), dv = k.dev(c); if (t && dv) t.textContent = `0x${dv.i2c.address.toString(16)}${k.running && dv.asleep ? ' · dormido' : ''}`;
      if (k.running && !k.powered('VCC', 'GND', 2.8)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
      else if (k.running && (k.wired('SDA') || k.wired('SCL')) && !(k.onBoard('SDA', k.board.i2c.sda) && k.onBoard('SCL', k.board.i2c.scl))) k.warn(`${c.name}: SDA va a ${k.board.i2c.sda} y SCL a ${k.board.i2c.scl}.`);
    },
  },
  ili9341: {
    label: 'Pantalla TFT 2,2" SPI (ILI9341)', prefix: 'TFT', cat: 'Pantallas',
    terms: TFT.terms, box: [-108, -136, 210, 262], props: () => ({}),
    svg(c){
      let s = pcb(-90, -130, 186, 254, '#d23a2c', '#962318') + hole(-80, -120) + hole(86, -120) + hole(-80, 114) + hole(86, 114);
      s += `<rect x="-56" y="-118" width="148" height="226" rx="3" fill="#0b0b0c" stroke="#333"/><rect x="-62" y="-30" width="8" height="50" fill="#e0a43a" opacity=".85"/>`;
      s += `<rect x="-48" y="-106" width="132" height="176" fill="#050505"/>`;
      s += `<foreignObject x="-48" y="-106" width="132" height="176"><canvas xmlns="http://www.w3.org/1999/xhtml" data-tft="${c.id}" width="240" height="320" style="width:100%;height:100%;display:block;image-rendering:pixelated"></canvas></foreignObject>`;
      s += tiny(18, 84, 'ILI9341 · 240×320', '#fff', 'middle', 6.5) + tiny(-74, 96, 'SPI', '#fff', 'middle', 7);
      return s + TFT.svg + label(4, -136, `${c.name} · TFT 2,2"`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 120); E.res(T('LED'), T('GND'), 80); E.res(T('RESET'), T('VCC'), 10000); },
    device: tftDevice,
    readout: () => 'Controlador ILI9341 (240×320, color de 16 bits).\nSPI por hardware: SDI→11, SCK→13 (Mega: 51, 52); CS, DC y RESET en cualquier pin; LED a 3,3 V o 5V.\nLibrería Adafruit_ILI9341 + Adafruit_GFX: Adafruit_ILI9341 tft(CS, DC, RST).',
    render(c, k){
      const cv = k.q(`[data-tft="${c.id}"]`); if (!cv) return;
      const s = c._tft, pw = k.powered('VCC', 'GND', 3), bl = k.V('LED') - k.V('GND') > 2.4;
      const key = `${s ? s.ver : -1}|${pw}|${bl}|${s && s.on && !s.sleep}|${s && s.inv}`;
      if (cv.dataset.key !== key && (!c._tftT || k.now - c._tftT > 50 || !s)) {
        cv.dataset.key = key; c._tftT = k.now; const g = cv.getContext('2d');
        if (!pw || !bl) { g.fillStyle = '#050505'; g.fillRect(0, 0, W, H); }
        else if (!s || !k.running || s.sleep || !s.on) { g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, W, H); }
        else { const img = new ImageData(s.inv ? s.fb.map((v, i) => (i & 3) === 3 ? v : 255 - v) : s.fb, W, H); g.putImageData(img, 0, 0); }
      }
      if (k.running && !pw) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
      else if (k.running && !bl) k.warn(`${c.name}: la luz de fondo está apagada: conecta LED a 3,3 V o 5V.`);
      else if (k.running && k.wired('MOSI') && !k.onBoard('MOSI', 'D' + k.board.spi.mosi)) k.warn(`${c.name}: SDI (MOSI) va al pin ${k.board.spi.mosi} y SCK al ${k.board.spi.sck} (SPI por hardware).`);
    },
  },
  ttmotor: {
    label: 'Motor amarillo con reductora (TT)', prefix: 'M', cat: 'Salidas',
    terms: { p: { x: -86, y: -8, dx: -1, dy: 0, name: '+' }, n: { x: -86, y: 8, dx: -1, dy: 0, name: '−' } },
    box: [-90, -50, 186, 100], props: () => ({ wheel: true }),
    checks: [{ prop: 'wheel', label: 'Con rueda' }],
    svg(c){
      let s = `<path d="M-86 -8 H-70 M-86 8 H-70" stroke="#c8b46a" stroke-width="3"/>` + tiny(-78, -12, '+', 'var(--muted)', 'middle', 8);
      s += `<rect x="-70" y="-16" width="46" height="32" rx="10" fill="#d0d6da" stroke="#8a9096" opacity=".85"/><rect x="-62" y="-12" width="30" height="24" rx="4" fill="#b7bcc0"/><circle cx="-66" cy="0" r="5" fill="#6d7276"/>`;
      s += `<rect x="-26" y="-22" width="96" height="44" rx="4" fill="#ffd21f" stroke="#c9a400" stroke-width="2"/><rect x="0" y="-22" width="2" height="44" fill="#e0b800"/><circle cx="30" cy="-10" r="3" fill="#c9a400"/><circle cx="30" cy="10" r="3" fill="#c9a400"/>` + tiny(20, 4, '1:48', '#8a6d00', 'middle', 7);
      s += `<rect x="50" y="-5" width="18" height="10" fill="#f4f4f0" stroke="#bbb"/>`;
      s += c.props.wheel ? `<g data-ttw="${c.id}" transform="rotate(0 76 0)"><circle cx="76" cy="0" r="28" fill="#222" stroke="#000" stroke-width="2"/><circle cx="76" cy="0" r="18" fill="#ffd21f" stroke="#c9a400"/>${[0, 60, 120, 180, 240, 300].map(a => `<line x1="76" y1="0" x2="${76 + 16 * Math.cos(a * Math.PI / 180)}" y2="${16 * Math.sin(a * Math.PI / 180)}" stroke="#c9a400" stroke-width="3"/>`).join('')}<circle cx="76" cy="0" r="4" fill="#f4f4f0"/></g>`
        : `<g data-ttw="${c.id}" transform="rotate(0 72 0)"><rect x="68" y="-6" width="8" height="12" fill="#f4f4f0" stroke="#bbb"/><rect x="71" y="-14" width="2" height="28" fill="#e6553a"/></g>`;
      return s + label(-10, -30, `${c.name} · <tspan data-ttrpm="${c.id}">detenido</tspan>`);
    },
    elec(c, T, E){ E.res(T('p'), T('n'), 25); },
    readout(c, V){ const v = V('p') - V('n'); return `Tensión: ${fmt(v, 2)} V (nominal 3–6 V)\nCorriente: ${fmt(Math.abs(v) / 25 * 1000, 0)} mA\nVelocidad sin carga: ~${Math.round(Math.abs(v) / 6 * 200)} rpm en la salida (reducción 1:48)`; },
    render(c, k){
      const v = k.V('p') - k.V('n'); const target = Math.abs(v) < 0.6 ? 0 : v / 6;
      c._spd = (c._spd || 0) + (target - (c._spd || 0)) * 0.06; c._rot = ((c._rot || 0) + c._spd * 20) % 360;
      const cx = c.props.wheel ? 76 : 72; const g = k.q(`[data-ttw="${c.id}"]`); if (g) g.setAttribute('transform', `rotate(${c._rot.toFixed(1)} ${cx} 0)`);
      const t = k.q(`[data-ttrpm="${c.id}"]`); if (t) t.textContent = Math.abs(c._spd) < 0.02 ? 'detenido' : `${Math.round(Math.abs(c._spd) * 200)} rpm ${c._spd > 0 ? '↻' : '↺'}`;
      const p = k.drivenBy('p'), i = Math.abs(v) / 25;
      if (k.running && p >= 0 && i > 0.04) k.warn(`${c.name}: conectado directo a un pin pide ${Math.round(i * 1000)} mA (máx. 40 mA). Usa un driver L298N, L9110 o un transistor.`);
      if (k.running && Math.abs(v) > 9) k.warn(`${c.name}: ${fmt(Math.abs(v), 1)} V es demasiado; estos motores son de 3–6 V.`);
    },
  },
  mg996r: {
    label: 'Servo MG996R (alto torque)', prefix: 'SERVO', cat: 'Salidas', servo: true,
    terms: { gnd: { x: -84, y: -14, dx: -1, dy: 0, name: 'GND (marrón)' }, vcc: { x: -84, y: 0, dx: -1, dy: 0, name: 'V+ (rojo, 4,8–7,2 V)' }, sig: { x: -84, y: 14, dx: -1, dy: 0, name: 'señal (naranja)' } },
    box: [-86, -44, 160, 88], props: () => ({}),
    svg(c){
      return `<path d="M-84 -14 H-66" stroke="#6b3e1f" stroke-width="3"/><path d="M-84 0 H-66" stroke="#d32f2f" stroke-width="3"/><path d="M-84 14 H-66" stroke="#f28c28" stroke-width="3"/>` +
        `<rect x="-66" y="-20" width="12" height="40" rx="2" fill="#222"/>` +
        `<rect x="-54" y="-30" width="114" height="60" rx="5" fill="#141414" stroke="#000"/><rect x="-64" y="-10" width="10" height="20" fill="#141414"/><rect x="60" y="-10" width="10" height="20" fill="#141414"/><circle cx="-59" cy="0" r="3" fill="var(--bg)"/><circle cx="65" cy="0" r="3" fill="var(--bg)"/>` +
        `<rect x="-46" y="-20" width="40" height="40" rx="2" fill="#e04fb3" transform="rotate(-6 -26 0)"/><text x="-26" y="-2" font-size="10" font-weight="700" fill="#111" text-anchor="middle" font-family="var(--f-ui)" transform="rotate(-6 -26 0)">MG996R</text><text x="-26" y="9" font-size="5.5" fill="#222" text-anchor="middle" font-family="var(--f-ui)" transform="rotate(-6 -26 0)">Metal Gear</text>` +
        `<circle cx="22" cy="0" r="18" fill="#222" stroke="#333"/><circle cx="22" cy="0" r="9" fill="#c99a3c" stroke="#8d6a20"/>` +
        `<g data-horn="${c.id}" transform="rotate(0 22 0)"><path d="M16 0 L20 -40 Q22 -45 24 -40 L28 0 Z" fill="#f2f2f2" stroke="#b9b9b9"/><circle cx="22" cy="0" r="7" fill="#e4e4e4" stroke="#aaa"/><circle cx="22" cy="-32" r="1.6" fill="#999"/><circle cx="22" cy="-24" r="1.6" fill="#999"/></g>` +
        `<text x="-54" y="42" class="clabel" text-anchor="start">${c.name} · MG996R</text><text data-angle="${c.id}" x="60" y="42" class="clabel" text-anchor="end">90°</text>`;
    },
    elec(c, T, E){ E.res(T('vcc'), T('gnd'), c._moving ? 6 : 600); },
    readout: c => `Ángulo: ${Math.round(c._ang ?? 90)}°\nTorque ~10 kg·cm. En movimiento pide 0,5–2,5 A: aliméntalo con una fuente de 5–6 V (no del pin 5V del Arduino) y une los GND.`,
    render(c, k){ if (k.running && c._moving && k.onBoard('vcc', '5V')) k.warn(`${c.name}: el MG996R toma hasta 2,5 A al moverse y el 5V del Arduino (USB) da ~0,5 A: el Arduino se reinicia. Usa una fuente externa de 5–6 V con GND común.`); },
  },
  xtal: {
    label: 'Cristal de cuarzo', prefix: 'Y', cat: 'Pasivos',
    terms: { a: { x: -10, y: 36, dx: 0, dy: 1, name: 'pata 1' }, b: { x: 10, y: 36, dx: 0, dy: 1, name: 'pata 2' } },
    box: [-24, -22, 48, 62], props: () => ({ mhz: 16 }),
    options: [{ prop: 'mhz', label: 'Frecuencia', values: [[16, '16 MHz (Arduino)'], [8, '8 MHz'], [12, '12 MHz'], [20, '20 MHz'], [0.032768, '32,768 kHz (reloj)']], num: true }],
    svg(c){
      const f = c.props.mhz < 1 ? '32.768K' : c.props.mhz.toFixed(3);
      return `<line x1="-10" y1="10" x2="-10" y2="36" stroke="#9aa3a6" stroke-width="3"/><line x1="10" y1="10" x2="10" y2="36" stroke="#9aa3a6" stroke-width="3"/>` +
        `<rect x="-22" y="-16" width="44" height="28" rx="12" fill="#d6dadd" stroke="#8a9096" stroke-width="1.5"/><rect x="-18" y="-12" width="36" height="20" rx="9" fill="#e9ecee"/>` + tiny(0, 1, f, '#555', 'middle', 6.5) + label(26, -8, c.name, 'start');
    },
    elec(){},
    readout: c => `Cristal de ${c.props.mhz < 1 ? '32,768 kHz' : c.props.mhz + ' MHz'}. En el Arduino casero va entre XTAL1 (pata 9) y XTAL2 (pata 10), cada pata con un condensador de 22 pF a GND.`,
  },
  hdrm: headerType(false),
  hdrf: headerType(true),
  bornera: bornera(),
};
