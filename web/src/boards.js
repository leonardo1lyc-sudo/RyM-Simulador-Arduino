// Placas Arduino: pines (número Arduino -> puerto/bit del microcontrolador), terminales en el lienzo y dibujo.
import { ESP32_GPIO, ESP32_ADC, VARIANTS } from './esp32map.js';
const PITCH = 17.6; // 2,54 mm en unidades del lienzo

/* ---------- utilidades de dibujo ---------- */
function headerSvg(B, ids){
  const a = B.terms[ids[0]], b = B.terms[ids[ids.length - 1]];
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return `<rect x="${x0 - 9}" y="${y0 - 9}" width="${x1 - x0 + 18}" height="${y1 - y0 + 18}" rx="2" fill="var(--header)"/>` +
    ids.map(id => `<rect data-pinled="${id}" x="${B.terms[id].x - 3.5}" y="${B.terms[id].y - 3.5}" width="7" height="7" fill="#0c0c0c" stroke="#3a3a3a"/>`).join('');
}
const boardLed = (id, lx, ly, lab, right) => `<rect id="${id}" x="${lx}" y="${ly}" width="10" height="6" rx="1" fill="#4a3d1a"/><text class="silk" x="${right ? lx - 4 : lx + 14}" y="${ly + 6}" font-size="8" text-anchor="${right ? 'end' : 'start'}">${lab}</text>`;
const resetBtn = (x, y) => `<g class="ctrl" data-ctrl="reset"><rect x="${x}" y="${y}" width="22" height="22" rx="3" fill="#c9cfd2"/><circle cx="${x + 11}" cy="${y + 11}" r="6" fill="#d9442d"/><title>Reiniciar la placa</title></g>`;
function pinLabels(B, skip = () => false){
  let s = '';
  for (const id in B.terms) {
    const p = B.terms[id]; if (skip(id, p)) continue;
    const lab = B.label(id);
    if (p.dx) { const left = p.labelLeft; s += `<text class="silk" font-size="8" x="${left ? p.x - 11 : p.x + 11}" y="${p.y + 3}" text-anchor="${left ? 'end' : 'start'}">${lab}</text>`; continue; }
    const ty = p.dy < 0 ? p.y + 14 : p.y - 14;
    s += `<text class="silk" font-size="9" transform="translate(${p.x + 3},${ty}) rotate(-90)" text-anchor="${p.dy < 0 ? 'end' : 'start'}">${lab}</text>`;
  }
  return s;
}
function chip(x, y, w, h, name, pinsPerSide, pitch){
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#202326"/>`;
  for (let i = 0; i < pinsPerSide; i++) s += `<rect x="${x + 6 + i * pitch}" y="${y - 6}" width="6" height="6" fill="#bfc6c9"/><rect x="${x + 6 + i * pitch}" y="${y + h}" width="6" height="6" fill="#bfc6c9"/>`;
  return s + `<circle cx="${x + 12}" cy="${y + h / 2}" r="4" fill="#2c3034"/><text x="${x + w / 2}" y="${y + h / 2 + 4}" font-family="var(--f-code)" font-size="11" fill="#9aa3a6" text-anchor="middle">${name}</text>`;
}
function qfp(cx, cy, size, name){ // encapsulado cuadrado (ATmega2560 / ATmega328P SMD)
  let s = `<rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" rx="2" fill="#202326" transform="rotate(45 ${cx} ${cy})"/>`;
  const n = Math.floor(size / 7);
  for (let i = 0; i < n; i++) {
    const o = -size / 2 + 4 + i * (size - 8) / (n - 1);
    for (const [a, b] of [[o, -size / 2 - 3], [o, size / 2 + 3], [-size / 2 - 3, o], [size / 2 + 3, o]]) s += `<rect x="${cx + a - 1}" y="${cy + b - 1}" width="2" height="2" fill="#bfc6c9" transform="rotate(45 ${cx} ${cy})"/>`;
  }
  return s + `<circle cx="${cx}" cy="${cy - size / 2 + 10}" r="2.5" fill="#2c3034" transform="rotate(45 ${cx} ${cy})"/><text x="${cx}" y="${cy + 4}" font-family="var(--f-code)" font-size="${size > 60 ? 10 : 7}" fill="#9aa3a6" text-anchor="middle">${name}</text>`;
}

/* ---------- definición común ---------- */
function makeBoard(def){
  const B = { ...def, terms: {} };
  B.add = (id, x, y, dx, dy) => { B.terms[id] = { id, x, y, dx, dy }; };
  B.pinName = p => p < B.firstAnalog ? 'D' + p : 'A' + (p - B.firstAnalog);
  B.pinOfName = id => { const m = /^([DA])(\d+)$/.exec(id); if (!m) return -1; const p = m[1] === 'D' ? +m[2] : B.firstAnalog + +m[2]; return p < B.pins.length ? p : -1; };
  B.label = id => {
    const base = id.replace(/\.\d+$/, '');
    if (base[0] === 'D' && /^D\d+$/.test(base)) { const n = +base.slice(1); const extra = B.pinExtra[n]; return extra ? `${extra}` : (B.pwm.has(n) ? '~' : '') + n; }
    return base;
  };
  B.title = id => {
    const base = id.replace(/\.\d+$/, '');
    if (base === 'GND') return 'GND (tierra, 0 V)'; if (base === '5V') return '5 V'; if (base === '3V3') return '3,3 V'; if (base === 'VIN') return 'VIN (no conectado en la simulación)';
    if (base === 'RESET') return 'RESET (a GND reinicia la placa; no simulado)'; if (base === 'AREF') return 'AREF (referencia analógica externa)'; if (base === 'IOREF') return 'IOREF (5 V)';
    const p = B.pinOfName(base); if (p < 0) return base;
    const notes = B.notes[p] ? ' · ' + B.notes[p] : '';
    if (base[0] === 'D') return `Pin digital ${p}${B.pwm.has(p) ? ' · PWM (~)' : ''}${notes}`;
    return `Entrada analógica ${base} (pin ${p})${B.pins[p] ? '' : ' · solo analógica'}${notes}`;
  };
  B.keys = B.pins.map((_, p) => 'B:' + B.pinName(p));
  return B;
}
const notesFrom = (list) => { const o = {}; for (const [p, t] of list) o[p] = o[p] ? o[p] + ' · ' + t : t; return o; };

/* =========================================================================
   Arduino Uno R3 (ATmega328P)
   ========================================================================= */
const PINS_328 = [];
for (let p = 0; p < 8; p++) PINS_328[p] = ['D', p];
for (let p = 8; p < 14; p++) PINS_328[p] = ['B', p - 8];
for (let p = 14; p < 20; p++) PINS_328[p] = ['C', p - 14];
const NOTES_328 = notesFrom([[0, 'RX del puerto serie'], [1, 'TX del puerto serie'], [2, 'interrupción externa'], [3, 'interrupción externa'],
  [10, 'SS (SPI)'], [11, 'MOSI (SPI)'], [12, 'MISO (SPI)'], [13, 'SCK (SPI) · LED L'], [18, 'SDA (I2C)'], [19, 'SCL (I2C)']]);

const uno = makeBoard({
  id: 'uno', name: 'Arduino Uno', chipName: 'ATmega328P', mcu: 'atmega328p', canvasW: 1100,
  rect: { x: 40, y: 200, w: 500, h: 380 },
  pins: PINS_328, firstAnalog: 14, analog: { 14: 0, 15: 1, 16: 2, 17: 3, 18: 4, 19: 5 },
  pwm: new Set([3, 5, 6, 9, 10, 11]), pinExtra: { 0: 'RX←0', 1: 'TX→1' }, notes: NOTES_328,
  i2c: { sda: 'A4', scl: 'A5' }, spi: { mosi: 11, sck: 13 }, uarts: [{ rx: 0, tx: 1 }],
  nets: [['GND.1', 'GND.2', 'GND.3']], supplies: [['5V', 5, 0.05], ['IOREF', 5, 0.05], ['3V3', 3.3, 0.5], ['RESET', 5, 10000]],
});
(function(B){
  const { x, y, h } = B.rect; const topY = y + 20, botY = y + h - 20;
  ['AREF', 'GND.1', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'].forEach((id, i) => B.add(id, x + 150 + i * PITCH, topY, 0, -1));
  ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'].forEach((id, i) => B.add(id, x + 150 + 8 * PITCH + 10 + i * PITCH, topY, 0, -1));
  ['IOREF', 'RESET', '3V3', '5V', 'GND.2', 'GND.3', 'VIN'].forEach((id, i) => B.add(id, x + 190 + i * PITCH, botY, 0, 1));
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((id, i) => B.add(id, x + 190 + 7 * PITCH + 10 + i * PITCH, botY, 0, 1));
  B.draw = () => {
    const { x, y, w, h } = B.rect; let s = '';
    s += `<rect x="${x - 14}" y="${y + 40}" width="74" height="62" rx="3" fill="#b9c0c4" stroke="#7d868b"/><rect x="${x - 6}" y="${y + 50}" width="22" height="42" fill="#8d969b"/>`;
    s += `<rect x="${x - 10}" y="${y + 268}" width="66" height="58" rx="5" fill="#1d1f22"/><circle cx="${x + 14}" cy="${y + 297}" r="11" fill="#33373b"/>`;
    s += `<path d="M${x} ${y + 8} q0 -8 8 -8 H${x + w - 24} l24 24 V${y + h - 34} l-14 14 V${y + h} H${x + 8} q-8 0 -8 -8 Z" fill="var(--pcb)" stroke="var(--pcb-edge)" stroke-width="2"/>`;
    for (const [hx, hy] of [[x + 20, y + h - 16], [x + w - 28, y + 30], [x + w - 20, y + h - 60], [x + 70, y + 20]]) s += `<circle cx="${hx}" cy="${hy}" r="6" fill="var(--bg)" stroke="#d9c27a" stroke-width="2"/>`;
    s += headerSvg(B, ['AREF', 'GND.1', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8']) + headerSvg(B, ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0']) + headerSvg(B, ['IOREF', 'RESET', '3V3', '5V', 'GND.2', 'GND.3', 'VIN']) + headerSvg(B, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);
    s += pinLabels(B);
    s += `<text class="silk" x="${x + 250}" y="${y + 96}" font-size="10" text-anchor="middle">DIGITAL (PWM ~)</text>`;
    s += `<text class="silk" x="${x + 282}" y="${y + h - 72}" font-size="10" text-anchor="middle">POWER</text><text class="silk" x="${x + 420}" y="${y + h - 72}" font-size="10" text-anchor="middle">ANALOG IN</text>`;
    s += `<text x="${x + 300}" y="${y + 175}" font-family="var(--f-ui)" font-weight="700" font-style="italic" font-size="54" fill="var(--silk)" opacity=".92" text-anchor="middle" letter-spacing="2">UNO</text>`;
    s += chip(x + 250, y + 232, 200, 44, 'ATmega328P', 14, 13.8);
    s += resetBtn(x + 24, y + 12) + `<text class="silk" x="${x + 35}" y="${y + 46}" font-size="8" text-anchor="middle">RESET</text>`;
    s += `<rect x="${x + 100}" y="${y + 130}" width="34" height="12" rx="2" fill="#c9cfd2"/><text class="silk" x="${x + 117}" y="${y + 156}" font-size="8" text-anchor="middle">16 MHz</text>`;
    s += boardLed('bL', x + 150, y + 60, 'L') + boardLed('bTX', x + 150, y + 72, 'TX') + boardLed('bRX', x + 150, y + 84, 'RX') + boardLed('bON', x + 440, y + 120, 'ON');
    s += `<rect x="${x + 438}" y="${y + 120}" width="10" height="6" rx="1" fill="#3cff7a" filter="url(#glowS)" opacity=".9"/>`;
    return s;
  };
})(uno);

/* =========================================================================
   Arduino Nano (ATmega328P, 8 entradas analógicas: A6 y A7 solo analógicas)
   ========================================================================= */
const nano = makeBoard({
  id: 'nano', name: 'Arduino Nano', chipName: 'ATmega328P', mcu: 'atmega328p', canvasW: 1100,
  rect: { x: 60, y: 320, w: 330, h: 130 },
  pins: [...PINS_328, null, null], firstAnalog: 14, analog: { 14: 0, 15: 1, 16: 2, 17: 3, 18: 4, 19: 5, 20: 6, 21: 7 },
  pwm: new Set([3, 5, 6, 9, 10, 11]), pinExtra: { 0: 'RX0', 1: 'TX1' }, notes: { ...NOTES_328, 20: 'no sirve como digital', 21: 'no sirve como digital' },
  i2c: { sda: 'A4', scl: 'A5' }, spi: { mosi: 11, sck: 13 }, uarts: [{ rx: 0, tx: 1 }],
  nets: [['GND.1', 'GND.2'], ['RESET', 'RESET.2']], supplies: [['5V', 5, 0.05], ['3V3', 3.3, 0.5], ['RESET', 5, 10000]],
});
(function(B){
  const { x, y, h } = B.rect; const x0 = x + 30;
  ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RESET', 'GND.1', 'VIN'].forEach((id, i) => B.add(id, x0 + i * PITCH, y + 14, 0, -1));
  ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND.2', 'RESET.2', 'D0', 'D1'].forEach((id, i) => B.add(id, x0 + i * PITCH, y + h - 14, 0, 1));
  B.draw = () => {
    const { x, y, w, h } = B.rect; let s = '';
    s += `<rect x="${x - 16}" y="${y + h / 2 - 20}" width="42" height="40" rx="3" fill="#b9c0c4" stroke="#7d868b"/><rect x="${x - 10}" y="${y + h / 2 - 12}" width="20" height="24" fill="#8d969b"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1f5fa8" stroke="#16467d" stroke-width="2"/>`;
    for (const [hx, hy] of [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]) s += `<circle cx="${hx}" cy="${hy}" r="4" fill="var(--bg)" stroke="#d9c27a" stroke-width="1.5"/>`;
    const top = ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RESET', 'GND.1', 'VIN'];
    const bot = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND.2', 'RESET.2', 'D0', 'D1'];
    for (const id of [...top, ...bot]) { const p = B.terms[id]; s += `<circle cx="${p.x}" cy="${p.y}" r="6" fill="#d9c27a"/><rect data-pinled="${id}" x="${p.x - 3}" y="${p.y - 3}" width="6" height="6" fill="#0c0c0c"/>`; }
    for (const id of [...top, ...bot]) { const p = B.terms[id]; const lab = B.label(id).replace('RESET', 'RST').replace('AREF', 'REF'); s += `<text class="silk" font-size="7" transform="translate(${p.x + 2.5},${p.dy < 0 ? p.y + 10 : p.y - 10}) rotate(-90)" text-anchor="${p.dy < 0 ? 'end' : 'start'}">${lab}</text>`; }
    s += qfp(x + 190, y + h / 2, 34, '328P');
    s += resetBtn(x + 110, y + h / 2 - 11);
    s += `<rect x="${x + 240}" y="${y + h / 2 - 8}" width="22" height="16" rx="2" fill="#c9cfd2"/><text class="silk" x="${x + 251}" y="${y + h / 2 + 18}" font-size="7" text-anchor="middle">16 MHz</text>`;
    s += boardLed('bTX', x + 56, y + 46, 'TX') + boardLed('bRX', x + 56, y + 58, 'RX') + boardLed('bL', x + 56, y + 70, 'L') + boardLed('bON', x + 56, y + 82, 'PWR');
    s += `<rect x="${x + 56}" y="${y + 82}" width="10" height="6" rx="1" fill="#3cff7a" filter="url(#glowS)" opacity=".9"/>`;
    s += `<text x="${x + w - 30}" y="${y + h / 2 + 5}" font-family="var(--f-ui)" font-weight="700" font-size="13" fill="var(--silk)" text-anchor="middle" transform="rotate(-90 ${x + w - 30} ${y + h / 2})">NANO</text>`;
    return s;
  };
})(nano);

/* =========================================================================
   Arduino Mega 2560 (ATmega2560)
   ========================================================================= */
const MEGA_PORTS = 'EEEEGEHHHHBBBBJJHHDDDDAAAAAAAACCCCCCCCDGGGLLLLLLLLBBBBFFFFFFFFKKKKKKKK';
const MEGA_BITS = [0, 1, 4, 5, 5, 3, 3, 4, 5, 6, 4, 5, 6, 7, 1, 0, 1, 0, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0, 7, 2, 1, 0, 7, 6, 5, 4, 3, 2, 1, 0, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];
const megaAnalog = {}; for (let i = 0; i < 16; i++) megaAnalog[54 + i] = i;
const mega = makeBoard({
  id: 'mega', name: 'Arduino Mega 2560', chipName: 'ATmega2560', mcu: 'atmega2560', canvasW: 1400,
  rect: { x: 40, y: 190, w: 700, h: 390 },
  pins: MEGA_BITS.map((b, p) => [MEGA_PORTS[p], b]), firstAnalog: 54, analog: megaAnalog,
  pwm: new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]),
  pinExtra: { 0: 'RX0←0', 1: 'TX0→1', 14: 'TX3 14', 15: 'RX3 15', 16: 'TX2 16', 17: 'RX2 17', 18: 'TX1 18', 19: 'RX1 19', 20: 'SDA 20', 21: 'SCL 21' },
  notes: notesFrom([[0, 'RX del puerto serie (USB)'], [1, 'TX del puerto serie (USB)'], [2, 'interrupción externa'], [3, 'interrupción externa'],
    [14, 'TX3 (Serial3)'], [15, 'RX3 (Serial3)'], [16, 'TX2 (Serial2)'], [17, 'RX2 (Serial2)'], [18, 'TX1 (Serial1) · interrupción externa'], [19, 'RX1 (Serial1) · interrupción externa'],
    [20, 'SDA (I2C) · interrupción externa'], [21, 'SCL (I2C) · interrupción externa'], [50, 'MISO (SPI)'], [51, 'MOSI (SPI)'], [52, 'SCK (SPI)'], [53, 'SS (SPI)'], [13, 'LED L']]),
  i2c: { sda: 'D20', scl: 'D21' }, spi: { mosi: 51, sck: 52 }, uarts: [{ rx: 0, tx: 1 }, { rx: 19, tx: 18 }, { rx: 17, tx: 16 }, { rx: 15, tx: 14 }],
  nets: [['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'], ['5V', '5V.2', '5V.3']], supplies: [['5V', 5, 0.05], ['IOREF', 5, 0.05], ['3V3', 3.3, 0.5], ['RESET', 5, 10000]],
});
(function(B){
  const { x, y, w, h } = B.rect; const topY = y + 20, botY = y + h - 20;
  const TOP = [['AREF', 'GND.1', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], ['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21']];
  TOP.forEach((g, k) => g.forEach((id, i) => B.add(id, x + 150 + k * (8 * PITCH + 10) + i * PITCH, topY, 0, -1)));
  const BOT = [['IOREF', 'RESET', '3V3', '5V', 'GND.2', 'GND.3', 'VIN'], ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], ['A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15']];
  let bx = x + 170; BOT.forEach(g => { g.forEach((id, i) => B.add(id, bx + i * PITCH, botY, 0, 1)); bx += g.length * PITCH + 10; });
  // conector doble del extremo: 5V/5V arriba, 22..53, GND/GND abajo
  const cx1 = x + w - 52, cx2 = cx1 + PITCH, y0 = y + 46;
  const rows = [['5V.2', '5V.3']]; for (let n = 22; n < 54; n += 2) rows.push(['D' + n, 'D' + (n + 1)]); rows.push(['GND.4', 'GND.5']);
  rows.forEach(([a, b], i) => { B.add(a, cx1, y0 + i * PITCH, 1, 0); B.terms[a].labelLeft = true; B.add(b, cx2, y0 + i * PITCH, 1, 0); });
  B.draw = () => {
    let s = '';
    s += `<rect x="${x - 14}" y="${y + 40}" width="74" height="62" rx="3" fill="#b9c0c4" stroke="#7d868b"/><rect x="${x - 6}" y="${y + 50}" width="22" height="42" fill="#8d969b"/>`;
    s += `<rect x="${x - 10}" y="${y + 278}" width="66" height="58" rx="5" fill="#1d1f22"/><circle cx="${x + 14}" cy="${y + 307}" r="11" fill="#33373b"/>`;
    s += `<path d="M${x} ${y + 8} q0 -8 8 -8 H${x + w - 8} q8 0 8 8 V${y + h - 8} q0 8 -8 8 H${x + 8} q-8 0 -8 -8 Z" fill="var(--pcb)" stroke="var(--pcb-edge)" stroke-width="2"/>`;
    for (const [hx, hy] of [[x + 20, y + h - 16], [x + 96, y + 20], [x + w - 100, y + 20], [x + w - 100, y + h - 16], [x + 420, y + h - 80]]) s += `<circle cx="${hx}" cy="${hy}" r="6" fill="var(--bg)" stroke="#d9c27a" stroke-width="2"/>`;
    for (const g of TOP) s += headerSvg(B, g);
    for (const g of BOT) s += headerSvg(B, g);
    s += `<rect x="${cx1 - 9}" y="${y0 - 9}" width="${PITCH + 18}" height="${(rows.length - 1) * PITCH + 18}" rx="2" fill="var(--header)"/>`;
    for (const r of rows) for (const id of r) s += `<rect data-pinled="${id}" x="${B.terms[id].x - 3.5}" y="${B.terms[id].y - 3.5}" width="7" height="7" fill="#0c0c0c" stroke="#3a3a3a"/>`;
    s += pinLabels(B);
    s += `<text class="silk" x="${x + 260}" y="${y + 96}" font-size="10" text-anchor="middle">PWM ~</text><text class="silk" x="${x + 470}" y="${y + 96}" font-size="10" text-anchor="middle">COMUNICACIÓN</text>`;
    s += `<text class="silk" x="${x + 230}" y="${y + h - 72}" font-size="10" text-anchor="middle">POWER</text><text class="silk" x="${x + 460}" y="${y + h - 72}" font-size="10" text-anchor="middle">ANALOG IN</text>`;
    s += `<text class="silk" x="${cx1 + PITCH / 2}" y="${y + 30}" font-size="9" text-anchor="middle">DIGITAL</text>`;
    s += `<text x="${x + 280}" y="${y + 196}" font-family="var(--f-ui)" font-weight="700" font-style="italic" font-size="42" fill="var(--silk)" opacity=".92" text-anchor="middle" letter-spacing="2">MEGA 2560</text>`;
    s += qfp(x + 470, y + 215, 92, 'ATmega2560');
    s += resetBtn(x + 24, y + 12) + `<text class="silk" x="${x + 35}" y="${y + 46}" font-size="8" text-anchor="middle">RESET</text>`;
    s += `<rect x="${x + 100}" y="${y + 140}" width="34" height="12" rx="2" fill="#c9cfd2"/><text class="silk" x="${x + 117}" y="${y + 166}" font-size="8" text-anchor="middle">16 MHz</text>`;
    s += boardLed('bL', x + 150, y + 60, 'L') + boardLed('bTX', x + 150, y + 72, 'TX') + boardLed('bRX', x + 150, y + 84, 'RX') + boardLed('bON', x + 560, y + 130, 'ON');
    s += `<rect x="${x + 558}" y="${y + 130}" width="10" height="6" rx="1" fill="#3cff7a" filter="url(#glowS)" opacity=".9"/>`;
    return s;
  };
})(mega);

/* =========================================================================
   ESP32 DevKit V1 (30 pines) en modo compatible: corre sobre el ATmega2560 emulado
   ========================================================================= */
const esp32Pins = []; for (let g = 0; g < 40; g++) { const m = ESP32_GPIO[g]; esp32Pins.push(m ? [m[0], m[1]] : null); }
const ESP_LABEL = { 1: 'TX0', 3: 'RX0', 16: 'RX2', 17: 'TX2', 36: 'VP', 39: 'VN' };
const esp32 = makeBoard({
  id: 'esp32', name: 'ESP32 DevKit', chipName: 'ESP32', mcu: 'atmega2560', canvasW: 1100, vio: 3.3, ledPin: 2, ledColor: [60, 140, 255], ledOff: '#1a2a4a', esp32: true,
  rect: { x: 300, y: 130, w: 220, h: 410 },
  pins: esp32Pins, firstAnalog: 99, analog: { ...ESP32_ADC },
  pwm: new Set(), pinExtra: {},
  notes: notesFrom([[1, 'TX0 del puerto serie (USB)'], [3, 'RX0 del puerto serie (USB)'], [16, 'RX2 (Serial2)'], [17, 'TX2 (Serial2)'], [21, 'SDA (I2C)'], [22, 'SCL (I2C)'],
    [23, 'MOSI (SPI)'], [19, 'MISO (SPI)'], [18, 'SCK (SPI)'], [5, 'SS (SPI)'], [2, 'LED azul de la placa'], [0, 'botón BOOT (a GND al pulsar)'],
    [34, 'solo entrada'], [35, 'solo entrada'], [36, 'solo entrada'], [39, 'solo entrada'], [25, 'DAC1'], [26, 'DAC2'],
    ...Object.entries(ESP32_ADC).map(([g, c]) => [+g, (+g >= 32 ? 'ADC1' : 'ADC2') + ' (analogRead, 0–4095)']),
    ...[[4, 0], [0, 1], [2, 2], [15, 3], [13, 4], [12, 5], [14, 6], [27, 7], [33, 8], [32, 9]].map(([g, t]) => [g, 'táctil T' + t])]),
  i2c: { sda: 'D21', scl: 'D22' }, spi: { mosi: 23, sck: 18 }, uarts: [{ rx: 3, tx: 1 }, null, { rx: 16, tx: 17 }, null],
  nets: [['GND.1', 'GND.2']], supplies: [['3V3', 3.3, 0.5], ['VIN', 5, 0.05], ['EN', 3.3, 10000], ['D0', 3.3, 10000]], bootPin: 0, btUart: 1,
});
(function(B){
  const { x, y, w, h } = B.rect, y0 = y + 120;
  const L = ['EN', 'D36', 'D39', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND.1', 'VIN'];
  const R = ['D23', 'D22', 'D1', 'D3', 'D21', 'D19', 'D18', 'D5', 'D17', 'D16', 'D4', 'D2', 'D15', 'GND.2', '3V3'];
  L.forEach((id, i) => B.add(id, x + 16, y0 + i * PITCH, -1, 0));
  R.forEach((id, i) => { B.add(id, x + w - 16, y0 + i * PITCH, 1, 0); B.terms[id].labelLeft = true; });
  B.pinName = p => 'D' + p;
  B.pinOfName = id => { const m = /^D(\d+)$/.exec(id); return m && esp32Pins[+m[1]] ? +m[1] : -1; };
  B.label = id => { const base = id.replace(/\.\d+$/, ''); const m = /^D(\d+)$/.exec(base); return m ? (ESP_LABEL[+m[1]] || 'D' + m[1]) : base; };
  B.title = id => {
    const base = id.replace(/\.\d+$/, '');
    if (base === 'GND') return 'GND (tierra, 0 V)'; if (base === '3V3') return '3,3 V (salida del regulador)'; if (base === 'VIN') return 'VIN (5 V del USB)'; if (base === 'EN') return 'EN (reinicio, activo en LOW; no simulado)';
    const p = B.pinOfName(base); if (p < 0) return base;
    return `GPIO${p}${B.notes[p] ? ' · ' + B.notes[p] : ''}`;
  };
  B.keys = esp32Pins.map((m, p) => m ? 'B:D' + p : null).filter(Boolean);
  B.draw = () => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1b1d20" stroke="#000" stroke-width="2"/>`;
    for (const [hx, hy] of [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]]) s += `<circle cx="${hx}" cy="${hy}" r="5" fill="var(--bg)" stroke="#d9c27a" stroke-width="1.5"/>`;
    // módulo ESP-WROOM-32: antena y blindaje metálico
    const mx = x + 40, mw = w - 80;
    s += `<rect x="${mx}" y="${y + 8}" width="${mw}" height="168" rx="2" fill="#262a2e"/>`;
    s += `<path d="M${mx + 10} ${y + 40} v-22 h16 v18 h16 v-18 h16 v18 h16 v-18 h16 v18 h16 v-18 h${mw - 106}" fill="none" stroke="#c9a54a" stroke-width="2.5"/>`;
    s += `<rect x="${mx + 6}" y="${y + 50}" width="${mw - 12}" height="118" rx="3" fill="#b8bec3" stroke="#8b9297"/>`;
    s += `<text x="${x + w / 2}" y="${y + 98}" font-family="var(--f-ui)" font-weight="700" font-size="13" fill="#4a5056" text-anchor="middle">ESP32</text><text x="${x + w / 2}" y="${y + 116}" font-family="var(--f-code)" font-size="8.5" fill="#5b6268" text-anchor="middle">ESP-WROOM-32</text><text x="${x + w / 2}" y="${y + 150}" font-family="var(--f-code)" font-size="7" fill="#6b7277" text-anchor="middle">modo compatible</text>`;
    s += `<rect x="${x + 6}" y="${y0 - 10}" width="20" height="${(L.length - 1) * PITCH + 20}" rx="2" fill="var(--header)"/><rect x="${x + w - 26}" y="${y0 - 10}" width="20" height="${(R.length - 1) * PITCH + 20}" rx="2" fill="var(--header)"/>`;
    for (const id of [...L, ...R]) s += `<rect data-pinled="${id}" x="${B.terms[id].x - 3.5}" y="${B.terms[id].y - 3.5}" width="7" height="7" fill="#0c0c0c" stroke="#3a3a3a"/>`;
    s += pinLabels(B);
    // regulador, botones, LEDs y USB
    s += `<rect x="${x + w / 2 - 14}" y="${y + 190}" width="28" height="18" rx="1" fill="#2b2f33"/><rect x="${x + w / 2 - 24}" y="${y + 240}" width="48" height="30" rx="2" fill="#16181a"/><text x="${x + w / 2}" y="${y + 258}" font-family="var(--f-code)" font-size="6.5" fill="#8e969b" text-anchor="middle">CP2102</text>`;
    s += `<g class="ctrl" data-ctrl="reset"><rect x="${x + 64}" y="${y + h - 52}" width="22" height="18" rx="2" fill="#c9cfd2"/><rect x="${x + 69}" y="${y + h - 48}" width="12" height="10" rx="2" fill="#3a3f44"/><title>EN: reiniciar el ESP32</title></g><text class="silk" x="${x + 75}" y="${y + h - 57}" font-size="8" text-anchor="middle">EN</text>`;
    s += `<g class="ctrl" data-ctrl="boot"><rect x="${x + w - 86}" y="${y + h - 52}" width="22" height="18" rx="2" fill="#c9cfd2"/><rect x="${x + w - 81}" y="${y + h - 48}" width="12" height="10" rx="2" fill="#3a3f44"/><title>BOOT: une GPIO0 a GND mientras lo mantienes pulsado</title></g><text class="silk" x="${x + w - 75}" y="${y + h - 57}" font-size="8" text-anchor="middle">BOOT</text>`;
    s += boardLed('bON', x + 72, y + h - 92, 'PWR') + `<rect x="${x + 72}" y="${y + h - 92}" width="10" height="6" rx="1" fill="#ff3b30" filter="url(#glowS)" opacity=".9"/>`;
    s += `<rect id="bL" x="${x + w - 82}" y="${y + h - 92}" width="10" height="6" rx="1" fill="#1a2a4a"/><text class="silk" x="${x + w - 86}" y="${y + h - 86}" font-size="8" text-anchor="end">IO2</text>`;
    s += `<rect id="bTX" width="0" height="0"/><rect id="bRX" width="0" height="0"/>`;
    s += `<rect x="${x + w / 2 - 22}" y="${y + h - 26}" width="44" height="32" rx="3" fill="#b9c0c4" stroke="#7d868b"/><rect x="${x + w / 2 - 14}" y="${y + h - 4}" width="28" height="8" rx="1" fill="#8d969b"/>`;
    return s;
  };
})(esp32);

/* =========================================================================
   ESP32-CAM (AI-Thinker) en modo compatible: mismo chip y numeración que el DevKit, con cámara
   OV2640 simulada, LED flash en GPIO4 y LED rojo en GPIO33 (se enciende en LOW)
   ========================================================================= */
const esp32cam = makeBoard({
  id: 'esp32cam', name: 'ESP32-CAM', chipName: 'ESP32', mcu: 'atmega2560', canvasW: 1100, vio: 3.3, esp32: true, cam: true,
  ledPin: 33, ledActiveLow: true, ledColor: [255, 40, 30], ledOff: '#4a1a1a', flashPin: 4,
  rect: { x: 320, y: 150, w: 190, h: 330 },
  pins: esp32Pins, firstAnalog: 99, analog: { ...ESP32_ADC },
  pwm: new Set(), pinExtra: {},
  notes: notesFrom([[1, 'U0T: TX del puerto serie (adaptador USB-serie)'], [3, 'U0R: RX del puerto serie'], [0, 'a GND para grabar el programa en la placa real'],
    [4, 'LED flash de la placa (muy brillante)'], [2, 'también es HS2_DATA0 de la tarjeta SD'], [12, 'HS2_DATA2 de la SD'], [13, 'HS2_DATA3 de la SD'], [14, 'HS2_CLK de la SD · SDA (I2C) en la simulación'], [15, 'HS2_CMD de la SD · SCL (I2C) en la simulación'],
    [16, 'en la placa real lo usa la PSRAM'], ...[[12, 10], [13, 11], [14, 9], [15, 14], [2, 13], [4, 12], [0, 15]].map(([g]) => [g, 'ADC2 (analogRead, 0–4095)'])]),
  i2c: { sda: 'D14', scl: 'D15' }, spi: { mosi: 13, sck: 14 }, uarts: [{ rx: 3, tx: 1 }, null, { rx: 16, tx: 17 }, null],
  nets: [['GND.1', 'GND.2', 'GND.3']], supplies: [['5V', 5, 0.05], ['3V3', 3.3, 0.5], ['VCC', 3.3, 0.5], ['D0', 3.3, 10000]],
  btUart: 1,
});
(function(B){
  const { x, y, w, h } = B.rect, y0 = y + h - 16 - 7 * PITCH;
  const L = ['5V', 'GND.1', 'D12', 'D13', 'D15', 'D14', 'D2', 'D4'];
  const R = ['3V3', 'D16', 'D0', 'GND.2', 'VCC', 'D3', 'D1', 'GND.3'];
  L.forEach((id, i) => B.add(id, x + 14, y0 + i * PITCH, -1, 0));
  R.forEach((id, i) => { B.add(id, x + w - 14, y0 + i * PITCH, 1, 0); B.terms[id].labelLeft = true; });
  const LABEL = { 1: 'U0T', 3: 'U0R' };
  B.pinName = p => 'D' + p;
  B.pinOfName = id => { const m = /^D(\d+)$/.exec(id); return m && esp32Pins[+m[1]] ? +m[1] : -1; };
  B.label = id => { const base = id.replace(/\.\d+$/, ''); const m = /^D(\d+)$/.exec(base); return m ? (LABEL[+m[1]] || 'IO' + m[1]) : base; };
  B.title = id => {
    const base = id.replace(/\.\d+$/, '');
    if (base === 'GND') return 'GND (tierra, 0 V)'; if (base === '3V3') return '3,3 V'; if (base === '5V') return '5 V (alimentación de la placa)'; if (base === 'VCC') return 'VCC (salida de 3,3 V)';
    const p = B.pinOfName(base); if (p < 0) return base;
    return `GPIO${p}${B.notes[p] ? ' · ' + B.notes[p] : ''}`;
  };
  B.keys = esp32Pins.map((m, p) => m ? 'B:D' + p : null).filter(Boolean);
  B.draw = () => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#16181b" stroke="#000" stroke-width="2"/>`;
    // antena impresa y módulo con blindaje
    s += `<path d="M${x + 20} ${y + 26} v-14 h12 v12 h12 v-12 h12 v12 h12 v-12 h12 v12 h12 v-12 h${w - 100}" fill="none" stroke="#c9a54a" stroke-width="2.2"/>`;
    s += `<rect x="${x + 18}" y="${y + 34}" width="${w - 36}" height="70" rx="2" fill="#b8bec3" stroke="#8b9297"/><text x="${x + w / 2}" y="${y + 66}" font-family="var(--f-ui)" font-weight="700" font-size="12" fill="#4a5056" text-anchor="middle">ESP32-S</text><text x="${x + w / 2}" y="${y + 82}" font-family="var(--f-code)" font-size="7" fill="#5b6268" text-anchor="middle">AI-Thinker · modo compatible</text>`;
    // cámara OV2640 con su cinta y lente
    s += `<rect x="${x + w / 2 - 34}" y="${y + 112}" width="68" height="14" rx="2" fill="#7a5a20"/><rect x="${x + w / 2 - 30}" y="${y + 120}" width="60" height="60" rx="4" fill="#0c0d0f" stroke="#2d3035"/>`;
    s += `<circle cx="${x + w / 2}" cy="${y + 150}" r="22" fill="#1d2024" stroke="#3a3f45" stroke-width="2"/><circle cx="${x + w / 2}" cy="${y + 150}" r="13" fill="#0a1330"/><circle cx="${x + w / 2}" cy="${y + 150}" r="7" fill="#1a2a60"/><circle cx="${x + w / 2 - 4}" cy="${y + 146}" r="2.5" fill="#8fb0ff" opacity=".8"/>`;
    s += `<text class="silk" x="${x + w / 2}" y="${y + 192}" font-size="7.5" text-anchor="middle">OV2640</text>`;
    // LED flash (GPIO4), botón RST y LED rojo (GPIO33)
    s += `<rect id="bF" x="${x + 22}" y="${y + 130}" width="16" height="16" rx="2" fill="#d8d2b0" stroke="#8d8a74"/><text class="silk" x="${x + 30}" y="${y + 158}" font-size="7" text-anchor="middle">FLASH</text>`;
    s += `<g class="ctrl" data-ctrl="reset"><rect x="${x + w - 42}" y="${y + 128}" width="22" height="18" rx="2" fill="#c9cfd2"/><rect x="${x + w - 37}" y="${y + 132}" width="12" height="10" rx="2" fill="#3a3f44"/><title>RST: reiniciar la ESP32-CAM</title></g><text class="silk" x="${x + w - 31}" y="${y + 158}" font-size="7.5" text-anchor="middle">RST</text>`;
    s += `<rect id="bL" x="${x + w / 2 - 5}" y="${y + 200}" width="10" height="6" rx="1" fill="#4a1a1a"/><text class="silk" x="${x + w / 2}" y="${y + 216}" font-size="7" text-anchor="middle">IO33</text>`;
    s += `<rect x="${x + 6}" y="${y0 - 10}" width="18" height="${7 * PITCH + 20}" rx="2" fill="var(--header)"/><rect x="${x + w - 24}" y="${y0 - 10}" width="18" height="${7 * PITCH + 20}" rx="2" fill="var(--header)"/>`;
    for (const id of [...L, ...R]) s += `<rect data-pinled="${id}" x="${B.terms[id].x - 3.5}" y="${B.terms[id].y - 3.5}" width="7" height="7" fill="#0c0c0c" stroke="#3a3a3a"/>`;
    s += pinLabels(B);
    s += `<rect id="bTX" width="0" height="0"/><rect id="bRX" width="0" height="0"/>`;
    return s;
  };
})(esp32cam);

/* =========================================================================
   ESP32-S3 DevKitC-1 y ESP32-C3 DevKitM-1 en modo compatible (otra numeración de GPIO, LED RGB en la placa)
   ========================================================================= */
function espDevkit(def, V, L, R, labels){
  const pins = []; for (let g = 0; g < V.n; g++) { const m = V.gpio[g]; pins.push(m ? [m[0], m[1]] : null); }
  const B = makeBoard({ chipName: def.chip, mcu: 'atmega2560', canvasW: 1100, vio: 3.3, esp32: true, rgbPin: V.rgb, ...def,
    pins, firstAnalog: 99, analog: { ...V.adc }, pwm: new Set(), pinExtra: {},
    i2c: { sda: 'D' + V.sda, scl: 'D' + V.scl }, spi: { mosi: V.spi.mosi, sck: V.spi.sck } });
  const { x, y, w, h } = B.rect, y0 = y + h - 18 - (L.length - 1) * PITCH;
  L.forEach((id, i) => B.add(id, x + 14, y0 + i * PITCH, -1, 0));
  R.forEach((id, i) => { B.add(id, x + w - 14, y0 + i * PITCH, 1, 0); B.terms[id].labelLeft = true; });
  B.pinName = p => 'D' + p;
  B.pinOfName = id => { const m = /^D(\d+)$/.exec(id); return m && pins[+m[1]] ? +m[1] : -1; };
  B.label = id => { const base = id.replace(/\.\d+$/, ''); const m = /^D(\d+)$/.exec(base); return m ? (labels[+m[1]] || String(+m[1])) : base; };
  B.title = id => {
    const base = id.replace(/\.\d+$/, '');
    if (base === 'GND') return 'GND (tierra, 0 V)'; if (base === '3V3') return '3,3 V (salida del regulador)'; if (base === '5V') return '5 V (del USB)'; if (base === 'EN') return 'EN / RST (reinicio, activo en LOW; no simulado)';
    const p = B.pinOfName(base); if (p < 0) return base;
    return `GPIO${p}${B.notes[p] ? ' · ' + B.notes[p] : ''}`;
  };
  B.keys = pins.map((m, p) => m ? 'B:D' + p : null).filter(Boolean);
  B.draw = () => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1b1d20" stroke="#000" stroke-width="2"/>`;
    const mx = x + 34, mw = w - 68;
    s += `<rect x="${mx}" y="${y + 8}" width="${mw}" height="${def.modH}" rx="2" fill="#262a2e"/>`;
    s += `<path d="M${mx + 10} ${y + 34} v-18 h14 v14 h14 v-14 h14 v14 h14 v-14 h${mw - 76}" fill="none" stroke="#c9a54a" stroke-width="2.2"/>`;
    s += `<rect x="${mx + 6}" y="${y + 44}" width="${mw - 12}" height="${def.modH - 42}" rx="3" fill="#b8bec3" stroke="#8b9297"/>`;
    s += `<text x="${x + w / 2}" y="${y + 44 + (def.modH - 42) / 2}" font-family="var(--f-ui)" font-weight="700" font-size="12" fill="#4a5056" text-anchor="middle">${def.chip}</text><text x="${x + w / 2}" y="${y + 58 + (def.modH - 42) / 2}" font-family="var(--f-code)" font-size="7" fill="#5b6268" text-anchor="middle">${def.module} · modo compatible</text>`;
    s += `<rect x="${x + 4}" y="${y0 - 10}" width="20" height="${(L.length - 1) * PITCH + 20}" rx="2" fill="var(--header)"/><rect x="${x + w - 24}" y="${y0 - 10}" width="20" height="${(R.length - 1) * PITCH + 20}" rx="2" fill="var(--header)"/>`;
    for (const id of [...L, ...R]) s += `<rect data-pinled="${id}" x="${B.terms[id].x - 3.5}" y="${B.terms[id].y - 3.5}" width="7" height="7" fill="#0c0c0c" stroke="#3a3a3a"/>`;
    s += pinLabels(B);
    // LED RGB, LED de encendido, botones y USB
    const cy = y + def.modH + 34;
    s += `<rect id="bRGB" x="${x + w / 2 - 7}" y="${cy}" width="14" height="14" rx="2" fill="#e8e8e4" stroke="#9a9a94"/><text class="silk" x="${x + w / 2}" y="${cy + 26}" font-size="7.5" text-anchor="middle">RGB · IO${V.rgb}</text>`;
    s += `<rect x="${x + w / 2 - 5}" y="${cy + 40}" width="10" height="6" rx="1" fill="#ff3b30" filter="url(#glowS)" opacity=".9"/><text class="silk" x="${x + w / 2}" y="${cy + 56}" font-size="7" text-anchor="middle">PWR</text>`;
    s += `<rect id="bL" width="0" height="0"/>`;
    const by = y + h - 46;
    s += `<g class="ctrl" data-ctrl="boot"><rect x="${x + 42}" y="${by}" width="22" height="18" rx="2" fill="#c9cfd2"/><rect x="${x + 47}" y="${by + 4}" width="12" height="10" rx="2" fill="#3a3f44"/><title>BOOT: une GPIO${def.bootPin} a GND mientras lo mantienes pulsado</title></g><text class="silk" x="${x + 53}" y="${by - 4}" font-size="8" text-anchor="middle">BOOT</text>`;
    s += `<g class="ctrl" data-ctrl="reset"><rect x="${x + w - 64}" y="${by}" width="22" height="18" rx="2" fill="#c9cfd2"/><rect x="${x + w - 59}" y="${by + 4}" width="12" height="10" rx="2" fill="#3a3f44"/><title>RST: reiniciar</title></g><text class="silk" x="${x + w - 53}" y="${by - 4}" font-size="8" text-anchor="middle">RST</text>`;
    s += `<rect x="${x + w / 2 - 20}" y="${y + h - 24}" width="40" height="30" rx="3" fill="#b9c0c4" stroke="#7d868b"/>`;
    s += `<rect id="bTX" width="0" height="0"/><rect id="bRX" width="0" height="0"/>`;
    return s;
  };
  return B;
}
const S3V = VARIANTS.esp32s3, C3V = VARIANTS.esp32c3;
const esp32s3 = espDevkit({
  id: 'esp32s3', name: 'ESP32-S3 DevKitC-1', chip: 'ESP32-S3', module: 'WROOM-1', modH: 150, bootPin: 0,
  rect: { x: 300, y: 110, w: 230, h: 600 },
  notes: notesFrom([[43, 'TX del puerto serie (USB)'], [44, 'RX del puerto serie (USB)'], [17, 'TX1 (Serial1)'], [18, 'RX1 (Serial1)'], [8, 'SDA (I2C)'], [9, 'SCL (I2C)'],
    [11, 'MOSI (SPI)'], [13, 'MISO (SPI)'], [12, 'SCK (SPI)'], [10, 'SS (SPI)'], [0, 'botón BOOT (a GND al pulsar)'], [48, 'LED RGB de la placa'], [19, 'USB D−'], [20, 'USB D+'],
    ...Object.keys(S3V.adc).map(g => [+g, (+g <= 10 ? 'ADC1' : 'ADC2') + ' (analogRead, 0–4095)']), ...Object.values(S3V.T).map(g => [g, 'táctil'])]),
  uarts: [{ rx: 44, tx: 43 }, { rx: 18, tx: 17 }, { rx: 19, tx: 20 }, null],
  nets: [['GND.1', 'GND.2', 'GND.3', 'GND.4'], ['3V3', '3V3.2']], supplies: [['3V3', 3.3, 0.5], ['5V', 5, 0.05], ['EN', 3.3, 10000], ['D0', 3.3, 10000]],
}, S3V,
  ['3V3', '3V3.2', 'EN', 'D4', 'D5', 'D6', 'D7', 'D15', 'D16', 'D17', 'D18', 'D8', 'D3', 'D46', 'D9', 'D10', 'D11', 'D12', 'D13', 'D14', '5V', 'GND.1'],
  ['GND.2', 'D43', 'D44', 'D1', 'D2', 'D42', 'D41', 'D40', 'D39', 'D38', 'D37', 'D36', 'D35', 'D0', 'D45', 'D48', 'D47', 'D21', 'D20', 'D19', 'GND.3', 'GND.4'],
  { 43: 'TX', 44: 'RX' });
const esp32c3 = espDevkit({
  id: 'esp32c3', name: 'ESP32-C3 DevKitM-1', chip: 'ESP32-C3', module: 'MINI-1', modH: 110, bootPin: 9,
  rect: { x: 320, y: 140, w: 200, h: 440 },
  notes: notesFrom([[21, 'TX del puerto serie (USB)'], [20, 'RX del puerto serie (USB)'], [19, 'TX1 (Serial1) · USB D+'], [18, 'RX1 (Serial1) · USB D−'], [8, 'SDA (I2C) · LED RGB de la placa'], [9, 'SCL (I2C) · botón BOOT (a GND al pulsar)'],
    [6, 'MOSI (SPI)'], [5, 'MISO (SPI)'], [4, 'SCK (SPI)'], [7, 'SS (SPI)'], ...Object.keys(C3V.adc).map(g => [+g, (+g <= 4 ? 'ADC1' : 'ADC2') + ' (analogRead, 0–4095)'])]),
  uarts: [{ rx: 20, tx: 21 }, { rx: 18, tx: 19 }, null, null],
  nets: [['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5', 'GND.6', 'GND.7', 'GND.8', 'GND.9', 'GND.10'], ['3V3', '3V3.2'], ['5V', '5V.2']],
  supplies: [['3V3', 3.3, 0.5], ['5V', 5, 0.05], ['EN', 3.3, 10000], ['D9', 3.3, 10000]],
}, C3V,
  ['GND.1', '3V3', '3V3.2', 'D2', 'D3', 'GND.2', 'EN', 'GND.3', 'D0', 'D1', 'D10', 'GND.4', '5V', '5V.2', 'GND.5'],
  ['GND.6', 'D21', 'D20', 'GND.7', 'D9', 'D8', 'GND.8', 'D7', 'D6', 'D5', 'D4', 'GND.9', 'D18', 'D19', 'GND.10'],
  { 21: 'TX', 20: 'RX' });


/* =========================================================================
   ATmega328P suelto en su zócalo (Arduino casero / «Arduino en protoboard»)
   Se alimenta desde afuera (VCC y AVCC a 5 V, p. ej. con un 7805), necesita el cristal de 16 MHz
   entre XTAL1 y XTAL2 (con 22 pF a GND) y RESET a 5 V con 10 kΩ. Si falta algo, no arranca.
   ========================================================================= */
const DIP_PINS = ['RESET', 'D0', 'D1', 'D2', 'D3', 'D4', 'VCC', 'GND.1', 'XTAL1', 'XTAL2', 'D5', 'D6', 'D7', 'D8',
  'D9', 'D10', 'D11', 'D12', 'D13', 'AVCC', 'AREF', 'GND.2', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const DIP_FN = { RESET: 'PC6', D0: 'PD0 RXD', D1: 'PD1 TXD', D2: 'PD2 INT0', D3: 'PD3 INT1', D4: 'PD4', VCC: 'VCC', 'GND.1': 'GND', XTAL1: 'XTAL1', XTAL2: 'XTAL2', D5: 'PD5', D6: 'PD6', D7: 'PD7', D8: 'PB0',
  D9: 'PB1', D10: 'PB2 SS', D11: 'PB3 MOSI', D12: 'PB4 MISO', D13: 'PB5 SCK', AVCC: 'AVCC', AREF: 'AREF', 'GND.2': 'GND', A0: 'PC0', A1: 'PC1', A2: 'PC2', A3: 'PC3', A4: 'PC4 SDA', A5: 'PC5 SCL' };
const dip328 = makeBoard({
  id: 'dip328', name: 'ATmega328P suelto (Arduino casero)', chipName: 'ATmega328P', mcu: 'atmega328p', canvasW: 1100, standalone: true, compileAs: 'uno',
  rect: { x: 120, y: 290, w: 330, h: 120 },
  pins: PINS_328, firstAnalog: 14, analog: { 14: 0, 15: 1, 16: 2, 17: 3, 18: 4, 19: 5 },
  pwm: new Set([3, 5, 6, 9, 10, 11]), pinExtra: {}, notes: NOTES_328,
  i2c: { sda: 'A4', scl: 'A5' }, spi: { mosi: 11, sck: 13 }, uarts: [{ rx: 0, tx: 1 }],
  nets: [['GND.1', 'GND.2']], supplies: [['RESET', 5, 40000]], keys: ['B:VCC', 'B:AVCC', 'B:XTAL1', 'B:XTAL2'],
});
(function(B){
  const { x, y, w, h } = B.rect, P = 20, x0 = x + 30;
  DIP_PINS.forEach((id, i) => {
    if (i < 14) B.add(id, x0 + i * P, y + h + 4, 0, 1);
    else B.add(id, x0 + (27 - i) * P, y - 4, 0, -1);
  });
  B.label = id => String(DIP_PINS.indexOf(id) + 1);
  const t0 = B.title;
  B.title = id => { const n = DIP_PINS.indexOf(id) + 1; const extra = { VCC: 'VCC: 5 V de la fuente (7805)', AVCC: 'AVCC: 5 V (alimenta el ADC; únelo a VCC)', XTAL1: 'XTAL1: cristal de 16 MHz (y 22 pF a GND)', XTAL2: 'XTAL2: cristal de 16 MHz (y 22 pF a GND)', RESET: 'RESET: 10 kΩ a 5 V; a GND reinicia', AREF: 'AREF: referencia analógica (100 nF a GND)' }[id.replace(/\.\d$/, '') === 'GND' ? 'GND' : id];
    return `Pata ${n} · ${DIP_FN[id]} · ${extra || t0(id)}`; };
  B.draw = () => {
    let s = `<rect x="${x}" y="${y - 22}" width="${w}" height="${h + 44}" rx="4" fill="#26282b" stroke="#111"/>`;
    for (const id of DIP_PINS) { const p = B.terms[id]; s += `<rect x="${p.x - 5}" y="${(p.dy < 0 ? p.y + 4 : p.y - 22)}" width="10" height="18" rx="1" fill="#0f1011"/><circle cx="${p.x}" cy="${p.dy < 0 ? p.y + 13 : p.y - 13}" r="3" fill="#c8b46a"/>`; }
    s += `<rect x="${x + 14}" y="${y + 10}" width="${w - 28}" height="${h - 20}" rx="3" fill="#1b1c1e"/>`;
    for (const id of DIP_PINS) { const p = B.terms[id]; s += `<rect x="${p.x - 3}" y="${p.dy < 0 ? y + 4 : y + h - 10}" width="6" height="8" fill="#bfc6c9"/>`; }
    s += `<path d="M${x + 14} ${y + h / 2 - 9} a9 9 0 0 1 0 18" fill="#26282b"/><circle cx="${x + 30}" cy="${y + h - 26}" r="4" fill="#2c3034"/>`;
    s += `<text x="${x + w / 2}" y="${y + h / 2 - 2}" font-family="var(--f-code)" font-size="15" fill="#9aa3a6" text-anchor="middle">ATMEGA328P-PU</text><text x="${x + w / 2}" y="${y + h / 2 + 16}" font-family="var(--f-code)" font-size="9" fill="#7c858a" text-anchor="middle">Atmel · bootloader Arduino Uno · 16 MHz</text>`;
    for (const id of DIP_PINS) { const p = B.terms[id], n = DIP_PINS.indexOf(id) + 1, up = p.dy < 0;
      s += `<text class="silk" font-size="7.5" x="${p.x}" y="${up ? p.y - 14 : p.y + 20}" text-anchor="middle">${n}</text>`;
      s += `<text class="silk" font-size="8" transform="translate(${p.x + 3},${up ? p.y - 24 : p.y + 28}) rotate(-90)" text-anchor="${up ? 'start' : 'end'}">${DIP_FN[id]}</text>`; }
    s += `<text class="silk" x="${x}" y="${y + h + 108}" font-size="10">Arduino casero: VCC y AVCC a 5 V · GND (8 y 22) · cristal 16 MHz en 9–10 con 22 pF a GND · RESET (1) con 10 kΩ a 5 V</text>`;
    s += `<rect id="bL" width="0" height="0"/><rect id="bTX" width="0" height="0"/><rect id="bRX" width="0" height="0"/>`;
    return s;
  };
})(dip328);

export const BOARDS = { uno, nano, mega, dip328, esp32, esp32cam, esp32s3, esp32c3 };
