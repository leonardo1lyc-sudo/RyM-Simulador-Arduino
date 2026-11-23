// Módulos de la tanda 3a: kit de 37 sensores (KY-0xx), sensores de humedad de suelo, lluvia y nivel de agua,
// semáforo, láser, zumbadores en placa y relés de 1 a 8 canales.
import { header, pcb, hole, smdLed, glowAttr, tiny, label, fmt, US } from './modules.js';

const BLACK = ['#17191c', '#050506'], RED = ['#b8262b', '#7d171b'], BLUE = ['#1e5fa8', '#143f70'];
const SPK = { S: 'S (señal)', VCC: '+ (5 V)', GND: '− (GND)' };
const TXT = { VCC: '+', GND: '−' };
const ky3 = (names = ['S', 'VCC', 'GND'], labels = SPK, texts = TXT) => header(names, { x0: -14, y0: 26, labels, texts });
const vccOf = E => (T => { const v = E.prev(T('VCC')) - E.prev(T('GND')); return v > 2.5 ? v : 0; });
const noPower = (c, k, vcc = 'VCC', gnd = 'GND') => { if (k.running && !k.powered(vcc, gnd, 3)) k.warn(`${c.name}: sin alimentación. Conecta + a 5V y − a GND.`); };
const pinName = p => p < 0 ? '' : 'D' + p;

/* ---------- placa negra de 3 pines (KY) ---------- */
function ky3Type(o){
  const H = o.header || ky3();
  return {
    label: o.label, prefix: o.prefix, cat: o.cat || 'Sensores',
    terms: H.terms, box: [-30, -44 - (o.top || 0), 60, 90 + (o.top || 0)], props: o.props || (() => ({})),
    controls: o.controls, checks: o.checks, options: o.options, device: o.device, passive: o.passive, sound: o.sound,
    svg(c){
      return pcb(-26, -30, 52, 56, ...(o.board || BLACK)) + hole(-18, -22) + o.draw(c) + (o.led ? smdLed(`data-kled="${c.id}"`, 18, 14, o.led) : '') +
        tiny(-12, 20, o.code || '', '#c9d1d6', 'start', 5.5) + H.svg + label(0, -36 - (o.top || 0), o.title ? o.title(c) : c.name);
    },
    elec: o.elec, readout: o.readout,
    render(c, k){ if (o.led) glowAttr(k.q(`[data-kled="${c.id}"]`), o.ledOn ? o.ledOn(c, k) : false); if (o.render) o.render(c, k); if (!o.noPowerCheck) noPower(c, k); },
  };
}

/* ---------- placa con comparador LM393 (4 pines: analógica + digital) ---------- */
function cmpType(o){
  const pins = o.pins || ['AO', 'GND', 'VCC', 'DO'];
  const H = header(pins, { x0: -21, y0: 30, labels: { AO: 'AO (analógica)', GND: 'GND (−)', VCC: 'VCC (+5 V)', DO: 'DO (digital)' }, texts: { AO: 'A0', DO: 'D0', VCC: '+', GND: 'G' } });
  const active = c => o.active(c);
  const doHigh = c => o.activeLow ? !active(c) : active(c);
  return {
    label: o.label, prefix: o.prefix, cat: o.cat || 'Sensores',
    terms: H.terms, box: [-32, -36 - o.top, 64, 84 + o.top], props: o.props, controls: o.controls, options: o.options, device: o.device,
    svg(c){
      const [f, e] = o.board || RED;
      return pcb(-30, -30, 60, 60, f, e) + o.draw(c) + `<rect x="-24" y="-2" width="14" height="14" fill="#2f6fd0" stroke="#bcd"/><circle cx="-17" cy="5" r="3.5" fill="#f0c84b"/>` +
        `<rect x="-4" y="0" width="14" height="10" rx="1" fill="#1b1b1b"/>` + tiny(3, 7, '393', '#9aa', 'middle', 4.5) +
        smdLed(`data-pwr="${c.id}"`, 20, 2, '#ff3b30') + smdLed(`data-do="${c.id}"`, 20, 12, '#34e86b') + tiny(20, 22, 'D0', '#e8eef2', 'middle', 5) +
        H.svg + label(0, -42 - o.top, `${c.name}${o.title ? ' · <tspan data-tt="' + c.id + '">' + o.title(c) + '</tspan>' : ''}`);
    },
    elec(c, T, E){
      E.res(T('VCC'), T('GND'), o.load || 3000);
      const vcc = vccOf(E)(T);
      E.src(T('AO'), T('GND'), vcc * Math.max(0, Math.min(1, o.ao(c))), 1000);
      E.src(T('DO'), T('GND'), doHigh(c) ? vcc : 0, 100);
    },
    readout(c, V){
      return `AO: ${fmt(V('AO'), 2)} V (≈ ${Math.round(V('AO') / 5 * 1023)}${o.aoNote ? '; ' + o.aoNote : ''})\nDO: ${doHigh(c) ? 'HIGH' : 'LOW'} (${active(c) ? o.activeText : o.idleText})` + (o.note ? '\n' + o.note : '');
    },
    render(c, k){
      const pw = k.powered('VCC', 'GND', 3);
      glowAttr(k.q(`[data-pwr="${c.id}"]`), pw); glowAttr(k.q(`[data-do="${c.id}"]`), pw && active(c));
      const t = k.q(`[data-tt="${c.id}"]`); if (t && o.title) t.textContent = o.title(c);
      if (o.render) o.render(c, k);
      if (k.running && !pw) k.warn(`${c.name}: sin alimentación. Conecta VCC a 5V y GND a GND.`);
    },
  };
}

/* ---------- sensores digitales ---------- */
const switchElec = (on, pullR = 10000) => (c, T, E) => { E.res(T('VCC'), T('S'), pullR); if (on(c)) E.res(T('S'), T('GND'), 0.1); };
const pressProps = latch => () => ({ pressed: false, contact: false, latch, bounce: false });

function knockDevice(c, api){
  return {
    reset(){ c._hit = 0; },
    tap(){
      if (!api.running()) return;
      const end = api.now() + c.props.ms * 1000 * US; c._hit = end; api.drive();
      api.schedule(end, () => { if (c._hit === end) { c._hit = 0; api.drive(); } });
    },
  };
}
function clapDevice(c, api){
  return {
    reset(){ c._clap = 0; },
    tap(){
      if (!api.running()) return;
      const end = api.now() + 0.12 * 16e6; c._clap = end; api.drive();
      api.schedule(end, () => { if (c._clap === end) { c._clap = 0; api.drive(); } });
    },
  };
}

const magnet = (c, x, y) => `<g data-mag="${c.id}" opacity="${c.props.magnet ? 1 : 0.25}"><rect x="${x}" y="${y}" width="10" height="20" fill="#d23a2f"/><rect x="${x}" y="${y + 10}" width="10" height="10" fill="#2f6bd2"/><text x="${x + 5}" y="${y + 8}" font-size="6" fill="#fff" text-anchor="middle">N</text></g>`;

export const KITS = {
  kybtn: ky3Type({
    label: 'Botón KY-004', prefix: 'KB', code: 'KY-004', props: pressProps(false),
    draw: c => `<g class="ctrl" data-ctrl="btn" data-id="${c.id}"><rect x="-12" y="-18" width="24" height="24" rx="2" fill="#2b2e33"/><circle data-cap="${c.id}" cx="0" cy="-6" r="${c.props.pressed ? 6.5 : 8}" fill="#111"/><title>Mantén pulsado</title></g>`,
    elec: switchElec(c => c.props.contact),
    readout: c => c.props.pressed ? 'Pulsado: S en LOW' : 'Suelto: S en HIGH (resistencia de 10 kΩ en el módulo)',
    render(c, k){ const cap = k.q(`[data-cap="${c.id}"]`); if (cap) cap.setAttribute('r', c.props.pressed ? 6.5 : 8); },
  }),
  tilt: ky3Type({
    label: 'Inclinación KY-020', prefix: 'TILT', code: 'KY-020', props: pressProps(true),
    draw: c => `<g class="ctrl" data-ctrl="btn" data-id="${c.id}"><g data-tiltg="${c.id}" transform="rotate(${c.props.pressed ? 35 : 0} 0 -6)"><rect x="-6" y="-24" width="12" height="22" rx="3" fill="#2f6bd2"/><rect x="-6" y="-24" width="12" height="6" fill="#c0392b"/></g><title>Clic para inclinar / enderezar</title></g>`,
    elec: switchElec(c => c.props.contact),
    title: c => `${c.name} · clic = inclinar`,
    readout: c => c.props.pressed ? 'Inclinado: la bolita cierra el contacto, S en LOW' : 'Derecho: S en HIGH',
    render(c, k){ const g = k.q(`[data-tiltg="${c.id}"]`); if (g) g.setAttribute('transform', `rotate(${c.props.pressed ? 35 : 0} 0 -6)`); },
  }),
  reed: ky3Type({
    label: 'Reed (imán) KY-021', prefix: 'REED', code: 'KY-021', top: 4, props: () => ({ magnet: false }),
    checks: [{ prop: 'magnet', label: 'Acercar un imán' }],
    draw: c => `<rect x="-16" y="-12" width="30" height="6" rx="3" fill="#cfe6f2" opacity=".8" stroke="#9cc"/><line x1="-22" y1="-9" x2="20" y2="-9" stroke="#c8b46a"/>` + magnet(c, -5, -40),
    elec: switchElec(c => c.props.magnet), led: '#ff3b30', ledOn: c => c.props.magnet,
    readout: c => c.props.magnet ? 'Imán cerca: el contacto se cierra, S en LOW' : 'Sin imán: S en HIGH',
    render(c, k){ const m = k.q(`[data-mag="${c.id}"]`); if (m) m.setAttribute('opacity', c.props.magnet ? 1 : 0.25); },
  }),
  hall: ky3Type({
    label: 'Hall magnético KY-003', prefix: 'HALL', code: 'KY-003', top: 4, props: () => ({ magnet: false }),
    checks: [{ prop: 'magnet', label: 'Acercar un imán' }],
    draw: c => `<rect x="-6" y="-16" width="12" height="9" rx="1" fill="#222"/><path d="M-4 -7 V0 M0 -7 V0 M4 -7 V0" stroke="#bbb"/>` + magnet(c, -5, -40),
    elec(c, T, E){ E.res(T('VCC'), T('S'), 10000); if (c.props.magnet && vccOf(E)(T)) E.res(T('S'), T('GND'), 20); }, led: '#ff3b30', ledOn: (c, k) => c.props.magnet && k.powered('VCC', 'GND', 3),
    readout: c => c.props.magnet ? 'Campo magnético detectado: S en LOW (A3144, colector abierto)' : 'Sin campo: S en HIGH',
    render(c, k){ const m = k.q(`[data-mag="${c.id}"]`); if (m) m.setAttribute('opacity', c.props.magnet ? 1 : 0.25); },
  }),
  knock: ky3Type({
    label: 'Golpe / vibración KY-031', prefix: 'KNK', code: 'KY-031', props: () => ({ ms: 40 }),
    controls: [{ prop: 'ms', label: 'Duración del golpe', min: 5, max: 300, step: 5, unit: 'ms' }],
    draw: c => `<g class="ctrl" data-ctrl="tap" data-id="${c.id}"><rect x="-8" y="-26" width="16" height="26" rx="3" fill="#1f1f22" stroke="#444"/><path data-wave="${c.id}" d="M-16 -22 q-4 8 0 16 M16 -22 q4 8 0 16" stroke="#ffb347" fill="none" stroke-width="2" opacity="0"/><title>Clic = golpe</title></g>`,
    elec: switchElec(c => !!c._hit), device: knockDevice, title: c => `${c.name} · clic = golpe`,
    readout: c => c._hit ? 'Golpe: S en LOW' : 'En reposo: S en HIGH. Clic en el sensor para golpearlo.',
    render(c, k){ glowAttr(k.q(`[data-wave="${c.id}"]`), !!c._hit); },
  }),
  touch: {
    label: 'Táctil TTP223', prefix: 'TCH', cat: 'Sensores',
    terms: header(['SIG', 'VCC', 'GND'], { x0: -14, y0: 30, labels: { SIG: 'SIG (salida)', VCC: 'VCC (+)', GND: 'GND' } }).terms,
    box: [-30, -40, 60, 88], props: () => ({ pressed: false, contact: false, latch: false, bounce: false, toggle: false }),
    checks: [{ prop: 'toggle', label: 'Modo interruptor (puente A soldado: cada toque cambia)' }],
    svg(c){
      const H = header(['SIG', 'VCC', 'GND'], { x0: -14, y0: 30, labels: {} });
      return pcb(-26, -32, 52, 62, ...BLUE) + `<g class="ctrl" data-ctrl="btn" data-id="${c.id}"><circle cx="0" cy="-6" r="18" fill="#d9e2ea" stroke="#8aa"/>` +
        [6, 10, 14].map(r => `<circle cx="0" cy="-6" r="${r}" fill="none" stroke="#8fb0c8"/>`).join('') + `<circle data-tch="${c.id}" cx="0" cy="-6" r="18" fill="#ffb347" opacity="0"/><title>Mantén pulsado para tocar</title></g>` +
        smdLed(`data-kled="${c.id}"`, 18, 20, '#ff3b30') + H.svg + label(0, -38, c.name);
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 20000); const v = vccOf(E)(T); E.src(T('SIG'), T('GND'), c._out ? v : 0, 100); },
    device: (c, api) => ({ reset(){ c._out = 0; c._last = false; }, update(){ const p = !!c.props.contact; if (p === c._last) return false; c._last = p; const o = c.props.toggle ? (p ? !c._out : c._out) : p; if (!!o !== !!c._out) { c._out = o ? 1 : 0; return true; } return false; } }),
    readout: c => `SIG: ${c._out ? 'HIGH (tocado)' : 'LOW'}${c.props.toggle ? '\nModo interruptor: cada toque invierte la salida.' : ''}`,
    render(c, k){ glowAttr(k.q(`[data-tch="${c.id}"]`), c.props.pressed); glowAttr(k.q(`[data-kled="${c.id}"]`), !!c._out); const e = k.q(`[data-tch="${c.id}"]`); if (e) e.setAttribute('opacity', c.props.pressed ? 0.35 : 0); noPower(c, k); },
  },
  irobst: {
    label: 'Obstáculo IR (FC-51)', prefix: 'IR', cat: 'Sensores',
    terms: header(['OUT', 'GND', 'VCC'], { x0: -14, y0: 30, labels: { OUT: 'OUT (LOW = obstáculo)', GND: 'GND', VCC: 'VCC (5 V)' } }).terms,
    box: [-30, -66, 60, 114], props: () => ({ cm: 20, threshold: 10 }),
    controls: [{ prop: 'cm', label: 'Distancia al obstáculo', min: 1, max: 40, step: 0.5, unit: 'cm' }, { prop: 'threshold', label: 'Alcance (potenciómetro)', min: 2, max: 30, step: 0.5, unit: 'cm' }],
    svg(c){
      const H = header(['OUT', 'GND', 'VCC'], { x0: -14, y0: 30, labels: {} });
      return pcb(-20, -40, 40, 70, ...BLACK) + `<circle cx="-8" cy="-48" r="6" fill="#dfe6ef" stroke="#999"/><circle cx="8" cy="-48" r="6" fill="#1b1b1b" stroke="#555"/><path d="M-8 -40 V-34 M8 -40 V-34" stroke="#aaa"/>` +
        `<rect x="-8" y="-24" width="14" height="14" fill="#2f6fd0" stroke="#bcd"/><circle cx="-1" cy="-17" r="3.5" fill="#f0c84b"/>` +
        smdLed(`data-pwr="${c.id}"`, -8, 4, '#ff3b30') + smdLed(`data-do="${c.id}"`, 8, 4, '#34e86b') +
        `<rect data-obst="${c.id}" x="-16" y="${-60 - c.props.cm}" width="32" height="5" fill="#8d6e63" opacity=".8"/>` + H.svg + label(26, -44, c.name, 'start') +
        `<text class="clabel" x="26" y="-32" text-anchor="start" data-tt="${c.id}">${fmt(c.props.cm)} cm</text>`;
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 2500); const v = vccOf(E)(T); E.src(T('OUT'), T('GND'), c.props.cm <= c.props.threshold ? 0 : v, 100); },
    readout: c => `OUT: ${c.props.cm <= c.props.threshold ? 'LOW (obstáculo a ' + fmt(c.props.cm) + ' cm)' : 'HIGH (nada dentro del alcance)'}\nAlcance ajustado: ${fmt(c.props.threshold)} cm`,
    render(c, k){
      const pw = k.powered('VCC', 'GND', 3); glowAttr(k.q(`[data-pwr="${c.id}"]`), pw); glowAttr(k.q(`[data-do="${c.id}"]`), pw && c.props.cm <= c.props.threshold);
      const t = k.q(`[data-tt="${c.id}"]`); if (t) t.textContent = `${fmt(c.props.cm)} cm`; const o = k.q(`[data-obst="${c.id}"]`); if (o) o.setAttribute('y', -60 - Math.min(c.props.cm, 40) * 0.5);
      noPower(c, k);
    },
  },
  line: ky3Type({
    label: 'Seguidor de línea KY-033', prefix: 'LIN', code: 'KY-033', props: () => ({ surface: 'blanco' }),
    header: ky3(['GND', 'VCC', 'S'], { GND: 'G (GND)', VCC: 'V+ (5 V)', S: 'S (HIGH sobre negro)' }, { GND: 'G', VCC: 'V+' }),
    options: [{ prop: 'surface', label: 'Debajo del sensor', values: [['blanco', 'Superficie blanca (refleja)'], ['negro', 'Línea negra (no refleja)']] }],
    draw: c => `<rect x="-14" y="-24" width="28" height="12" rx="2" fill="#111"/><circle cx="-6" cy="-18" r="4" fill="#3a6fd8"/><circle cx="6" cy="-18" r="4" fill="#222" stroke="#555"/><rect data-surf="${c.id}" x="-24" y="-38" width="48" height="6" fill="${c.props.surface === 'negro' ? '#111' : '#f4f4f4'}" stroke="#999"/>`,
    top: 4, led: '#ff3b30', ledOn: c => c.props.surface === 'blanco',
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 5000); const v = vccOf(E)(T); E.src(T('S'), T('GND'), c.props.surface === 'negro' ? v : 0, 100); },
    readout: c => c.props.surface === 'negro' ? 'Sobre la línea negra: S en HIGH' : 'Sobre blanco: S en LOW',
    render(c, k){ const s = k.q(`[data-surf="${c.id}"]`); if (s) s.setAttribute('fill', c.props.surface === 'negro' ? '#111' : '#f4f4f4'); },
  }),

  /* ---------- analógicos de 3 pines ---------- */
  ntc: ky3Type({
    label: 'Termistor KY-013', prefix: 'NTC', code: 'KY-013', props: () => ({ temp: 25 }),
    controls: [{ prop: 'temp', label: 'Temperatura', min: -20, max: 100, step: 0.5, unit: '°C' }],
    draw: c => `<path d="M0 -6 V-16" stroke="#aaa"/><ellipse cx="0" cy="-20" rx="5" ry="6" fill="#151515"/>` + `<text class="clabel" x="0" y="-30" text-anchor="middle" font-size="9" data-tt="${c.id}">${fmt(c.props.temp)} °C</text>`,
    elec(c, T, E){ const R = 10000 * Math.exp(3950 * (1 / (c.props.temp + 273.15) - 1 / 298.15)); E.res(T('VCC'), T('S'), 10000); E.res(T('S'), T('GND'), R); },
    readout: (c, V) => `Termistor NTC 10 kΩ (B = 3950) a ${fmt(c.props.temp)} °C: ${fmt(10 * Math.exp(3950 * (1 / (c.props.temp + 273.15) - 1 / 298.15)), 2)} kΩ\nS: ${fmt(V('S'), 2)} V (≈ ${Math.round(V('S') / 5 * 1023)}). Divisor: 10 kΩ a +, termistor a −.`,
    render(c, k){ const t = k.q(`[data-tt="${c.id}"]`); if (t) t.textContent = `${fmt(c.props.temp)} °C`; },
  }),
  ldrmod: ky3Type({
    label: 'Luz (LDR) KY-018', prefix: 'LUZ', code: 'KY-018', props: () => ({ lux: 200 }),
    controls: [{ prop: 'lux', label: 'Iluminación', min: 1, max: 2000, step: 1, unit: 'lux' }],
    draw: c => `<circle cx="0" cy="-12" r="9" fill="#e9d7b0" stroke="#a88"/><path d="M-6 -16 h4 v4 h4 v4 h4" stroke="#a33" fill="none"/>`,
    elec(c, T, E){ const R = Math.min(1e6, Math.max(80, 10000 * Math.pow(Math.max(c.props.lux, 0.01) / 10, -0.7))); E.res(T('VCC'), T('S'), 10000); E.res(T('S'), T('GND'), R); },
    readout: (c, V) => `Iluminación: ${fmt(c.props.lux, 1)} lux\nS: ${fmt(V('S'), 2)} V (≈ ${Math.round(V('S') / 5 * 1023)}; baja con más luz)`,
  }),
  water: {
    label: 'Nivel de agua', prefix: 'AGUA', cat: 'Sensores',
    terms: header(['S', 'VCC', 'GND'], { x0: -14, y0: 50, labels: SPK, texts: TXT }).terms,
    box: [-24, -72, 48, 140], props: () => ({ mm: 15 }),
    controls: [{ prop: 'mm', label: 'Profundidad sumergida', min: 0, max: 40, step: 0.5, unit: 'mm' }],
    svg(c){
      const H = header(['S', 'VCC', 'GND'], { x0: -14, y0: 50, labels: {}, texts: TXT });
      let s = pcb(-20, -66, 40, 116, '#c0392b', '#7d1f17');
      for (let i = 0; i < 10; i++) s += `<rect x="${-14 + (i % 2) * 4}" y="${-62 + i * 7}" width="24" height="3" fill="#e3c27a"/>`;
      s += `<rect data-wl="${c.id}" x="-24" y="${-66 + 70 * (1 - c.props.mm / 40)}" width="48" height="${70 * c.props.mm / 40}" fill="#4fa3e0" opacity=".45"/>`;
      return s + smdLed(`data-pwr="${c.id}"`, 0, 20, '#ff3b30') + H.svg + label(26, -60, c.name, 'start') + `<text class="clabel" x="26" y="-48" text-anchor="start" data-tt="${c.id}">${fmt(c.props.mm)} mm</text>`;
    },
    elec(c, T, E){ E.res(T('VCC'), T('GND'), 5000); const v = vccOf(E)(T); E.src(T('S'), T('GND'), v * 0.7 * Math.pow(c.props.mm / 40, 0.6), 2000); },
    readout: (c, V) => `Sumergido: ${fmt(c.props.mm)} mm de 40\nS: ${fmt(V('S'), 2)} V (≈ ${Math.round(V('S') / 5 * 1023)}; seco ≈ 0)`,
    render(c, k){
      const r = k.q(`[data-wl="${c.id}"]`); if (r) { r.setAttribute('y', -66 + 70 * (1 - c.props.mm / 40)); r.setAttribute('height', 70 * c.props.mm / 40); }
      const t = k.q(`[data-tt="${c.id}"]`); if (t) t.textContent = `${fmt(c.props.mm)} mm`; glowAttr(k.q(`[data-pwr="${c.id}"]`), k.powered('VCC', 'GND', 3)); noPower(c, k);
    },
  },

  /* ---------- con comparador (analógica + digital) ---------- */
  soil: cmpType({
    label: 'Humedad de suelo', prefix: 'SUELO', top: 44, board: BLUE, pins: ['VCC', 'GND', 'DO', 'AO'],
    props: () => ({ hum: 35, threshold: 50 }),
    controls: [{ prop: 'hum', label: 'Humedad de la tierra', min: 0, max: 100, step: 1, unit: '%' }, { prop: 'threshold', label: 'Umbral de DO', min: 5, max: 95, step: 1, unit: '%' }],
    draw: c => `<path d="M-14 -30 V-76 l4 -4 l4 4 V-30 M6 -30 V-76 l4 -4 l4 4 V-30" fill="#d7b25a" stroke="#9b7d2e"/><rect data-soil="${c.id}" x="-26" y="-60" width="52" height="30" fill="#6d4c2f" opacity="${0.25 + 0.6 * c.props.hum / 100}"/>`,
    ao: c => 1 - 0.62 * c.props.hum / 100, aoNote: 'seco ≈ 1023, mojado ≈ 390',
    active: c => c.props.hum >= c.props.threshold, activeLow: true, activeText: 'tierra húmeda', idleText: 'tierra seca',
    title: c => `${c.props.hum} %`,
    render(c, k){ const r = k.q(`[data-soil="${c.id}"]`); if (r) r.setAttribute('opacity', 0.25 + 0.6 * c.props.hum / 100); },
  }),
  rain: cmpType({
    label: 'Sensor de lluvia', prefix: 'LLUV', top: 54, board: BLUE, pins: ['VCC', 'GND', 'DO', 'AO'],
    props: () => ({ rain: 0, threshold: 40 }),
    controls: [{ prop: 'rain', label: 'Intensidad de la lluvia', min: 0, max: 100, step: 1, unit: '%' }, { prop: 'threshold', label: 'Umbral de DO', min: 5, max: 95, step: 1, unit: '%' }],
    draw(c){
      let s = `<rect x="-28" y="-88" width="56" height="50" rx="2" fill="#1c1c1c"/>`;
      for (let i = 0; i < 6; i++) s += `<path d="M-22 ${-84 + i * 8} H22" stroke="#d5b35c" stroke-width="2"/>`;
      return s + `<path d="M-22 -38 v8 M22 -38 v8" stroke="#888"/><g data-drops="${c.id}" opacity="${c.props.rain / 100}">${[-14, -2, 10, 18, -8].map((x, i) => `<ellipse cx="${x}" cy="${-80 + i * 9}" rx="2.5" ry="3.5" fill="#6cc0ff"/>`).join('')}</g>`;
    },
    ao: c => 1 - 0.75 * c.props.rain / 100, aoNote: 'seco ≈ 1023, baja con el agua',
    active: c => c.props.rain >= c.props.threshold, activeLow: true, activeText: 'lloviendo', idleText: 'seco',
    title: c => `${c.props.rain} %`,
    render(c, k){ const g = k.q(`[data-drops="${c.id}"]`); if (g) g.setAttribute('opacity', c.props.rain / 100); },
  }),
  sound: cmpType({
    label: 'Micrófono KY-038', prefix: 'MIC', top: 22,
    props: () => ({ level: 0.1, threshold: 0.5 }), device: clapDevice,
    controls: [{ prop: 'level', label: 'Nivel de sonido', min: 0, max: 1, step: 0.01, pct: true }, { prop: 'threshold', label: 'Umbral (potenciómetro)', min: 0.05, max: 0.95, step: 0.01, pct: true }],
    draw: c => `<g class="ctrl" data-ctrl="tap" data-id="${c.id}"><circle cx="0" cy="-40" r="13" fill="#222" stroke="#666" stroke-width="2"/><circle cx="0" cy="-40" r="8" fill="#3a3a3a"/><path data-clap="${c.id}" d="M-20 -50 q-6 10 0 20 M20 -50 q6 10 0 20" fill="none" stroke="#ffb347" stroke-width="2" opacity="0"/><title>Clic = aplauso</title></g><path d="M-4 -28 v-2 M4 -28 v-2" stroke="#999"/>`,
    ao: c => 0.5 + 0.45 * (c._clap ? 1 : c.props.level), aoNote: 'reposo ≈ 512, sube con el sonido',
    active: c => !!c._clap || c.props.level > c.props.threshold, activeLow: false, activeText: 'sonido por encima del umbral', idleText: 'silencio',
    note: 'Clic en el micrófono para simular un aplauso (0,12 s).',
    render(c, k){ glowAttr(k.q(`[data-clap="${c.id}"]`), !!c._clap); },
  }),
  hallan: cmpType({
    label: 'Hall lineal KY-024', prefix: 'HAL', top: 18, props: () => ({ field: 0, threshold: 0.5 }),
    controls: [{ prop: 'field', label: 'Campo magnético (−: polo S, +: polo N)', min: -1, max: 1, step: 0.01 }, { prop: 'threshold', label: 'Umbral (potenciómetro)', min: 0.05, max: 0.95, step: 0.01, pct: true }],
    draw: c => `<path d="M-4 -30 v-10 M0 -30 v-10 M4 -30 v-10" stroke="#aaa"/><rect x="-6" y="-48" width="12" height="9" rx="1" fill="#222"/>`,
    ao: c => 0.5 + 0.4 * c.props.field, aoNote: 'sin imán ≈ 512',
    active: c => Math.abs(c.props.field) > c.props.threshold, activeLow: false, activeText: 'imán detectado', idleText: 'sin imán',
    title: c => (c.props.field > 0 ? '+' : '') + fmt(c.props.field, 2),
  }),
  tempd: cmpType({
    label: 'Temperatura digital KY-028', prefix: 'TMP', top: 22, props: () => ({ temp: 25, threshold: 40 }),
    controls: [{ prop: 'temp', label: 'Temperatura', min: -20, max: 100, step: 0.5, unit: '°C' }, { prop: 'threshold', label: 'Umbral de DO', min: 0, max: 90, step: 0.5, unit: '°C' }],
    draw: c => `<path d="M0 -30 v-8" stroke="#aaa"/><ellipse cx="0" cy="-44" rx="5" ry="6" fill="#151515"/>`,
    ao: c => { const R = 10000 * Math.exp(3950 * (1 / (c.props.temp + 273.15) - 1 / 298.15)); return R / (R + 10000); }, aoNote: 'baja al calentar',
    active: c => c.props.temp >= c.props.threshold, activeLow: false, activeText: 'por encima del umbral', idleText: 'por debajo del umbral',
    title: c => `${fmt(c.props.temp)} °C`,
  }),

  /* ---------- salidas ---------- */
  laser: ky3Type({
    label: 'Láser KY-008', prefix: 'LSR', cat: 'Salidas', code: 'KY-008', noPowerCheck: true,
    header: ky3(['S', 'VCC', 'GND'], { S: 'S (HIGH = encendido)', VCC: '+ (sin uso)', GND: '− (GND)' }),
    draw: c => `<rect x="-10" y="-26" width="20" height="18" rx="2" fill="#c8a24a" stroke="#8a6d27"/><rect x="-4" y="-34" width="8" height="8" fill="#b0892f"/><line data-beam="${c.id}" x1="0" y1="-34" x2="0" y2="-120" stroke="#ff2a2a" stroke-width="2.5" filter="url(#glowS)" opacity="0"/>`,
    elec(c, T, E){ E.res(T('S'), T('GND'), 180); },
    readout: (c, V) => `${V('S') - V('GND') > 2.5 ? 'Encendido' : 'Apagado'} · consume ${fmt(Math.max(0, V('S') - V('GND')) / 180 * 1000, 0)} mA desde S`,
    render(c, k){ glowAttr(k.q(`[data-beam="${c.id}"]`), k.V('S') - k.V('GND') > 2.5); },
  }),
  buzza: ky3Type({
    label: 'Zumbador activo KY-012', prefix: 'BZA', cat: 'Salidas', code: 'KY-012', sound: true, noPowerCheck: true,
    header: ky3(['S', 'VCC', 'GND'], { S: 'S (HIGH = suena)', VCC: '+ (sin uso)', GND: '− (GND)' }),
    draw: c => `<circle cx="0" cy="-8" r="15" fill="#151515"/><circle cx="0" cy="-8" r="3" fill="#333"/><g data-waves="${c.id}" opacity="0" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M20 -18 A14 14 0 0 1 20 2"/><path d="M25 -23 A20 20 0 0 1 25 7"/></g>`,
    elec(c, T, E){ E.res(T('S'), T('GND'), 220); },
    readout: c => c._freq ? 'Sonando (oscilador interno de ~2,3 kHz)' : 'En silencio: pon S en HIGH para que suene',
    render(c, k){ const on = k.running && k.V('S') - k.V('GND') > 2.5; c._freq = on ? 2300 : 0; const w = k.q(`[data-waves="${c.id}"]`); if (w) w.setAttribute('opacity', on ? 0.5 + 0.5 * Math.sin(k.now / 60) ** 2 : 0); },
  }),
  buzzp: ky3Type({
    label: 'Zumbador pasivo KY-006', prefix: 'BZP', cat: 'Salidas', code: 'KY-006', passive: 'S', noPowerCheck: true,
    header: ky3(['S', 'VCC', 'GND'], { S: 'S (señal con tone())', VCC: '+ (sin uso)', GND: '− (GND)' }),
    draw: c => `<circle cx="0" cy="-8" r="15" fill="#151515"/><circle cx="0" cy="-8" r="9" fill="#26292c"/><g data-waves="${c.id}" opacity="0" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M20 -18 A14 14 0 0 1 20 2"/><path d="M25 -23 A20 20 0 0 1 25 7"/></g>`,
    elec(c, T, E){ E.res(T('S'), T('GND'), 1000); },
    readout: c => c._freq ? `Sonando a ${Math.round(c._freq)} Hz` : 'En silencio: usa tone(pin, frecuencia)',
  }),
  led2: {
    label: 'LED 2 colores KY-011', prefix: 'L2C', cat: 'Salidas',
    terms: header(['GND', 'R', 'G'], { x0: -14, y0: 26, labels: { GND: '− (GND)', R: 'R (rojo)', G: 'G (verde)' }, texts: { GND: '−' } }).terms,
    box: [-30, -54, 60, 100], props: () => ({}),
    svg(c){
      const H = header(['GND', 'R', 'G'], { x0: -14, y0: 26, labels: {}, texts: { GND: '−' } });
      return pcb(-26, -30, 52, 56, ...BLACK) + `<path d="M-3 -6 V-20 M3 -6 V-20" stroke="#bbb"/><path d="M-9 -22 a9 9 0 0 1 18 0 V-14 H-9 Z" fill="#e9eee9" opacity=".85"/>` +
        `<path data-lit="${c.id}" d="M-9 -22 a9 9 0 0 1 18 0 V-14 H-9 Z" fill="#ff3020" opacity="0"/><circle data-glow="${c.id}" cx="0" cy="-20" r="16" fill="#ff3020" filter="url(#glow)" opacity="0"/>` + H.svg + label(0, -40, c.name);
    },
    elec(c, T, E){ E.diode(c.id + ':r', T('R'), T('GND'), 1.8, 18); E.diode(c.id + ':g', T('G'), T('GND'), 2.1, 18); },
    readout: () => 'Dos LEDs con el cátodo común (−). No tienen resistencia en la placa: pon 220 Ω en serie con R y con G.',
    render(c, k){
      const r = Math.min(1, (k.led(c.id + ':r') || 0) / 0.010) ** 0.55, g = Math.min(1, (k.led(c.id + ':g') || 0) / 0.010) ** 0.55, m = Math.max(r, g);
      const col = `rgb(${Math.round(255 * (m ? r / m : 0))},${Math.round(230 * (m ? g / m : 0))},30)`;
      for (const [a, op] of [['lit', 0.95], ['glow', 0.85]]) { const e = k.q(`[data-${a}="${c.id}"]`); if (e) { e.setAttribute('fill', col); e.setAttribute('opacity', (m * op).toFixed(3)); } }
      for (const ch of ['r', 'g']) if ((k.led(c.id + ':' + ch) || 0) > 0.03) k.warn(`${c.name}: el LED ${ch === 'r' ? 'rojo' : 'verde'} recibe demasiada corriente. Pon una resistencia de 220 Ω en serie.`);
    },
  },
  traffic: {
    label: 'Semáforo (módulo)', prefix: 'SEM', cat: 'Salidas',
    terms: header(['R', 'Y', 'G', 'GND'], { x0: -21, y0: 64, labels: { R: 'R (rojo)', Y: 'Y (amarillo)', G: 'G (verde)', GND: 'GND' } }).terms,
    box: [-26, -62, 52, 144], props: () => ({}),
    svg(c){
      const H = header(['R', 'Y', 'G', 'GND'], { x0: -21, y0: 64, labels: {} });
      let s = pcb(-22, -56, 44, 120, '#111', '#000');
      [['r', '#ff2a1a', -36], ['y', '#ffc21a', -6], ['g', '#2aff5a', 24]].forEach(([k, col, y]) => {
        s += `<circle cx="0" cy="${y}" r="12" fill="#2a2a2a"/><circle data-tl="${c.id}:${k}" cx="0" cy="${y}" r="11" fill="${col}" opacity=".15"/><circle data-tg="${c.id}:${k}" cx="0" cy="${y}" r="20" fill="${col}" filter="url(#glow)" opacity="0"/>`;
      });
      return s + H.svg + label(0, -62, c.name);
    },
    elec(c, T, E){ E.diode(c.id + ':r', T('R'), T('GND'), 1.8, 330); E.diode(c.id + ':y', T('Y'), T('GND'), 2.0, 330); E.diode(c.id + ':g', T('G'), T('GND'), 2.1, 330); },
    readout: () => 'Tres LEDs con resistencia incluida (330 Ω) y el GND común. Se conectan directo a los pines.',
    render(c, k){
      for (const ch of ['r', 'y', 'g']) {
        const b = Math.min(1, (k.led(c.id + ':' + ch) || 0) / 0.008) ** 0.55;
        const l = k.q(`[data-tl="${c.id}:${ch}"]`), g = k.q(`[data-tg="${c.id}:${ch}"]`);
        if (l) l.setAttribute('opacity', (0.15 + 0.85 * b).toFixed(3)); if (g) g.setAttribute('opacity', (0.7 * b).toFixed(3));
      }
    },
  },
};

/* ---------- relés de 2, 4 y 8 canales ---------- */
function relayN(n){
  const pitch = 40, h = n * pitch, top = -h / 2;
  const inNames = ['VCC', 'GND', ...Array.from({ length: n }, (_, i) => 'IN' + (i + 1))];
  const IN = header(inNames, { x0: -82, y0: -((inNames.length - 1) * 14) / 2, dir: 'left', labels: Object.fromEntries(inNames.map(k => [k, k === 'VCC' ? 'VCC (5 V)' : k === 'GND' ? 'GND' : k + ' (señal del relé ' + k.slice(2) + ')'])) });
  const outs = []; let outSvg = ''; const outTerms = {};
  for (let i = 1; i <= n; i++) {
    const H = header(['NO' + i, 'COM' + i, 'NC' + i], { x0: 82, y0: top + (i - 1) * pitch + 6, pitch: 12, dir: 'right', len: 14, texts: { ['NO' + i]: 'NO', ['COM' + i]: 'C', ['NC' + i]: 'NC' }, labels: { ['NO' + i]: `NO${i} (normalmente abierto)`, ['COM' + i]: `COM${i} (común)`, ['NC' + i]: `NC${i} (normalmente cerrado)` } });
    Object.assign(outTerms, H.terms); outSvg += H.svg; outs.push(i);
  }
  const on = c => c._on || [];
  return {
    label: `Módulo relé ${n} canales`, prefix: 'RELE', cat: 'Salidas',
    terms: { ...IN.terms, ...outTerms }, box: [-100, top - 14, 200, h + 22], props: () => ({ trigger: 'low' }),
    options: [{ prop: 'trigger', label: 'Se activan con', values: [['low', 'LOW (lo más común)'], ['high', 'HIGH']] }],
    svg(c){
      let s = pcb(-82, top - 6, 164, h + 10, ...BLUE);
      for (const i of outs) {
        const y = top + (i - 1) * pitch;
        s += `<rect x="-10" y="${y}" width="56" height="${pitch - 6}" rx="2" fill="#2a6fd6" stroke="#174a96"/>` + tiny(18, y + 15, 'SRD-05VDC', '#e9f1ff', 'middle', 6) +
          `<rect x="56" y="${y}" width="22" height="${pitch - 6}" rx="2" fill="#2f8a4a" stroke="#1d5e31"/>` +
          smdLed(`data-rl="${c.id}:${i}"`, -44, y + 14, '#ff3b30') + tiny(-30, y + 16, 'K' + i, '#dfe9ff', 'middle', 6);
      }
      return s + IN.svg + outSvg + label(0, top - 12, `${c.name} · activos en ${c.props.trigger === 'low' ? 'LOW' : 'HIGH'}`);
    },
    elec(c, T, E){
      for (const i of outs) {
        if (c.props.trigger === 'low') E.res(T('VCC'), T('IN' + i), 2700); else E.res(T('IN' + i), T('GND'), 2700);
        const a = on(c)[i]; E.res(T('COM' + i), T((a ? 'NO' : 'NC') + i), 0.05);
      }
      E.res(T('VCC'), T('GND'), 20000 / n); const k = outs.filter(i => on(c)[i]).length; if (k) E.res(T('VCC'), T('GND'), 70 / k);
    },
    device: (c, api) => ({
      reset(){ c._on = []; },
      update(V){
        const vcc = V('VCC') - V('GND'); let ch = false; c._on = c._on || [];
        for (const i of outs) {
          const vin = V('IN' + i) - V('GND');
          const a = vcc > 3.8 && (c.props.trigger === 'low' ? vcc - vin > 2.2 : vin > 2.2);
          if (a !== !!c._on[i]) { c._on[i] = a; ch = true; }
        }
        if (ch && api.running()) api.click();
        return ch;
      },
    }),
    readout: c => outs.map(i => `Relé ${i}: ${on(c)[i] ? 'activado (COM–NO)' : 'reposo (COM–NC)'}`).join('\n'),
    render(c, k){
      for (const i of outs) glowAttr(k.q(`[data-rl="${c.id}:${i}"]`), !!on(c)[i]);
      if (k.running && !k.powered('VCC', 'GND', 3.5)) k.warn(`${c.name}: el módulo no tiene alimentación. VCC a 5V y GND a GND.`);
    },
  };
}
KITS.relay2 = relayN(2); KITS.relay4 = relayN(4); KITS.relay8 = relayN(8);
