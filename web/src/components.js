// Definición de componentes: terminales, aspecto (SVG) y modelo eléctrico.
import { MODULES } from './modules.js';
export const LED_COLORS = {
  rojo:    { c: '#ff3b30', off: '#8a2a24', vf: 1.8 },
  naranja: { c: '#ff8a1f', off: '#8a4a1a', vf: 1.9 },
  amarillo:{ c: '#ffd21f', off: '#8a7420', vf: 2.0 },
  verde:   { c: '#34e86b', off: '#226b3a', vf: 2.1 },
  azul:    { c: '#3d8bff', off: '#23457e', vf: 3.0 },
  blanco:  { c: '#ffffff', off: '#9aa3a6', vf: 3.0 },
};
export const RES_VALUES = [100, 150, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000];
const BAND = ['#000000', '#7b4a12', '#d0261f', '#f07b16', '#f2d22b', '#2f9e44', '#1f63d6', '#7f3fbf', '#8c8c8c', '#ffffff'];
export const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');
export const fmtOhm = R => R >= 1e6 ? fmt(R / 1e6, R % 1e6 ? 1 : 0) + ' MΩ' : R >= 1000 ? (R % 1000 ? fmt(R / 1000, 1) : R / 1000) + ' kΩ' : Math.round(R) + ' Ω';
// Fotorresistencia GL5528: ~10 kΩ a 10 lux, gamma 0,7, ~1 MΩ a oscuras
export const ldrOhms = lux => Math.min(1e6, Math.max(80, 10000 * Math.pow(Math.max(lux, 0.01) / 10, -0.7)));

function resBands(R){
  const e = Math.floor(Math.log10(R)) - 1; const d1 = Math.floor(R / 10 ** (e + 1)) % 10, d2 = Math.floor(R / 10 ** e) % 10;
  return [BAND[d1], BAND[d2], e >= 0 ? BAND[e] : '#c9a227'];
}
const leg = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa3a6" stroke-width="3" stroke-linecap="round"/>`;
const label = (x, y, t, anchor = 'middle') => `<text class="clabel" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
const dir = (dx, dy) => ({ dx, dy });

const LCD_PINS = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
const LCD_PIN_NAMES = { VSS: 'VSS (GND)', VDD: 'VDD (5 V)', V0: 'V0 (contraste)', RS: 'RS (registro)', RW: 'RW (lectura/escritura)', E: 'E (habilitación)', A: 'A (luz +)', K: 'K (luz −)' };
function lcdBody(c, extra = ''){
  let s = `<rect x="-150" y="-80" width="300" height="140" rx="6" fill="#1f6b3a" stroke="#14462a"/>`;
  for (const [x, y] of [[-140, -70], [140, -70], [-140, 50], [140, 50]]) s += `<circle cx="${x}" cy="${y}" r="5" fill="var(--bg)" stroke="#c9b26b" stroke-width="1.5"/>`;
  s += `<rect x="-128" y="-48" width="256" height="92" rx="4" fill="#111"/>`;
  s += `<g data-lcd="${c.id}"><rect data-lcdbg="${c.id}" x="-120" y="-38" width="240" height="72" rx="2" fill="#2f3a12"/><g data-lcdtxt="${c.id}"></g></g>`;
  return s + extra;
}

export const TYPES = {
  led: {
    label: 'LED', prefix: 'LED', cat: 'Salidas',
    terms: { a: { x: -10, y: 40, ...dir(0, 1), name: 'ánodo (+)' }, k: { x: 10, y: 40, ...dir(0, 1), name: 'cátodo (−)' } },
    box: [-20, -26, 40, 70], props: () => ({ color: 'rojo' }),
    svg(c){
      const col = LED_COLORS[c.props.color];
      return leg(-10, 10, -10, 40) + leg(10, 10, 10, 40) +
        `<circle data-glow="${c.id}" cx="0" cy="-6" r="30" fill="${col.c}" filter="url(#glow)" opacity="0"/>` +
        `<path d="M-15 12 V-6 A15 15 0 0 1 15 -6 V12 Z" fill="${col.off}" stroke="rgba(0,0,0,.35)"/>` +
        `<path data-lit="${c.id}" d="M-15 12 V-6 A15 15 0 0 1 15 -6 V12 Z" fill="${col.c}" opacity="0"/>` +
        `<path d="M-18 10 H14 V16 H-18 Z" fill="${col.off}" stroke="rgba(0,0,0,.35)"/><path d="M-9 -12 A9 9 0 0 1 -2 -18" stroke="rgba(255,255,255,.6)" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
        `<text x="-17" y="34" font-size="11" font-family="var(--f-code)" fill="var(--muted)">+</text>` + label(20, -14, c.name, 'start');
    },
    elec(c, T, E){ E.diode(c.id, T('a'), T('k'), LED_COLORS[c.props.color].vf, 15); },
  },
  rgb: {
    label: 'LED RGB', prefix: 'RGB', cat: 'Salidas',
    terms: { r: { x: -21, y: 44, ...dir(0, 1), name: 'rojo' }, k: { x: -7, y: 44, ...dir(0, 1), name: 'cátodo común (−)' }, g: { x: 7, y: 44, ...dir(0, 1), name: 'verde' }, b: { x: 21, y: 44, ...dir(0, 1), name: 'azul' } },
    box: [-24, -28, 48, 76], props: () => ({}),
    svg(c){
      return leg(-21, 12, -21, 44) + leg(-7, 12, -7, 44) + leg(7, 12, 7, 44) + leg(21, 12, 21, 44) +
        `<circle data-glow="${c.id}" cx="0" cy="-6" r="32" fill="#fff" filter="url(#glow)" opacity="0"/>` +
        `<path d="M-17 12 V-6 A17 17 0 0 1 17 -6 V12 Z" fill="#dfe3e6" stroke="rgba(0,0,0,.3)"/>` +
        `<path data-lit="${c.id}" d="M-17 12 V-6 A17 17 0 0 1 17 -6 V12 Z" fill="#fff" opacity="0"/>` +
        `<path d="M-20 10 H20 V16 H-20 Z" fill="#cfd4d7" stroke="rgba(0,0,0,.3)"/>` +
        `<text x="-21" y="58" font-size="8" fill="var(--muted)" text-anchor="middle" font-family="var(--f-code)">R</text><text x="-7" y="58" font-size="8" fill="var(--muted)" text-anchor="middle" font-family="var(--f-code)">−</text><text x="7" y="58" font-size="8" fill="var(--muted)" text-anchor="middle" font-family="var(--f-code)">G</text><text x="21" y="58" font-size="8" fill="var(--muted)" text-anchor="middle" font-family="var(--f-code)">B</text>` +
        label(24, -18, c.name, 'start');
    },
    elec(c, T, E){ E.diode(c.id + ':r', T('r'), T('k'), 1.9, 20); E.diode(c.id + ':g', T('g'), T('k'), 2.9, 20); E.diode(c.id + ':b', T('b'), T('k'), 3.0, 20); },
  },
  res: {
    label: 'Resistencia', prefix: 'R', cat: 'Pasivos',
    terms: { a: { x: -48, y: 0, ...dir(-1, 0), name: 'pata 1' }, b: { x: 48, y: 0, ...dir(1, 0), name: 'pata 2' } },
    box: [-50, -12, 100, 24], props: () => ({ ohms: 220 }),
    svg(c){
      const [b1, b2, b3] = resBands(c.props.ohms);
      return leg(-48, 0, 48, 0) +
        `<path d="M-28 -8 Q-28 -10 -24 -10 H-14 Q-11 -7 -8 -7 H8 Q11 -7 14 -10 H24 Q28 -10 28 -8 V8 Q28 10 24 10 H14 Q11 7 8 7 H-8 Q-11 7 -14 10 H-24 Q-28 10 -28 8 Z" fill="#d8bf8a" stroke="rgba(0,0,0,.3)"/>` +
        `<rect x="-21" y="-10" width="4" height="20" fill="${b1}"/><rect x="-12" y="-7" width="4" height="14" fill="${b2}"/><rect x="-3" y="-7" width="4" height="14" fill="${b3}"/><rect x="17" y="-10" width="4" height="20" fill="#c9a227"/>` +
        label(0, -16, `${c.name} · ${fmtOhm(c.props.ohms)}`);
    },
    elec(c, T, E){ E.res(T('a'), T('b'), c.props.ohms); },
  },
  btn: {
    label: 'Pulsador', prefix: 'BTN', cat: 'Entradas',
    terms: { a: { x: -36, y: 0, ...dir(-1, 0), name: 'pata 1' }, b: { x: 36, y: 0, ...dir(1, 0), name: 'pata 2' } },
    box: [-38, -26, 76, 52], props: () => ({ pressed: false, latch: false, bounce: true }),
    svg(c){
      let s = leg(-36, 0, -22, 0) + leg(22, 0, 36, 0) + `<rect x="-22" y="-22" width="44" height="44" rx="4" fill="#2b2f33" stroke="#15171a"/>`;
      for (const [dx, dy] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) s += `<circle cx="${dx}" cy="${dy}" r="2.5" fill="#55595e"/>`;
      return s + `<circle class="ctrl" data-ctrl="btn" data-id="${c.id}" data-cap="${c.id}" cx="0" cy="0" r="13" fill="#3c4146" stroke="#101214" stroke-width="2"/>` + label(0, -30, c.name + (c.props.latch ? ' · fijo' : ''));
    },
    elec(c, T, E){ if (c.props.contact) E.res(T('a'), T('b'), 0.05); },
  },
  sw: {
    label: 'Interruptor', prefix: 'SW', cat: 'Entradas',
    terms: { a: { x: -20, y: 30, ...dir(0, 1), name: 'extremo 1' }, c: { x: 0, y: 30, ...dir(0, 1), name: 'común' }, b: { x: 20, y: 30, ...dir(0, 1), name: 'extremo 2' } },
    box: [-30, -22, 60, 54], props: () => ({ pos: 0 }),
    svg(c){
      return leg(-20, 12, -20, 30) + leg(0, 12, 0, 30) + leg(20, 12, 20, 30) +
        `<rect x="-30" y="-14" width="60" height="28" rx="3" fill="#2d3135" stroke="#15171a"/><rect x="-22" y="-7" width="44" height="14" rx="2" fill="#15171a"/>` +
        `<rect class="ctrl" data-ctrl="sw" data-id="${c.id}" data-lever="${c.id}" x="${c.props.pos ? 2 : -20}" y="-12" width="18" height="24" rx="3" fill="#c9ced1" stroke="#6d7479"/>` + label(0, -20, c.name);
    },
    elec(c, T, E){ E.res(T('c'), T(c.props.pos ? 'b' : 'a'), 0.05); },
  },
  pot: {
    label: 'Potenciómetro', prefix: 'POT', cat: 'Entradas',
    terms: { p1: { x: -20, y: 48, ...dir(0, 1), name: 'extremo 1' }, w: { x: 0, y: 48, ...dir(0, 1), name: 'cursor' }, p3: { x: 20, y: 48, ...dir(0, 1), name: 'extremo 3' } },
    box: [-30, -30, 60, 82], props: () => ({ ohms: 10000, pos: 0.5 }),
    svg(c){
      let s = leg(-20, 24, -20, 48) + leg(0, 24, 0, 48) + leg(20, 24, 20, 48) + `<rect x="-28" y="-28" width="56" height="54" rx="5" fill="#2459a8" stroke="#163a70"/>`;
      s += `<g class="ctrl" data-ctrl="pot" data-id="${c.id}"><circle cx="0" cy="-2" r="19" fill="#d7dadc" stroke="#8c9296" stroke-width="2"/><g data-knob="${c.id}"><line x1="0" y1="-2" x2="0" y2="-18" stroke="#2a2d30" stroke-width="4" stroke-linecap="round"/></g></g>`;
      for (const [x, t] of [[-20, '1'], [0, '2'], [20, '3']]) s += `<text x="${x}" y="38" font-size="8" fill="#cfe0ff" text-anchor="middle" font-family="var(--f-code)">${t}</text>`;
      return s + label(0, -36, `${c.name} · ${fmtOhm(c.props.ohms)}`);
    },
    elec(c, T, E){ const R = c.props.ohms, p = c.props.pos; E.res(T('p1'), T('w'), Math.max(0.5, (1 - p) * R)); E.res(T('w'), T('p3'), Math.max(0.5, p * R)); },
  },
  ldr: {
    label: 'Fotorresistencia', prefix: 'LDR', cat: 'Entradas',
    terms: { a: { x: -36, y: 0, ...dir(-1, 0), name: 'pata 1' }, b: { x: 36, y: 0, ...dir(1, 0), name: 'pata 2' } },
    box: [-38, -24, 76, 48], props: () => ({ lux: 300 }),
    svg(c){
      return leg(-36, 0, -14, 0) + leg(14, 0, 36, 0) +
        `<circle cx="0" cy="0" r="16" fill="#e9dcc0" stroke="#8a7b5a"/><path d="M-9 -9 H6 V-4 H-6 V1 H6 V6 H-6 V10" fill="none" stroke="#c0552c" stroke-width="2.2"/>` +
        `<circle cx="0" cy="0" r="16" fill="none" stroke="rgba(0,0,0,.2)"/>` + label(0, -22, `${c.name} · ${Math.round(c.props.lux)} lx`);
    },
    elec(c, T, E){ E.res(T('a'), T('b'), ldrOhms(c.props.lux)); },
  },
  buzzer: {
    label: 'Zumbador', prefix: 'BZ', cat: 'Salidas',
    terms: { p: { x: -10, y: 38, ...dir(0, 1), name: '+' }, n: { x: 10, y: 38, ...dir(0, 1), name: '−' } },
    box: [-26, -26, 52, 66], props: () => ({}),
    svg(c){
      return leg(-10, 18, -10, 38) + leg(10, 18, 10, 38) +
        `<g data-waves="${c.id}" opacity="0" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M26 -14 A20 20 0 0 1 26 10"/><path d="M32 -20 A28 28 0 0 1 32 16"/></g>` +
        `<circle cx="0" cy="-2" r="22" fill="#1b1c1e" stroke="#000"/><circle cx="0" cy="-2" r="4" fill="#3a3c40"/><text x="-14" y="-14" font-size="10" fill="#9aa3a6" font-family="var(--f-code)">+</text>` +
        label(0, -30, c.name);
    },
    elec(c, T, E){ E.res(T('p'), T('n'), 1000); },
  },
  servo: {
    label: 'Servo', prefix: 'SERVO', cat: 'Salidas',
    terms: { gnd: { x: -72, y: -14, ...dir(-1, 0), name: 'GND (marrón)' }, vcc: { x: -72, y: 0, ...dir(-1, 0), name: 'V+ (rojo)' }, sig: { x: -72, y: 14, ...dir(-1, 0), name: 'señal (naranja)' } },
    box: [-74, -36, 134, 72], props: () => ({}),
    svg(c){
      return `<path d="M-72 -14 H-56" stroke="#6b3e1f" stroke-width="3"/><path d="M-72 0 H-56" stroke="#d32f2f" stroke-width="3"/><path d="M-72 14 H-56" stroke="#f28c28" stroke-width="3"/>` +
        `<rect x="-56" y="-20" width="12" height="40" rx="2" fill="#222"/>` +
        `<rect x="-44" y="-24" width="96" height="48" rx="4" fill="#1d3f8f" stroke="#122a60"/><rect x="-54" y="-8" width="10" height="16" fill="#1d3f8f"/><rect x="52" y="-8" width="10" height="16" fill="#1d3f8f"/>` +
        `<circle cx="22" cy="0" r="14" fill="#f0f0f0" stroke="#bbb"/>` +
        `<g data-horn="${c.id}" transform="rotate(0 22 0)"><path d="M17 0 L22 -34 Q22 -38 26 -34 L27 0 Z" fill="#fafafa" stroke="#b9b9b9"/><circle cx="22" cy="0" r="6" fill="#ddd" stroke="#aaa"/><circle cx="22" cy="-28" r="1.5" fill="#999"/></g>` +
        `<text x="-34" y="30" class="clabel" text-anchor="start">${c.name} · SG90</text><text data-angle="${c.id}" x="50" y="30" class="clabel" text-anchor="end">90°</text>`;
    },
    elec(c, T, E){ E.res(T('vcc'), T('gnd'), 1000); },
  },
  lcd: {
    label: 'LCD 16×2', prefix: 'LCD', cat: 'Pantallas',
    terms: Object.fromEntries(LCD_PINS.map((p, i) => [p, { x: -112 + i * 15, y: -96, ...dir(0, -1), name: LCD_PIN_NAMES[p] || p }])),
    box: [-152, -100, 304, 162], props: () => ({}),
    svg(c){
      let s = lcdBody(c);
      LCD_PINS.forEach((p, i) => { const x = -112 + i * 15; s += `<line x1="${x}" y1="-96" x2="${x}" y2="-80" stroke="#b9a35a" stroke-width="3"/><text x="${x}" y="-66" font-size="6.5" fill="#e4f2e8" text-anchor="middle" font-family="var(--f-code)">${p}</text>`; });
      return s + label(0, 74, `${c.name} · HD44780`);
    },
    elec(c, T, E){ E.res(T('VDD'), T('VSS'), 5000); E.res(T('V0'), T('VSS'), 1e7); E.diode(c.id + ':bl', T('A'), T('K'), 2.9, 115); },
  },
  lcdi2c: {
    label: 'LCD 16×2 I2C', prefix: 'LCD', cat: 'Pantallas',
    terms: { GND: { x: -176, y: -21, ...dir(-1, 0), name: 'GND' }, VCC: { x: -176, y: -7, ...dir(-1, 0), name: 'VCC (5 V)' }, SDA: { x: -176, y: 7, ...dir(-1, 0), name: 'SDA (A4; 20 en el Mega)' }, SCL: { x: -176, y: 21, ...dir(-1, 0), name: 'SCL (A5; 21 en el Mega)' } },
    box: [-178, -82, 330, 146], props: () => ({ address: 0x27 }),
    svg(c){
      let s = lcdBody(c, `<rect x="-168" y="-32" width="22" height="64" rx="2" fill="#1d1d1d"/>`);
      ['GND', 'VCC', 'SDA', 'SCL'].forEach((p, i) => { const y = -21 + i * 14; s += `<line x1="-176" y1="${y}" x2="-160" y2="${y}" stroke="#b9a35a" stroke-width="3"/><text x="-150" y="${y + 2.5}" font-size="7" fill="#e4f2e8" font-family="var(--f-code)">${p}</text>`; });
      return s + label(0, 74, `${c.name} · I2C 0x${c.props.address.toString(16).toUpperCase()}`);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 5000); E.res(T('SDA'), T('VCC'), 10000); E.res(T('SCL'), T('VCC'), 10000); },
  },
  ...MODULES,
};

export const LIBRARY = [
  { cat: 'Salidas', items: ['led', 'rgb', 'buzzer', 'servo', 'relay', 'motor', 'l298n'] },
  { cat: 'Entradas', items: ['btn', 'sw', 'pot', 'joy'] },
  { cat: 'Sensores', items: ['sr04', 'dht', 'pir', 'ldr', 'flame', 'gas'] },
  { cat: 'Pantallas', items: ['lcd', 'lcdi2c', 'oled', 'max7219', { soon: true, name: 'Display 7 seg.' }] },
  { cat: 'Comunicación', items: ['hc05'] },
  { cat: 'Pasivos y energía', items: ['res', 'battery', { soon: true, name: 'Condensador' }] },
];

export function icon(type){
  const t = TYPES[type]; const [x, y, w, h] = t.box;
  const c = { id: 'i', type, name: '', props: t.props() };
  if (type === 'led') c.props.color = 'rojo';
  let inner = t.svg(c).replace(/<text[^>]*class="clabel"[^>]*>.*?<\/text>/g, '').replace(/ data-[a-z]+="[^"]*"/g, '');
  if (type === 'rgb') inner = inner.replace('fill="#dfe3e6"', 'fill="#d9b8ff"');
  return `<svg viewBox="${x - 4} ${y - 4} ${w + 8} ${h + 8}" aria-hidden="true">${inner}</svg>`;
}
