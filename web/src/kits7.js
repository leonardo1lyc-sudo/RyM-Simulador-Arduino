// Tanda 5a: NFC PN532 (I2C, SPI y HSU), lector microSD (SPI + FAT16), reproductor DFPlayer Mini,
// módulo GSM SIM800L (comandos AT y SMS), radio de 433 MHz (emisor FS1000A y receptor XY-MK-5V),
// amplificador PAM8610 y parlante.
import { PinState } from './emulator.js';
import { header, pcb, hole, smdLed, glowAttr, tiny, label, fmt, US } from './modules.js';
import { CARDS, newCard } from './kits3.js';
import { Fat16 } from './fat.js';

const MS = 16000;
const hex = a => a.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const isIn = s => s === PinState.Input || s === PinState.InputPullUp;

// Salida digital de un módulo: si el terminal va directo a un pin de entrada se fija al instante
// (sin resolver todo el circuito), si no se resuelve el circuito.
export function setOut(c, api, term, key, v){
  if (c[key] === v) return; c[key] = v;
  const p = api.pin(term);
  if (p >= 0 && isIn(api.state(p))) { api.setInput(p, !!v); api.touch(); } else api.drive();
}

// Puerto serie de un módulo: por hardware (Serial/Serial1-3) o por software (SoftwareSerial en cualquier pin).
export function uartPort(c, api, { tx, rx, baud, onByte, key = '_tx' }){
  let txFree = 0, rxBusy = false;
  const bitCyc = () => 16e6 / baud();
  const port = {
    hwTx(){ const p = api.pin(tx); return p < 0 ? -1 : api.board().uarts.findIndex(u => u && u.rx === p); },
    hwRx(){ const p = api.pin(rx); return p < 0 ? -1 : api.board().uarts.findIndex(u => u && u.tx === p); },
    reset(){ c[key] = 1; txFree = 0; rxBusy = false; },
    // envía bytes del módulo al Arduino, `delayMs` después de ahora (y detrás de lo que ya estaba en cola)
    send(bytes, delayMs = 0){
      if (!api.running() || !bytes.length) return false;
      const bc = bitCyc(); let t = Math.max(api.now() + 32 + delayMs * MS, txFree);
      const hw = port.hwTx();
      if (hw >= 0) { const b = [...bytes]; api.schedule(t, () => api.serialWrite(b, hw)); txFree = t + b.length * 10 * bc; return true; }
      if (api.pin(tx) < 0) return false;
      for (const b of bytes) {
        const bits = [0]; for (let i = 0; i < 8; i++) bits.push((b >> i) & 1); bits.push(1);
        for (const v of bits) { api.schedule(t, () => setOut(c, api, tx, key, v)); t += bc; }
        t += bc * 0.2;
      }
      txFree = t; return true;
    },
    rx(b){ onByte(b); },
    onPin(p, s, old, cyc){
      if (p !== api.pin(rx) || port.hwRx() >= 0 || rxBusy) return;
      if (old === PinState.High && s === PinState.Low) {
        rxBusy = true; const bc = bitCyc(); let byte = 0;
        for (let i = 0; i < 8; i++) api.schedule(cyc + bc * (1.5 + i), () => { if (api.state(p) === PinState.High) byte |= 1 << i; });
        api.schedule(cyc + bc * 9.5, () => { rxBusy = false; onByte(byte); });
      }
    },
  };
  return port;
}

/* =========================================================================
   NFC PN532 (módulo rojo V3): I2C, SPI o HSU según los interruptores
   ========================================================================= */
const PN_I2C = header(['SCL', 'SDA', 'VCC', 'GND'], { x0: -42, y0: -74, dir: 'up', len: 14, labels: { SCL: 'SCL (I2C)', SDA: 'SDA (I2C) · TX en modo HSU', VCC: 'VCC (3,3–5 V)', GND: 'GND' } });
const PN_SPI = header(['SCK', 'MISO', 'MOSI', 'SS', 'VCC2', 'GND2', 'IRQ', 'RSTO'], { x0: 78, y0: -42, dir: 'right', len: 14,
  labels: { SCK: 'SCK (SPI)', MISO: 'MISO / MSO (SPI)', MOSI: 'MOSI (SPI)', SS: 'SS / NSS (SPI)', VCC2: 'VCC', GND2: 'GND', IRQ: 'IRQ (LOW = respuesta lista)', RSTO: 'RSTPDN (reset, activo en LOW)' },
  texts: { MISO: 'MSO', VCC2: 'VCC', GND2: 'GND', RSTO: 'RST' } });
const NTAG_UID = [0x04, 0xA2, 0x3B, 0x6A, 0x2F, 0x51, 0x80];
const PN_CARDS = { tarjeta: 'Tarjeta blanca MIFARE Classic 1K', llavero: 'Llavero azul MIFARE Classic 1K', ntag: 'Etiqueta NFC NTAG213' };
function newNtag(){
  const p = []; for (let i = 0; i < 45; i++) p.push([0, 0, 0, 0]);
  const u = NTAG_UID; p[0] = [u[0], u[1], u[2], 0x88 ^ u[0] ^ u[1] ^ u[2]]; p[1] = [u[3], u[4], u[5], u[6]]; p[2] = [u[3] ^ u[4] ^ u[5] ^ u[6], 0x48, 0, 0]; p[3] = [0xE1, 0x10, 0x12, 0x00];
  p[4] = [0x03, 0x00, 0xFE, 0x00]; // NDEF vacío
  return { ntag: true, uid: NTAG_UID, pages: p };
}
const ACK = [0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00];
function pnFrame(cmd, data){
  const len = data.length + 2; let sum = 0xD5 + cmd + 1; for (const v of data) sum += v;
  return [0x00, 0x00, 0xFF, len, (0x100 - len) & 255, 0xD5, cmd + 1, ...data, (0x100 - (sum & 255)) & 255, 0x00];
}
function pnParse(bytes){ // trama del Arduino al PN532: devuelve [cmd, args] o null
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] !== 0x00 || bytes[i + 1] !== 0xFF) continue;
    const len = bytes[i + 2]; if (!len || bytes.length < i + 5 + len) continue;
    const d = bytes.slice(i + 4, i + 4 + len); if (d[0] !== 0xD4) continue;
    return [d[1], d.slice(2)];
  }
  return null;
}
function pn532Device(c, api){
  const cards = c._cards || (c._cards = {});
  let out = [], pos = 0, pending = null, retries = 0xFF, rxw = [], spiMode = null, ssLow = false, hsu = [], inWrite = true, rdySent = false, sam = false;
  const card = () => { const k = c.props.card; if (!c.props.near || !PN_CARDS[k]) return null; return cards[k] || (cards[k] = k === 'ntag' ? newNtag() : newCard(CARDS[k])); };
  const mode = () => c.props.mode || 'i2c';
  const ok = () => api.powered('VCC', 'GND', 2.7) && api.state(api.pin('RSTO')) !== PinState.Low;
  const irq = () => setOut(c, api, 'IRQ', '_irq', out.length ? 0 : 1);
  const push = f => {
    if (mode() === 'hsu') { port.send(f, 0.2); return; }
    out.push(f); irq();
  };
  const target = k => k.ntag ? [0x01, 0x00, 0x44, 0x00, 7, ...k.uid] : [0x01, 0x00, 0x04, 0x08, 4, ...k.uid];
  const exec = (cmd, a) => {
    c._last = cmd; c._seen = performance.now();
    switch (cmd) {
      case 0x02: return pnFrame(cmd, [0x32, 0x01, 0x06, 0x07]); // PN532 v1.6
      case 0x14: sam = true; return pnFrame(cmd, []);
      case 0x32: if (a[0] === 0x05) retries = a[3]; return pnFrame(cmd, []);
      case 0x4A: {
        const k = card(); if (k) { if (!k.ntag) { k.auth = -1; k.st = 'active'; } return pnFrame(cmd, [1, ...target(k)]); }
        if (retries === 0xFF) { pending = { cmd, a }; return null; } // espera hasta que se acerque una tarjeta
        return pnFrame(cmd, [0]);
      }
      case 0x40: {
        const k = card(), d = a.slice(1); if (!k) return pnFrame(cmd, [0x01]); // tiempo agotado: no hay tarjeta
        if (k.ntag) {
          if (d[0] === 0x30) { const p = d[1]; if (p >= 45) return pnFrame(cmd, [0x01]); const r = []; for (let i = 0; i < 4; i++) r.push(...(k.pages[p + i] || [0, 0, 0, 0])); return pnFrame(cmd, [0x00, ...r]); }
          if (d[0] === 0xA2) { const p = d[1]; if (p < 4 || p >= 45) return pnFrame(cmd, [0x01]); k.pages[p] = d.slice(2, 6); return pnFrame(cmd, [0x00]); }
          return pnFrame(cmd, [0x01]);
        }
        if (d[0] === 0x60 || d[0] === 0x61) {
          const blk = d[1], key = d.slice(2, 8), tr = blk < 64 ? k.mem[blk | 3] : null;
          const good = tr && (d[0] === 0x60 ? key.every((v, i) => v === tr[i]) : key.every((v, i) => v === tr[10 + i]));
          k.auth = good ? blk >> 2 : -1; return pnFrame(cmd, [good ? 0x00 : 0x14]);
        }
        if (d[0] === 0x30) { const blk = d[1]; if (blk > 63 || k.auth !== blk >> 2) return pnFrame(cmd, [0x14]); let data = k.mem[blk].slice(); if ((blk & 3) === 3) data = [0, 0, 0, 0, 0, 0, ...data.slice(6, 10), 0, 0, 0, 0, 0, 0]; return pnFrame(cmd, [0x00, ...data]); }
        if (d[0] === 0xA0) { const blk = d[1]; if (blk === 0 || blk > 63 || k.auth !== blk >> 2) return pnFrame(cmd, [0x14]); k.mem[blk] = d.slice(2, 18); return pnFrame(cmd, [0x00]); }
        return pnFrame(cmd, [0x27]);
      }
      case 0x44: case 0x52: { const k = card(); if (k && !k.ntag) k.auth = -1; return pnFrame(cmd, [0x00]); }
      case 0x06: return pnFrame(cmd, a.filter((_, i) => i % 2 === 0).map(() => 0)); // ReadRegister
      case 0x8C: return null; // como tarjeta: no termina
      default: return pnFrame(cmd, [0x00]);
    }
  };
  const command = bytes => {
    if (!ok()) return;
    const f = pnParse(bytes); if (!f) return;
    out = []; pos = 0; pending = null; push(ACK);
    api.schedule(api.now() + 1.2 * MS, () => { const r = exec(f[0], f[1]); if (r) push(r); });
  };
  const checkPending = () => { if (pending && card()) { const p = pending; pending = null; push(exec(p.cmd, p.a)); } };
  const ready = () => { checkPending(); return out.length > 0; };
  const port = uartPort(c, api, { tx: 'SDA', rx: 'SCL', baud: () => 115200, key: '_hsu', onByte: b => {
    if (mode() !== 'hsu') return;
    hsu.push(b); if (hsu.length > 300) hsu = hsu.slice(-300);
    const f = pnParse(hsu); if (!f) return; hsu = []; if (!ok()) return;
    pending = null; port.send(ACK, 0.1); api.schedule(api.now() + 1.2 * MS, () => { const r = exec(f[0], f[1]); if (r) port.send(r, 0.1); });
  } });
  const i2c = {
    address: 0x24,
    ready: () => mode() === 'i2c' && ok() && api.node('SDA') === api.boardNode(api.board().i2c.sda) && api.node('SCL') === api.boardNode(api.board().i2c.scl),
    begin(write){ inWrite = write; if (write) rxw = []; else rdySent = false; },
    write(b){ rxw.push(b); },
    read(){ if (!rdySent) { rdySent = true; return ready() ? 0x01 : 0x00; } const f = out[0]; if (!f) return 0; return f[pos++] ?? 0; },
    end(){ if (inWrite) { if (rxw.length) command(rxw); rxw = []; } else if (pos > 0 && out.length) { out.shift(); pos = 0; irq(); } },
  };
  const spiBuf = [];
  return {
    i2c, hwRx: () => (mode() === 'hsu' ? port.hwRx() : -1), rx: b => port.rx(b),
    reset(){ out = []; pos = 0; pending = null; retries = 0xFF; spiMode = null; hsu = []; sam = false; c._irq = 1; port.reset(); for (const k of Object.values(cards)) if (!k.ntag) { k.st = 'idle'; k.auth = -1; } },
    update(){ if (pending && card()) { if (mode() === 'hsu') { const p = pending; pending = null; const r = exec(p.cmd, p.a); if (r) port.send(r, 0.1); } else checkPending(); } return false; },
    onPin(p, s, old, cyc){
      if (mode() === 'hsu') { port.onPin(p, s, old, cyc); return; }
      if (p === api.pin('RSTO') && s === PinState.Low) { out = []; pending = null; }
      if (p !== api.pin('SS') || mode() !== 'spi') return;
      const low = s === PinState.Low; if (low === ssLow) return; ssLow = low;
      if (!low) { if (spiMode === 'w') command(spiBuf.splice(0)); else if (spiMode === 'r' && pos > 0 && out.length) { out.shift(); pos = 0; irq(); } spiMode = null; }
    },
    onSpi(b){
      if (mode() !== 'spi') return undefined;
      const { mosi, sck } = api.board().spi;
      if (api.pin('MOSI') !== mosi || api.pin('SCK') !== sck || api.state(api.pin('SS')) !== PinState.Low) return undefined;
      if (!ok()) return 0x00;
      if (!spiMode) { spiMode = b === 0x01 ? 'w' : b === 0x02 ? 's' : b === 0x03 ? 'r' : 'x'; spiBuf.length = 0; if (spiMode === 'r') pos = 0; return 0; }
      if (spiMode === 'w') { spiBuf.push(b); return 0; }
      if (spiMode === 's') return ready() ? 0x01 : 0x00;
      if (spiMode === 'r') { const f = out[0]; return f ? f[pos++] ?? 0 : 0; }
      return 0;
    },
    get sam(){ return sam; },
  };
}

/* =========================================================================
   Lector de tarjetas microSD (SPI) con tarjeta FAT16 simulada
   ========================================================================= */
const SD = header(['GND', 'VCC', 'MISO', 'MOSI', 'SCK', 'CS'], { x0: 74, y0: -35, dir: 'right', len: 14, labels: { GND: 'GND', VCC: 'VCC (5 V)', MISO: 'MISO (12; 50 en el Mega)', MOSI: 'MOSI (11; 51 en el Mega)', SCK: 'SCK (13; 52 en el Mega)', CS: 'CS (selección, p. ej. 4 o 10)' } });
const crc7 = () => 0x01;
function sdImage(c){
  if (c._fs) return c._fs;
  const fs = new Fat16();
  const files = c.props.files && c.props.files.length ? c.props.files : [{ name: 'LEEME.TXT', b64: btoa('Hola desde RyM Simu.\r\nEsta tarjeta microSD es simulada: los archivos que escriba tu programa aparecen en el panel del modulo.\r\n') }];
  for (const f of files) { try { fs.addFile(f.name, Uint8Array.from(atob(f.b64), ch => ch.charCodeAt(0))); } catch {} }
  c._fs = fs; c._fsSaved = fs.version; return fs;
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export function sdPersist(c){ // guarda los archivos de la tarjeta en el proyecto (hasta 256 KB)
  const fs = c._fs; if (!fs || fs.version === c._fsSaved) return false;
  const files = fs.list().filter(e => !e.dir && !e.path.includes('/')); let total = 0; const keep = [];
  for (const e of files) { total += e.size; if (total > 262144) break; keep.push({ name: e.name, b64: b64(fs.readFile(e)) }); }
  c.props.files = keep; c._fsSaved = fs.version; return true;
}
function sdDevice(c, api){
  let idle = true, acmd = false, cmd = [], out = [], wr = null, csLow = false;
  const csd = [0x40, 0x0E, 0x00, 0x32, 0x5B, 0x59, 0x00, 0x00, 0x00, 0x7F, 0x7F, 0x80, 0x0A, 0x40, 0x00, 0x01];
  const cid = [0x03, 0x52, 0x59, 0x52, 0x59, 0x4D, 0x53, 0x44, 0x10, 0x12, 0x34, 0x56, 0x78, 0x01, 0x6A, 0x01];
  const r1 = (extra = 0) => (idle ? 0x01 : 0x00) | extra;
  const exec = (n, arg) => {
    const fs = sdImage(c);
    if (acmd) { acmd = false; if (n === 41) { idle = false; return [0xFF, 0x00]; } return [0xFF, r1()]; }
    switch (n) {
      case 0: idle = true; return [0xFF, 0x01];
      case 8: return [0xFF, r1(), 0x00, 0x00, 0x01, arg & 0xFF];
      case 55: acmd = true; return [0xFF, r1()];
      case 58: return [0xFF, r1(), 0xC0, 0xFF, 0x80, 0x00];
      case 9: return [0xFF, r1(), 0xFF, 0xFE, ...csd, 0xFF, 0xFF];
      case 10: return [0xFF, r1(), 0xFF, 0xFE, ...cid, 0xFF, 0xFF];
      case 16: case 59: return [0xFF, r1()];
      case 12: return [0xFF, 0xFF, 0x00, 0xFF];
      case 13: return [0xFF, r1(), 0x00];
      case 17: if (idle) return [0xFF, 0x05]; if (arg >= fs.totalBlocks) return [0xFF, 0x40]; c._reads = (c._reads || 0) + 1; c._act = performance.now(); return [0xFF, 0x00, 0xFF, 0xFE, ...fs.read(arg), 0xFF, 0xFF];
      case 24: if (idle) return [0xFF, 0x05]; if (arg >= fs.totalBlocks) return [0xFF, 0x40]; wr = { lba: arg, ph: 'tok', buf: [] }; return [0xFF, 0x00];
      default: return [0xFF, r1(0x04)];
    }
  };
  return {
    reset(){ idle = true; acmd = false; cmd = []; out = []; wr = null; },
    onPin(p, s){ if (p === api.pin('CS')) { const low = s === PinState.Low; if (low !== csLow) { csLow = low; cmd = []; out = []; if (!low && wr && wr.ph !== 'busy') wr = null; } } },
    onSpi(b){
      const { mosi, sck } = api.board().spi;
      if (!c.props.inserted || api.pin('MOSI') !== mosi || api.pin('SCK') !== sck || api.state(api.pin('CS')) !== PinState.Low) return undefined;
      if (!api.powered('VCC', 'GND', 3.2)) return 0xFF;
      if (out.length) { const v = out.shift(); if (!out.length && wr && wr.ph === 'busy') wr = null; return v; }
      if (wr) {
        if (wr.ph === 'tok') { if (b === 0xFE) wr.ph = 'data'; return 0xFF; }
        wr.buf.push(b);
        if (wr.buf.length === 514) { sdImage(c).write(wr.lba, wr.buf.slice(0, 512)); c._writes = (c._writes || 0) + 1; c._act = performance.now(); wr.ph = 'busy'; out = [0xE5, 0x00, 0x00, 0xFF]; }
        return 0xFF;
      }
      if (!cmd.length && (b & 0xC0) !== 0x40) return 0xFF;
      cmd.push(b);
      if (cmd.length === 6) { const n = cmd[0] & 0x3F, arg = ((cmd[1] << 24) | (cmd[2] << 16) | (cmd[3] << 8) | cmd[4]) >>> 0; cmd = []; out = exec(n, arg); }
      return 0xFF;
    },
  };
}
function sdDialog(c, refresh){
  const fs = sdImage(c);
  const dlg = document.createElement('dialog'); dlg.className = 'rym-dlg';
  const draw = () => {
    const files = fs.list();
    dlg.innerHTML = `<form method="dialog"><h3>Tarjeta microSD de ${c.name}</h3>
      <p class="note">FAT16 de 64 MB · ${files.filter(f => !f.dir).length} archivos · ${fmt(fs.usedBytes() / 1024, 1)} KB usados. Los nombres son 8.3 (como en la librería SD).</p>
      <table class="files"><thead><tr><th>Archivo</th><th>Tamaño</th><th></th></tr></thead><tbody>${files.map((f, i) => `<tr><td>${f.dir ? '📁 ' : ''}${f.path}</td><td>${f.dir ? '' : f.size + ' B'}</td><td>${f.dir ? '' : `<button type="button" class="btn small" data-see="${i}">Ver</button> <button type="button" class="btn small" data-get="${i}">Bajar</button> ${f.path.includes('/') ? '' : `<button type="button" class="btn small danger" data-rm="${i}">Borrar</button>`}`}</td></tr>`).join('') || '<tr><td colspan="3">La tarjeta está vacía.</td></tr>'}</tbody></table>
      <pre class="preview" hidden></pre>
      <div class="row"><label class="btn small filebtn">Subir archivos…<input type="file" multiple></label><button type="button" class="btn small danger" data-fmt="1">Formatear</button><span class="spacer"></span><button class="btn small primary">Cerrar</button></div></form>`;
    const files2 = files;
    dlg.querySelector('input[type=file]').onchange = async e => {
      for (const f of e.target.files) { try { fs.addFile(f.name, new Uint8Array(await f.arrayBuffer())); } catch (err) { alert(err.message); } }
      sdPersist(c); refresh(); draw();
    };
    dlg.onclick = e => {
      const t = e.target.closest('[data-see],[data-get],[data-rm],[data-fmt]'); if (!t) return;
      if (t.dataset.fmt) { if (confirm('¿Borrar todos los archivos de la tarjeta?')) { fs.format(); sdPersist(c); refresh(); draw(); } return; }
      const f = files2[+(t.dataset.see ?? t.dataset.get ?? t.dataset.rm)];
      if (t.dataset.rm) { fs.remove(f); sdPersist(c); refresh(); draw(); return; }
      const data = fs.readFile(f);
      if (t.dataset.see) { const pre = dlg.querySelector('.preview'); pre.hidden = false; pre.textContent = new TextDecoder().decode(data.subarray(0, 20000)) + (data.length > 20000 ? '\n…' : ''); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    };
  };
  draw(); document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
}

/* =========================================================================
   Audio compartido: parlantes, DFPlayer y amplificador
   ========================================================================= */
// ¿Hay un parlante conectado entre estos dos nodos (directo o a través de un PAM8610 alimentado)?
function speakerOn(api, c, a, b){
  const na = api.nodeOf(c, a), nb = api.nodeOf(c, b); if (na === -2 && nb === -2) return 0;
  for (const d of api.comps()) {
    if (d.type === 'speaker') { const p = api.nodeOf(d, 'p'), n = api.nodeOf(d, 'n'); if ((p === na && n === nb) || (p === nb && n === na)) return 1; }
  }
  return 0;
}
function ampGain(api, c, l, r, gnd){ // un PAM8610 con su entrada en estos terminales y un parlante en su salida
  for (const d of api.comps()) {
    if (d.type !== 'pam8610') continue;
    const ok = api.nodeOf(d, 'LIN') === api.nodeOf(c, l) || api.nodeOf(d, 'RIN') === api.nodeOf(c, r);
    if (!ok) continue;
    const vs = api.voltOf(d, 'VCC') - api.voltOf(d, 'GND');
    if (vs < 7) continue;
    if (speakerOn(api, d, 'Lp', 'Ln') || speakerOn(api, d, 'Rp', 'Rn')) return 2.5 * (d.props.vol ?? 0.7);
  }
  return 0;
}
const tunes = {};
function synthTrack(n){ // melodía distinta para cada número de pista (cuando no se cargó un MP3)
  if (tunes[n]) return tunes[n];
  const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]; const base = 220 * Math.pow(2, ((n * 5) % 12) / 12);
  const notes = []; let seed = n * 9301 + 49297;
  for (let i = 0; i < 16; i++) { seed = (seed * 9301 + 49297) % 233280; notes.push(base * Math.pow(2, scale[seed % scale.length] / 12)); }
  return (tunes[n] = { notes, dur: 4.8 });
}

/* =========================================================================
   DFPlayer Mini (MP3-TF-16P)
   ========================================================================= */
const DFL = header(['VCC', 'RX', 'TX', 'DACR', 'DACL', 'SPK1', 'GND', 'SPK2'], { x0: -58, y0: -49, dir: 'left', len: 14,
  labels: { VCC: 'VCC (3,2–5 V)', RX: 'RX (entra desde el TX del Arduino; 1 kΩ en serie)', TX: 'TX (va al RX del Arduino)', DACR: 'DAC_R (salida de línea derecha)', DACL: 'DAC_L (salida de línea izquierda)', SPK1: 'SPK_1 (parlante +)', GND: 'GND', SPK2: 'SPK_2 (parlante −)' },
  texts: { DACR: 'DAC_R', DACL: 'DAC_L', SPK1: 'SPK1', SPK2: 'SPK2' } });
const DFR = header(['BUSY', 'USBM', 'USBP', 'ADK2', 'ADK1', 'IO2', 'GND2', 'IO1'], { x0: 58, y0: -49, dir: 'right', len: 14,
  labels: { BUSY: 'BUSY (LOW mientras reproduce)', USBM: 'USB− (no simulado)', USBP: 'USB+ (no simulado)', ADK2: 'ADKEY_2 (no simulado)', ADK1: 'ADKEY_1 (no simulado)', IO2: 'IO_2 (a GND: siguiente)', GND2: 'GND', IO1: 'IO_1 (a GND: anterior)' },
  texts: { USBM: 'USB-', USBP: 'USB+', ADK2: 'ADK2', ADK1: 'ADK1', GND2: 'GND' } });
function dfDevice(c, api){
  let buf = [], vol = 20, eq = 0, track = 0, playing = false, paused = false, loopOne = false, until = 0, startAt = 0, node = null, io = [1, 1], folder = 0;
  const tracks = () => c._tracks || (c._tracks = new Map());
  const count = () => Math.max(tracks().size ? Math.max(...tracks().keys()) : 0, c.props.ntracks || 10);
  const frame = (cmd, p, fb = 0) => { const f = [0x7E, 0xFF, 0x06, cmd, fb, p >> 8, p & 255]; let s = 0; for (let i = 1; i < 7; i++) s += f[i]; s = (0x10000 - s) & 0xFFFF; return [...f, s >> 8, s & 255, 0xEF]; };
  const port = uartPort(c, api, { tx: 'TX', rx: 'RX', baud: () => 9600, onByte: b => rx(b) });
  const send = (cmd, p, d = 0) => port.send(frame(cmd, p), d);
  const stopAudio = () => { if (node) { try { node.stop(); } catch {} node = null; } };
  const gain = () => { const direct = speakerOn(api, c, 'SPK1', 'SPK2') ? 1 : 0, amp = ampGain(api, c, 'DACL', 'DACR', 'GND'); return Math.max(direct, amp) * vol / 30; };
  const startAudio = () => {
    stopAudio(); const ctx = api.sound(); if (!ctx) return; const g0 = gain(); if (!g0) return;
    const t = tracks().get(track);
    const g = ctx.createGain(); g.gain.value = Math.min(1, 0.25 * g0); g.connect(ctx.destination);
    if (t && t.buf) { const s = ctx.createBufferSource(); s.buffer = t.buf; s.connect(g); s.start(); node = s; return; }
    const tune = synthTrack(track), osc = ctx.createOscillator(); osc.type = 'triangle'; osc.connect(g);
    const step = tune.dur / tune.notes.length, t0 = ctx.currentTime;
    tune.notes.forEach((f, i) => osc.frequency.setValueAtTime(f, t0 + i * step)); osc.start(); osc.stop(t0 + tune.dur); node = osc;
  };
  const duration = n => { const t = tracks().get(n); return t && t.buf ? t.buf.duration : synthTrack(n).dur; };
  const play = n => {
    if (!api.powered('VCC', 'GND', 3)) return;
    const max = count(); if (n < 1 || n > max) { send(0x40, 0x06, 30); return; }
    track = n; playing = true; paused = false; startAt = api.now(); until = api.now() + duration(n) * 1000 * MS; c._track = n; c._ver = (c._ver || 0) + 1;
    setOut(c, api, 'BUSY', '_busy', 0); startAudio();
    const myUntil = until; api.schedule(until, () => { if (playing && until === myUntil) finished(); });
  };
  const finished = () => {
    if (loopOne) { play(track); return; }
    playing = false; setOut(c, api, 'BUSY', '_busy', 1); stopAudio(); c._ver = (c._ver || 0) + 1; send(0x3D, track);
  };
  const stop = () => { playing = false; paused = false; until = 0; stopAudio(); setOut(c, api, 'BUSY', '_busy', 1); c._ver = (c._ver || 0) + 1; };
  const exec = (cmd, p) => {
    c._cmd = cmd; const max = count();
    switch (cmd) {
      case 0x01: play(track >= max ? 1 : track + 1); break;
      case 0x02: play(track <= 1 ? max : track - 1); break;
      case 0x03: play(p); break;
      case 0x04: vol = Math.min(30, vol + 1); break;
      case 0x05: vol = Math.max(0, vol - 1); break;
      case 0x06: vol = Math.min(30, p); break;
      case 0x07: eq = p; break;
      case 0x08: loopOne = true; play(p); break;
      case 0x0C: stop(); vol = 20; loopOne = false; send(0x3F, 0x02, 600); break; // reinicio: avisa «tarjeta en línea»
      case 0x0D: if (paused) { paused = false; playing = true; until = api.now() + (until - startAt); setOut(c, api, 'BUSY', '_busy', 0); startAudio(); } else if (!playing) play(track || 1); break;
      case 0x0E: if (playing) { paused = true; playing = false; stopAudio(); setOut(c, api, 'BUSY', '_busy', 1); } break;
      case 0x0F: folder = p >> 8; play(p & 255); break;
      case 0x12: case 0x14: case 0x13: play(p & 0xFFF); break;
      case 0x16: stop(); break;
      case 0x19: loopOne = !p; break;
      case 0x42: send(0x42, playing ? 0x0201 : paused ? 0x0202 : 0x0200, 2); break;
      case 0x43: send(0x43, vol, 2); break;
      case 0x44: send(0x44, eq, 2); break;
      case 0x48: send(0x48, count(), 2); break;
      case 0x4C: send(0x4C, track, 2); break;
      case 0x4E: send(0x4E, count(), 2); break;
      case 0x4F: send(0x4F, 1, 2); break;
      default: break;
    }
    c._ver = (c._ver || 0) + 1;
  };
  function rx(b){
    if (!api.powered('VCC', 'GND', 3)) return;
    if (!buf.length && b !== 0x7E) return;
    buf.push(b); if (buf.length < 10) return;
    const f = buf; buf = [];
    if (f[1] !== 0xFF || f[2] !== 0x06 || f[9] !== 0xEF) return;
    let s = 0; for (let i = 1; i < 7; i++) s += f[i]; if (((0x10000 - s) & 0xFFFF) !== (f[7] << 8 | f[8])) { send(0x40, 0x04, 1); return; } // error de suma
    if (f[4]) send(0x41, 0, 1); // ACK
    exec(f[3], f[5] << 8 | f[6]);
  }
  return {
    hwRx: () => port.hwRx(), rx: b => port.rx(b), onPin: port.onPin,
    reset(){ stop(); buf = []; vol = 20; track = 0; loopOne = false; c._busy = 1; c._track = 0; io = [1, 1]; port.reset(); },
    update(V){
      const vcc = V('VCC') - V('GND'); if (vcc < 3) return false;
      const lv = [V('IO1') - V('GND') < 1 ? 0 : 1, V('IO2') - V('GND') < 1 ? 0 : 1];
      if (lv[0] === 0 && io[0] === 1) exec(0x02, 0); if (lv[1] === 0 && io[1] === 1) exec(0x01, 0); io = lv;
      return false;
    },
    get state(){ return { playing, paused, track, vol, eq, loopOne, folder }; },
    progress(){ return playing && until > startAt ? Math.min(1, (api.now() - startAt) / (until - startAt)) : 0; },
    audible: () => gain() > 0,
  };
}
async function dfLoad(c, files, refresh){
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const t = c._tracks || (c._tracks = new Map()); let next = t.size ? Math.max(...t.keys()) + 1 : 1;
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const m = /^(\d{1,4})/.exec(f.name); const n = m ? +m[1] : next++;
    try { const buf = await ctx.decodeAudioData(await f.arrayBuffer()); t.set(n, { name: f.name, buf }); } catch { alert(`${f.name}: no se pudo leer como audio.`); }
  }
  ctx.close(); refresh();
}

/* =========================================================================
   Módulo GSM SIM800L
   ========================================================================= */
const SIM = header(['NET', 'VCC', 'RST', 'RXD', 'TXD', 'GND'], { x0: -58, y0: -35, dir: 'left', len: 14,
  labels: { NET: 'NET (antena)', VCC: 'VCC (3,4–4,4 V; picos de 2 A)', RST: 'RST (reset, activo en LOW)', RXD: 'RXD (entra desde el TX del Arduino; máx. 2,8 V)', TXD: 'TXD (va al RX del Arduino)', GND: 'GND' } });
const SIM_R = header(['RING', 'DTR', 'MICP', 'MICN', 'SPKP', 'SPKN'], { x0: 58, y0: -35, dir: 'right', len: 14,
  labels: { RING: 'RING (LOW con llamada o SMS entrante)', DTR: 'DTR (sueño)', MICP: 'MIC+', MICN: 'MIC−', SPKP: 'SPK+', SPKN: 'SPK−' }, texts: { MICP: 'MIC+', MICN: 'MIC-', SPKP: 'SPK+', SPKN: 'SPK-' } });
const PHONE = '+5493875551234';
function simDevice(c, api){
  let line = '', echo = true, textMode = false, cnmi = 0, clip = false, smsTo = null, smsBody = '', bootAt = 0, inCall = null, ringTimer = 0;
  const store = []; let ref = 0;
  const port = uartPort(c, api, { tx: 'TXD', rx: 'RXD', baud: () => c.props.baud || 9600, onByte: b => rx(b) });
  const out = (s, d = 0.5) => port.send([...new TextEncoder().encode(s)], d);
  const alive = () => { const v = api.volts('VCC', 'GND'); return v >= 3.4 && api.state(api.pin('RST')) !== PinState.Low; };
  const registered = () => alive() && api.now() - bootAt > 3000 * MS;
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${p(d.getFullYear() % 100)}/${p(d.getMonth() + 1)}/${p(d.getDate())},${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}-12`; };
  const dev = {
    rxText: '', panelTitle: 'Celular (SMS y llamadas al SIM800L)', placeholder: 'Escribe un SMS para el SIM800L…', phone: true,
    hwRx: () => port.hwRx(), rx: b => port.rx(b), onPin: port.onPin,
    reset(){ line = ''; echo = true; textMode = false; cnmi = 0; clip = false; smsTo = null; inCall = null; bootAt = 0; port.reset(); c._ring = 1; store.length = 0; },
    send(text){ // SMS del celular al módulo
      if (!api.running() || !alive()) return false;
      const msg = text.replace(/\n$/, '');
      if (!registered()) return false;
      store.push({ from: PHONE, text: msg, when: stamp(), read: false }); const idx = store.length;
      setOut(c, api, 'RING', '_ring', 0); api.schedule(api.now() + 120 * MS, () => setOut(c, api, 'RING', '_ring', 1));
      if (cnmi === 2) out(`\r\n+CMT: "${PHONE}","","${stamp()}"\r\n${msg}\r\n`, 5); else out(`\r\n+CMTI: "SM",${idx}\r\n`, 5);
      return true;
    },
    call(){ // llamada del celular al módulo
      if (!api.running() || !registered() || inCall) return false;
      inCall = { dir: 'in', state: 'ring' }; let n = 0;
      const ring = () => { if (!inCall || inCall.state !== 'ring' || n++ > 8) { if (inCall && inCall.state === 'ring') { inCall = null; out('\r\nNO CARRIER\r\n'); } return; }
        setOut(c, api, 'RING', '_ring', 0); api.schedule(api.now() + 300 * MS, () => setOut(c, api, 'RING', '_ring', 1));
        out('\r\nRING\r\n' + (clip ? `\r\n+CLIP: "${PHONE}",145,"",0,"",0\r\n` : ''), 2); ringTimer = api.now() + 3000 * MS; api.schedule(ringTimer, ring); };
      ring(); dev.rxText += '\n📞 Llamando al SIM800L…\n'; return true;
    },
    hangup(){ if (!inCall) return; inCall = null; out('\r\nNO CARRIER\r\n'); dev.rxText += '\n📞 Colgaste.\n'; },
    get call_(){ return inCall; },
  };
  function cmd(raw){
    const s = raw.trim(); if (!s) return; const u = s.toUpperCase(); c._last = s;
    const ok = (body = '') => out(`${body ? '\r\n' + body + '\r\n' : ''}\r\nOK\r\n`);
    if (!u.startsWith('AT')) { out('\r\nERROR\r\n'); return; }
    const a = u.slice(2);
    if (a === '' || a === 'E1') { if (a === 'E1') echo = true; ok(); return; }
    if (a === 'E0') { echo = false; ok(); return; }
    if (a === 'I') { ok('SIM800 R14.18'); return; }
    if (a.startsWith('+CMGF=')) { textMode = a.endsWith('1'); ok(); return; }
    if (a === '+CMGF?') { ok(`+CMGF: ${textMode ? 1 : 0}`); return; }
    if (a === '+CSQ') { ok(registered() ? '+CSQ: 21,0' : '+CSQ: 99,99'); return; }
    if (a === '+CREG?') { ok(`+CREG: 0,${registered() ? 1 : 2}`); return; }
    if (a === '+CPIN?') { ok('+CPIN: READY'); return; }
    if (a === '+COPS?') { ok(registered() ? '+COPS: 0,0,"Claro AR"' : '+COPS: 0'); return; }
    if (a === '+CCID') { ok('89543420123456789012'); return; }
    if (a === '+GSN' || a === '+CGSN') { ok('867273021334334'); return; }
    if (a === '+CBC') { const v = api.volts('VCC', 'GND'); ok(`+CBC: 0,${Math.round(Math.max(0, Math.min(100, (v - 3.4) / 0.8 * 100)))},${Math.round(v * 1000)}`); return; }
    if (a === '+CCLK?') { ok(`+CCLK: "${stamp()}"`); return; }
    if (a.startsWith('+CNMI=')) { cnmi = +(a.split(',')[1] || 0); ok(); return; }
    if (a.startsWith('+CLIP=')) { clip = a.endsWith('1'); ok(); return; }
    if (a.startsWith('+CMGS=')) {
      if (!textMode) { out('\r\nERROR\r\n'); return; }
      smsTo = (/"([^"]*)"/.exec(s) || [, '?'])[1]; smsBody = ''; out('\r\n> ', 0.3); return;
    }
    if (a.startsWith('+CMGR=')) { const m = store[+a.slice(6) - 1]; if (!m) { ok(); return; } const st = m.read ? 'REC READ' : 'REC UNREAD'; m.read = true; ok(`+CMGR: "${st}","${m.from}","","${m.when}"\r\n${m.text}`); return; }
    if (a.startsWith('+CMGL')) { ok(store.map((m, i) => `+CMGL: ${i + 1},"${m.read ? 'REC READ' : 'REC UNREAD'}","${m.from}","","${m.when}"\r\n${m.text}`).join('\r\n')); return; }
    if (a.startsWith('+CMGD=') || a.startsWith('+CMGDA')) { if (a.startsWith('+CMGDA')) store.length = 0; else { const i = +a.slice(6).split(',')[0] - 1; if (store[i]) store[i] = { from: '', text: '', when: '', read: true }; } ok(); return; }
    if (a.startsWith('D')) {
      if (!registered()) { out('\r\nNO CARRIER\r\n'); return; }
      const num = s.slice(3).replace(/;.*$/, ''); inCall = { dir: 'out', state: 'ring', num }; ok();
      dev.rxText += `\n📞 El Arduino está llamando desde el SIM800L a ${num}. (Usa «Colgar» para cortar)\n`;
      return;
    }
    if (a === 'A') { if (inCall && inCall.dir === 'in') { inCall.state = 'talk'; dev.rxText += '\n📞 El SIM800L atendió la llamada.\n'; ok(); } else out('\r\nNO CARRIER\r\n'); return; }
    if (a === 'H' || a === '+CHUP') { if (inCall) dev.rxText += '\n📞 El SIM800L colgó.\n'; inCall = null; ok(); return; }
    if (a.startsWith('+CFUN') || a.startsWith('+CSCS') || a.startsWith('&W') || a.startsWith('+IPR') || a.startsWith('+CSMP') || a.startsWith('+CLVL') || a.startsWith('+CMIC') || a.startsWith('+CHFA') || a.startsWith('+CPMS') || a.startsWith('+CSCLK') || a.startsWith('V') || a.startsWith('+CMEE') || a.startsWith('+CLTS') || a.startsWith('+CGATT') || a.startsWith('+SAPBR') || a.startsWith('+HTTP') || a.startsWith('+CIP')) { ok(); return; }
    ok();
  }
  function rx(b){
    if (!alive()) return;
    if (!bootAt) bootAt = api.now();
    if (smsTo != null) {
      if (b === 0x1A) { // Ctrl+Z: envía
        ref = (ref + 1) % 256; dev.rxText += `\n💬 SMS del Arduino a ${smsTo}:\n${smsBody}\n`; c._sms = (c._sms || 0) + 1;
        if (echo) out(smsBody, 0); smsTo = null; out(`\r\n+CMGS: ${ref}\r\n\r\nOK\r\n`, 1500); return;
      }
      if (b === 0x1B) { smsTo = null; out('\r\nOK\r\n'); return; }
      smsBody += String.fromCharCode(b); return;
    }
    if (echo) port.send([b], 0);
    if (b === 13 || b === 10) { if (line) cmd(line); line = ''; return; }
    line += String.fromCharCode(b); if (line.length > 300) line = '';
  }
  dev.boot = () => { if (!bootAt) bootAt = api.now(); };
  return dev;
}

/* =========================================================================
   Radio 433 MHz: emisor FS1000A y receptor XY-MK-5V
   ========================================================================= */
const RFT = header(['DATA', 'VCC', 'GND'], { x0: -14, y0: 34, labels: { DATA: 'DATA (ATAD: dato a transmitir)', VCC: 'VCC (3–12 V; más tensión, más alcance)', GND: 'GND' } });
const RFR = header(['VCC', 'DATA', 'DATA2', 'GND'], { x0: -21, y0: 34, labels: { VCC: 'VCC (5 V)', DATA: 'DATA (dato recibido)', DATA2: 'DATA (el mismo pin)', GND: 'GND' }, texts: { DATA2: 'DATA' } });
const RC_CODES = [['A', 1361], ['B', 1364], ['C', 4433], ['D', 4436]];
function rfTxDevice(c, api){
  return {
    reset(){ c._air = 0; },
    onPin(p, s){
      if (p !== api.pin('DATA')) return;
      const on = s === PinState.High && api.powered('VCC', 'GND', 2.5) ? 1 : 0; c._air = on; if (on) c._seen = performance.now();
      for (const d of api.others()) if (d.rf433) d.rf433(on, c);
    },
  };
}
function rfRxDevice(c, api){
  let busy = 0;
  const dev = {
    reset(){ c._rf = 0; busy = 0; },
    rf433(on){ if (!api.powered('VCC', 'GND', 3.5)) return; if (on) c._seen = performance.now(); setOut(c, api, 'DATA', '_rf', on); },
    tap(ds){ // control remoto de 433 MHz (protocolo 1 de RCSwitch, 24 bits, 350 µs)
      if (!api.running() || !api.powered('VCC', 'GND', 3.5) || ds.code == null) return;
      const code = +ds.code, T = 350 * US; let t = Math.max(api.now() + 32, busy);
      const lvl = (v, n) => { api.schedule(t, () => setOut(c, api, 'DATA', '_rf', v)); t += n * T; };
      for (let r = 0; r < 8; r++) {
        for (let i = 23; i >= 0; i--) { const b = (code >> i) & 1; lvl(1, b ? 3 : 1); lvl(0, b ? 1 : 3); }
        lvl(1, 1); lvl(0, 31);
      }
      busy = t; c._sent = code; c._sentAt = performance.now();
    },
  };
  return dev;
}

/* =========================================================================
   Tipos
   ========================================================================= */
const coil = (x, y, n = 6, col = '#c87533') => { let s = ''; for (let i = 0; i < n; i++) s += `<ellipse cx="${x + i * 3.2}" cy="${y}" rx="2" ry="6" fill="none" stroke="${col}" stroke-width="1.8"/>`; return s; };
const btnSvg = (attrs, x, y, t, r = 9) => `<g class="ctrl" ${attrs}><circle cx="${x}" cy="${y}" r="${r}" fill="#2a2d31" stroke="#111"/><text x="${x}" y="${y + 3.5}" font-size="9" fill="#fff" text-anchor="middle" font-family="var(--f-ui)" pointer-events="none">${t}</text></g>`;
export const KITS7 = {
  pn532: {
    label: 'NFC PN532 (I2C/SPI)', prefix: 'NFC', cat: 'Comunicación',
    terms: { ...PN_I2C.terms, ...PN_SPI.terms }, nets: () => [['VCC', 'VCC2'], ['GND', 'GND2']],
    box: [-96, -92, 202, 170], props: () => ({ mode: 'i2c', card: 'tarjeta', near: false }),
    options: [{ prop: 'mode', label: 'Interruptores (modo)', values: [['i2c', 'I2C (ON-OFF) · dirección 0x24'], ['spi', 'SPI (OFF-ON)'], ['hsu', 'HSU / UART 115200 (OFF-OFF)']] },
      { prop: 'card', label: 'Tarjeta', values: Object.entries(PN_CARDS).map(([k, v]) => [k, v]) }],
    checks: [{ prop: 'near', label: 'Acercar la tarjeta al lector' }],
    svg(c){
      let s = pcb(-78, -60, 156, 134, '#d8382b', '#9b2219') + hole(-68, -50) + hole(68, -50) + hole(-68, 64) + hole(68, 64);
      s += `<rect x="-72" y="-54" width="144" height="122" rx="10" fill="none" stroke="#f3f0ea" stroke-width="5" opacity=".9"/><rect x="-64" y="-46" width="128" height="106" rx="8" fill="none" stroke="#f3f0ea" stroke-width="3" opacity=".7"/>`;
      s += `<rect x="-6" y="10" width="26" height="26" fill="#1b1b1b" transform="rotate(45 7 23)"/>` + tiny(7, 26, 'PN532', '#bbb', 'middle', 5.5);
      const sw = c.props.mode === 'spi' ? [0, 1] : c.props.mode === 'hsu' ? [0, 0] : [1, 0];
      s += `<rect x="-60" y="-26" width="22" height="30" rx="2" fill="#222"/>` + sw.map((on, i) => `<rect x="${-57 + i * 10}" y="-23" width="7" height="24" fill="#d8d0b8"/><rect x="${-57 + i * 10}" y="${on ? -23 : -9}" width="7" height="10" fill="#333"/>`).join('') + tiny(-49, 12, 'ON  KE', '#fff', 'middle', 5);
      s += smdLed(`data-nfcled="${c.id}"`, 44, 44, '#ff3b30') + tiny(-50, 26, ['I2C', 'SPI', 'HSU'][['i2c', 'spi', 'hsu'].indexOf(c.props.mode)], '#fff', 'middle', 7);
      const near = c.props.near, k = c.props.card;
      s += `<g class="ctrl" data-ctrl="card" data-id="${c.id}" opacity="${near ? 0.93 : 0.8}" transform="translate(${near ? 0 : 36},${near ? 6 : 94})">` +
        (k === 'llavero' ? `<path d="M-16 -24 L16 -24 L22 6 L0 26 L-22 6 Z" fill="#1565c0" stroke="#0d3c80" stroke-width="2"/><circle cx="0" cy="-15" r="4" fill="var(--bg)"/><circle cx="0" cy="2" r="11" fill="none" stroke="#0d3c80" stroke-width="2"/>`
          : k === 'ntag' ? `<circle r="20" fill="#f4f4f0" stroke="#999" stroke-width="1.5"/><text y="4" font-size="9" fill="#666" text-anchor="middle" font-family="var(--f-ui)">NFC</text>`
          : `<rect x="-34" y="-21" width="68" height="42" rx="4" fill="#f5f5f2" stroke="#9a9a94" stroke-width="1.5"/><text x="0" y="4" font-size="8" fill="#888" text-anchor="middle" font-family="var(--f-ui)">MIFARE 1K</text>`) +
        `<title>Clic para acercar o alejar la tarjeta</title></g>`;
      return s + PN_I2C.svg + PN_SPI.svg + label(-90, 86, `${c.name} · ${near ? 'tarjeta sobre el lector' : 'clic en la tarjeta'}`, 'start');
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), 500); E.res(T('RSTO'), T('VCC'), 10000);
      if (c.props.mode === 'i2c') { E.res(T('SDA'), T('VCC'), 4700); E.res(T('SCL'), T('VCC'), 4700); }
      E.src(T('IRQ'), T('GND'), c._irq === 0 ? 0 : Math.max(0, E.prev(T('VCC')) - E.prev(T('GND'))), 200);
      if (c.props.mode === 'hsu') E.src(T('SDA'), T('GND'), c._hsu === 0 ? 0 : 3.3, 200);
    },
    device: pn532Device,
    readout(c){
      const k = c.props.card, uid = k === 'ntag' ? NTAG_UID : CARDS[k];
      const m = c.props.mode, how = m === 'i2c' ? 'I2C: SDA→A4, SCL→A5 (Mega: 20, 21). Adafruit_PN532 nfc(IRQ, RESET) — el IRQ es opcional.' : m === 'spi' ? 'SPI: SCK→13, MSO→12, MOSI→11, SS→10 (Mega: 52, 50, 51, 53). Adafruit_PN532 nfc(10, &SPI).' : 'HSU: TX del PN532 (pin SDA) → RX1 y RX del PN532 (SCL) → TX1 del Mega. Adafruit_PN532 nfc(RESET, &Serial1).';
      return `${PN_CARDS[k]} · UID ${hex(uid)} · ${c.props.near ? 'sobre el lector' : 'lejos'}\n${how}\nLibrería Adafruit PN532.`;
    },
    render(c, k){
      glowAttr(k.q(`[data-nfcled="${c.id}"]`), k.powered('VCC', 'GND', 2.7));
      if (k.running && !k.powered('VCC', 'GND', 2.7)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
      else if (k.running && c.props.mode === 'i2c' && (k.wired('SDA') || k.wired('SCL')) && !(k.onBoard('SDA', k.board.i2c.sda) && k.onBoard('SCL', k.board.i2c.scl))) k.warn(`${c.name}: en modo I2C, SDA va a ${k.board.i2c.sda} y SCL a ${k.board.i2c.scl}.`);
      else if (k.running && c.props.mode === 'spi' && k.wired('SCK') && !k.onBoard('SCK', 'D' + k.board.spi.sck)) k.warn(`${c.name}: en modo SPI, SCK va al pin ${k.board.spi.sck}, MOSI al ${k.board.spi.mosi} y MISO al ${k.board.spi.mosi + 1 === 12 ? 12 : 50}.`);
    },
  },
  sdcard: {
    label: 'Lector microSD (SPI)', prefix: 'SD', cat: 'Módulos',
    terms: SD.terms, box: [-78, -58, 172, 112], props: () => ({ inserted: true, files: [] }),
    checks: [{ prop: 'inserted', label: 'Tarjeta microSD insertada' }],
    actions: [{ act: 'files', label: '📂 Archivos de la tarjeta' }],
    action(c, act, k){ if (act === 'files') sdDialog(c, k.refresh); },
    svg(c){
      let s = pcb(-74, -50, 148, 100, '#1f4fb0', '#143579') + hole(-66, -42) + hole(-66, 42) + hole(66, -42) + hole(66, 42);
      s += `<rect x="-62" y="-34" width="62" height="66" rx="3" fill="#c9cdd1" stroke="#8a9096" stroke-width="1.5"/><rect x="-58" y="-30" width="54" height="10" fill="#b2b7bc"/>` + tiny(-31, 24, 'TF CARD', '#555', 'middle', 6);
      if (c.props.inserted) s += `<rect x="-52" y="-18" width="42" height="40" rx="2" fill="#20242a"/><rect x="-52" y="-18" width="42" height="8" fill="#e0a43a"/>` + tiny(-31, 6, 'microSD', '#ddd', 'middle', 6) + tiny(-31, 15, '64MB', '#aaa', 'middle', 5.5);
      s += `<rect x="14" y="-34" width="26" height="18" fill="#1b1b1b"/>` + tiny(27, -22, 'LVC125', '#bbb', 'middle', 4.5) + `<rect x="14" y="2" width="22" height="20" fill="#1b1b1b"/><rect x="18" y="-2" width="14" height="5" fill="#bcc2c6"/>` + tiny(25, 15, 'AMS1117', '#bbb', 'middle', 4);
      s += smdLed(`data-sdled="${c.id}"`, 52, 34, '#ff3b30');
      return s + SD.svg + label(0, -56, `${c.name} · microSD`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 300); E.res(T('CS'), T('VCC'), 10000); E.res(T('MISO'), T('VCC'), 10000); },
    device: sdDevice,
    readout(c){
      const fs = c._fs; const files = fs ? fs.list().filter(e => !e.dir) : null;
      const list = files ? files.slice(0, 6).map(f => `  ${f.path} (${f.size} B)`).join('\n') + (files.length > 6 ? `\n  … y ${files.length - 6} más` : '') : '  (se carga al simular)';
      return `${c.props.inserted ? 'Tarjeta FAT16 de 64 MB' : 'Sin tarjeta'} · lecturas ${c._reads || 0} · escrituras ${c._writes || 0}\nArchivos:\n${list}\nSPI: MOSI→11, MISO→12, SCK→13, CS→4 (Mega: 51, 50, 52). Librería SD: SD.begin(4).`;
    },
    render(c, k){
      glowAttr(k.q(`[data-sdled="${c.id}"]`), k.running && performance.now() - (c._act || 0) < 120);
      if (c._fs && sdPersist(c)) k.save();
      if (k.running && !k.powered('VCC', 'GND', 3.2)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
      else if (k.running && k.wired('MOSI') && !k.onBoard('MOSI', 'D' + k.board.spi.mosi)) k.warn(`${c.name}: el lector usa el SPI por hardware: MOSI al pin ${k.board.spi.mosi} y SCK al ${k.board.spi.sck}.`);
    },
  },
  dfplayer: {
    label: 'Reproductor MP3 DFPlayer Mini', prefix: 'MP3', cat: 'Módulos',
    terms: { ...DFL.terms, ...DFR.terms }, nets: () => [['GND', 'GND2']],
    box: [-100, -64, 200, 128], props: () => ({ ntracks: 10 }),
    options: [{ prop: 'ntracks', label: 'Pistas en la tarjeta', values: [1, 3, 5, 10, 20, 50].map(n => [n, `${n} (0001.mp3 … ${String(n).padStart(4, '0')}.mp3)`]), num: true }],
    actions: [{ act: 'mp3', label: '🎵 Cargar MP3…' }],
    action(c, act, k){ if (act !== 'mp3') return; const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*,.mp3,.wav'; i.multiple = true; i.onchange = () => dfLoad(c, i.files, k.refresh); i.click(); },
    svg(c){
      let s = pcb(-56, -58, 112, 116, '#151617', '#000');
      s += `<rect x="-44" y="-52" width="88" height="62" rx="3" fill="#c9cdd1" stroke="#8a9096"/><rect x="-40" y="-48" width="80" height="10" fill="#b2b7bc"/>` + tiny(0, -16, 'micro SD', '#555', 'middle', 7);
      s += `<rect x="-20" y="18" width="40" height="22" fill="#222"/>` + tiny(0, 32, 'YX5200', '#999', 'middle', 6) + tiny(0, 50, 'DFPlayer Mini', '#ddd', 'middle', 7);
      s += smdLed(`data-dfled="${c.id}"`, 34, 22, '#2f9bff');
      return s + DFL.svg + DFR.svg + label(0, -68, `${c.name} · <tspan data-dft="${c.id}">detenido</tspan>`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), 250); E.res(T('IO1'), T('VCC'), 47000); E.res(T('IO2'), T('VCC'), 47000);
      const v = Math.max(0, E.prev(T('VCC')) - E.prev(T('GND')));
      E.src(T('TX'), T('GND'), c._tx === 0 ? 0 : Math.min(3.3, v), 200); E.src(T('BUSY'), T('GND'), c._busy === 0 ? 0 : Math.min(3.3, v), 500);
    },
    device: dfDevice,
    readout(c){
      const d = c._dfst; const st = d ? (d.playing ? `▶ reproduciendo la pista ${d.track}` : d.paused ? `⏸ pausa en la pista ${d.track}` : '■ detenido') + ` · volumen ${d.vol}/30` + (d.loopOne ? ' · repetir' : '') : '■ detenido';
      const t = c._tracks && c._tracks.size ? `MP3 cargados: ${[...c._tracks].map(([n, x]) => `${n}: ${x.name}`).join(', ')}` : 'Sin MP3 cargados: cada pista suena con una melodía de prueba.';
      return `${st}\n${t}\nSerie a 9600: TX→RX del Arduino, RX←TX del Arduino con 1 kΩ (SoftwareSerial en 10 y 11 es lo habitual).\nSonido: parlante en SPK1/SPK2 o DAC_L/DAC_R a un amplificador. Activa 🔊 Sonido.`;
    },
    render(c, k){
      const d = k.dev(c); if (!d) return; c._dfst = d.state;
      glowAttr(k.q(`[data-dfled="${c.id}"]`), d.state.playing);
      const t = k.q(`[data-dft="${c.id}"]`); if (t) t.textContent = d.state.playing ? `▶ pista ${d.state.track} · ${Math.round(d.progress() * 100)} %` : d.state.paused ? '⏸ pausa' : 'detenido';
      if (!k.running) return;
      if (!k.powered('VCC', 'GND', 3)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`);
      else if (d.state.playing && !d.audible()) k.warn(`${c.name}: está reproduciendo pero no hay un parlante: conecta uno entre SPK1 y SPK2 (o DAC_L/DAC_R a un amplificador PAM8610 con parlante).`);
    },
  },
  sim800l: {
    label: 'Módulo GSM SIM800L', prefix: 'GSM', cat: 'Comunicación',
    terms: { ...SIM.terms, ...SIM_R.terms }, box: [-96, -86, 192, 150], props: () => ({ baud: 9600 }),
    options: [{ prop: 'baud', label: 'Velocidad (baudios)', values: [[9600, '9600 (la más usada)'], [19200, '19200'], [38400, '38400'], [115200, '115200']], num: true }],
    svg(c){
      let s = pcb(-56, -52, 112, 104, '#c8282f', '#8d1a1f') + hole(-48, -44) + hole(48, -44) + hole(-48, 44) + hole(48, 44);
      s += `<rect x="-36" y="-28" width="72" height="62" rx="2" fill="#d9dde0" stroke="#9aa0a5"/>` + tiny(0, -14, 'SIM800L', '#333', 'middle', 9) + tiny(0, -3, 'IMEI:86727302133', '#555', 'middle', 4.6) + tiny(0, 5, 'S2-105HE', '#555', 'middle', 5);
      s += `<rect x="-14" y="12" width="20" height="18" fill="#fff"/><path d="M-12 14h4v4h-4zM-2 14h4v4h-4zM-12 24h4v4h-4zM-6 20h4v4h-4zM0 24h4v4h-4z" fill="#111"/>`;
      s += `<rect x="18" y="-50" width="20" height="14" rx="2" fill="#c7782c"/>` + coil(-2, -66, 7, '#d6a640') + `<rect x="18" y="-78" width="9" height="28" rx="3" fill="#e0b048"/>`;
      s += smdLed(`data-net="${c.id}"`, -40, 42, '#ff3b30');
      return s + SIM.svg + SIM_R.svg + label(0, 66, `${c.name} · <tspan data-gsm="${c.id}">apagado</tspan>`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), c._on ? 20 : 2000); E.res(T('RST'), T('VCC'), 10000);
      const v = Math.max(0, E.prev(T('VCC')) - E.prev(T('GND')));
      E.src(T('TXD'), T('GND'), c._tx === 0 ? 0 : Math.min(2.8, v), 150); E.src(T('RING'), T('GND'), c._ring === 0 ? 0 : Math.min(2.8, v), 1000);
    },
    device: simDevice,
    readout(c){ return `Comandos AT a ${c.props.baud} baudios${c._last ? ` · último: ${c._last}` : ''}\nAlimentación: 3,7–4,2 V capaces de dar 2 A (batería Li-ion o regulador). 5 V lo daña; 3,3 V no alcanza.\nSMS: AT+CMGF=1, AT+CMGS="+54…" y el texto con Ctrl+Z (26). Recibir: AT+CNMI=1,2,0,0,0.\nEl panel «Celular» hace de teléfono: manda SMS y llama al módulo.`; },
    render(c, k){
      const v = k.V('VCC') - k.V('GND'), on = k.running && v >= 3.4 && k.V('RST') - k.V('GND') > 1.5; c._on = on;
      const d = k.dev(c); if (on && d) d.boot();
      const reg = on && d && k.now - (c._regT || (c._regT = k.now)) > 3000; if (!on) c._regT = 0;
      const per = reg ? 3000 : 800; glowAttr(k.q(`[data-net="${c.id}"]`), on && (k.now % per) < 80);
      const t = k.q(`[data-gsm="${c.id}"]`); if (t) t.textContent = !on ? 'apagado' : reg ? 'registrado en la red' : 'buscando red…';
      if (!k.running) return;
      if (v < 3.4 && k.wired('VCC')) k.warn(`${c.name}: tiene ${fmt(Math.max(0, v), 1)} V y necesita 3,4–4,4 V con hasta 2 A. Usa una batería Li-ion (3,7 V) o un regulador de 4 V.`);
      else if (v > 4.5) k.warn(`${c.name}: está recibiendo ${fmt(v, 1)} V; el máximo es 4,4 V y se puede quemar. Usa 3,7–4,2 V.`);
      else if (!k.wired('VCC')) k.warn(`${c.name}: sin alimentación. VCC a 3,7–4,2 V (batería) y GND a GND.`);
    },
  },
  rftx: {
    label: 'Emisor RF 433 MHz (FS1000A)', prefix: 'RFT', cat: 'Comunicación',
    terms: RFT.terms, box: [-40, -46, 80, 98], props: () => ({}),
    svg(c){
      let s = pcb(-30, -34, 60, 58, '#1f8a4c', '#14613a') + `<circle cx="-4" cy="-12" r="13" fill="#c7ccd0" stroke="#8a9096" stroke-width="1.5"/>` + tiny(-4, -9, 'R433', '#666', 'middle', 6);
      s += coil(4, 8, 5) + tiny(16, -24, 'ANT', '#e9f5ec', 'middle', 6) + `<circle cx="22" cy="-26" r="3" fill="none" stroke="#d4c07a"/>`;
      s += smdLed(`data-rfon="${c.id}"`, -18, 12, '#ff3b30');
      return s + RFT.svg + label(0, -40, `${c.name} · FS1000A`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 3000); E.res(T('DATA'), T('GND'), 100000); },
    device: rfTxDevice,
    readout: () => 'Transmite el nivel de DATA por radio a todos los receptores de 433 MHz del circuito.\nLibrerías: RCSwitch (mySwitch.enableTransmit(10); mySwitch.send(1361, 24)) o RadioHead RH_ASK (cárgala como .zip).',
    render(c, k){ glowAttr(k.q(`[data-rfon="${c.id}"]`), k.running && performance.now() - (c._seen || 0) < 100); if (k.running && !k.powered('VCC', 'GND', 2.5) && k.wired('DATA')) k.warn(`${c.name}: sin alimentación. VCC a 5V (o hasta 12 V) y GND a GND.`); },
  },
  rfrx: {
    label: 'Receptor RF 433 MHz (XY-MK-5V)', prefix: 'RFR', cat: 'Comunicación',
    terms: RFR.terms, nets: () => [['DATA', 'DATA2']], box: [-64, -52, 128, 108], props: () => ({}),
    svg(c){
      let s = pcb(-60, -34, 120, 58, '#1f8a4c', '#14613a') + `<rect x="-4" y="-26" width="16" height="16" fill="#f2e7c9" stroke="#b49a54"/><circle cx="4" cy="-18" r="5" fill="#c79a3c"/>` + coil(26, -18, 5);
      s += `<rect x="-46" y="-2" width="22" height="14" fill="#1b1b1b"/>` + tiny(-35, 7, 'LM358', '#bbb', 'middle', 4.5) + smdLed(`data-rfrx="${c.id}"`, 44, 12, '#ff3b30');
      RC_CODES.forEach(([t, code], i) => { s += btnSvg(`data-ctrl="tap" data-id="${c.id}" data-code="${code}"`, -45 + i * 18, -44, t, 7.5); });
      s += `<title>Botones A–D: control remoto de 433 MHz (RCSwitch)</title>`;
      return s + RFR.svg + label(30, -42, `${c.name}`, 'start');
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 1500); const v = Math.max(0, E.prev(T('VCC')) - E.prev(T('GND'))); E.src(T('DATA'), T('GND'), c._rf ? v : 0, 300); },
    device: rfRxDevice,
    readout(c){ return `DATA copia lo que transmite cualquier FS1000A del circuito.${c._sent ? `\nÚltimo código del control: ${c._sent} (24 bits)` : ''}\nBotones A–D: control remoto (códigos ${RC_CODES.map(x => x[1]).join(', ')}).\nRCSwitch: mySwitch.enableReceive(0) recibe en el pin 2 (interrupción 0).`; },
    render(c, k){ glowAttr(k.q(`[data-rfrx="${c.id}"]`), k.running && performance.now() - (c._seen || c._sentAt || 0) < 100); if (k.running && !k.powered('VCC', 'GND', 3.5)) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`); },
  },
  pam8610: {
    label: 'Amplificador PAM8610 2×10 W', prefix: 'AMP', cat: 'Salidas',
    terms: {
      VCC: { x: 60, y: -62, dx: 0, dy: -1, name: '12V (+ alimentación, 7–15 V)' }, GND: { x: 74, y: -62, dx: 0, dy: -1, name: 'GND (alimentación)' },
      Rp: { x: -74, y: -18, dx: -1, dy: 0, name: 'R+ (parlante derecho)' }, Rn: { x: -74, y: -4, dx: -1, dy: 0, name: 'R− (parlante derecho)' },
      Lp: { x: 74, y: 0, dx: 1, dy: 0, name: 'L+ (parlante izquierdo)' }, Ln: { x: 74, y: 14, dx: 1, dy: 0, name: 'L− (parlante izquierdo)' },
      RIN: { x: -14, y: 62, dx: 0, dy: 1, name: 'R_IN (entrada derecha)' }, AGND: { x: 0, y: 62, dx: 0, dy: 1, name: 'GND (de la señal)' }, LIN: { x: 14, y: 62, dx: 0, dy: 1, name: 'L_IN (entrada izquierda)' },
    },
    box: [-78, -66, 156, 132], props: () => ({ vol: 0.7 }),
    controls: [{ prop: 'vol', label: 'Volumen (potenciómetro)', min: 0, max: 1, step: 0.05, pct: true }],
    passive: 'LIN',
    svg(c){
      let s = pcb(-60, -48, 120, 96, '#151617', '#000') + hole(-50, -38) + hole(50, -38) + hole(-50, 38) + hole(50, 38);
      s += `<rect x="-16" y="-16" width="32" height="32" fill="#2a2a2a" transform="rotate(0)"/>` + tiny(0, -2, 'PAM', '#999', 'middle', 7) + tiny(0, 8, '8610', '#999', 'middle', 6);
      for (let i = 0; i < 6; i++) s += `<rect x="${-26 + i * 9}" y="24" width="6" height="12" rx="1" fill="#c9b07a"/><rect x="${-26 + i * 9}" y="-36" width="6" height="12" rx="1" fill="#c9b07a"/>`;
      s += `<g data-ampw="${c.id}" opacity="0"><path d="M84 -10 q8 12 0 24 M90 -16 q12 18 0 36" stroke="var(--accent)" stroke-width="2" fill="none"/></g>`;
      const pin = (x, y, x2, y2) => `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#c8b46a" stroke-width="3"/><rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#1a1a1a"/>`;
      s += pin(60, -46, 60, -62) + pin(74, -46, 74, -62) + pin(-58, -18, -74, -18) + pin(-58, -4, -74, -4) + pin(58, 0, 74, 0) + pin(58, 14, 74, 14) + pin(-14, 46, -14, 62) + pin(0, 46, 0, 62) + pin(14, 46, 14, 62);
      s += tiny(52, -38, '12V', '#fff', 'end', 6) + tiny(68, -38, 'G', '#fff', 'start', 6) + tiny(-52, -16, 'R+', '#fff', 'start', 6) + tiny(-52, -2, 'R−', '#fff', 'start', 6) + tiny(52, 2, 'L+', '#fff', 'end', 6) + tiny(52, 16, 'L−', '#fff', 'end', 6) + tiny(0, 42, 'R_IN G L_IN', '#fff', 'middle', 5.5);
      return s + smdLed(`data-ampon="${c.id}"`, -40, -30, '#ff3b30') + label(0, -54, `${c.name} · PAM8610`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 1200); E.res(T('LIN'), T('AGND'), 20000); E.res(T('RIN'), T('AGND'), 20000); E.res(T('AGND'), T('GND'), 0.1); E.res(T('Lp'), T('Ln'), 1e6); E.res(T('Rp'), T('Rn'), 1e6); },
    readout(c, V){ const v = V('VCC') - V('GND'); return `Alimentación: ${fmt(v, 1)} V (necesita 7–15 V; 12 V es lo habitual)\nAmplifica la señal de L_IN/R_IN (DAC del DFPlayer, tone() de un pin…) hacia parlantes de 4–8 Ω en L+/L− y R+/R−.`; },
    render(c, k){
      const v = k.V('VCC') - k.V('GND'), on = v >= 7; glowAttr(k.q(`[data-ampon="${c.id}"]`), on);
      const spk = k.speakerOn('Lp', 'Ln') || k.speakerOn('Rp', 'Rn');
      if (!(on && spk)) c._freq = 0;
      const w = k.q(`[data-ampw="${c.id}"]`); if (w) w.setAttribute('opacity', on && spk && c._freq ? 1 : 0);
      if (k.running && k.wired('VCC') && v < 7) k.warn(`${c.name}: tiene ${fmt(Math.max(v, 0), 1)} V; necesita 7–15 V (una fuente o batería de 12 V con GND común).`);
      if (k.running && v > 15.5) k.warn(`${c.name}: ${fmt(v, 1)} V supera los 15 V máximos.`);
    },
  },
  speaker: {
    label: 'Parlante 8 Ω', prefix: 'SPK', cat: 'Salidas',
    terms: { p: { x: -14, y: 48, dx: 0, dy: 1, name: '+' }, n: { x: 14, y: 48, dx: 0, dy: 1, name: '−' } },
    box: [-40, -42, 80, 92], props: () => ({}), passive: 'p',
    svg(c){
      return `<line x1="-14" y1="30" x2="-14" y2="48" stroke="#c8b46a" stroke-width="3"/><line x1="14" y1="30" x2="14" y2="48" stroke="#c8b46a" stroke-width="3"/>` +
        `<circle r="36" fill="#2b2d30" stroke="#111" stroke-width="2"/><circle r="28" fill="#3a3d41"/><circle r="20" fill="#1c1d1f" stroke="#555"/><circle r="8" fill="#4a4d52"/>` +
        `<g data-waves="${c.id}" opacity="0"><path d="M40 -12 q8 12 0 24 M46 -18 q12 18 0 36" stroke="var(--accent)" stroke-width="2" fill="none"/></g>` +
        tiny(-14, 26, '+', '#fff', 'middle', 9) + label(0, -46, `${c.name} · 8 Ω 0,5 W`);
    },
    elec(c, T, E){ E.res(T('p'), T('n'), 8); },
    readout: c => c._freq ? `Sonando a ${Math.round(c._freq)} Hz` : 'En silencio. Directo a un pin pide demasiada corriente: mejor con un transistor o un amplificador.',
    render(c, k){
      const p = k.drivenBy('p'), i = Math.abs(k.V('p') - k.V('n')) / 8;
      if (k.running && p >= 0 && i > 0.04) k.warn(`${c.name}: conectado directo a un pin pide ${Math.round(i * 1000)} mA (máx. 40 mA). Ponle 100 Ω en serie o usa un transistor o un amplificador.`);
      const w = k.q(`[data-waves="${c.id}"]`); if (w && c._dfOn) w.setAttribute('opacity', 0.5 + 0.5 * Math.sin(k.now / 60) ** 2);
    },
  },
};
