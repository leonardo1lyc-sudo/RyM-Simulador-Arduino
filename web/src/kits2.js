// Módulos de la tanda 3b: display de 7 segmentos, TM1637 de 4 dígitos, teclado 4x4, encoder rotativo KY-040
// y control remoto IR con su receptor (protocolo NEC).
import { PinState } from './emulator.js';
import { header, pcb, hole, smdLed, glowAttr, tiny, label, fmt, US } from './modules.js';

const isLow = (api, p) => p >= 0 && api.state(p) === PinState.Low;

/* ---------- dibujo de un dígito de 7 segmentos ---------- */
// segs: bits a..g = 0..6, dp = 7. attr(i) da los atributos para identificar cada segmento.
const SEG_PATHS = [
  'M-8 -20 L8 -20 L6 -17 L-6 -17 Z', 'M9 -19 L9 -2 L6 -4 L6 -16 Z', 'M9 2 L9 19 L6 16 L6 4 Z', 'M-8 20 L8 20 L6 17 L-6 17 Z',
  'M-9 2 L-9 19 L-6 16 L-6 4 Z', 'M-9 -19 L-9 -2 L-6 -4 L-6 -16 Z', 'M-8 0 L-6 -2 L6 -2 L8 0 L6 2 L-6 2 Z',
];
function digitSvg(x, y, attr, s = 1, skew = true){
  let o = `<g transform="translate(${x},${y}) scale(${s})${skew ? ' skewX(-6)' : ''}">`;
  SEG_PATHS.forEach((d, i) => { o += `<path d="${d}" fill="#3a1410" ${attr(i)}/>`; });
  return o + `<circle cx="12" cy="19" r="1.8" fill="#3a1410" ${attr(7)}/></g>`;
}
const SEG_ON = '#ff3b24', SEG_OFF = '#3a1410';

/* ---------- display de 7 segmentos (1 dígito) ---------- */
const SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
const SEG7 = (() => {
  const top = header(['g', 'f', 'COM1', 'a', 'b'], { x0: -28, y0: -46, dir: 'up', labels: { g: 'g', f: 'f', COM1: 'COM (común)', a: 'a', b: 'b' }, texts: { COM1: 'C' } });
  const bot = header(['e', 'd', 'COM2', 'c', 'dp'], { x0: -28, y0: 46, labels: { e: 'e', d: 'd', COM2: 'COM (común)', c: 'c', dp: 'dp (punto)' }, texts: { COM2: 'C' } });
  return { terms: { ...top.terms, ...bot.terms }, svg: top.svg + bot.svg };
})();

/* ---------- TM1637 ---------- */
const TM = header(['CLK', 'DIO', 'VCC', 'GND'], { x0: 80, y0: -21, dir: 'right', len: 14, labels: { CLK: 'CLK (reloj)', DIO: 'DIO (datos)', VCC: 'VCC (5 V)', GND: 'GND' } });
function tmDevice(c, api){
  let clk = true, dio = true, active = false, bits = 0, byte = 0, ackPending = false, first = true, addr = 0, auto = true;
  const st = () => c._tm || (c._tm = { segs: [0, 0, 0, 0, 0, 0], on: false, bright: 7, ver: 0 });
  const lines = () => [!isLow(api, api.pin('CLK')), !isLow(api, api.pin('DIO')) && !c._ack];
  const handle = b => {
    const s = st();
    if (first) {
      first = false;
      if ((b & 0xC0) === 0x40) { auto = !(b & 0x04); return; }
      if ((b & 0xC0) === 0x80) { s.on = !!(b & 0x08); s.bright = b & 7; s.ver++; return; }
      if ((b & 0xC0) === 0xC0) { addr = b & 0x07; return; }
    }
    if (addr < 6) { s.segs[addr] = b; s.ver++; } if (auto) addr++;
  };
  return {
    reset(){ c._tm = null; c._ack = 0; clk = dio = true; active = false; bits = 0; ackPending = false; },
    onPin(p, s, old, cyc){
      if (p !== api.pin('CLK') && p !== api.pin('DIO')) return;
      if (!api.powered('VCC', 'GND', 3)) return;
      const [nc, nd] = lines();
      if (nc === clk && nd === dio) return;
      if (nc && clk && nd !== dio) { // DIO cambia con CLK en alto: inicio o fin
        if (!nd) { active = true; bits = 0; byte = 0; first = true; } else active = false;
      } else if (active && nc && !clk) { // flanco de subida de CLK: lee un bit (LSB primero)
        if (bits < 8) { if (nd) byte |= 1 << bits; bits++; }
      } else if (active && !nc && clk) { // flanco de bajada
        if (bits === 8 && !ackPending) { ackPending = true; c._ack = 1; api.drive(); }
        else if (ackPending) { ackPending = false; c._ack = 0; handle(byte); bits = 0; byte = 0; api.drive(); }
      }
      clk = nc; dio = lines()[1];
    },
  };
}

/* ---------- teclado 4x4 ---------- */
const KEYS = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'];
const KP = header(['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'], { x0: -49, y0: 74, labels: { R1: 'Fila 1', R2: 'Fila 2', R3: 'Fila 3', R4: 'Fila 4', C1: 'Columna 1', C2: 'Columna 2', C3: 'Columna 3', C4: 'Columna 4' } });
function keypadDevice(c, api){
  // Propaga al instante el contacto de la tecla pulsada (el barrido de Keypad lee justo después de escribir).
  const sync = () => {
    const k = c.props.key; if (k == null || k < 0) return;
    const r = api.pin('R' + (Math.floor(k / 4) + 1)), col = api.pin('C' + (k % 4 + 1)); if (r < 0 || col < 0) return;
    const rl = isLow(api, r), cl = isLow(api, col);
    const isIn = p => api.state(p) === PinState.Input || api.state(p) === PinState.InputPullUp;
    if (cl && isIn(r)) api.setInput(r, false); else if (rl && isIn(col)) api.setInput(col, false);
    else { if (isIn(r) && api.state(r) === PinState.InputPullUp) api.setInput(r, true); if (isIn(col) && api.state(col) === PinState.InputPullUp) api.setInput(col, true); }
  };
  return {
    reset(){},
    onPin(p){ for (let i = 1; i <= 4; i++) if (p === api.pin('R' + i) || p === api.pin('C' + i)) { sync(); return; } },
    press(){ sync(); api.drive(); },
  };
}

/* ---------- encoder rotativo KY-040 ---------- */
const ENC = header(['CLK', 'DT', 'SW', 'VCC', 'GND'], { x0: 46, y0: -28, dir: 'right', len: 14, labels: { CLK: 'CLK (salida A)', DT: 'DT (salida B)', SW: 'SW (pulsador)', VCC: '+ (5 V)', GND: 'GND' }, texts: { VCC: '+' } });
function encDevice(c, api){
  let busyUntil = 0;
  return {
    reset(){ c._a = 1; c._b = 1; busyUntil = 0; },
    tap(ds){
      if (!api.running()) return;
      const dir = ds && ds.dir === 'ccw' ? -1 : 1;
      let t = Math.max(api.now() + 16, busyUntil); const step = 500 * US; // 0,5 ms entre cambios
      const seq = dir > 0 ? [[0, 1], [0, 0], [1, 0], [1, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]];
      for (const [a, b] of seq) { api.schedule(t, () => { c._a = a; c._b = b; api.drive(); }); t += step; }
      busyUntil = t + step; c.props.pos = (c.props.pos || 0) + dir;
    },
  };
}

/* ---------- IR: receptor VS1838B y control remoto (NEC) ---------- */
const IRRX = header(['S', 'VCC', 'GND'], { x0: -14, y0: 26, labels: { S: 'S (salida, LOW con señal)', VCC: '+ (5 V)', GND: '− (GND)' }, texts: { VCC: '+', GND: '−' } });
const REMOTE = [['CH-', 0x45], ['CH', 0x46], ['CH+', 0x47], ['|◀◀', 0x44], ['▶▶|', 0x40], ['▶||', 0x43], ['−', 0x07], ['+', 0x15], ['EQ', 0x09],
  ['0', 0x16], ['100+', 0x19], ['200+', 0x0D], ['1', 0x0C], ['2', 0x18], ['3', 0x5E], ['4', 0x08], ['5', 0x1C], ['6', 0x5A], ['7', 0x42], ['8', 0x52], ['9', 0x4A]];
function irRxDevice(c, api){
  let busy = 0;
  return {
    reset(){ c._ir = 0; busy = 0; },
    irReceive(addr, cmd){ // trama NEC: salida activa en bajo mientras llega la portadora de 38 kHz
      if (!api.running() || !api.powered('VCC', 'GND', 3)) return false;
      let t = Math.max(api.now() + 32, busy);
      const burst = (on, us) => { api.schedule(t, () => { c._ir = on; api.drive(); }); t += us * US; };
      burst(1, 9000); burst(0, 4500);
      for (const byte of [addr, ~addr & 255, cmd, ~cmd & 255]) for (let i = 0; i < 8; i++) { burst(1, 562); burst(0, (byte >> i) & 1 ? 1687 : 562); }
      burst(1, 562); api.schedule(t, () => { c._ir = 0; api.drive(); });
      busy = t + 40000 * US; c._last = cmd; return true;
    },
  };
}
function remoteDevice(c, api){
  return {
    reset(){},
    tap(ds){
      if (!ds || ds.code == null) return;
      const code = +ds.code; c._sent = code; c._sentAt = performance.now();
      let n = 0; for (const d of api.others()) if (d.irReceive && d.irReceive(0x00, code)) n++;
      c._hits = n;
    },
  };
}

export const KITS2 = {
  seg7: {
    label: 'Display 7 segmentos', prefix: 'D7S', cat: 'Pantallas',
    terms: SEG7.terms, box: [-36, -64, 72, 128], props: () => ({ common: 'cathode', color: 'rojo' }),
    options: [{ prop: 'common', label: 'Tipo', values: [['cathode', 'Cátodo común (5161AS)'], ['anode', 'Ánodo común (5161BS)']] }],
    svg(c){
      return `<rect x="-34" y="-46" width="68" height="92" rx="3" fill="#1d1e20" stroke="#000"/>` + digitSvg(-2, 0, i => `data-seg="${c.id}:${i}"`, 1.7) + SEG7.svg +
        label(0, -70, `${c.name} · ${c.props.common === 'anode' ? 'ánodo' : 'cátodo'} común`);
    },
    elec(c, T, E){
      E.res(T('COM1'), T('COM2'), 0.01);
      SEG_NAMES.forEach((s, i) => { if (c.props.common === 'anode') E.diode(c.id + ':' + i, T('COM1'), T(s), 1.9, 18); else E.diode(c.id + ':' + i, T(s), T('COM1'), 1.9, 18); });
    },
    readout: c => `Cada segmento es un LED (a–g y dp) con el ${c.props.common === 'anode' ? 'ánodo unido a COM: COM a 5V y el segmento se enciende con LOW' : 'cátodo unido a COM: COM a GND y el segmento se enciende con HIGH'}.\nPon una resistencia de 220 Ω en cada segmento.`,
    render(c, k){
      for (let i = 0; i < 8; i++) {
        const I = k.led(c.id + ':' + i) || 0, b = Math.min(1, I / 0.008) ** 0.55;
        const e = k.q(`[data-seg="${c.id}:${i}"]`); if (e) e.setAttribute('fill', b > 0.03 ? `rgba(255,59,36,${(0.35 + 0.65 * b).toFixed(2)})` : SEG_OFF);
        if (I > 0.03) k.warn(`${c.name}: el segmento ${SEG_NAMES[i]} recibe ${Math.round(I * 1000)} mA. Pon una resistencia de 220 Ω en serie con cada segmento.`);
      }
    },
  },
  tm1637: {
    label: 'TM1637 4 dígitos', prefix: 'TM', cat: 'Pantallas',
    terms: TM.terms, box: [-98, -40, 196, 80], props: () => ({}),
    svg(c){
      let s = pcb(-94, -34, 174, 68, '#1e5fa8', '#143f70') + hole(-86, -26) + hole(-86, 26) + hole(72, -26) + hole(72, 26) + `<rect x="-78" y="-26" width="144" height="52" rx="2" fill="#141414"/>`;
      for (let d = 0; d < 4; d++) s += digitSvg(-58 + d * 34 + (d > 1 ? 8 : 0), 0, i => `data-tmseg="${c.id}:${d}:${i}"`, 1.05);
      s += `<circle data-tmseg="${c.id}:col:0" cx="-4" cy="-7" r="2.4" fill="${SEG_OFF}"/><circle data-tmseg="${c.id}:col:1" cx="-4" cy="7" r="2.4" fill="${SEG_OFF}"/>`;
      return s + TM.svg + label(-8, -40, c.name);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 250); E.res(T('VCC'), T('CLK'), 10000); E.res(T('VCC'), T('DIO'), 10000); if (c._ack) E.src(T('DIO'), T('GND'), 0, 30); },
    device: tmDevice,
    readout(c){ const s = c._tm; if (!s) return 'Sin datos. Usa la librería TM1637 (TM1637Display).'; return `Pantalla ${s.on ? 'encendida' : 'apagada'} · brillo ${s.bright}/7\nSegmentos: ${s.segs.slice(0, 4).map(v => '0x' + v.toString(16).padStart(2, '0')).join(' ')}`; },
    render(c, k){
      const s = c._tm, pw = k.powered('VCC', 'GND', 3), on = pw && s && s.on;
      const key = on ? s.ver + ':' + s.bright : 'off'; if (c._tmKey === key) { if (k.running && !pw) k.warn(`${c.name}: sin alimentación. VCC a 5V y GND a GND.`); return; } c._tmKey = key;
      const a = on ? (0.45 + 0.55 * (s.bright + 1) / 8).toFixed(2) : 0;
      for (let d = 0; d < 4; d++) for (let i = 0; i < 8; i++) { const e = k.q(`[data-tmseg="${c.id}:${d}:${i}"]`); if (e) e.setAttribute('fill', on && (s.segs[d] >> i) & 1 && i < 7 ? `rgba(255,59,36,${a})` : SEG_OFF); }
      for (let j = 0; j < 2; j++) { const e = k.q(`[data-tmseg="${c.id}:col:${j}"]`); if (e) e.setAttribute('fill', on && s.segs[1] & 0x80 ? `rgba(255,59,36,${a})` : SEG_OFF); }
    },
  },
  keypad: {
    label: 'Teclado 4x4', prefix: 'KP', cat: 'Entradas',
    terms: KP.terms, box: [-64, -84, 128, 176], props: () => ({ key: -1 }),
    svg(c){
      let s = `<rect x="-60" y="-78" width="120" height="146" rx="5" fill="#f3f3f1" stroke="#b9bab5" stroke-width="2"/><rect x="-54" y="62" width="108" height="12" fill="#1c1c1c"/>`;
      KEYS.forEach((t, i) => {
        const x = -45 + (i % 4) * 30, y = -62 + Math.floor(i / 4) * 32, col = i % 4 === 3 ? '#d84a3a' : /[*#]/.test(t) ? '#4a5560' : '#2d6cdf';
        s += `<g class="ctrl" data-ctrl="key" data-id="${c.id}" data-key="${i}"><rect data-kp="${c.id}:${i}" x="${x - 12}" y="${y - 12}" width="24" height="24" rx="4" fill="${col}" stroke="rgba(0,0,0,.25)"/><text x="${x}" y="${y + 4}" font-size="11" font-weight="600" fill="#fff" text-anchor="middle" font-family="var(--f-ui)" pointer-events="none">${t}</text></g>`;
      });
      return s + KP.svg + label(0, -84, `${c.name} · mantén pulsada una tecla`);
    },
    elec(c, T, E){ const k = c.props.key; if (k != null && k >= 0) E.res(T('R' + (Math.floor(k / 4) + 1)), T('C' + (k % 4 + 1)), 50); },
    device: keypadDevice,
    readout: c => c.props.key >= 0 ? `Tecla ${KEYS[c.props.key]} pulsada: une la fila ${Math.floor(c.props.key / 4) + 1} con la columna ${c.props.key % 4 + 1}` : 'Ninguna tecla pulsada. Filas R1–R4 y columnas C1–C4 (librería Keypad).',
    render(c, k){ KEYS.forEach((_, i) => { const e = k.q(`[data-kp="${c.id}:${i}"]`); if (e) e.setAttribute('opacity', c.props.key === i ? 0.55 : 1); }); },
  },
  encoder: {
    label: 'Encoder rotativo KY-040', prefix: 'ENC', cat: 'Entradas',
    terms: ENC.terms, box: [-50, -48, 112, 96], props: () => ({ pos: 0, pressed: false, contact: false, latch: false, bounce: false }),
    svg(c){
      const ang = (c.props.pos || 0) * 18;
      return pcb(-46, -42, 92, 84, '#17191c', '#050506') + `<rect x="-26" y="-26" width="44" height="44" rx="3" fill="#b9bfc3"/>` +
        `<g class="ctrl" data-ctrl="btn" data-id="${c.id}"><circle cx="-4" cy="-4" r="15" fill="#d9dde0" stroke="#7d868b" stroke-width="2"/><g data-encknob="${c.id}" transform="rotate(${ang} -4 -4)"><rect x="-6" y="-19" width="4" height="12" fill="#6b7277"/></g><title>Mantén pulsado = botón SW</title></g>` +
        `<g class="ctrl" data-ctrl="tap" data-id="${c.id}" data-dir="ccw"><circle cx="-38" cy="30" r="8" fill="#2a2d31" stroke="#555"/><text x="-38" y="34" font-size="11" fill="#fff" text-anchor="middle" pointer-events="none">↺</text><title>Girar a la izquierda</title></g>` +
        `<g class="ctrl" data-ctrl="tap" data-id="${c.id}" data-dir="cw"><circle cx="30" cy="30" r="8" fill="#2a2d31" stroke="#555"/><text x="30" y="34" font-size="11" fill="#fff" text-anchor="middle" pointer-events="none">↻</text><title>Girar a la derecha</title></g>` +
        ENC.svg + label(0, -48, `${c.name} · <tspan data-encpos="${c.id}">${c.props.pos || 0}</tspan>`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('CLK'), 10000); E.res(T('VCC'), T('DT'), 10000);
      if (c._a === 0) E.res(T('CLK'), T('GND'), 1); if (c._b === 0) E.res(T('DT'), T('GND'), 1);
      if (c.props.contact) E.res(T('SW'), T('GND'), 0.1);
    },
    device: encDevice,
    readout: c => `Pasos girados: ${c.props.pos || 0} (20 por vuelta)\nCLK y DT tienen resistencias de 10 kΩ a +. SW va a GND al pulsar (usa INPUT_PULLUP).`,
    render(c, k){
      const g = k.q(`[data-encknob="${c.id}"]`); if (g) g.setAttribute('transform', `rotate(${(c.props.pos || 0) * 18} -4 -4)`);
      const t = k.q(`[data-encpos="${c.id}"]`); if (t) t.textContent = c.props.pos || 0;
      if (k.running && !k.powered('VCC', 'GND', 3)) k.warn(`${c.name}: conecta + a 5V y GND a GND (alimenta las resistencias de CLK y DT).`);
    },
  },
  irrx: {
    label: 'Receptor IR (VS1838B)', prefix: 'IRX', cat: 'Comunicación',
    terms: IRRX.terms, box: [-30, -48, 60, 94], props: () => ({}),
    svg(c){
      return pcb(-26, -30, 52, 56, '#17191c', '#050506') + `<rect x="-10" y="-30" width="20" height="18" rx="2" fill="#151515"/><path d="M-8 -30 a8 10 0 0 1 16 0" fill="#2a2a2a"/>` +
        smdLed(`data-irled="${c.id}"`, 16, 12, '#ff3b30') + IRRX.svg + label(0, -40, c.name);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 10000); const v = E.prev(T('VCC')) - E.prev(T('GND')); E.src(T('S'), T('GND'), c._ir ? 0 : (v > 2.5 ? v : 0), 100); },
    device: irRxDevice,
    readout: c => `Salida S: HIGH en reposo, LOW mientras recibe la portadora de 38 kHz.${c._last != null ? '\nÚltimo código NEC: 0x' + c._last.toString(16).toUpperCase().padStart(2, '0') : ''}\nUsa la librería IRremote (IrReceiver.begin(pin)).`,
    render(c, k){ glowAttr(k.q(`[data-irled="${c.id}"]`), !!c._ir); if (k.running && !k.powered('VCC', 'GND', 3)) k.warn(`${c.name}: sin alimentación. + a 5V y − a GND.`); },
  },
  irremote: {
    label: 'Control remoto IR', prefix: 'CTRL', cat: 'Comunicación',
    terms: {}, box: [-46, -96, 92, 196], props: () => ({}),
    svg(c){
      let s = `<rect x="-42" y="-90" width="84" height="184" rx="12" fill="#2a2c30" stroke="#111" stroke-width="2"/><circle data-irtx="${c.id}" cx="0" cy="-82" r="4" fill="#552222"/>`;
      REMOTE.forEach(([t, code], i) => {
        const x = -24 + (i % 3) * 24, y = -64 + Math.floor(i / 3) * 22, red = i < 3;
        s += `<g class="ctrl" data-ctrl="tap" data-id="${c.id}" data-code="${code}"><circle cx="${x}" cy="${y}" r="9.5" fill="${red ? '#d23a2f' : '#e9ebee'}" stroke="#111"/><text x="${x}" y="${y + 3}" font-size="${t.length > 2 ? 6 : 8}" fill="${red ? '#fff' : '#222'}" text-anchor="middle" font-family="var(--f-ui)" pointer-events="none">${t}</text></g>`;
      });
      return s + label(0, -100, `${c.name} · clic en un botón`);
    },
    elec(){},
    device: remoteDevice,
    readout: c => c._sent != null ? `Último botón: código NEC 0x${c._sent.toString(16).toUpperCase().padStart(2, '0')} (dirección 0x00)${c._hits === 0 ? '\nNingún receptor IR alimentado lo recibió.' : ''}` : 'Apunta a todos los receptores IR del circuito. Clic en un botón para enviar su código NEC.',
    render(c, k){ glowAttr(k.q(`[data-irtx="${c.id}"]`), c._sentAt && k.now - c._sentAt < 150); },
  },
};
export { KEYS, REMOTE };
