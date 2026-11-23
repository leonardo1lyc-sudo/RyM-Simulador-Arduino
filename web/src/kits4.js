// Tanda 4a: tiras y aros LED. Inteligentes (WS2812B / NeoPixel: un hilo de datos, cada LED con su color)
// y comunes (RGB de ánodo común: R, G y B se encienden juntos en todos los LED, se manejan con transistores).
import { PinState } from './emulator.js';
import { label, tiny, fmt } from './modules.js';

const COUNT_STRIP = Array.from({ length: 15 }, (_, i) => [i + 1, `${i + 1} LED`]);
const COUNT_RING = Array.from({ length: 10 }, (_, i) => [i + 1, `${i + 1} LED`]);
const PITCH = 26;
const term = (x, y, dx, dy, name) => ({ x, y, dx, dy, name });
const pad = (x, y) => `<rect x="${x - 5}" y="${y - 4}" width="10" height="8" rx="1.5" fill="#d8b04a" stroke="#8d7330"/>`;

/* ---------- WS2812B: decodificación del protocolo por tiempos ---------- */
// A 800 kHz cada bit dura 1,25 µs (20 ciclos a 16 MHz): pulso alto corto (~0,4 µs) = 0, largo (~0,8 µs) = 1.
// 24 bits por LED en orden G, R, B. Más de 50 µs en bajo reinicia: el próximo dato es otra vez el LED 1.
const T_ONE = 9;       // ciclos: por encima es un 1
const T_RESET = 50 * 16;
function wsDevice(c, api){
  let rise = 0, fall = -1e12, cur = 0, nb = 0, idx = 0, din = -1;
  const px = () => c._px || (c._px = []);
  const downstream = () => { const n = api.node('DOUT'); if (n < 0) return null; return api.others().find(d => d.c !== c && d.wsIn && api.nodeOf(d.c, 'DIN') === n) || null; };
  const dev = {
    reset(){ c._px = []; c._pxVer = (c._pxVer || 0) + 1; idx = 0; nb = 0; cur = 0; },
    wsIn: true,
    frame(){ idx = 0; const d = downstream(); if (d) d.frame(); },
    pixel(rgb){ // un LED completo: si sobra, pasa a la tira conectada en DOUT
      if (idx < c.props.n) { const p = px(); const o = p[idx]; if (!o || o[0] !== rgb[0] || o[1] !== rgb[1] || o[2] !== rgb[2]) { p[idx] = rgb; c._pxVer = (c._pxVer || 0) + 1; } idx++; }
      else { idx++; const d = downstream(); if (d) d.pixel(rgb); }
    },
    onPin(p, s, old, cyc){
      if (din < 0 || p !== din) return;
      if (s === PinState.High) { if (cyc - fall > T_RESET) { nb = 0; cur = 0; dev.frame(); } rise = cyc; }
      else if (old === PinState.High) {
        fall = cyc; cur = (cur << 1) | (cyc - rise > T_ONE ? 1 : 0);
        if (++nb === 24) { dev.pixel([(cur >> 8) & 255, (cur >> 16) & 255, cur & 255]); nb = 0; cur = 0; }
      }
    },
  };
  Object.defineProperty(dev, 'din', { get(){ return din; } });
  const refresh = () => { din = api.pin('DIN'); };
  const origReset = dev.reset; dev.reset = () => { refresh(); origReset(); }; dev.remap = refresh;
  return dev;
}
// corriente aproximada: 20 mA por canal a pleno brillo, ~1 mA en reposo por LED
const wsCurrent = c => { let i = c.props.n * 0.001; for (const p of c._px || []) if (p) i += (p[0] + p[1] + p[2]) / 255 * 0.02; return i; };
const shown = rgb => { const m = Math.max(rgb[0], rgb[1], rgb[2]); if (m < 1) return null; const k = 255 / m; return { fill: `rgb(${rgb.map(v => Math.round(v * k)).join(',')})`, op: Math.min(1, 0.35 + m / 120) }; };
function wsRender(c, k){
  const pw = k.powered('VCC', 'GND', 3.5);
  const key = (pw && k.running ? c._pxVer || 0 : -1) + ':' + c.props.n;
  if (c._wsKey !== key) {
    c._wsKey = key;
    for (let i = 0; i < c.props.n; i++) {
      const e = k.q(`[data-px="${c.id}:${i}"]`), g = k.q(`[data-pxg="${c.id}:${i}"]`); if (!e) continue;
      const s = pw && k.running && c._px && c._px[i] ? shown(c._px[i]) : null;
      e.setAttribute('fill', s ? s.fill : '#f4f1e6'); e.setAttribute('opacity', s ? s.op : 1);
      if (g) { g.setAttribute('fill', s ? s.fill : 'none'); g.setAttribute('opacity', s ? s.op * 0.8 : 0); }
    }
  }
  if (!k.running) return;
  if (!pw) k.warn(`${c.name}: sin alimentación. VCC (5V) a 5V y GND a GND.`);
  else if (!k.wired('DIN')) k.warn(`${c.name}: DIN sin conectar. Únelo a un pin digital (librería Adafruit_NeoPixel).`);
  const i = wsCurrent(c); if (i > 0.4) k.warn(`${c.name}: consume ~${Math.round(i * 1000)} mA. El USB da unos 500 mA en total: con muchos LED a pleno brillo, aliméntala con una fuente de 5 V aparte (GND común con el Arduino).`);
}
const wsReadout = c => {
  const p = c._px || []; const lit = p.filter(x => x && x[0] + x[1] + x[2] > 0).length;
  return `${c.props.n} LED WS2812B · ${lit} encendidos · ~${Math.round(wsCurrent(c) * 1000)} mA\n` +
    (p.length ? p.slice(0, c.props.n).map((x, i) => `${i}: ${x ? x.join(',') : '0,0,0'}`).join('  ') : 'Sin datos. Usa Adafruit_NeoPixel (NEO_GRB + NEO_KHZ800).');
};
const wsElec = (c, T, E) => { E.res(T('VCC'), T('GND'), 5 / Math.max(0.001, wsCurrent(c))); E.res(T('DIN'), T('GND'), 1e6); };
const ledCell = (c, i, x, y) => `<circle data-pxg="${c.id}:${i}" cx="${x}" cy="${y}" r="14" fill="none" filter="url(#glow)" opacity="0"/>` +
  `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" fill="#fbfaf5" stroke="#b7b3a5"/><circle data-px="${c.id}:${i}" cx="${x}" cy="${y}" r="5.5" fill="#f4f1e6" stroke="#d6d1c0" stroke-width=".8"/>`;

/* ---------- tira WS2812B ---------- */
const STRIP_T = { VCC: term(-36, -14, -1, 0, '5V (+)'), DIN: term(-36, 0, -1, 0, 'DIN (datos)'), GND: term(-36, 14, -1, 0, 'GND (−)') };
const stripW = n => 14 + n * PITCH;
const strip = {
  label: 'Tira LED WS2812B (NeoPixel)', prefix: 'NEO', cat: 'Salidas',
  terms: { ...STRIP_T, DOUT: term(0, 0, 1, 0, 'DOUT (salida de datos a otra tira)') },
  dynTerms(c){ return { DOUT: { ...this.terms.DOUT, x: -22 + stripW(c.props.n) + 14 } }; },
  box: c => [-40, -24, stripW(c.props.n) + 40, 48], props: () => ({ n: 8 }), iconProps: () => ({ n: 3 }),
  options: [{ prop: 'n', label: 'Cantidad de LED', values: COUNT_STRIP, num: true }],
  svg(c){
    const n = c.props.n, w = stripW(n);
    let s = `<path d="M-36 -14 H-24 M-36 0 H-24 M-36 14 H-24 M${w - 22} 0 H${w - 8}" stroke="#9aa3a6" stroke-width="3"/>`;
    s += `<rect x="-24" y="-18" width="${w}" height="36" rx="3" fill="#f5f5f2" stroke="#c9c7bd"/>`;
    s += pad(-18, -10) + pad(-18, 0) + pad(-18, 10);
    for (let i = 0; i < n; i++) s += ledCell(c, i, -1 + i * PITCH + 8, 0);
    s += tiny(-18, -20, '5V', '#555', 'middle', 6) + tiny(-30, 3, 'DI', '#555', 'end', 6) + tiny(w - 22, -6, 'DO', '#555', 'middle', 6);
    return s + label((w - 24) / 2 - 12, -26, `${c.name} · ${n} LED`);
  },
  elec: wsElec, device: wsDevice, render: wsRender, readout: wsReadout,
};

/* ---------- aro WS2812B ---------- */
const ringR = n => Math.max(26, n * 7.5);
const ring = {
  label: 'Aro LED WS2812B (NeoPixel)', prefix: 'ARO', cat: 'Salidas',
  terms: { VCC: term(-14, 0, 0, 1, '5V (+)'), DIN: term(0, 0, 0, 1, 'DIN (datos)'), GND: term(14, 0, 0, 1, 'GND (−)'), DOUT: term(28, 0, 0, 1, 'DOUT (salida de datos)') },
  dynTerms(c){ const y = ringR(c.props.n) + 30; return { VCC: { ...this.terms.VCC, y }, DIN: { ...this.terms.DIN, y }, GND: { ...this.terms.GND, y }, DOUT: { ...this.terms.DOUT, y } }; },
  box: c => { const r = ringR(c.props.n) + 14; return [-r, -r, 2 * r, 2 * r + 30]; }, props: () => ({ n: 8 }),
  options: [{ prop: 'n', label: 'Cantidad de LED', values: COUNT_RING, num: true }],
  svg(c){
    const n = c.props.n, R = ringR(c.props.n), y = R + 30;
    let s = `<circle r="${R + 12}" fill="#1b1d20" stroke="#000"/><circle r="${R - 12}" fill="var(--bg)" stroke="#000"/>`;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; s += ledCell(c, i, +(R * Math.cos(a)).toFixed(1), +(R * Math.sin(a)).toFixed(1)); }
    s += `<path d="M-14 ${R + 8} V${y} M0 ${R + 8} V${y} M14 ${R + 8} V${y} M28 ${R + 6} V${y}" stroke="#9aa3a6" stroke-width="3"/>`;
    s += tiny(-14, R + 4, '5V', '#ddd', 'middle', 5.5) + tiny(0, R + 4, 'DI', '#ddd', 'middle', 5.5) + tiny(14, R + 4, 'G', '#ddd', 'middle', 5.5) + tiny(28, R + 2, 'DO', '#ddd', 'middle', 5.5);
    return s + label(0, -R - 18, `${c.name} · ${n} LED`);
  },
  elec: wsElec, device: wsDevice, render: wsRender, readout: wsReadout,
};

/* ---------- tira y aro RGB comunes (ánodo común) ---------- */
// Cada canal: LED en serie con su resistencia. A 12 V van 3 LED por tramo; a 5 V, uno.
const COMMON_VF = { 12: { r: 6.0, g: 8.7, b: 8.7 }, 5: { r: 1.9, g: 2.9, b: 2.9 } };
function commonElec(c, T, E){
  const v = c.props.volts, segs = v === 12 ? Math.ceil(c.props.n / 3) : c.props.n, vf = COMMON_VF[v];
  for (const ch of ['r', 'g', 'b']) E.diode(`${c.id}:${ch}`, T('V'), T(ch.toUpperCase()), vf[ch], 150 / segs);
}
function commonRender(c, k){
  const v = c.props.volts, segs = v === 12 ? Math.ceil(c.props.n / 3) : c.props.n, full = 0.02 * segs;
  const lv = ['r', 'g', 'b'].map(ch => Math.min(1, (k.led(`${c.id}:${ch}`) || 0) / full));
  const m = Math.max(...lv);
  for (let i = 0; i < c.props.n; i++) {
    const e = k.q(`[data-px="${c.id}:${i}"]`), g = k.q(`[data-pxg="${c.id}:${i}"]`); if (!e) continue;
    if (m < 0.02) { e.setAttribute('fill', '#f4f1e6'); e.setAttribute('opacity', 1); if (g) g.setAttribute('opacity', 0); continue; }
    const col = `rgb(${lv.map(x => Math.round(x / m * 255)).join(',')})`;
    e.setAttribute('fill', col); e.setAttribute('opacity', (0.35 + 0.65 * m).toFixed(2)); if (g) { g.setAttribute('fill', col); g.setAttribute('opacity', (0.8 * m).toFixed(2)); }
  }
  if (!k.running) return;
  for (const ch of ['R', 'G', 'B']) {
    const p = k.drivenBy(ch); const i = k.led(`${c.id}:${ch.toLowerCase()}`) || 0;
    if (p >= 0 && i > 0.04) { k.warn(`${c.name}: el canal ${ch} va directo a un pin y pide ${Math.round(i * 1000)} mA. Usa un transistor (TIP120, 2N2222) o un MOSFET (IRLZ44N) por canal.`); break; }
  }
  if (v === 12 && k.V('V') - Math.min(k.V('R'), k.V('G'), k.V('B')) < 7 && k.wired('V')) k.warn(`${c.name}: es una tira de 12 V. Con 5 V los LED no llegan a encender: aliméntala con 12 V (batería o fuente) y GND común.`);
}
const commonReadout = c => `Tira RGB común de ${c.props.volts} V, ${c.props.n} LED. +${c.props.volts}V al positivo; cada color se prende uniendo R, G o B a GND (con un transistor o MOSFET manejado por un pin PWM).`;
const VOLTS = [{ prop: 'volts', label: 'Tensión', values: [[12, '12 V (3 LED por tramo)'], [5, '5 V']], num: true }];
const commonStrip = {
  label: 'Tira LED RGB común', prefix: 'TIRA', cat: 'Salidas',
  terms: { V: term(-36, -21, -1, 0, '+V (ánodo común)'), G: term(-36, -7, -1, 0, 'G (verde, −)'), R: term(-36, 7, -1, 0, 'R (rojo, −)'), B: term(-36, 21, -1, 0, 'B (azul, −)') },
  box: c => [-40, -28, stripW(c.props.n) + 22, 56], props: () => ({ n: 6, volts: 12 }), iconProps: () => ({ n: 3, volts: 12 }),
  options: [{ prop: 'n', label: 'Cantidad de LED', values: COUNT_STRIP, num: true }, ...VOLTS],
  svg(c){
    const n = c.props.n, w = stripW(n);
    let s = `<path d="M-36 -21 H-24 M-36 -7 H-24 M-36 7 H-24 M-36 21 H-24" stroke="#9aa3a6" stroke-width="3"/>`;
    s += `<rect x="-24" y="-24" width="${w}" height="48" rx="3" fill="#f5f5f2" stroke="#c9c7bd"/>`;
    s += pad(-18, -15) + pad(-18, -5) + pad(-18, 5) + pad(-18, 15);
    for (let i = 0; i < n; i++) { s += ledCell(c, i, -1 + i * PITCH + 8, 0); if (c.props.volts === 12 && i % 3 === 2 && i < n - 1) s += `<line x1="${11 + i * PITCH + 8}" y1="-22" x2="${11 + i * PITCH + 8}" y2="22" stroke="#c99" stroke-dasharray="2 2"/>`; }
    s += tiny(-30, -24, `+${c.props.volts}V`, '#555', 'end', 6) + tiny(-30, -4, 'G', '#555', 'end', 6) + tiny(-30, 10, 'R', '#555', 'end', 6) + tiny(-30, 24, 'B', '#555', 'end', 6);
    return s + label((w - 24) / 2 - 12, -32, `${c.name} · ${n} LED · ${c.props.volts} V`);
  },
  elec: commonElec, render: commonRender, readout: commonReadout,
};
const commonRing = {
  label: 'Aro LED RGB común', prefix: 'ARO', cat: 'Salidas',
  terms: { V: term(-21, 0, 0, 1, '+V (ánodo común)'), G: term(-7, 0, 0, 1, 'G (verde, −)'), R: term(7, 0, 0, 1, 'R (rojo, −)'), B: term(21, 0, 0, 1, 'B (azul, −)') },
  dynTerms(c){ const y = ringR(c.props.n) + 30, o = {}; for (const t of ['V', 'G', 'R', 'B']) o[t] = { ...this.terms[t], y }; return o; },
  box: c => { const r = ringR(c.props.n) + 14; return [-r, -r, 2 * r, 2 * r + 30]; }, props: () => ({ n: 8, volts: 5 }),
  options: [{ prop: 'n', label: 'Cantidad de LED', values: COUNT_RING, num: true }, ...VOLTS],
  svg(c){
    const n = c.props.n, R = ringR(n), y = R + 30;
    let s = `<circle r="${R + 12}" fill="#1b1d20" stroke="#000"/><circle r="${R - 12}" fill="var(--bg)" stroke="#000"/>`;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; s += ledCell(c, i, +(R * Math.cos(a)).toFixed(1), +(R * Math.sin(a)).toFixed(1)); }
    s += `<path d="M-21 ${R + 8} V${y} M-7 ${R + 8} V${y} M7 ${R + 8} V${y} M21 ${R + 8} V${y}" stroke="#9aa3a6" stroke-width="3"/>`;
    s += tiny(-21, R + 4, '+', '#ddd', 'middle', 6) + tiny(-7, R + 4, 'G', '#ddd', 'middle', 6) + tiny(7, R + 4, 'R', '#ddd', 'middle', 6) + tiny(21, R + 4, 'B', '#ddd', 'middle', 6);
    return s + label(0, -R - 18, `${c.name} · ${n} LED · ${c.props.volts} V`);
  },
  elec: commonElec, render: commonRender, readout: commonReadout,
};

export const KITS4 = { neostrip: strip, neoring: ring, rgbstrip: commonStrip, rgbring: commonRing };
export { fmt };
