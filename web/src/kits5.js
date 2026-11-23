// Tanda 4b: componentes electrónicos sueltos. Condensadores (con carga y descarga en el tiempo), diodos,
// Zener, transistores NPN/PNP, MOSFET y reguladores de tensión.
import { label, tiny, fmt } from './modules.js';

const term = (x, y, dx, dy, name) => ({ x, y, dx, dy, name });
const leg = (x1, y1, x2, y2, col = '#9aa3a6') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const si = (v, u) => { // 0.0000047 → "4,7 µ"
  const a = Math.abs(v);
  const [k, p] = a >= 1 ? [1, ''] : a >= 1e-3 ? [1e3, 'm'] : a >= 1e-6 ? [1e6, 'µ'] : a >= 1e-9 ? [1e9, 'n'] : [1e12, 'p'];
  const x = v * k; return (Number.isInteger(+x.toFixed(3)) ? String(Math.round(x)) : fmt(x, x < 10 ? 1 : 0)) + ' ' + p + u;
};
const mA = I => I >= 1 ? fmt(I, 2) + ' A' : fmt(I * 1000, I < 0.01 ? 2 : 1) + ' mA';

/* ---------- condensadores ---------- */
// Modelo de Euler implícito: en cada paso el condensador es una fuente de su tensión actual con una resistencia dt/C.
// Detenido (dt = 0) se comporta como circuito abierto, que es su estado en continua.
function capElec(c, T, E, a, b, esr){
  const C = c.props.uf * 1e-6;
  if (!E.dt) { E.res(T(a), T(b), 1e10); return; }
  E.src(T(a), T(b), c._vc || 0, E.dt / C + esr);
  E.res(T(a), T(b), 5e7); // fuga
}
function capStep(c, V, dt, a, b, esr){
  const C = c.props.uf * 1e-6, vc = c._vc || 0;
  const i = (V(a) - V(b) - vc) / (dt / C + esr);
  const nv = vc + i * dt / C; c._vc = nv;
  return Math.abs(nv - vc) / dt > 1e-3; // sigue cambiando (V/s)
}
// código impreso en los cerámicos: 104 = 10·10⁴ pF
const capCode = uf => { const pf = Math.round(uf * 1e6); if (pf < 100) return String(pf); const e = Math.floor(Math.log10(pf)) - 1; return String(Math.round(pf / 10 ** e)) + e; };
const CER_VALUES = [0.00001, 0.000022, 0.0001, 0.001, 0.01, 0.1, 0.22, 0.47, 1, 10].map(v => [v, `${si(v * 1e-6, 'F')} (${capCode(v)})`]);
const EL_VALUES = [1, 4.7, 10, 22, 47, 100, 220, 470, 1000, 2200, 4700].map(v => [v, si(v * 1e-6, 'F')]);
const EL_VOLTS = [6.3, 10, 16, 25, 35, 50].map(v => [v, fmt(v, v % 1 ? 1 : 0) + ' V']);
const tau = c => { const C = c.props.uf * 1e-6; return `Con 10 kΩ en serie: τ = R·C = ${si(1e4 * C, 's')} (se carga al 63 % en τ y casi del todo en 5τ).`; };

const ceramic = {
  label: 'Condensador cerámico', prefix: 'C', cat: 'Pasivos',
  terms: { a: term(-30, 0, -1, 0, 'pata 1'), b: term(30, 0, 1, 0, 'pata 2') },
  box: [-32, -22, 64, 36], props: () => ({ uf: 0.1 }),
  options: [{ prop: 'uf', label: 'Capacidad', values: CER_VALUES, num: true }],
  svg(c){
    return leg(-30, 0, -7, 0) + leg(30, 0, 7, 0) + leg(-7, 0, -5, 8) + leg(7, 0, 5, 8) +
      `<ellipse cx="0" cy="-2" rx="13" ry="12" fill="#e08a2e" stroke="#a85f17"/><ellipse cx="-3" cy="-6" rx="5" ry="3" fill="#f2b06a" opacity=".6"/>` +
      tiny(0, 1, capCode(c.props.uf), '#4a2a08', 'middle', 8) + label(0, -18, `${c.name} · ${si(c.props.uf * 1e-6, 'F')}`);
  },
  elec(c, T, E){ capElec(c, T, E, 'a', 'b', 0.05); },
  step(c, V, dt){ return capStep(c, V, dt, 'a', 'b', 0.05); },
  readout(c, V){ return `Tensión: ${fmt(V('a') - V('b'), 2)} V\n${tau(c)}`; },
};

const electrolytic = {
  label: 'Condensador electrolítico', prefix: 'C', cat: 'Pasivos',
  terms: { p: term(-10, 40, 0, 1, '+ (pata larga)'), n: term(10, 40, 0, 1, '− (franja)') },
  box: [-20, -40, 40, 82], props: () => ({ uf: 100, volts: 16 }),
  options: [{ prop: 'uf', label: 'Capacidad', values: EL_VALUES, num: true }, { prop: 'volts', label: 'Tensión máxima', values: EL_VOLTS, num: true }],
  svg(c){
    return leg(-10, 22, -10, 40) + leg(10, 22, 10, 40) +
      `<rect x="-16" y="-34" width="32" height="58" rx="5" fill="#1f3f8f" stroke="#122656"/><rect x="5" y="-34" width="9" height="58" fill="#c9d3ea"/>` +
      `<path d="M-16 -26 H16" stroke="#122656" stroke-width="1.5"/>` + tiny(9.5, -12, '−', '#1f3f8f', 'middle', 9) + tiny(9.5, 8, '−', '#1f3f8f', 'middle', 9) +
      tiny(-5, -2, si(c.props.uf * 1e-6, 'F').replace(' ', ''), '#fff', 'middle', 6.5) + tiny(-5, 8, fmt(c.props.volts, c.props.volts % 1 ? 1 : 0) + 'V', '#fff', 'middle', 6) +
      tiny(-10, 36, '+', '#555', 'end', 8) +
      `<text data-capv="${c.id}" x="0" y="54" font-size="9" text-anchor="middle" fill="#666" font-family="monospace"></text>` + label(0, -40, c.name);
  },
  elec(c, T, E){ capElec(c, T, E, 'p', 'n', 0.2); },
  step(c, V, dt){ return capStep(c, V, dt, 'p', 'n', 0.2); },
  render(c, k){
    const v = k.V('p') - k.V('n'), t = k.q(`[data-capv="${c.id}"]`);
    if (t) { const s = k.running ? fmt(v, 2) + ' V' : ''; if (t.textContent !== s) t.textContent = s; }
    if (!k.running) return;
    if (v < -1) k.warn(`${c.name}: está al revés (${fmt(v, 1)} V). En un electrolítico la pata − (la de la franja) va al lado de menor tensión; invertido se calienta y puede reventar.`);
    if (v > c.props.volts) k.warn(`${c.name}: tiene ${fmt(v, 1)} V y aguanta ${c.props.volts} V. Usa uno de mayor tensión.`);
  },
  readout(c, V){ return `Tensión: ${fmt(V('p') - V('n'), 2)} V (máx. ${c.props.volts} V)\nCarga: ${si(c.props.uf * 1e-6 * Math.max(0, V('p') - V('n')), 'C')}\n${tau(c)}`; },
};

/* ---------- diodos ---------- */
const DIODES = {
  '1N4007': { vf: 0.7, ron: 0.15, imax: 1, info: 'rectificador de 1 A, 1000 V' },
  '1N4148': { vf: 0.65, ron: 1.5, imax: 0.2, info: 'de señal, rápido, 200 mA' },
  '1N5819': { vf: 0.3, ron: 0.15, imax: 1, info: 'Schottky de 1 A, poca caída' },
};
const diodeI = (c, V, vf, ron) => Math.max(0, (V('a') - V('k') - vf) / ron);
const diode = {
  label: 'Diodo', prefix: 'D', cat: 'Pasivos',
  terms: { a: term(-40, 0, -1, 0, 'ánodo (+)'), k: term(40, 0, 1, 0, 'cátodo (−, franja)') },
  box: [-42, -20, 84, 30], props: () => ({ model: '1N4007' }),
  options: [{ prop: 'model', label: 'Modelo', values: Object.entries(DIODES).map(([k, d]) => [k, `${k} (${d.info})`]) }],
  svg(c){
    const glass = c.props.model === '1N4148';
    const body = glass ? `<rect x="-16" y="-6" width="32" height="12" rx="5" fill="#e9a27c" opacity=".85" stroke="#b46b44"/><rect x="8" y="-6" width="4" height="12" fill="#222"/>`
      : `<rect x="-16" y="-7" width="32" height="14" rx="3" fill="#232323"/><rect x="8" y="-7" width="5" height="14" fill="#cfd3d6"/>`;
    return leg(-40, 0, -16, 0) + leg(16, 0, 40, 0) + body + label(0, -12, `${c.name} · ${c.props.model}`);
  },
  elec(c, T, E){ const d = DIODES[c.props.model]; E.diode(c.id, T('a'), T('k'), d.vf, d.ron); },
  render(c, k){
    if (!k.running) return; const d = DIODES[c.props.model]; const i = k.led(c.id) || 0;
    if (i > d.imax) k.warn(`${c.name}: pasan ${mA(i)} y el ${c.props.model} aguanta ${mA(d.imax)}.`);
  },
  readout(c, V){ const d = DIODES[c.props.model]; const i = diodeI(c, V, d.vf, d.ron); return `${c.props.model}: ${d.info}\nTensión: ${fmt(V('a') - V('k'), 2)} V\nCorriente: ${i > 0 ? mA(i) : '0 (bloquea)'}`; },
};
const ZENERS = [[3.3, '1N4728A'], [4.7, '1N4732A'], [5.1, '1N4733A'], [6.2, '1N4735A'], [9.1, '1N4739A'], [12, '1N4742A']];
const zener = {
  label: 'Diodo Zener', prefix: 'DZ', cat: 'Pasivos',
  terms: diode.terms, box: diode.box, props: () => ({ vz: 5.1 }),
  options: [{ prop: 'vz', label: 'Tensión Zener', values: ZENERS.map(([v, m]) => [v, `${fmt(v, 1)} V (${m})`]), num: true }],
  svg(c){
    return leg(-40, 0, -16, 0) + leg(16, 0, 40, 0) + `<rect x="-16" y="-6" width="32" height="12" rx="5" fill="#d9744e" opacity=".9" stroke="#9c4a2a"/><rect x="8" y="-6" width="4" height="12" fill="#222"/>` +
      label(0, -12, `${c.name} · ${fmt(c.props.vz, 1)} V`);
  },
  elec(c, T, E){ E.diode(c.id, T('a'), T('k'), 0.7, 0.3); E.diode(`${c.id}:z`, T('k'), T('a'), c.props.vz, 3); },
  render(c, k){
    if (!k.running) return; const i = k.led(`${c.id}:z`) || 0, p = i * c.props.vz;
    if (p > 1) k.warn(`${c.name}: disipa ${fmt(p, 2)} W y aguanta 1 W. Pon una resistencia en serie más grande.`);
  },
  readout(c, V){
    const v = V('k') - V('a'), iz = Math.max(0, (v - c.props.vz) / 3), fw = Math.max(0, (-v - 0.7) / 0.3);
    return `Tensión (cátodo − ánodo): ${fmt(v, 2)} V\n` + (iz > 0 ? `Regulando a ${fmt(c.props.vz, 1)} V con ${mA(iz)}` : fw > 0 ? `Polarizado en directa: ${mA(fw)}` : 'No conduce (tensión menor que la Zener)');
  },
};

/* ---------- transistores bipolares ---------- */
// Base: diodo base-emisor. Colector: resistencia que deja pasar β·Ib (región activa) sin bajar de Rsat (saturación).
const BJT = {
  '2N2222A': { pnp: false, beta: 150, vbe: 0.65, rb: 30, rsat: 1.5, imax: 0.6, order: 'EBC', pkg: 'to92', info: 'NPN de uso general, 600 mA' },
  'BC547': { pnp: false, beta: 200, vbe: 0.65, rb: 40, rsat: 2.5, imax: 0.1, order: 'CBE', pkg: 'to92', info: 'NPN de señal, 100 mA' },
  'TIP120': { pnp: false, beta: 1000, vbe: 1.3, rb: 60, rsat: 0.5, imax: 5, order: 'BCE', pkg: 'to220', info: 'NPN Darlington, 5 A' },
  '2N2907A': { pnp: true, beta: 150, vbe: 0.65, rb: 30, rsat: 1.5, imax: 0.6, order: 'EBC', pkg: 'to92', info: 'PNP de uso general, 600 mA' },
  'BC557': { pnp: true, beta: 200, vbe: 0.65, rb: 40, rsat: 2.5, imax: 0.1, order: 'CBE', pkg: 'to92', info: 'PNP de señal, 100 mA' },
  'TIP125': { pnp: true, beta: 1000, vbe: 1.3, rb: 60, rsat: 0.5, imax: 5, order: 'BCE', pkg: 'to220', info: 'PNP Darlington, 5 A' },
};
const PIN_NAMES = { E: 'E (emisor)', B: 'B (base)', C: 'C (colector)', G: 'G (gate)', D: 'D (drenador)', S: 'S (fuente)', I: 'IN (entrada)', O: 'OUT (salida)', N: 'GND' };
const pinsByOrder = (order, y = 36) => Object.fromEntries([...order].map((p, i) => [p, term((i - 1) * 20, y, 0, 1, PIN_NAMES[p])]));
function to92(order, txt, sub){
  let s = `<path d="M-17 4 V-14 A17 17 0 0 1 17 -14 V4 Z" fill="#26282b" stroke="#111"/>` + tiny(0, -10, txt, '#ddd', 'middle', 6.5) + (sub ? tiny(0, -2, sub, '#9a9', 'middle', 5.5) : '');
  [...order].forEach((p, i) => { const x = (i - 1) * 20; s += leg(x === 0 ? 0 : x * 0.5, 4, x, 36) + tiny(x, 46, p, '#666', 'middle', 7); });
  return s;
}
function to220(order, txt, sub, names = order){
  let s = `<rect x="-24" y="-46" width="48" height="16" rx="2" fill="#c7ccd1" stroke="#8a9096"/><circle cx="0" cy="-38" r="4.5" fill="var(--bg)" stroke="#8a9096"/>` +
    `<rect x="-24" y="-30" width="48" height="36" rx="1" fill="#26282b" stroke="#111"/>` + tiny(0, -16, txt, '#ddd', 'middle', 6.5) + (sub ? tiny(0, -6, sub, '#9a9', 'middle', 5.5) : '');
  [...order].forEach((p, i) => { const x = (i - 1) * 20; s += leg(x, 6, x, 36) + tiny(x, 46, names[i], '#666', 'middle', 6.5); });
  return s;
}
function bjtElec(c, T, E){
  const m = BJT[c.props.model], sg = m.pnp ? -1 : 1, B = T('B'), C = T('C'), Em = T('E');
  if (m.pnp) E.diode(c.id, Em, B, m.vbe, m.rb); else E.diode(c.id, B, Em, m.vbe, m.rb);
  const ib = Math.max(0, (sg * (E.prev(B) - E.prev(Em)) - m.vbe) / m.rb), vce = sg * (E.prev(C) - E.prev(Em));
  const ic = m.beta * ib;
  E.res(C, Em, ic > 1e-7 ? Math.max(m.rsat, Math.max(vce, 0.02) / ic) : 1e9);
}
const bjtVals = (c, V) => {
  const m = BJT[c.props.model], sg = m.pnp ? -1 : 1;
  const ib = Math.max(0, (sg * (V('B') - V('E')) - m.vbe) / m.rb), vce = sg * (V('C') - V('E'));
  const ic = ib > 1e-7 ? Math.max(0, vce) / Math.max(m.rsat, Math.max(vce, 0.02) / (m.beta * ib)) : 0;
  return { m, ib, vce, ic };
};
const mkBjt = pnp => ({
  label: pnp ? 'Transistor PNP' : 'Transistor NPN', prefix: 'Q', cat: 'Pasivos',
  terms: pinsByOrder('EBC'),
  dynTerms(c){ return pinsByOrder(BJT[c.props.model].order); },
  box: c => BJT[c.props.model].pkg === 'to220' ? [-26, -48, 52, 98] : [-22, -32, 44, 82],
  props: () => ({ model: pnp ? '2N2907A' : '2N2222A' }),
  options: [{ prop: 'model', label: 'Modelo', values: Object.entries(BJT).filter(([, m]) => m.pnp === pnp).map(([k, m]) => [k, `${k} (${m.info})`]) }],
  svg(c){
    const m = BJT[c.props.model];
    return (m.pkg === 'to220' ? to220(m.order, c.props.model, pnp ? 'PNP' : 'NPN') : to92(m.order, c.props.model, pnp ? 'PNP' : 'NPN')) + label(0, m.pkg === 'to220' ? -52 : -36, c.name);
  },
  elec: bjtElec,
  render(c, k){
    if (!k.running) return;
    const { m, ib, ic } = bjtVals(c, k.V);
    if (ib > 0.03 && m.beta < 500) k.warn(`${c.name}: la base recibe ${mA(ib)}. Falta una resistencia de base (con 5 V, 1 kΩ da unos 4 mA).`);
    if (ic > m.imax) k.warn(`${c.name}: el colector lleva ${mA(ic)} y el ${c.props.model} aguanta ${mA(m.imax)}. Usa un TIP120/TIP125 o un MOSFET.`);
  },
  readout(c, V){
    const { m, ib, vce, ic } = bjtVals(c, V);
    const st = ib < 1e-6 ? 'corte (apagado)' : vce < 0.3 + m.rsat * ic ? 'saturación (llave cerrada)' : 'activa (amplifica)';
    return `${c.props.model}: ${m.info}, β ≈ ${m.beta}\nEstado: ${st}\nIb = ${mA(ib)} · Ic = ${mA(ic)} · Vce = ${fmt(Math.abs(vce), 2)} V`;
  },
});

/* ---------- MOSFET de canal N ---------- */
const FETS = {
  'IRLZ44N': { vth: 1.5, vfull: 4, ron: 0.025, imax: 47, info: 'nivel lógico: conduce del todo con 5 V' },
  'IRF540N': { vth: 3, vfull: 10, ron: 0.044, imax: 33, info: 'necesita 10 V en el gate' },
};
const fetR = (m, vgs) => { const k = clamp((vgs - m.vth) / (m.vfull - m.vth), 0, 1); return k <= 0 ? 1e9 : m.ron / (k * k); };
const mosfet = {
  label: 'MOSFET canal N', prefix: 'Q', cat: 'Pasivos',
  terms: pinsByOrder('GDS'), box: [-26, -48, 52, 98], props: () => ({ model: 'IRLZ44N' }),
  options: [{ prop: 'model', label: 'Modelo', values: Object.entries(FETS).map(([k, m]) => [k, `${k} (${m.info})`]) }],
  svg(c){ return to220('GDS', c.props.model, 'MOSFET N') + label(0, -52, c.name); },
  elec(c, T, E){
    const m = FETS[c.props.model], G = T('G'), D = T('D'), S = T('S');
    E.res(D, S, fetR(m, E.prev(G) - E.prev(S)));
    E.diode(c.id, S, D, 0.8, 0.05); // diodo interno
    E.res(G, S, 1e9);
  },
  render(c, k){
    if (!k.running) return; const m = FETS[c.props.model];
    if (!k.wired('G')) { k.warn(`${c.name}: el gate está sin conectar. Únelo a un pin y pon 10 kΩ del gate a GND para que quede apagado al arrancar.`); return; }
    const vgs = k.V('G') - k.V('S'), id = (k.V('D') - k.V('S')) / fetR(m, vgs);
    if (vgs > m.vth && vgs < m.vfull - 0.5 && id > 0.05) k.warn(`${c.name}: con ${fmt(vgs, 1)} V en el gate el ${c.props.model} conduce a medias y se calienta. Usa un MOSFET de nivel lógico (IRLZ44N).`);
  },
  readout(c, V){
    const m = FETS[c.props.model], vgs = V('G') - V('S'), R = fetR(m, vgs), id = Math.max(0, (V('D') - V('S')) / R);
    return `${c.props.model}: ${m.info}\nVgs = ${fmt(vgs, 2)} V (umbral ${fmt(m.vth, 1)} V) · Rds = ${R >= 1e8 ? 'abierto' : R < 1 ? fmt(R * 1000, 0) + ' mΩ' : fmt(R, 1) + ' Ω'}\nId = ${mA(id)}`;
  },
};

/* ---------- reguladores lineales ---------- */
const REGS = {
  '7805': { v: 5, drop: 2, vmax: 35, order: 'ION', info: '5 V, 1,5 A' },
  '7809': { v: 9, drop: 2, vmax: 35, order: 'ION', info: '9 V, 1,5 A' },
  '7812': { v: 12, drop: 2, vmax: 35, order: 'ION', info: '12 V, 1,5 A' },
  'AMS1117-3.3': { v: 3.3, drop: 1.1, vmax: 15, order: 'NOI', info: '3,3 V, 1 A' },
  'AMS1117-5.0': { v: 5, drop: 1.1, vmax: 15, order: 'NOI', info: '5 V, 1 A' },
};
const RS = 0.05;
const regTerms = order => { const t = pinsByOrder(order); return { IN: t.I, GND: t.N, OUT: t.O }; };
const regVals = (c, V) => {
  const m = REGS[c.props.model], vin = V('IN') - V('GND'), vout = V('OUT') - V('GND');
  const vt = clamp(vin - m.drop, 0, m.v); return { m, vin, vout, vt, iout: Math.max(0, (vt - vout) / RS) };
};
const regulator = {
  label: 'Regulador de tensión', prefix: 'U', cat: 'Pasivos',
  terms: regTerms('ION'),
  dynTerms(c){ return regTerms(REGS[c.props.model].order); },
  box: [-26, -48, 52, 98], props: () => ({ model: '7805' }),
  options: [{ prop: 'model', label: 'Modelo', values: Object.entries(REGS).map(([k, m]) => [k, `${k} (${m.info})`]) }],
  svg(c){ const m = REGS[c.props.model]; return to220(m.order, c.props.model.replace('-', ' '), '', [...m.order].map(p => ({ I: 'IN', N: 'GND', O: 'OUT' })[p])) + label(0, -52, c.name); },
  elec(c, T, E){
    const { vin, vt } = regVals(c, t => E.prev(T(t)));
    // elemento de paso entre IN y OUT (como el transistor del regulador): la corriente de salida sale de IN
    E.src(T('IN'), T('OUT'), vin - vt, RS);
    E.res(T('IN'), T('GND'), 1500); // consumo propio (~5 mA)
  },
  render(c, k){
    if (!k.running || !k.wired('IN')) return;
    const { m, vin, vout, iout } = regVals(c, k.V);
    if (vin > m.vmax) k.warn(`${c.name}: tiene ${fmt(vin, 1)} V en IN y el ${c.props.model} admite hasta ${m.vmax} V.`);
    else if (vin < m.v + m.drop - 0.05 && vin > 0.5) k.warn(`${c.name}: necesita al menos ${fmt(m.v + m.drop, 1)} V en IN para dar ${fmt(m.v, 1)} V (ahora da ${fmt(Math.max(0, vout), 1)} V).`);
    const p = (vin - vout) * iout; if (p > 1.5) k.warn(`${c.name}: disipa ${fmt(p, 1)} W y se calienta mucho. Ponle un disipador o baja la tensión de entrada.`);
  },
  readout(c, V){ const { m, vin, vout, iout } = regVals(c, V); return `${c.props.model}: ${m.info}, caída mínima ${fmt(m.drop, 1)} V\nIN = ${fmt(vin, 2)} V · OUT = ${fmt(vout, 2)} V\nCorriente de salida: ${mA(iout)} · Calor: ${fmt(Math.max(0, (vin - vout) * iout), 2)} W`; },
};

export const KITS5 = { cap: ceramic, ecap: electrolytic, diode, zener, npn: mkBjt(false), pnp: mkBjt(true), mosfet, vreg: regulator };
