// Módulos de la tanda 1: sensores, actuadores, pantallas y comunicación.
// Cada tipo define terminales, aspecto (SVG), modelo eléctrico y, si hace falta, un modelo de
// dispositivo (`device`) que reacciona a los pines del ATmega328P con precisión de ciclo.
import { PinState } from './emulator.js';

const US = 16; // ciclos por microsegundo a 16 MHz
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const label = (x, y, t, anchor = 'middle') => `<text class="clabel" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
const tiny = (x, y, t, fill = '#f1f5f4', anchor = 'middle', size = 6.5) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="var(--f-code)">${t}</text>`;

// Fila de pines macho. dir: 'down' | 'up' | 'left' | 'right'
function header(names, opts){
  const { x0, y0, pitch = 14, dir = 'down', len = 16, labels = {}, texts = {} } = opts;
  const terms = {}; let svg = '';
  const D = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[dir];
  names.forEach((n, i) => {
    const horiz = dir === 'down' || dir === 'up';
    const bx = horiz ? x0 + i * pitch : x0, by = horiz ? y0 : y0 + i * pitch;
    const tx = bx + D[0] * len, ty = by + D[1] * len;
    terms[n] = { x: tx, y: ty, dx: D[0], dy: D[1], name: labels[n] || n };
    svg += `<line x1="${bx}" y1="${by}" x2="${tx}" y2="${ty}" stroke="#c8b46a" stroke-width="3"/><rect x="${bx - 3.5}" y="${by - 3.5}" width="7" height="7" fill="#1a1a1a"/>`;
    const lx = horiz ? bx : bx - D[0] * 8, ly = horiz ? by - D[1] * 8 + 2.5 : by + 2.5;
    svg += tiny(lx, ly, texts[n] || n, '#f1f5f4', horiz ? 'middle' : D[0] < 0 ? 'start' : 'end');
  });
  return { terms, svg };
}
const pcb = (x, y, w, h, fill = '#1e5fa8', edge = '#143f70') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${edge}" stroke-width="1.5"/>`;
const hole = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="var(--bg)" stroke="#d4c07a" stroke-width="1.2"/>`;
const smdLed = (attr, x, y, col = '#ff3b30') => `<rect x="${x - 4}" y="${y - 2.5}" width="8" height="5" rx="1" fill="#5a5048"/><rect ${attr} x="${x - 4}" y="${y - 2.5}" width="8" height="5" rx="1" fill="${col}" opacity="0"/>`;
const glowAttr = (el, on) => { if (el) el.setAttribute('opacity', on ? 1 : 0); };

/* =========================================================================
   Sensores
   ========================================================================= */
const SR = header(['VCC', 'TRIG', 'ECHO', 'GND'], { x0: -21, y0: 30, labels: { VCC: 'VCC (5 V)', TRIG: 'TRIG (disparo)', ECHO: 'ECHO (eco)', GND: 'GND' } });
const DHT = header(['VCC', 'DATA', 'GND'], { x0: -14, y0: 42, labels: { VCC: 'VCC (+)', DATA: 'DATA (out)', GND: 'GND (−)' } });
const PIR = header(['VCC', 'OUT', 'GND'], { x0: -14, y0: 36, labels: { VCC: 'VCC (5 V)', OUT: 'OUT (salida)', GND: 'GND' } });
const JOY = header(['GND', 'V5', 'VRx', 'VRy', 'SW'], { x0: -52, y0: -28, dir: 'left', texts: { V5: '+5V' }, labels: { GND: 'GND', V5: '+5V', VRx: 'VRx (eje X)', VRy: 'VRy (eje Y)', SW: 'SW (pulsador)' } });
const FLM = header(['AO', 'GND', 'VCC', 'DO'], { x0: -21, y0: 46, labels: { AO: 'AO (analógica)', GND: 'GND', VCC: 'VCC (+)', DO: 'DO (digital)' } });
const GAS = header(['VCC', 'GND', 'DO', 'AO'], { x0: -21, y0: 42, labels: { VCC: 'VCC (5 V)', GND: 'GND', DO: 'DO (digital)', AO: 'AO (analógica)' } });

function srDevice(c, api){
  let rise = 0, busy = false;
  return {
    reset(){ c._echo = 0; busy = false; rise = 0; },
    onPin(p, s, old, cyc){
      if (p !== api.pin('TRIG')) return;
      if (s === PinState.High) { rise = cyc; return; }
      if (old !== PinState.High || !rise) return;
      const w = (cyc - rise) / US; rise = 0;
      if (w < 8 || busy || !api.powered('VCC', 'GND')) return;
      busy = true;
      const d = c.props.cm; const width = d < 2 || d > 400 ? 38000 : d * 58.3; // µs (ida y vuelta a 343 m/s)
      const start = cyc + 460 * US; // ráfaga de 8 pulsos a 40 kHz + procesado
      api.schedule(start, () => { c._echo = 1; api.drive(); });
      api.schedule(start + width * US, () => { c._echo = 0; busy = false; api.drive(); });
    },
  };
}

function dhtFrame(c){
  const h = Math.max(0, Math.min(100, c.props.hum)), t = Math.max(-40, Math.min(80, c.props.temp));
  let b;
  if (c.props.model === 'DHT11') {
    const hh = Math.round(Math.max(20, Math.min(90, h))), tt = Math.max(0, Math.min(50, t));
    const ti = Math.floor(tt), td = Math.round((tt - ti) * 10) % 10;
    b = [hh, 0, ti, td];
  } else {
    const hh = Math.round(h * 10), tt = Math.round(Math.abs(t) * 10) | (t < 0 ? 0x8000 : 0);
    b = [hh >> 8, hh & 255, tt >> 8, tt & 255];
  }
  b.push((b[0] + b[1] + b[2] + b[3]) & 255);
  return b;
}
function dhtDevice(c, api){
  let lowAt = 0, busy = false;
  return {
    reset(){ c._pull = 0; lowAt = 0; busy = false; },
    onPin(p, s, old, cyc){
      if (p !== api.pin('DATA')) return;
      if (s === PinState.Low) { lowAt = cyc; return; }
      if (old !== PinState.Low || !lowAt) return;
      const dur = (cyc - lowAt) / US; lowAt = 0;
      if (dur < 450 || busy || !api.powered('VCC', 'GND', 3)) return;
      busy = true;
      // respuesta: 80 µs abajo, 80 µs arriba, 40 bits (50 µs abajo + 26 o 70 µs arriba), 50 µs abajo
      const seg = [[1, 40], [0, 80], [1, 80]];
      for (const byte of dhtFrame(c)) for (let i = 7; i >= 0; i--) seg.push([0, 50], [1, (byte >> i) & 1 ? 70 : 27]);
      seg.push([0, 50]);
      let t = cyc;
      for (const [lvl, us] of seg) { const pull = lvl ? 0 : 1; api.schedule(t, () => { c._pull = pull; api.drive(); }); t += us * US; }
      api.schedule(t, () => { c._pull = 0; busy = false; api.drive(); });
    },
  };
}

function pirDevice(c, api){
  return {
    reset(){ c._out = 0; c._until = 0; },
    tap(){
      if (!api.running() || !api.powered('VCC', 'GND')) return;
      const until = api.now() + c.props.hold * 16e6; c._until = until; c._out = 1; api.drive();
      api.schedule(until, () => { if (c._until === until) { c._out = 0; api.drive(); } });
    },
  };
}

/* =========================================================================
   Actuadores y potencia
   ========================================================================= */
const RLY = header(['VCC', 'GND', 'IN'], { x0: -62, y0: -14, dir: 'left', labels: { VCC: 'VCC (5 V)', GND: 'GND', IN: 'IN (señal)' } });
const RLY_OUT = header(['NO', 'COM', 'NC'], { x0: 66, y0: -14, dir: 'right', len: 14, labels: { NO: 'NO (normalmente abierto)', COM: 'COM (común)', NC: 'NC (normalmente cerrado)' } });
const L298_IN = header(['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'], { x0: -10, y0: 76, labels: { ENA: 'ENA (velocidad A)', IN1: 'IN1', IN2: 'IN2', IN3: 'IN3', IN4: 'IN4', ENB: 'ENB (velocidad B)' } });
const L298_PW = header(['VS', 'GND', '5V'], { x0: -66, y0: 76, pitch: 16, texts: { VS: '12V' }, labels: { VS: '+12V (motores)', GND: 'GND', '5V': '+5V (lógica)' } });
const L298_A = header(['OUT1', 'OUT2'], { x0: -84, y0: -20, dir: 'left', pitch: 22, labels: { OUT1: 'OUT1 (motor A)', OUT2: 'OUT2 (motor A)' } });
const L298_B = header(['OUT3', 'OUT4'], { x0: 84, y0: -20, dir: 'right', pitch: 22, labels: { OUT3: 'OUT3 (motor B)', OUT4: 'OUT4 (motor B)' } });

function relayDevice(c, api){
  return {
    reset(){ c._on = false; },
    update(V){ // decide el estado de la bobina con la solución eléctrica
      const vcc = V('VCC') - V('GND'), vin = V('IN') - V('GND');
      const on = vcc > 3.8 && (c.props.trigger === 'low' ? vcc - vin > 2.2 : vin > 2.2);
      if (on !== !!c._on) { c._on = on; if (api.running()) api.click(); return true; }
      return false;
    },
  };
}

/* =========================================================================
   Pantallas
   ========================================================================= */
const OLED = header(['GND', 'VCC', 'SCL', 'SDA'], { x0: -21, y0: -48, dir: 'up', labels: { GND: 'GND', VCC: 'VCC (3,3–5 V)', SCL: 'SCL (A5; 21 en el Mega)', SDA: 'SDA (A4; 20 en el Mega)' } });
const MAX = header(['VCC', 'GND', 'DIN', 'CS', 'CLK'], { x0: -62, y0: -28, dir: 'left', labels: { VCC: 'VCC (5 V)', GND: 'GND', DIN: 'DIN (datos)', CS: 'CS / LOAD', CLK: 'CLK (reloj)' } });

// Controlador SSD1306 (128×64) por I2C: comandos, modos de direccionamiento y RAM de 1 KB.
export class SSD1306 {
  constructor(address = 0x3C){ this.address = address; this.reset(); }
  reset(){
    this.ram = new Uint8Array(1024); this.on = false; this.mode = 2; this.col = 0; this.page = 0;
    this.c0 = 0; this.c1 = 127; this.p0 = 0; this.p1 = 7; this.contrast = 0x7F; this.invert = false; this.allOn = false;
    this.remap = false; this.comDec = false; this.startLine = 0; this.offset = 0; this.pump = false;
    this.state = 'ctrl'; this.args = []; this.need = 0; this.cmd = 0; this.version = 0;
  }
  begin(){ this.state = 'ctrl'; } // los argumentos pendientes de un comando siguen esperando (Adafruit los manda aparte)
  read(){ return 0xFF; }
  write(b){
    if (this.state === 'ctrl') { this.stream = (b & 0x40) ? 'data' : 'cmd'; this.single = !!(b & 0x80); this.state = 'body'; return; }
    if (this.stream === 'data') this.data(b); else this.command(b);
    if (this.single) this.state = 'ctrl';
  }
  data(b){
    this.ram[this.page * 128 + this.col] = b; this.version++;
    if (this.mode === 2) { this.col = (this.col + 1) & 127; return; } // modo página
    if (this.mode === 0) { // horizontal
      if (++this.col > this.c1) { this.col = this.c0; if (++this.page > this.p1) this.page = this.p0; }
    } else if (++this.page > this.p1) { this.page = this.p0; if (++this.col > this.c1) this.col = this.c0; } // vertical
  }
  command(b){
    if (this.need) {
      this.args.push(b);
      if (--this.need) return;
      const a = this.args, c = this.cmd;
      if (c === 0x20) this.mode = a[0] & 3;
      else if (c === 0x21) { this.c0 = a[0] & 127; this.c1 = a[1] & 127; this.col = this.c0; }
      else if (c === 0x22) { this.p0 = a[0] & 7; this.p1 = a[1] & 7; this.page = this.p0; }
      else if (c === 0x81) this.contrast = a[0];
      else if (c === 0xD3) this.offset = a[0] & 63;
      else if (c === 0x8D) this.pump = !!(a[0] & 0x04);
      this.version++; return;
    }
    const ARGS = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0xA8: 1, 0xD3: 1, 0xD5: 1, 0xD9: 1, 0xDA: 1, 0xDB: 1, 0x8D: 1, 0xA3: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2A: 5 };
    if (ARGS[b]) { this.cmd = b; this.need = ARGS[b]; this.args = []; return; }
    if (b === 0xAE) this.on = false; else if (b === 0xAF) this.on = true;
    else if (b === 0xA6) this.invert = false; else if (b === 0xA7) this.invert = true;
    else if (b === 0xA4) this.allOn = false; else if (b === 0xA5) this.allOn = true;
    else if (b === 0xA0) this.remap = false; else if (b === 0xA1) this.remap = true;
    else if (b === 0xC0) this.comDec = false; else if (b === 0xC8) this.comDec = true;
    else if (b >= 0x40 && b <= 0x7F) this.startLine = b & 63;
    else if (b >= 0xB0 && b <= 0xB7) this.page = b & 7;
    else if (b <= 0x0F) this.col = (this.col & 0xF0) | b;
    else if (b >= 0x10 && b <= 0x1F) this.col = ((b & 0x0F) << 4) | (this.col & 0x0F);
    this.version++;
  }
  // Píxel visible (x, y) de la pantalla
  pixel(x, y){
    if (this.allOn) return 1;
    const col = this.remap ? x : 127 - x;
    const row = ((this.comDec ? y : 63 - y) + this.startLine + this.offset) & 63;
    return (this.ram[(row >> 3) * 128 + col] >> (row & 7)) & 1;
  }
}

// MAX7219: registro de desplazamiento de 16 bits, se carga con el flanco de subida de LOAD (CS).
export class MAX7219 {
  constructor(){ this.reset(); }
  reset(){ this.shift = 0; this.digits = new Uint8Array(8); this.intensity = 7; this.scan = 7; this.shutdown = true; this.test = false; this.decode = 0; this.version = 0; }
  bit(b){ this.shift = ((this.shift << 1) | (b ? 1 : 0)) & 0xFFFF; }
  byte(v){ for (let i = 7; i >= 0; i--) this.bit((v >> i) & 1); }
  load(){
    const reg = (this.shift >> 8) & 0x0F, d = this.shift & 0xFF;
    if (reg >= 1 && reg <= 8) this.digits[reg - 1] = d;
    else if (reg === 0x09) this.decode = d; else if (reg === 0x0A) this.intensity = d & 15;
    else if (reg === 0x0B) this.scan = d & 7; else if (reg === 0x0C) this.shutdown = !(d & 1); else if (reg === 0x0F) this.test = !!(d & 1);
    this.version++;
  }
  lit(r, c){ if (this.test) return true; if (this.shutdown || r > this.scan) return false; return !!((this.digits[r] >> (7 - c)) & 1); }
}
function maxDevice(c, api){
  const m = c._max || (c._max = new MAX7219());
  return {
    reset(){ m.reset(); },
    onPin(p, s, old, cyc){
      if (p === api.pin('CLK') && s === PinState.High && old !== PinState.High) { const din = api.pin('DIN'); m.bit(din >= 0 && api.state(din) === PinState.High); }
      else if (p === api.pin('CS') && s === PinState.High && old !== PinState.High) m.load();
    },
    onSpi(b){ const { mosi, sck } = api.board().spi; if (api.pin('DIN') === mosi && api.pin('CLK') === sck) m.byte(b); }, // SPI por hardware (D11/D13; D51/D52 en el Mega)
  };
}

/* =========================================================================
   Comunicación: Bluetooth HC-05 / HC-06 (UART)
   ========================================================================= */
const BT = header(['VCC', 'GND', 'TXD', 'RXD'], { x0: -21, y0: 52, labels: { VCC: 'VCC (5 V)', GND: 'GND', TXD: 'TXD (sale hacia RX del Arduino)', RXD: 'RXD (entra desde TX del Arduino)' } });
function btDevice(c, api){
  let txFree = 0, rxBusy = false;
  const bitCyc = () => 16e6 / c.props.baud;
  const dev = {
    rxText: '', log: [],
    reset(){ c._tx = 1; txFree = 0; rxBusy = false; },
    // índice del puerto serie por hardware al que está conectado (o -1): 0 = D0/D1; en el Mega 1-3 = Serial1-3
    hwTx(){ const p = api.pin('TXD'); return p < 0 ? -1 : api.board().uarts.findIndex(u => u.rx === p); },  // TXD del módulo al RX del Arduino
    hwRx(){ const p = api.pin('RXD'); return p < 0 ? -1 : api.board().uarts.findIndex(u => u.tx === p); },  // TX del Arduino al RXD del módulo
    send(text){ // del celular al Arduino
      if (!api.running() || !api.powered('VCC', 'GND')) return false;
      const bytes = [...new TextEncoder().encode(text)];
      const hw = dev.hwTx(); if (hw >= 0) { api.serialWrite(bytes, hw); return true; }
      if (api.pin('TXD') < 0) return false;
      const bc = bitCyc(); let t = Math.max(api.now() + 32, txFree);
      for (const b of bytes) {
        const bits = [0]; for (let i = 0; i < 8; i++) bits.push((b >> i) & 1); bits.push(1);
        for (const v of bits) { api.schedule(t, () => { c._tx = v; api.drive(); }); t += bc; }
        t += bc * 0.5;
      }
      txFree = t; return true;
    },
    dec: new TextDecoder(),
    rx(b){ if (api.powered('VCC', 'GND')) dev.rxText += dev.dec.decode(new Uint8Array([b]), { stream: true }); },
    onPin(p, s, old, cyc){ // del Arduino al celular por software (SoftwareSerial)
      if (p !== api.pin('RXD') || dev.hwRx() >= 0 || rxBusy) return;
      if (old === PinState.High && s === PinState.Low) {
        rxBusy = true; const bc = bitCyc(); let byte = 0;
        for (let i = 0; i < 8; i++) api.schedule(cyc + bc * (1.5 + i), () => { if (api.state(p) === PinState.High) byte |= 1 << i; });
        api.schedule(cyc + bc * 9.5, () => { rxBusy = false; dev.rx(byte); });
      }
    },
  };
  return dev;
}

/* =========================================================================
   Tipos
   ========================================================================= */
export const MODULES = {
  sr04: {
    label: 'Ultrasonido HC-SR04', prefix: 'US', cat: 'Sensores',
    terms: SR.terms, box: [-76, -34, 152, 82], props: () => ({ cm: 30 }),
    controls: [{ prop: 'cm', label: 'Distancia al objeto', min: 1, max: 450, step: 1, unit: 'cm' }],
    svg(c){
      const eye = x => `<circle cx="${x}" cy="-4" r="24" fill="#c9cdd0" stroke="#8e969b" stroke-width="2"/><circle cx="${x}" cy="-4" r="18" fill="#2d3236"/><circle cx="${x}" cy="-4" r="15" fill="none" stroke="#4b5257" stroke-dasharray="2 2"/>`;
      return pcb(-74, -32, 148, 62) + hole(-68, -26) + hole(68, -26) + hole(-68, 24) + hole(68, 24) + eye(-40) + eye(40) +
        `<rect x="-9" y="-28" width="18" height="9" rx="4" fill="#c9cdd0"/>` + tiny(0, 16, 'HC-SR04', '#dfe9ff', 'middle', 7) + tiny(-40, 26, 'T', '#dfe9ff') + tiny(40, 26, 'R', '#dfe9ff') +
        SR.svg + label(0, -38, `${c.name} · <tspan data-cm="${c.id}">${c.props.cm} cm</tspan>`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 330); E.src(T('ECHO'), T('GND'), c._echo ? 5 : 0, 50); },
    device: srDevice,
    readout(c){ const cm = c.props.cm; return `Distancia: ${cm} cm${cm > 400 ? ' (fuera de alcance: eco de 38 ms)' : ''}\nEco esperado: ${cm > 400 ? 38000 : Math.round(cm * 58.3)} µs`; },
    render(c, k){ const t = k.q(`[data-cm="${c.id}"]`); if (t) t.textContent = `${c.props.cm} cm`; if (k.running && !k.powered('VCC', 'GND')) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`); },
  },
  dht: {
    label: 'DHT22 / DHT11', prefix: 'DHT', cat: 'Sensores',
    terms: DHT.terms, box: [-32, -52, 64, 112], props: () => ({ model: 'DHT22', temp: 24, hum: 55 }),
    options: [{ prop: 'model', label: 'Modelo', values: [['DHT22', 'DHT22 (AM2302)'], ['DHT11', 'DHT11']] }],
    controls: [{ prop: 'temp', label: 'Temperatura', min: -40, max: 80, step: 0.1, unit: '°C' }, { prop: 'hum', label: 'Humedad relativa', min: 0, max: 100, step: 0.5, unit: '%' }],
    svg(c){
      const blue = c.props.model === 'DHT11'; const body = blue ? '#2c7be5' : '#f2f2ef', slot = blue ? '#1a4f96' : '#c9cbc6';
      let s = pcb(-30, -10, 60, 52, '#1f2a33', '#0f151a') + `<rect x="-20" y="-48" width="40" height="54" rx="3" fill="${body}" stroke="rgba(0,0,0,.25)"/>`;
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) s += `<rect x="${-14 + k * 10}" y="${-42 + r * 9}" width="6" height="5" rx="1" fill="${slot}"/>`;
      return s + tiny(0, 26, c.props.model, '#e6eef5', 'middle', 7) + DHT.svg + label(36, -40, `${c.name}`, 'start') +
        `<text class="clabel" x="36" y="-28" text-anchor="start" data-dht="${c.id}">${fmt(c.props.temp)} °C · ${fmt(c.props.hum, 0)} %</text>`;
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 3000); E.res(T('DATA'), T('VCC'), 10000); if (c._pull) E.src(T('DATA'), T('GND'), 0, 40); },
    device: dhtDevice,
    readout(c){ return `Temperatura: ${fmt(c.props.temp)} °C\nHumedad: ${fmt(c.props.hum, 1)} %\nLee como máximo cada ${c.props.model === 'DHT11' ? 1 : 2} s.`; },
    render(c, k){ const t = k.q(`[data-dht="${c.id}"]`); if (t) t.textContent = `${fmt(c.props.temp)} °C · ${fmt(c.props.hum, 0)} %`; if (k.running && !k.powered('VCC', 'GND', 3)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`); },
  },
  pir: {
    label: 'Sensor PIR', prefix: 'PIR', cat: 'Sensores',
    terms: PIR.terms, box: [-36, -44, 72, 98], props: () => ({ hold: 3 }),
    controls: [{ prop: 'hold', label: 'Tiempo en alto tras detectar', min: 1, max: 20, step: 1, unit: 's' }],
    svg(c){
      let s = pcb(-34, -36, 68, 72, '#2f7d3a', '#1d5226');
      s += `<g class="ctrl" data-ctrl="tap" data-id="${c.id}"><circle cx="0" cy="-6" r="26" fill="#f4f4f2" stroke="#c9cac5" stroke-width="2"/>`;
      for (let i = -2; i <= 2; i++) s += `<path d="M${i * 9} -30 Q${i * 11} -6 ${i * 9} 18" fill="none" stroke="#dcdcd7"/>`;
      s += `<circle data-pirring="${c.id}" cx="0" cy="-6" r="29" fill="none" stroke="#ff5a3c" stroke-width="3" opacity="0"/><title>Clic para simular movimiento</title></g>`;
      return s + PIR.svg + label(0, -42, `${c.name} · clic = movimiento`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 50000); E.src(T('OUT'), T('GND'), c._out ? 3.3 : 0, 100); },
    device: pirDevice,
    readout(c){ return c._out ? 'Movimiento detectado: OUT en alto (3,3 V)' : 'Sin movimiento: OUT en bajo\nHaz clic en la cúpula para simular movimiento.'; },
    render(c, k){ glowAttr(k.q(`[data-pirring="${c.id}"]`), c._out); if (k.running && !k.powered('VCC', 'GND')) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`); },
  },
  joy: {
    label: 'Joystick KY-023', prefix: 'JOY', cat: 'Sensores',
    terms: JOY.terms, box: [-70, -48, 116, 96], props: () => ({ x: 0, y: 0, pressed: false }),
    svg(c){
      const kx = c.props.x * 16, ky = -c.props.y * 16;
      return pcb(-52, -44, 96, 88, '#1b1d20', '#000') + `<rect x="-36" y="-30" width="64" height="60" rx="4" fill="#2b2e33"/>` +
        `<circle cx="-4" cy="0" r="24" fill="#3a3e44" stroke="#15171a"/>` +
        `<g class="ctrl" data-ctrl="joy" data-id="${c.id}"><circle cx="-4" cy="0" r="30" fill="transparent"/><g data-joyknob="${c.id}" transform="translate(${kx},${ky})"><circle cx="-4" cy="0" r="16" fill="#202226" stroke="#555a60" stroke-width="2"/><circle cx="-4" cy="0" r="10" fill="${c.props.pressed ? '#55595e' : '#34373c'}" data-joycap="${c.id}"/></g><title>Arrastra para mover; doble clic para pulsar</title></g>` +
        JOY.svg + label(-4, -52, `${c.name} · <tspan data-joyxy="${c.id}">X ${Math.round(c.props.x * 100)} · Y ${Math.round(c.props.y * 100)}</tspan>`);
    },
    elec(c, T, E){
      const pot = (w, pos) => { E.res(T('V5'), T(w), Math.max(1, (1 - pos) * 10000)); E.res(T(w), T('GND'), Math.max(1, pos * 10000)); };
      pot('VRx', (c.props.x + 1) / 2); pot('VRy', (c.props.y + 1) / 2);
      if (c.props.pressed) E.res(T('SW'), T('GND'), 0.1);
    },
    readout(c, V){ return `X: ${fmt(V('VRx'), 2)} V (≈ ${Math.round(V('VRx') / 5 * 1023)})\nY: ${fmt(V('VRy'), 2)} V (≈ ${Math.round(V('VRy') / 5 * 1023)})\nPulsador: ${c.props.pressed ? 'pulsado (SW a GND)' : 'suelto (usa INPUT_PULLUP)'}`; },
    render(c, k){
      const g = k.q(`[data-joyknob="${c.id}"]`); if (g) g.setAttribute('transform', `translate(${(c.props.x * 16).toFixed(1)},${(-c.props.y * 16).toFixed(1)})`);
      const cap = k.q(`[data-joycap="${c.id}"]`); if (cap) cap.setAttribute('fill', c.props.pressed ? '#6b7076' : '#34373c');
      const t = k.q(`[data-joyxy="${c.id}"]`); if (t) t.textContent = `X ${Math.round(c.props.x * 100)} · Y ${Math.round(c.props.y * 100)}`;
    },
  },
  flame: {
    label: 'Sensor de llama', prefix: 'FLM', cat: 'Sensores',
    terms: FLM.terms, box: [-30, -62, 60, 126], props: () => ({ level: 0, threshold: 0.5 }),
    controls: [{ prop: 'level', label: 'Intensidad de la llama', min: 0, max: 1, step: 0.01, pct: true }, { prop: 'threshold', label: 'Umbral (potenciómetro azul)', min: 0.05, max: 0.95, step: 0.01, pct: true }],
    svg(c){
      return pcb(-26, -36, 52, 82, '#1e5fa8', '#143f70') + `<path d="M-6 -36 V-48 M6 -36 V-48" stroke="#9aa3a6" stroke-width="2"/><circle cx="0" cy="-52" r="9" fill="#1a1a1a" stroke="#000"/>` +
        `<path data-flame="${c.id}" d="M0 -78 C10 -66 8 -58 0 -54 C-8 -58 -10 -66 0 -78 Z" fill="#ff8a1f" opacity="${c.props.level}"/>` +
        `<rect x="-12" y="-22" width="16" height="16" fill="#2f6fd0" stroke="#bcd"/><circle cx="-4" cy="-14" r="4" fill="#f0c84b"/>` +
        smdLed(`data-pwr="${c.id}"`, 14, -18, '#ff3b30') + smdLed(`data-do="${c.id}"`, 14, -6, '#34e86b') + tiny(14, 6, 'D0', '#dfe9ff', 'middle', 5.5) +
        FLM.svg + label(30, -48, c.name, 'start');
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), 3000);
      const v = E.prev(T('VCC')) - E.prev(T('GND')); const vcc = v > 1 ? v : 0;
      E.src(T('AO'), T('GND'), vcc * (1 - 0.92 * c.props.level), 1000);
      E.src(T('DO'), T('GND'), c.props.level > c.props.threshold ? 0 : vcc, 100); // activo en bajo
    },
    readout(c, V){ return `AO: ${fmt(V('AO'), 2)} V (≈ ${Math.round(V('AO') / 5 * 1023)}; baja con la llama)\nDO: ${c.props.level > c.props.threshold ? 'LOW (llama detectada)' : 'HIGH (sin llama)'}`; },
    render(c, k){
      const pw = k.powered('VCC', 'GND', 3);
      glowAttr(k.q(`[data-pwr="${c.id}"]`), pw); glowAttr(k.q(`[data-do="${c.id}"]`), pw && c.props.level > c.props.threshold);
      const f = k.q(`[data-flame="${c.id}"]`); if (f) f.setAttribute('opacity', (c.props.level * (0.85 + 0.15 * Math.sin(k.now / 70))).toFixed(2));
    },
  },
  gas: {
    label: 'Sensor de gas MQ-2', prefix: 'GAS', cat: 'Sensores',
    terms: GAS.terms, box: [-38, -50, 76, 110], props: () => ({ ppm: 300, threshold: 1000 }),
    controls: [{ prop: 'ppm', label: 'Concentración de gas', min: 200, max: 10000, step: 10, unit: 'ppm' }, { prop: 'threshold', label: 'Umbral de DO', min: 300, max: 8000, step: 10, unit: 'ppm' }],
    svg(c){
      let s = pcb(-36, -30, 72, 62, '#1e5fa8', '#143f70') + `<circle cx="0" cy="-22" r="24" fill="#b7bdc1" stroke="#7f878c" stroke-width="2"/><circle cx="0" cy="-22" r="17" fill="#8d959a"/>`;
      for (let i = -2; i <= 2; i++) s += `<line x1="${i * 6}" y1="-37" x2="${i * 6}" y2="-7" stroke="#6b7277" stroke-width="1.5"/><line x1="-15" y1="${-22 + i * 6}" x2="15" y2="${-22 + i * 6}" stroke="#6b7277" stroke-width="1.5"/>`;
      return s + smdLed(`data-pwr="${c.id}"`, -24, 18, '#ff3b30') + smdLed(`data-do="${c.id}"`, 24, 18, '#34e86b') + `<rect x="-7" y="10" width="14" height="14" fill="#2f6fd0" stroke="#bcd"/>` +
        GAS.svg + label(0, -52, `${c.name} · <tspan data-ppm="${c.id}">${c.props.ppm} ppm</tspan>`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), 33); // calefactor (~150 mA)
      const v = E.prev(T('VCC')) - E.prev(T('GND')); const vcc = v > 1 ? v : 0;
      const ao = Math.min(0.95, 0.12 + 0.8 * Math.log10(c.props.ppm / 200) / Math.log10(50));
      E.src(T('AO'), T('GND'), vcc * ao, 1000);
      E.src(T('DO'), T('GND'), c.props.ppm > c.props.threshold ? 0 : vcc, 100);
    },
    readout(c, V){ return `AO: ${fmt(V('AO'), 2)} V (≈ ${Math.round(V('AO') / 5 * 1023)}; sube con el gas)\nDO: ${c.props.ppm > c.props.threshold ? 'LOW (supera el umbral)' : 'HIGH'}`; },
    render(c, k){
      const pw = k.powered('VCC', 'GND', 3);
      glowAttr(k.q(`[data-pwr="${c.id}"]`), pw); glowAttr(k.q(`[data-do="${c.id}"]`), pw && c.props.ppm > c.props.threshold);
      const t = k.q(`[data-ppm="${c.id}"]`); if (t) t.textContent = `${c.props.ppm} ppm`;
    },
  },
  relay: {
    label: 'Módulo relé 5 V', prefix: 'RELE', cat: 'Salidas',
    terms: { ...RLY.terms, ...RLY_OUT.terms }, box: [-80, -38, 164, 76], props: () => ({ trigger: 'low' }),
    options: [{ prop: 'trigger', label: 'Se activa con', values: [['low', 'LOW (lo más común)'], ['high', 'HIGH']] }],
    svg(c){
      return pcb(-62, -34, 128, 68, '#1e5fa8', '#143f70') + `<rect x="-24" y="-28" width="56" height="44" rx="2" fill="#2a6fd6" stroke="#174a96"/>` +
        tiny(4, -10, 'SRD-05VDC', '#e9f1ff', 'middle', 6.5) + tiny(4, 0, '10A 250VAC', '#e9f1ff', 'middle', 6) +
        `<rect x="40" y="-30" width="22" height="60" rx="2" fill="#2f8a4a" stroke="#1d5e31"/>` +
        `<g data-arm="${c.id}"><line x1="51" y1="0" x2="${c._on ? 59 : 43}" y2="-12" stroke="#f0d060" stroke-width="2.5"/></g>` +
        smdLed(`data-rl="${c.id}"`, -42, 22, '#ff3b30') + tiny(-42, 31, 'IN', '#dfe9ff', 'middle', 5.5) +
        RLY.svg + RLY_OUT.svg + label(4, -40, `${c.name} · activo en ${c.props.trigger === 'low' ? 'LOW' : 'HIGH'}`);
    },
    elec(c, T, E){
      if (c.props.trigger === 'low') E.res(T('VCC'), T('IN'), 2700); else E.res(T('IN'), T('GND'), 2700);
      E.res(T('VCC'), T('GND'), c._on ? 70 : 20000);
      E.res(T('COM'), T(c._on ? 'NO' : 'NC'), 0.05);
    },
    device: relayDevice,
    readout(c){ return c._on ? 'Bobina activada: COM unido a NO' : 'En reposo: COM unido a NC'; },
    render(c, k){
      glowAttr(k.q(`[data-rl="${c.id}"]`), c._on);
      const a = k.q(`[data-arm="${c.id}"] line`); if (a) a.setAttribute('x2', c._on ? 59 : 43);
      if (k.running && !k.powered('VCC', 'GND', 3.5)) k.warn(`${c.name}: el módulo no tiene alimentación. VCC a 5V y GND a GND.`);
    },
  },
  l298n: {
    label: 'Driver L298N', prefix: 'DRV', cat: 'Salidas',
    terms: { ...L298_IN.terms, ...L298_PW.terms, ...L298_A.terms, ...L298_B.terms }, box: [-100, -84, 200, 180], props: () => ({ jumperA: true, jumperB: true }),
    checks: [{ prop: 'jumperA', label: 'Puente en ENA (motor A siempre habilitado)' }, { prop: 'jumperB', label: 'Puente en ENB (motor B siempre habilitado)' }],
    svg(c){
      let s = pcb(-84, -80, 168, 156, '#b3262b', '#7d171b');
      s += `<rect x="-34" y="-80" width="68" height="44" fill="#2b2b2b"/>`; for (let i = 0; i < 9; i++) s += `<rect x="${-32 + i * 7.5}" y="-80" width="4" height="40" fill="#3d3d3d"/>`;
      s += `<rect x="-22" y="-36" width="44" height="22" rx="2" fill="#151515"/>` + tiny(0, -22, 'L298N', '#c9c9c9', 'middle', 7);
      for (const x of [-76, 64]) s += `<rect x="${x}" y="-34" width="14" height="44" rx="2" fill="#1f63d6"/>`;
      s += `<rect x="-74" y="52" width="48" height="16" rx="2" fill="#1f63d6"/>`;
      if (c.props.jumperA) s += `<rect x="-13.5" y="64" width="7" height="10" fill="#111"/>`;
      if (c.props.jumperB) s += `<rect x="56.5" y="64" width="7" height="10" fill="#111"/>`;
      return s + smdLed(`data-pwr="${c.id}"`, 60, 30, '#ff3b30') + L298_IN.svg + L298_PW.svg + L298_A.svg + L298_B.svg + label(0, -88, c.name);
    },
    elec(c, T, E){
      E.res(T('5V'), T('GND'), 5000); E.res(T('VS'), T('GND'), 3000);
      const vs = Math.max(0, E.prev(T('VS')) - E.prev(T('GND')));
      const ch = (en, a, b, oa, ob, jumper) => {
        const e = jumper ? 1 : E.level(T(en)); if (e < 0.005 || vs < 1) return; // salidas en alta impedancia
        const vo = Math.max(0, vs - 1.8), R = 1.5 / e;
        E.src(T(oa), T('GND'), e * E.level(T(a)) * vo, R); E.src(T(ob), T('GND'), e * E.level(T(b)) * vo, R);
      };
      ch('ENA', 'IN1', 'IN2', 'OUT1', 'OUT2', c.props.jumperA); ch('ENB', 'IN3', 'IN4', 'OUT3', 'OUT4', c.props.jumperB);
    },
    readout(c, V){ return `Alimentación de motores: ${fmt(V('VS') - V('GND'), 1)} V\nMotor A (OUT1−OUT2): ${fmt(V('OUT1') - V('OUT2'), 2)} V\nMotor B (OUT3−OUT4): ${fmt(V('OUT3') - V('OUT4'), 2)} V`; },
    render(c, k){
      const vs = k.V('VS') - k.V('GND'); glowAttr(k.q(`[data-pwr="${c.id}"]`), vs > 4);
      if (k.running && k.wired('VS') && vs < 4) k.warn(`${c.name}: la entrada +12V tiene ${fmt(vs, 1)} V. Conecta una batería (6–12 V) a +12V y GND, y une el GND con el del Arduino.`);
      if (k.running && !k.wired('VS') && (k.wired('OUT1') || k.wired('OUT3'))) k.warn(`${c.name}: falta alimentar los motores. Conecta una batería a +12V y GND.`);
    },
  },
  motor: {
    label: 'Motor DC', prefix: 'M', cat: 'Salidas',
    terms: { p: { x: -56, y: -10, dx: -1, dy: 0, name: '+' }, n: { x: -56, y: 10, dx: -1, dy: 0, name: '−' } },
    box: [-58, -40, 124, 80], props: () => ({}),
    svg(c){
      return `<path d="M-56 -10 H-40 M-56 10 H-40" stroke="#c8b46a" stroke-width="3"/>` + tiny(-48, -14, '+', 'var(--muted)', 'middle', 8) +
        `<rect x="-40" y="-22" width="60" height="44" rx="6" fill="#c3c8cc" stroke="#7e868b" stroke-width="2"/><rect x="-40" y="-22" width="14" height="44" rx="4" fill="#d9a02a"/>` +
        `<rect x="20" y="-3" width="12" height="6" fill="#9aa3a6"/>` +
        `<g data-prop="${c.id}" transform="rotate(0 44 0)"><ellipse cx="44" cy="-18" rx="6" ry="17" fill="#e6553a" opacity=".9"/><ellipse cx="44" cy="18" rx="6" ry="17" fill="#e6553a" opacity=".9"/><circle cx="44" cy="0" r="5" fill="#333"/></g>` +
        label(-10, -28, `${c.name} · <tspan data-rpm="${c.id}">detenido</tspan>`);
    },
    elec(c, T, E){ E.res(T('p'), T('n'), 8); },
    readout(c, V){ const v = V('p') - V('n'); return `Tensión: ${fmt(v, 2)} V\nCorriente: ${fmt(Math.abs(v) / 8 * 1000, 0)} mA\nGiro: ${Math.abs(v) < 0.8 ? 'detenido' : v > 0 ? 'horario' : 'antihorario'}`; },
    render(c, k){
      const v = k.V('p') - k.V('n'); const target = Math.abs(v) < 0.8 ? 0 : Math.max(-1, Math.min(1, v / 6));
      c._spd = (c._spd || 0) + (target - (c._spd || 0)) * 0.08; c._rot = ((c._rot || 0) + c._spd * 40) % 360;
      const g = k.q(`[data-prop="${c.id}"]`); if (g) g.setAttribute('transform', `rotate(${c._rot.toFixed(1)} 44 0)`);
      const t = k.q(`[data-rpm="${c.id}"]`); if (t) t.textContent = Math.abs(c._spd) < 0.02 ? 'detenido' : `${Math.round(Math.abs(c._spd) * 200)} rpm ${c._spd > 0 ? '↻' : '↺'}`;
      const i = Math.abs(v) / 8; const p = k.drivenBy('p');
      if (k.running && p >= 0 && i > 0.04) k.warn(`${c.name}: el motor está conectado directo al pin ${p < 14 ? 'D' + p : 'A' + (p - 14)} y pide ${Math.round(i * 1000)} mA. Un pin da 40 mA como máximo: usa un driver (L298N) o un transistor.`);
    },
  },
  battery: {
    label: 'Batería 9 V', prefix: 'BAT', cat: 'Pasivos',
    terms: { p: { x: -12, y: -50, dx: 0, dy: -1, name: '+ (9 V)' }, n: { x: 12, y: -50, dx: 0, dy: -1, name: '−' } },
    box: [-30, -52, 60, 104], props: () => ({ volts: 9 }),
    controls: [{ prop: 'volts', label: 'Tensión', min: 3, max: 12, step: 0.1, unit: 'V' }],
    svg(c){
      return `<path d="M-12 -50 V-38 M12 -50 V-38" stroke="#c8b46a" stroke-width="3"/><rect x="-20" y="-40" width="16" height="6" fill="#aab"/><rect x="5" y="-41" width="14" height="7" rx="2" fill="#aab"/>` +
        `<rect x="-26" y="-34" width="52" height="82" rx="4" fill="#1d1d1f"/><rect x="-26" y="-6" width="52" height="34" fill="#e2b33a"/>` + tiny(0, 16, `${fmt(c.props.volts, 1)} V`, '#1d1d1f', 'middle', 11) +
        tiny(-12, -22, '+', '#fff', 'middle', 10) + tiny(12, -22, '−', '#fff', 'middle', 10) + label(0, 62, c.name);
    },
    elec(c, T, E){ E.src(T('p'), T('n'), c.props.volts, 1.5); },
    readout(c, V){ const v = V('p') - V('n'); return `Tensión en bornes: ${fmt(v, 2)} V\nCorriente: ${fmt(Math.max(0, (c.props.volts - v) / 1.5) * 1000, 0)} mA`; },
  },
  oled: {
    label: 'OLED SSD1306 I2C', prefix: 'OLED', cat: 'Pantallas',
    terms: OLED.terms, box: [-70, -66, 140, 116], props: () => ({ address: 0x3C }),
    options: [{ prop: 'address', label: 'Dirección I2C', values: [[0x3C, '0x3C'], [0x3D, '0x3D']], num: true }],
    svg(c){
      return pcb(-66, -48, 132, 96, '#1b2b4a', '#0d1830') + hole(-58, -40) + hole(58, -40) + hole(-58, 40) + hole(58, 40) +
        `<rect x="-58" y="-30" width="116" height="66" rx="2" fill="#050608"/>` +
        `<image data-oled="${c.id}" x="-51.2" y="-25.6" width="102.4" height="51.2" preserveAspectRatio="none" style="image-rendering:pixelated" href=""/>` +
        OLED.svg + label(0, 60, `${c.name} · 128×64 · 0x${c.props.address.toString(16).toUpperCase()}`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 2000); E.res(T('SDA'), T('VCC'), 10000); E.res(T('SCL'), T('VCC'), 10000); },
    i2c: true,
    readout(c){ const m = c._oled; return m ? `Pantalla ${m.on ? 'encendida' : 'apagada'} · contraste ${m.contrast}${m.invert ? ' · invertida' : ''}` : ''; },
  },
  max7219: {
    label: 'Matriz LED 8×8 MAX7219', prefix: 'MTX', cat: 'Pantallas',
    terms: MAX.terms, box: [-80, -64, 144, 132], props: () => ({}),
    svg(c){
      let s = pcb(-62, -60, 122, 124, '#1e5fa8', '#143f70') + `<rect x="-52" y="-52" width="104" height="104" rx="2" fill="#181818"/>`;
      for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) s += `<circle cx="${-45.5 + k * 13}" cy="${-45.5 + r * 13}" r="5" fill="#3a1414"/><circle data-dot="${c.id}:${r}:${k}" cx="${-45.5 + k * 13}" cy="${-45.5 + r * 13}" r="5" fill="#ff2a1a" opacity="0"/>`;
      return s + MAX.svg + label(0, -68, `${c.name} · MAX7219`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 1000); },
    device: maxDevice,
    readout(c){ const m = c._max; return m ? `${m.shutdown ? 'En apagado (shutdown): llama a shutdown(0, false)' : 'Encendida'} · brillo ${m.intensity}/15` : ''; },
  },
  hc05: {
    label: 'Bluetooth HC-05 / HC-06', prefix: 'BT', cat: 'Comunicación',
    terms: BT.terms, box: [-36, -64, 72, 134], props: () => ({ baud: 9600 }),
    options: [{ prop: 'baud', label: 'Velocidad (baudios)', values: [[9600, '9600 (por defecto)'], [38400, '38400'], [115200, '115200']], num: true }],
    svg(c){
      return pcb(-30, -60, 60, 100, '#1e5fa8', '#143f70') + `<rect x="-22" y="-56" width="44" height="66" rx="2" fill="#1b6fb8" stroke="#0f4a7e"/>` +
        `<path d="M-14 -50 h8 v6 h-8 v6 h8 v6 h-8" fill="none" stroke="#e7d27a" stroke-width="1.6"/>` + tiny(4, -18, 'HC-05', '#e9f1ff', 'middle', 7.5) +
        smdLed(`data-btled="${c.id}"`, 18, 22, '#ff3b30') + BT.svg + label(34, -48, c.name, 'start');
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 1000); E.src(T('TXD'), T('GND'), c._tx === 0 ? 0 : 3.3, 100); },
    device: btDevice,
    readout(c){ return `UART a ${c.props.baud} baudios. Escríbele desde el panel «Celular (Bluetooth)».`; },
    render(c, k){
      const on = k.running && k.powered('VCC', 'GND', 3.3);
      glowAttr(k.q(`[data-btled="${c.id}"]`), on && Math.floor(k.now / 180) % 2 === 0);
      if (k.running && !on) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
    },
  },
};

// Dibuja la RAM del SSD1306 en un lienzo y la entrega como imagen (data URL).
const oledCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export function oledImage(m, powered){
  const cv = oledCanvas; cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
  const img = g.createImageData(128, 64); const d = img.data;
  const show = powered && m.on && m.pump !== false;
  const lvl = 120 + Math.round(m.contrast / 255 * 135);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    let p = show ? m.pixel(x, y) : 0; if (show && m.invert) p ^= 1;
    const i = (y * 128 + x) * 4;
    d[i] = p ? Math.round(lvl * 0.55) : 4; d[i + 1] = p ? Math.round(lvl * 0.85) : 6; d[i + 2] = p ? lvl : 10; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

// Utilidades de dibujo compartidas con kits.js
export { header, pcb, hole, smdLed, glowAttr, tiny, label, fmt, US };
