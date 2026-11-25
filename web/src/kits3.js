// Módulos de la tanda 3c: reloj DS1302, motor paso a paso 28BYJ-48 con driver ULN2003,
// lector RFID RC522 (SPI) y sensor de temperatura DS18B20 (1-Wire).
import { PinState } from './emulator.js';
import { header, pcb, hole, smdLed, glowAttr, tiny, label, fmt, US } from './modules.js';

const isHigh = (api, p) => p >= 0 && api.state(p) === PinState.High;
const bcd = v => ((v / 10) | 0) << 4 | v % 10;
const unbcd = v => (v >> 4) * 10 + (v & 15);
const MS = 16000; // ciclos por milisegundo

/* =========================================================================
   Reloj DS1302 (protocolo de 3 hilos: CE/RST, SCLK, I/O)
   ========================================================================= */
const RTC = header(['VCC', 'GND', 'CLK', 'DAT', 'RST'], { x0: 62, y0: -28, dir: 'right', len: 14, labels: { VCC: 'VCC (5 V)', GND: 'GND', CLK: 'CLK (SCLK)', DAT: 'DAT (I/O)', RST: 'RST (CE)' } });
function rtcState(c){
  if (!c._rtc) { const d = new Date(); c._rtc = { base: d.getTime() - d.getTimezoneOffset() * 60000, cyc0: 0, halted: false, h12: false, wp: false, ram: new Array(31).fill(0), tcs: 0x5C, last: null }; }
  return c._rtc;
}
function ds1302Device(c, api){
  let ce = false, clk = false, bitn = 0, byte = 0, cmd = -1, reading = false, first = false, outByte = 0, outBit = 0, idx = 0, burstBuf = null;
  const r = () => rtcState(c);
  const cur = () => { const s = r(); return s.base + (s.halted ? 0 : (api.now() - s.cyc0) / MS); };
  const setBase = ms => { const s = r(); s.base = ms; s.cyc0 = api.now(); };
  const readReg = (ram, i) => {
    const s = r(); if (ram) return i < 31 ? s.ram[i] : 0;
    const d = new Date(cur());
    switch (i) {
      case 0: return bcd(d.getUTCSeconds()) | (s.halted ? 0x80 : 0);
      case 1: return bcd(d.getUTCMinutes());
      case 2: { const h = d.getUTCHours(); if (!s.h12) return bcd(h); const h12 = h % 12 || 12; return 0x80 | (h >= 12 ? 0x20 : 0) | bcd(h12); }
      case 3: return bcd(d.getUTCDate());
      case 4: return bcd(d.getUTCMonth() + 1);
      case 5: return d.getUTCDay() + 1;
      case 6: return bcd(d.getUTCFullYear() % 100);
      case 7: return s.wp ? 0x80 : 0;
      case 8: return s.tcs;
      default: return 0;
    }
  };
  const hourOf = v => (v & 0x80) ? (unbcd(v & 0x1F) % 12) + ((v & 0x20) ? 12 : 0) : unbcd(v & 0x3F);
  const writeClock = vals => { // vals: [seg, min, hora, día, mes, -, año] (undefined = sin cambio)
    const s = r(), d = new Date(cur());
    const f = [d.getUTCSeconds(), d.getUTCMinutes(), d.getUTCHours(), d.getUTCDate(), d.getUTCMonth() + 1, 0, d.getUTCFullYear() % 100];
    if (vals[0] !== undefined) f[0] = unbcd(vals[0] & 0x7F);
    if (vals[1] !== undefined) f[1] = unbcd(vals[1] & 0x7F);
    if (vals[2] !== undefined) { s.h12 = !!(vals[2] & 0x80); f[2] = hourOf(vals[2]); }
    if (vals[3] !== undefined) f[3] = unbcd(vals[3] & 0x3F);
    if (vals[4] !== undefined) f[4] = unbcd(vals[4] & 0x1F);
    if (vals[6] !== undefined) f[6] = unbcd(vals[6]);
    const ms = Date.UTC(2000 + f[6], f[4] - 1, f[3], f[2], f[1], f[0]);
    setBase(ms);
    if (vals[0] !== undefined) s.halted = !!(vals[0] & 0x80);
  };
  const writeReg = (ram, i, v) => {
    const s = r();
    if (s.wp && !(i === 7 && !ram)) return; // protección contra escritura
    if (ram) { if (i < 31) s.ram[i] = v; return; }
    if (i === 7) { s.wp = !!(v & 0x80); return; }
    if (i === 8) { s.tcs = v; return; }
    if (i === 5) return; // el día de la semana se calcula de la fecha
    if (i === 0 && !!(v & 0x80) !== s.halted) { // arrancar o detener el oscilador
      if (v & 0x80) { s.base = cur(); s.halted = true; } else { s.cyc0 = api.now(); s.halted = false; }
    }
    const vals = []; vals[i] = v; writeClock(vals);
  };
  const setOut = v => { if (c._out !== v) { c._out = v; api.drive(); } };
  return {
    reset(){ const s = rtcState(c); if (s.last != null) s.base = s.last; s.cyc0 = 0; c._out = null; ce = clk = false; cmd = -1; },
    now: () => { const v = cur(); r().last = v; return v; },
    onPin(p){
      const pr = api.pin('RST'), pc = api.pin('CLK'), pd = api.pin('DAT');
      if (p !== pr && p !== pc && p !== pd) return;
      if (!api.powered('VCC', 'GND', 2)) return;
      const ceNow = isHigh(api, pr), clkNow = isHigh(api, pc);
      if (!ceNow) { ce = false; clk = clkNow; if (burstBuf) burstBuf = null; setOut(null); return; }
      if (!ce) { ce = true; bitn = 0; byte = 0; cmd = -1; reading = false; idx = 0; burstBuf = null; clk = clkNow; return; }
      if (clkNow && !clk && !reading) { // flanco de subida: el DS1302 lee un bit (LSB primero)
        if (isHigh(api, pd)) byte |= 1 << bitn;
        if (++bitn === 8) {
          const b = byte; bitn = 0; byte = 0;
          if (cmd < 0) {
            cmd = b; if (!(cmd & 0x80)) { cmd = 0; reading = false; }
            else if (cmd & 1) { reading = true; first = true; idx = 0; }
            else if (((cmd >> 1) & 31) === 31 && !(cmd & 0x40)) burstBuf = [];
          } else if (cmd & 0x80) {
            const ram = !!(cmd & 0x40), reg = (cmd >> 1) & 31;
            if (reg === 31) {
              if (ram) writeReg(true, idx++, b);
              else if (burstBuf) { burstBuf.push(b); if (burstBuf.length === 7) { if (!r().wp) writeClock(burstBuf); } if (burstBuf.length === 8) writeReg(false, 7, b); }
            } else writeReg(ram, reg, b);
          }
        }
      } else if (!clkNow && clk && reading) { // flanco de bajada: el DS1302 saca el bit siguiente
        const ram = !!(cmd & 0x40), reg = (cmd >> 1) & 31;
        if (first) { first = false; outByte = readReg(ram, reg === 31 ? 0 : reg); outBit = 0; }
        else if (outBit === 8) { idx++; outByte = readReg(ram, reg === 31 ? idx : reg); outBit = 0; }
        setOut((outByte >> outBit++) & 1);
      }
      clk = clkNow;
    },
  };
}

/* =========================================================================
   Motor 28BYJ-48 con driver ULN2003
   ========================================================================= */
const ULN = header(['IN1', 'IN2', 'IN3', 'IN4'], { x0: -64, y0: -14, dir: 'left', len: 14, labels: { IN1: 'IN1 (bobina A)', IN2: 'IN2 (bobina B)', IN3: 'IN3 (bobina C)', IN4: 'IN4 (bobina D)' } });
const ULNP = header(['VCC', 'GND'], { x0: -64, y0: 52, dir: 'left', len: 14, labels: { VCC: '+ (5 V)', GND: '− (GND)' }, texts: { VCC: '+', GND: '−' } });
const STEPS_REV = 2048; // pasos completos por vuelta del eje de salida (reducción 1:64)
function stepperDevice(c, api){
  let pend = null, lastAng = null, lastCommit = 0;
  const coilAngle = () => {
    let x = 0, y = 0, n = 0;
    for (let i = 0; i < 4; i++) if (isHigh(api, api.pin('IN' + (i + 1)))) { x += Math.cos(i * Math.PI / 2); y += Math.sin(i * Math.PI / 2); n++; }
    c._coils = [1, 2, 3, 4].map(i => isHigh(api, api.pin('IN' + i)));
    if (Math.hypot(x, y) < 0.5) return null;
    return Math.atan2(y, x) * 180 / Math.PI;
  };
  const commit = (ang, cyc) => {
    if (ang == null) return;
    if (lastAng == null) { lastAng = ang; lastCommit = cyc; return; }
    let d = ang - lastAng; while (d > 180) d -= 360; while (d <= -180) d += 360;
    if (Math.abs(d) < 1 || Math.abs(d) > 179) return;
    const dt = (cyc - lastCommit) / MS;
    lastCommit = cyc; lastAng = ang;
    if (dt < 1.4 * Math.abs(d) / 90) { c._stall = true; return; } // más de ~20 rpm: el motor se traba
    c._steps = (c._steps || 0) + d / 90; c._stall = false;
  };
  const settle = () => { if (pend && api.now() - pend.cyc >= 50 * US) { commit(pend.ang, pend.cyc); pend = null; } };
  c._settle = settle;
  return {
    reset(){ pend = null; lastAng = null; c._stall = false; c._coils = [false, false, false, false]; },
    onPin(p, s, old, cyc){
      let mine = false; for (let i = 1; i <= 4; i++) if (p === api.pin('IN' + i)) mine = true;
      if (!mine) return;
      if (pend && cyc - pend.cyc >= 50 * US) commit(pend.ang, pend.cyc);
      const pw = api.powered('VCC', 'GND', 4);
      pend = { ang: pw ? coilAngle() : null, cyc };
      if (!pw) c._coils = [1, 2, 3, 4].map(i => isHigh(api, api.pin('IN' + i)));
    },
  };
}

/* =========================================================================
   Lector RFID RC522 (MFRC522 por SPI) con tarjetas MIFARE Classic 1K
   ========================================================================= */
const RC = header(['SDA', 'SCK', 'MOSI', 'MISO', 'IRQ', 'GND', 'RST', 'V33'], { x0: -49, y0: 66, labels: { SDA: 'SDA (SS, selección)', SCK: 'SCK', MOSI: 'MOSI', MISO: 'MISO', IRQ: 'IRQ (sin usar)', GND: 'GND', RST: 'RST', V33: '3.3V (¡no 5 V!)' }, texts: { V33: '3V3' } });
const CARDS = { tarjeta: [0x93, 0x3A, 0x7C, 0x1D], llavero: [0x5A, 0x21, 0xB4, 0x0C] };
const hex = a => a.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
function crcA(data){
  let crc = 0x6363;
  for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0x8408 : crc >> 1; }
  return [crc & 0xFF, crc >> 8];
}
function newCard(uid){
  const mem = []; for (let b = 0; b < 64; b++) mem.push(new Array(16).fill(0));
  mem[0] = [...uid, uid.reduce((a, v) => a ^ v, 0), 0x08, 0x04, 0x00, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69];
  for (let s = 0; s < 16; s++) mem[s * 4 + 3] = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x07, 0x80, 0x69, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
  return { uid, mem, st: 'idle', auth: -1, pendingWrite: -1 };
}
function rc522Device(c, api){
  const R = new Uint8Array(64); let fifo = [], txn = null, ssLow = false;
  const cards = c._cards || (c._cards = {});
  const card = () => { const k = c.props.card; if (!k || k === 'ninguna' || !c.props.near) return null; return cards[k] || (cards[k] = newCard(CARDS[k])); };
  const softReset = () => { R.fill(0); R[0x01] = 0x20; R[0x0A] = 0; R[0x0C] = 0x10; R[0x14] = 0x80; R[0x37] = 0x92; R[0x11] = 0x3F; R[0x13] = 0x84; R[0x24] = 0x26; R[0x2A] = 0; fifo = []; };
  softReset();
  const irq = bits => { R[0x04] |= bits; };
  // La tarjeta responde a una trama; devuelve [bytes, bitsVálidosDelÚltimo] o null (sin respuesta)
  const picc = (d, txBits) => {
    const k = card(); if (!k) return null;
    const ok = () => { const l = d.length; if (l < 3) return false; const [a, b] = crcA(d.slice(0, l - 2)); return a === d[l - 2] && b === d[l - 1]; };
    if (d.length === 1 && txBits === 7 && (d[0] === 0x26 || d[0] === 0x52)) {
      if (d[0] === 0x26 && k.st === 'halt') return null;
      if (d[0] === 0x26 && k.st === 'active') { k.st = 'idle'; return null; }
      k.st = 'ready'; k.auth = -1; R[0x08] &= ~0x08; return [[0x04, 0x00], 0];
    }
    if (d[0] === 0x93 && d[1] === 0x20 && k.st === 'ready') return [[...k.uid, k.mem[0][4]], 0];
    if (d[0] === 0x93 && d[1] === 0x70 && d.length === 9 && ok() && d.slice(2, 6).every((v, i) => v === k.uid[i])) { k.st = 'active'; return [[0x08, ...crcA([0x08])], 0]; }
    if (k.st !== 'active') return null;
    if (d[0] === 0x50 && d[1] === 0x00) { k.st = 'halt'; k.auth = -1; R[0x08] &= ~0x08; return null; }
    if (k.pendingWrite >= 0 && d.length === 18) { if (ok()) k.mem[k.pendingWrite] = d.slice(0, 16); k.pendingWrite = -1; return [[0x0A], 4]; }
    if (d[0] === 0x30 && d.length === 4 && ok()) {
      const blk = d[1]; if (blk > 63 || k.auth !== (blk >> 2)) return [[0x04], 4];
      let data = k.mem[blk].slice(); if ((blk & 3) === 3) data = [0, 0, 0, 0, 0, 0, ...data.slice(6, 10), 0, 0, 0, 0, 0, 0]; // las claves A no se pueden leer
      return [[...data, ...crcA(data)], 0];
    }
    if (d[0] === 0xA0 && d.length === 4 && ok()) { const blk = d[1]; if (blk === 0 || blk > 63 || k.auth !== (blk >> 2)) return [[0x04], 4]; k.pendingWrite = blk; return [[0x0A], 4]; }
    return [[0x04], 4]; // NAK
  };
  const runCommand = cmd => {
    R[0x01] = (R[0x01] & 0xF0) | cmd;
    if (cmd === 0x0F) { softReset(); return; }
    if (cmd === 0x03) { const [l, h] = crcA(fifo); fifo = []; R[0x22] = l; R[0x21] = h; R[0x05] |= 0x04; R[0x01] &= 0xF0; return; } // CalcCRC
    if (cmd === 0x0E) { // MFAuthent
      const k = card(), d = fifo; fifo = [];
      const blk = d[1], key = d.slice(2, 8), tr = k && blk < 64 ? k.mem[(blk | 3)] : null;
      const good = k && k.st === 'active' && tr && ((d[0] === 0x60 && key.every((v, i) => v === tr[i])) || (d[0] === 0x61 && key.every((v, i) => v === tr[10 + i])));
      if (good) { k.auth = blk >> 2; R[0x08] |= 0x08; irq(0x10); } else irq(0x01);
      R[0x01] &= 0xF0; return;
    }
    if (cmd === 0x00) return; // Idle
  };
  const startSend = () => {
    const txBits = R[0x0D] & 7, d = fifo; fifo = [];
    const res = api.powered('V33', 'GND', 2.5) && api.state(api.pin('RST')) !== PinState.Low ? picc(d, txBits) : null;
    R[0x0D] &= 0x7F;
    if (!res) { irq(0x01); c._lastTx = performance.now(); return; } // sin respuesta: vence el temporizador
    const [bytes, last] = res; fifo = bytes.slice(); R[0x0C] = (R[0x0C] & 0xF8) | last; R[0x06] = 0; irq(0x30); c._lastTx = c._seen = performance.now();
  };
  const read = reg => {
    if (reg === 0x09) return fifo.length ? fifo.shift() : 0;
    if (reg === 0x0A) return fifo.length;
    return R[reg];
  };
  const write = (reg, v) => {
    if (reg === 0x09) { if (fifo.length < 64) fifo.push(v); return; }
    if (reg === 0x0A) { if (v & 0x80) { fifo = []; R[0x0B] &= ~0x80; } return; }
    if (reg === 0x04 || reg === 0x05) { if (v & 0x80) R[reg] |= v & 0x7F; else R[reg] &= ~(v & 0x7F); return; }
    if (reg === 0x01) { runCommand(v & 0x0F); R[0x01] = (R[0x01] & 0x0F) | (v & 0x30); return; }
    if (reg === 0x0D) { R[0x0D] = v; if ((v & 0x80) && (R[0x01] & 0x0F) === 0x0C) startSend(); return; }
    if (reg === 0x37) return;
    R[reg] = v;
  };
  return {
    reset(){ softReset(); txn = null; for (const k of Object.values(cards)) { k.st = 'idle'; k.auth = -1; } },
    onPin(p, s){ if (p === api.pin('SDA')) { const low = s === PinState.Low; if (low !== ssLow) { ssLow = low; txn = null; } } },
    onSpi(b){
      const { mosi, sck } = api.board().spi;
      if (api.pin('MOSI') !== mosi || api.pin('SCK') !== sck || api.state(api.pin('SDA')) !== PinState.Low) return undefined;
      if (!api.powered('V33', 'GND', 2.5)) return 0x00;
      if (!txn) { txn = b & 0x80 ? { mode: 'r', reg: (b >> 1) & 0x3F } : { mode: 'w', reg: (b >> 1) & 0x3F }; return 0; }
      if (txn.mode === 'w') { write(txn.reg, b); return 0; }
      const v = read(txn.reg); txn.reg = (b >> 1) & 0x3F; if (!(b & 0x80)) txn = null; return v;
    },
  };
}

/* =========================================================================
   Sensor de temperatura DS18B20 (1-Wire)
   ========================================================================= */
const DS = header(['GND', 'DQ', 'VDD'], { x0: -14, y0: 22, labels: { GND: 'GND', DQ: 'DQ (datos 1-Wire)', VDD: 'VDD (5 V)' } });
function crc8(a){ let crc = 0; for (let b of a) for (let i = 0; i < 8; i++) { const mix = (crc ^ b) & 1; crc >>= 1; if (mix) crc ^= 0x8C; b >>= 1; } return crc; }
function dsDevice(c, api){
  let fall = 0, mode = 'idle', rx = null, tx = [], txInf = null, afterTx = null, search = null, convDone = 0;
  const rom = (() => { const r = [0x28, 0xAA, c.id & 255, (c.id >> 8) & 255, 0x4B, 0x46, 0x10]; r.push(crc8(r)); return r; })();
  const sp = () => c._sp || (c._sp = (() => { const s = [0x50, 0x05, 0x4B, 0x46, 0x7F, 0xFF, 0x0C, 0x10]; s.push(crc8(s)); return s; })());
  const bits = bytes => { const o = []; for (const b of bytes) for (let i = 0; i < 8; i++) o.push((b >> i) & 1); return o; };
  const pull = us => { c._low = 1; api.drive(); api.schedule(api.now() + us * US, () => { c._low = 0; api.drive(); }); };
  const recv = (n, cb) => { mode = 'rx'; rx = { n, got: [], cb }; };
  const send = (b, cb) => { mode = 'tx'; tx = b; txInf = null; afterTx = cb || null; };
  const sendForever = f => { mode = 'tx'; tx = []; txInf = f; afterTx = null; };
  const toBytes = b => { const o = []; for (let i = 0; i < b.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v |= b[i + j] << j; o.push(v); } return o; };
  const res = () => [0x1F, 0x3F, 0x5F, 0x7F].indexOf(sp()[4] | 0x1F) ;
  const func = () => recv(8, g => {
    const cmd = toBytes(g)[0];
    if (cmd === 0x44) { // convertir temperatura
      const r = Math.max(0, res()), ms = [93.75, 187.5, 375, 750][r];
      convDone = api.now() + ms * MS;
      api.schedule(convDone, () => {
        let raw = Math.round(Math.max(-55, Math.min(125, c.props.temp)) * 16); raw &= ~((1 << (3 - r)) - 1); raw &= 0xFFFF;
        const s = sp(); s[0] = raw & 255; s[1] = raw >> 8; s[8] = crc8(s.slice(0, 8));
      });
      sendForever(() => api.now() >= convDone ? 1 : 0);
    } else if (cmd === 0xBE) send(bits(sp()), () => sendForever(() => 1));
    else if (cmd === 0x4E) recv(24, g2 => { const b = toBytes(g2), s = sp(); s[2] = b[0]; s[3] = b[1]; s[4] = (b[2] & 0x60) | 0x1F; s[8] = crc8(s.slice(0, 8)); mode = 'idle'; });
    else if (cmd === 0x48) { c._ee = sp().slice(2, 5); sendForever(() => 1); }
    else if (cmd === 0xB8) { if (c._ee) { const s = sp(); [s[2], s[3], s[4]] = c._ee; s[8] = crc8(s.slice(0, 8)); } sendForever(() => 1); }
    else if (cmd === 0xB4) sendForever(() => 1); // alimentación externa
    else mode = 'idle';
  });
  const alarm = () => { const s = sp(), t = ((s[1] << 8 | s[0]) << 16 >> 16) / 16, th = s[2] << 24 >> 24, tl = s[3] << 24 >> 24; return t >= th || t <= tl; };
  const romCmd = () => recv(8, g => {
    const cmd = toBytes(g)[0];
    if (cmd === 0x33) send(bits(rom), func);
    else if (cmd === 0xCC) func();
    else if (cmd === 0x55) recv(64, g2 => { const b = toBytes(g2); if (b.every((v, i) => v === rom[i])) func(); else mode = 'idle'; });
    else if (cmd === 0xF0 || (cmd === 0xEC && alarm())) { mode = 'search'; search = { i: 0, ph: 0, rb: bits(rom) }; }
    else mode = 'idle';
  });
  let slotRx = false;
  const slotStart = () => {
    slotRx = mode === 'rx' || (mode === 'search' && search.ph === 2);
    if (mode === 'tx') {
      let b; if (tx.length) b = tx.shift(); else if (txInf) b = txInf(); else b = 1;
      if (!b) pull(30);
      if (!tx.length && !txInf && afterTx) { const f = afterTx; afterTx = null; f(); }
    } else if (mode === 'search' && search.ph < 2) { const b = search.rb[search.i]; if ((search.ph === 0 ? b : 1 - b) === 0) pull(30); search.ph++; }
  };
  const slotEnd = us => {
    if (!slotRx) return; slotRx = false;
    const bit = us < 30 ? 1 : 0;
    if (mode === 'rx') { rx.got.push(bit); if (rx.got.length === rx.n) { const r = rx; rx = null; mode = 'idle'; r.cb(r.got); } }
    else if (mode === 'search' && search.ph === 2) { if (bit !== search.rb[search.i]) { mode = 'idle'; return; } search.i++; search.ph = 0; if (search.i === 64) func(); }
  };
  return {
    reset(){ mode = 'idle'; c._low = 0; c._sp = null; },
    onPin(p, s, old, cyc){
      if (p !== api.pin('DQ')) return;
      if (!api.powered('VDD', 'GND', 2.8)) { api.drive(); return; }
      if (s === PinState.Low && old !== PinState.Low) { fall = cyc; slotStart(); }
      else if (old === PinState.Low && s !== PinState.Low) {
        const us = (cyc - fall) / US;
        if (us >= 400) { // pulso de reset: responde con el pulso de presencia
          mode = 'idle'; romCmd(); const t = api.now() + 30 * US;
          api.schedule(t, () => { c._low = 1; api.drive(); }); api.schedule(t + 120 * US, () => { c._low = 0; api.drive(); });
        } else slotEnd(us);
      }
      api.drive(); // el maestro lee la línea pocos microsegundos después: hay que resolverla ya
    },
  };
}

export const KITS3 = {
  ds1302: {
    label: 'Reloj DS1302', prefix: 'RTC', cat: 'Módulos',
    terms: RTC.terms, box: [-64, -44, 142, 88], props: () => ({}),
    svg(c){
      return pcb(-60, -40, 122, 80, '#1e5fa8', '#143f70') + hole(-52, -32) + hole(-52, 32) +
        `<circle cx="-22" cy="0" r="27" fill="#c9ccd0" stroke="#8a8f94" stroke-width="2"/><text x="-22" y="4" font-size="9" fill="#555" text-anchor="middle" font-family="var(--f-ui)">CR2032</text>` +
        `<rect x="14" y="-18" width="24" height="22" rx="1" fill="#1b1b1b"/>` + tiny(26, -4, 'DS1302', '#ccc') +
        `<rect x="14" y="12" width="22" height="8" rx="4" fill="#cfd3d6" stroke="#888"/>` + RTC.svg +
        label(0, -46, `${c.name} · <tspan data-rtc="${c.id}">--:--:--</tspan>`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), 20000); E.res(T('RST'), T('GND'), 40000); E.res(T('CLK'), T('GND'), 40000); E.res(T('DAT'), T('GND'), 40000);
      if (c._out != null) { const v = E.prev(T('VCC')) - E.prev(T('GND')); E.src(T('DAT'), T('GND'), c._out ? Math.max(v, 0) : 0, 60); }
    },
    device: ds1302Device,
    readout(c){
      const s = c._rtc; if (!s || s.last == null) return 'Reloj con pila: sigue la hora aunque se reinicie el Arduino.\nLibrería Rtc by Makuna (RtcDS1302 + ThreeWire).';
      const d = new Date(s.last); const p = v => String(v).padStart(2, '0');
      return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}${s.halted ? ' (detenido)' : ''}${s.wp ? '\nProtegido contra escritura' : ''}`;
    },
    render(c, k){
      const d = k.dev && k.dev(c); const t = k.q(`[data-rtc="${c.id}"]`);
      if (d && d.now && t) { const v = new Date(d.now()); const p = n => String(n).padStart(2, '0'); t.textContent = `${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`; }
      if (k.running && !k.powered('VCC', 'GND', 2)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
    },
  },
  stepper: {
    label: 'Motor paso a paso 28BYJ-48 + ULN2003', prefix: 'M', cat: 'Salidas',
    terms: { ...ULN.terms, ...ULNP.terms }, box: [-82, -62, 200, 136], props: () => ({}),
    svg(c){
      let s = pcb(-64, -52, 62, 118, '#2a7a3b', '#1b5428') + `<rect x="-52" y="0" width="38" height="30" rx="1" fill="#1b1b1b"/>` + tiny(-33, 18, 'ULN2003', '#ccc', 'middle', 6);
      ['A', 'B', 'C', 'D'].forEach((n, i) => { s += smdLed(`data-coil="${c.id}:${i}"`, -50 + i * 12, -38, '#ff3b30') + tiny(-50 + i * 12, -28, n, '#e8f5e9'); });
      s += `<path d="M-2 -10 C 20 -10 20 -30 40 -30" fill="none" stroke="#e53935" stroke-width="2"/><path d="M-2 -6 C 22 -6 24 -24 40 -24" fill="none" stroke="#fb8c00" stroke-width="2"/><path d="M-2 -2 C 24 -2 28 -18 40 -18" fill="none" stroke="#fdd835" stroke-width="2"/><path d="M-2 2 C 26 2 30 -12 40 -12" fill="none" stroke="#e91e63" stroke-width="2"/><path d="M-2 6 C 28 6 32 -6 40 -6" fill="none" stroke="#1e88e5" stroke-width="2"/>`;
      s += `<circle cx="74" cy="0" r="40" fill="#c4c8cc" stroke="#7d8287" stroke-width="2"/><rect x="34" y="-36" width="16" height="36" fill="#1e88e5" opacity=".9"/><circle cx="74" cy="0" r="28" fill="#d8dcdf" stroke="#9aa0a5"/>`;
      s += `<g data-shaft="${c.id}" transform="rotate(${(c._steps || 0) * 360 / STEPS_REV} 74 0)"><circle cx="74" cy="0" r="9" fill="#f3d36b" stroke="#b39429"/><rect x="72" y="-24" width="4" height="22" rx="1" fill="#e53935"/></g>`;
      return s + ULN.svg + ULNP.svg + label(26, -58, `${c.name} · <tspan data-stepdeg="${c.id}">0°</tspan>`);
    },
    elec(c, T, E){ for (let i = 1; i <= 4; i++) E.res(T('IN' + i), T('GND'), 3400); E.res(T('VCC'), T('GND'), 2000); },
    device: stepperDevice,
    readout: c => `Giro: ${fmt((c._steps || 0) * 360 / STEPS_REV, 1)}° (${Math.round(c._steps || 0)} pasos; ${STEPS_REV} pasos por vuelta)\nCon la librería Stepper: Stepper motor(2048, IN1, IN3, IN2, IN4) y setSpeed de 5 a 15 rpm.`,
    render(c, k){
      if (c._settle) c._settle();
      const coils = c._coils || []; for (let i = 0; i < 4; i++) glowAttr(k.q(`[data-coil="${c.id}:${i}"]`), !!coils[i]);
      const deg = (c._steps || 0) * 360 / STEPS_REV;
      const g = k.q(`[data-shaft="${c.id}"]`); if (g) g.setAttribute('transform', `rotate(${deg.toFixed(2)} 74 0)`);
      const t = k.q(`[data-stepdeg="${c.id}"]`); if (t) t.textContent = fmt(deg, 0) + '°';
      if (k.running && !k.powered('VCC', 'GND', 4)) k.warn(`${c.name}: el driver necesita 5 V en + y GND en −.`);
      if (c._stall) k.warn(`${c.name}: los pasos van demasiado rápido y el motor se traba. Usa setSpeed de 15 rpm o menos.`);
    },
  },
  rc522: {
    label: 'Lector RFID RC522', prefix: 'RFID', cat: 'Comunicación',
    terms: RC.terms, box: [-64, -84, 128, 170], props: () => ({ card: 'tarjeta', near: false }),
    options: [{ prop: 'card', label: 'Tarjeta', values: [['tarjeta', `Tarjeta blanca (UID ${hex(CARDS.tarjeta)})`], ['llavero', `Llavero azul (UID ${hex(CARDS.llavero)})`]] }],
    checks: [{ prop: 'near', label: 'Acercar la tarjeta al lector' }],
    svg(c){
      let s = pcb(-60, -78, 120, 146, '#1e5fa8', '#143f70') + hole(-52, -70) + hole(52, -70) + hole(-52, 40) + hole(52, 40);
      for (let i = 0; i < 4; i++) s += `<rect x="${-40 + i * 4}" y="${-62 + i * 4}" width="${80 - i * 8}" height="${80 - i * 8}" rx="6" fill="none" stroke="#d4b25a" stroke-width="1.6"/>`;
      s += `<rect x="-14" y="30" width="22" height="22" fill="#1b1b1b"/>` + smdLed(`data-rfled="${c.id}"`, 30, 46, '#ff3b30');
      const near = c.props.near;
      s += `<g class="ctrl" data-ctrl="card" data-id="${c.id}" opacity="${near ? 0.92 : 0.75}" transform="translate(${near ? 0 : 70},${near ? -22 : -42})">` +
        (c.props.card === 'llavero'
          ? `<path d="M-14 -22 L14 -22 L20 6 L0 24 L-20 6 Z" fill="#1565c0" stroke="#0d3c80" stroke-width="2"/><circle cx="0" cy="-14" r="4" fill="var(--bg)"/>`
          : `<rect x="-30" y="-19" width="60" height="38" rx="4" fill="#f5f5f2" stroke="#9a9a94" stroke-width="1.5"/><text x="0" y="4" font-size="8" fill="#888" text-anchor="middle" font-family="var(--f-ui)">MIFARE</text>`) +
        `<title>Clic para acercar o alejar la tarjeta</title></g>`;
      return s + RC.svg + label(0, -84, `${c.name} · ${near ? 'tarjeta cerca' : 'clic en la tarjeta'}`);
    },
    elec(c, T, E){ E.res(T('V33'), T('GND'), 300); E.res(T('RST'), T('V33'), 10000); },
    device: rc522Device,
    readout(c){
      const k = c._cards && c._cards[c.props.card];
      return `Tarjeta: UID ${hex(CARDS[c.props.card] || [])} · ${c.props.near ? 'sobre el lector' : 'lejos'}${k && k.st === 'active' ? ' (seleccionada)' : ''}\nSPI: SDA→10, SCK→13, MOSI→11, MISO→12, RST→9 (Mega: 53, 52, 51, 50). Alimenta con 3.3V.\nLibrería MFRC522 (miguelbalboa).`;
    },
    render(c, k){
      glowAttr(k.q(`[data-rfled="${c.id}"]`), k.powered('V33', 'GND', 2.5));
      if (k.running) {
        if (!k.powered('V33', 'GND', 2.5)) k.warn(`${c.name}: sin alimentación. 3.3V del Arduino al pin 3.3V y GND a GND.`);
        else if (k.V('V33') - k.V('GND') > 4) k.warn(`${c.name}: está alimentado con 5 V. El RC522 funciona con 3.3 V y se puede dañar.`);
      }
    },
  },
  ds18b20: {
    label: 'Temperatura DS18B20', prefix: 'T', cat: 'Sensores',
    terms: DS.terms, box: [-26, -50, 52, 90], props: () => ({ temp: 25, pullup: false }),
    controls: [{ prop: 'temp', label: 'Temperatura', min: -55, max: 125, step: 0.5, unit: '°C' }],
    checks: [{ prop: 'pullup', label: 'Módulo con resistencia de 4,7 kΩ incluida' }],
    svg(c){
      return `<path d="M-14 22 L-14 -18 A14 14 0 0 1 14 -18 L14 22 Z" fill="#1d1d1d" stroke="#000"/>` + tiny(0, -6, 'DS18B20', '#bbb', 'middle', 5.5) +
        (c.props.pullup ? `<rect x="-20" y="8" width="40" height="8" rx="2" fill="#1e5fa8" opacity=".85"/>` + tiny(0, 14.5, '4K7', '#fff', 'middle', 5.5) : '') + DS.svg +
        label(0, -38, `${c.name} · <tspan data-dst="${c.id}">${fmt(c.props.temp, 1)} °C</tspan>`);
    },
    elec(c, T, E){ E.res(T('VDD'), T('GND'), 20000); if (c.props.pullup) E.res(T('DQ'), T('VDD'), 4700); if (c._low) E.res(T('DQ'), T('GND'), 15); },
    device: dsDevice,
    readout: c => `Bus 1-Wire: DQ necesita una resistencia de 4,7 kΩ a 5V${c.props.pullup ? ' (ya incluida en el módulo)' : ''}.\nLibrerías OneWire y DallasTemperature. Conversión de 12 bits: 750 ms.`,
    render(c, k){
      const t = k.q(`[data-dst="${c.id}"]`); if (t) t.textContent = fmt(c.props.temp, 1) + ' °C';
      if (k.running && !k.powered('VDD', 'GND', 2.8)) k.warn(`${c.name}: sin alimentación. VDD a 5V y GND a GND.`);
    },
  },
};
export { CARDS, newCard, crcA };
