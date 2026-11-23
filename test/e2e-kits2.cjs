// Prueba de la tanda 3b (7 segmentos, TM1637, teclado 4x4, encoder, IR): node test/e2e-kits2.cjs [url]
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando' || /Error/.test(document.querySelector('#status').textContent), null, { timeout: 90000 }); };
  const status = () => p.evaluate(() => document.querySelector('#status').textContent + ' ' + document.querySelector('#err').textContent);
  const load = async st => { await p.evaluate(s => __banco.applyState(s), st); await waitRun(); const s = await status(); if (!/Simulando/.test(s)) console.log('  compilación:', s.slice(0, 400)); };
  const ex = name => p.evaluate(n => __banco.exampleState(n), name).then(load);
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const comp = t => `__banco.state.comps.find(c => c.type === '${t}')`;

  // TM1637: la librería TM1637Display escribe los 4 dígitos
  await ex('contador7'); await p.waitForTimeout(1500);
  const tm = await p.evaluate(`(${comp('tm1637')})._tm`);
  check(tm && tm.on && tm.segs.slice(0, 4).every(v => v & 0x7f) && (tm.segs[1] & 0x80), 'TM1637 muestra 4 dígitos con los dos puntos: ' + JSON.stringify(tm && tm.segs.slice(0, 4)));
  await shot('k2-tm1637');

  // 7 segmentos (cátodo común): el 7 enciende a, b y c
  await p.evaluate(() => 0);
  const segSt = { board: 'uno', counters: {}, nextId: 100, code: `const int P[] = {2, 3, 4, 5, 6, 7, 8, 9};\nconst byte SIETE = 0b00000111;\nvoid setup(){ for (int i = 0; i < 8; i++){ pinMode(P[i], OUTPUT); digitalWrite(P[i], (SIETE >> i) & 1); } }\nvoid loop(){}\n`,
    comps: [{ id: 1, type: 'seg7', x: 820, y: 300, rot: 0, name: 'D7S1', props: { common: 'cathode' } }], wires: [] };
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].forEach((s, i) => {
    segSt.comps.push({ id: 2 + i, type: 'res', x: 640 + i * 40, y: 150, rot: 90, name: 'R' + (i + 1), props: { ohms: 220 } });
    segSt.wires.push({ id: 10 + i, a: 'B:D' + (2 + i), b: `C${2 + i}:a`, pts: [], color: '#f9a825' }, { id: 30 + i, a: `C${2 + i}:b`, b: 'C1:' + s, pts: [], color: '#1565c0' });
  });
  segSt.wires.push({ id: 50, a: 'C1:COM2', b: 'B:GND.2', pts: [], color: '#212121' });
  await load(segSt); await p.waitForTimeout(600);
  const segs = await p.evaluate(() => [0, 1, 2, 3, 4, 5, 6, 7].map(i => __banco.display.led.get('1:' + i) || 0));
  check(segs.slice(0, 3).every(v => v > 0.005) && segs.slice(3).every(v => v < 1e-4), '7 segmentos muestra el 7: ' + segs.map(v => (v * 1000).toFixed(1)).join(' '));
  await shot('k2-seg7');

  // Teclado 4x4 con la librería Keypad
  await ex('teclado'); await p.waitForTimeout(800);
  for (const k of [0, 5, 15, 12]) { await p.evaluate(k => __banco.pressKey(__banco.state.comps[0], k), k); await p.waitForTimeout(250); await p.evaluate(() => __banco.pressKey(__banco.state.comps[0], -1)); await p.waitForTimeout(200); }
  let s = await serial(); const keys = [...s.matchAll(/Tecla: (.)/g)].map(m => m[1]).join('');
  check(keys === '15D*', 'Keypad.getKey() lee 1, 5, D y *: ' + JSON.stringify(keys));
  await shot('k2-teclado');

  // Encoder: 3 pasos a la derecha y 1 a la izquierda
  await ex('encoder'); await p.waitForTimeout(800);
  for (const d of ['cw', 'cw', 'cw', 'ccw']) { await p.evaluate(d => __banco.simDevs.get(__banco.state.comps[0].id).tap({ dir: d }), d); await p.waitForTimeout(150); }
  await p.waitForTimeout(300); s = await serial();
  const pos = [...s.matchAll(/Posición: (-?\d+)/g)].map(m => +m[1]);
  check(pos.join(',') === '1,2,3,2', 'Encoder cuenta 1,2,3,2: ' + pos.join(','));
  await p.evaluate(() => __banco.setPressed(__banco.state.comps[0], true)); await p.waitForTimeout(300); await p.evaluate(() => __banco.setPressed(__banco.state.comps[0], false));
  await p.waitForTimeout(300); check(/Cero/.test(await serial()), 'Pulsador SW del encoder');

  // IR: el botón "1" (0x0C) llega por IRremote y prende el LED 13
  await ex('controlIR'); await p.waitForTimeout(1000);
  await p.evaluate(() => __banco.simDevs.get(__banco.state.comps[1].id).tap({ code: '12' })); await p.waitForTimeout(600);
  await p.evaluate(() => __banco.simDevs.get(__banco.state.comps[1].id).tap({ code: '69' })); await p.waitForTimeout(600);
  s = await serial(); const led = await p.evaluate(() => __banco.io.pins[13].val);
  check(/Código: 0xC\b/.test(s) && /Código: 0x45/.test(s) && led, 'IRremote decodifica 0x0C y 0x45, LED 13 encendido: ' + JSON.stringify(s.trim().split('\n').slice(-2)));
  await shot('k2-ir');

  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
