// Tanda 4c: protoboards. Cada agujero es un terminal; las tiras internas (columnas de 5 y rieles) se unen solas,
// y las patas de los componentes que caen sobre un agujero quedan conectadas sin cable (ver rebuildCircuit).
const P = 10; // paso entre agujeros (2,54 mm)

function makeBreadboard({ cols, railGroups, label, prefix, info }){
  const rails = railGroups > 0;
  const X = i => 20 + (i - 1) * P;
  const top = 'jihgf', bot = 'edcba';
  const Y = rails ? { tp: 10, tn: 20, j: 40, i: 50, h: 60, g: 70, f: 80, e: 110, d: 120, c: 130, b: 140, a: 150, bn: 170, bp: 180 }
    : { j: 10, i: 20, h: 30, g: 40, f: 50, e: 80, d: 90, c: 100, b: 110, a: 120 };
  const W = X(cols) + 20, H = rails ? 190 : 130;
  const terms = {}, nets = [];
  const hole = (k, x, y, name) => { terms[k] = { x, y, dx: 0, dy: -1, name }; };
  for (let i = 1; i <= cols; i++) {
    for (const r of top + bot) hole(r + i, X(i), Y[r], `${r}${i}`);
    nets.push([...top].map(r => r + i), [...bot].map(r => r + i));
  }
  const railCols = []; // grupos de 5 con un espacio, centrados
  if (rails) { const span = railGroups * 6 - 1, start = 1 + Math.floor((cols - span) / 2); for (let g = 0; g < railGroups; g++) for (let k = 0; k < 5; k++) railCols.push(start + g * 6 + k); }
  const RAILS = { tp: 'Riel + de arriba', tn: 'Riel − de arriba', bn: 'Riel − de abajo', bp: 'Riel + de abajo' };
  if (rails) for (const r in RAILS) { const g = []; railCols.forEach((col, n) => { hole(`${r}${n + 1}`, X(col), Y[r], `${RAILS[r]} (${n + 1})`); g.push(`${r}${n + 1}`); }); nets.push(g); }
  const total = Object.keys(terms).length;

  let art = `<rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="#f3f1ea" stroke="#cfcabb"/>`;
  const chY = rails ? 95 : 65;
  art += `<rect x="4" y="${chY - 4}" width="${W - 8}" height="8" rx="2" fill="#dedad0"/>`;
  if (rails) {
    const x1 = X(railCols[0]) - 6, x2 = X(railCols[railCols.length - 1]) + 6;
    art += `<path d="M${x1} 3.5 H${x2} M${x1} ${H - 3.5} H${x2}" stroke="#d33" stroke-width="1.6"/><path d="M${x1} 26.5 H${x2} M${x1} ${H - 26.5} H${x2}" stroke="#2a62c9" stroke-width="1.6"/>`;
    art += `<text x="8" y="13" font-size="8" fill="#d33" font-weight="700">+</text><text x="8" y="23" font-size="9" fill="#2a62c9" font-weight="700">−</text>` +
      `<text x="8" y="173" font-size="9" fill="#2a62c9" font-weight="700">−</text><text x="8" y="183" font-size="8" fill="#d33" font-weight="700">+</text>`;
  }
  for (const k in terms) { const t = terms[k]; art += `<rect x="${t.x - 2.5}" y="${t.y - 2.5}" width="5" height="5" rx="1" fill="#4a4844"/>`; }
  const lab = (x, y, s, a = 'middle') => `<text x="${x}" y="${y}" font-size="6" fill="#8d887a" text-anchor="${a}" font-family="monospace">${s}</text>`;
  for (const r of top + bot) art += lab(9, Y[r] + 2, r) + lab(W - 9, Y[r] + 2, r);
  for (let i = 1; i <= cols; i++) if (i === 1 || i % 5 === 0) art += lab(X(i), Y.j - 5, i) + lab(X(i), Y.a + 9, i);

  return {
    label, prefix, cat: 'Protoboards', under: true, breadboard: true, termR: 4.2,
    terms, box: [0, 0, W, H], props: () => ({}),
    nets: () => nets,
    svg(c){ return art + `<text class="clabel" x="${W / 2}" y="-6" text-anchor="middle">${c.name} · ${total} puntos</text>`; },
    elec(){},
    readout: () => `${info}\nLas 5 perforaciones de cada columna (a–e y f–j) están unidas entre sí${rails ? '; cada riel (+ y −) está unido a lo largo' : ''}. Las patas que caen sobre un agujero quedan conectadas solas.`,
  };
}

export const KITS6 = {
  bb830: makeBreadboard({ cols: 63, railGroups: 10, label: 'Protoboard completa (830)', prefix: 'PB', info: 'Protoboard de 830 puntos: 63 columnas y 4 rieles de alimentación.' }),
  bb400: makeBreadboard({ cols: 30, railGroups: 5, label: 'Media protoboard (400)', prefix: 'PB', info: 'Protoboard de 400 puntos: 30 columnas y 4 rieles de alimentación.' }),
  bb170: makeBreadboard({ cols: 17, railGroups: 0, label: 'Mini protoboard (170)', prefix: 'PB', info: 'Mini protoboard de 170 puntos: 17 columnas, sin rieles.' }),
};
