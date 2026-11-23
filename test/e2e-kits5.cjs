// Prueba de la tanda 4b (condensadores, diodos, transistores, MOSFET y reguladores): node test/e2e-kits5.cjs [url]
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
  const load = async st => { await p.evaluate(s => __banco.applyState(s), st); await waitRun(); const s = await status(); if (!/Simulando/.test(s)) console.log('  compilación:', s.slice(0, 600)); };
  const ex = name => p.evaluate(n => __banco.exampleState(n), name).then(load);
  const exCode = (name, code, f) => p.evaluate(([n, c, f]) => { const s = __banco.exampleState(n); s.code = c; if (f) new Function('s', f)(s); return s; }, [name, code, f && f.toString().replace(/^s => /, '')]).then(load);
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const waitSerial = (re, ms = 15000) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#serialOut').textContent), re, { timeout: ms }).catch(() => {});
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const warns = () => p.evaluate(() => document.querySelector('#warnings').textContent);
  const led = id => p.evaluate(i => __banco.display.led.get(i) || 0, id);
  const readout = async id => { await p.click(`[data-comp="${id}"]`, { force: true }).catch(() => {}); await p.waitForTimeout(400); return p.evaluate(() => (document.querySelector('#pRead') || {}).textContent || ''); };
  const volts = (txt, re) => { const m = new RegExp(re + '\\s*=?\\s*(-?[\\d,]+) V').exec(txt); return m ? +m[1].replace(',', '.') : NaN; };

  // RC: 10 kΩ y 100 µF (τ = 1 s). Carga: 63 % en 1 s; descarga: 37 % en 1 s
  await ex('condensador');
  await waitSerial('descargando[\\s\\S]*1\\.0 s: [\\d.]+ V', 25000);
  const L = (await serial()).split('\n').map(l => l.trim());
  const at = (from, t) => { const i = L.findIndex(l => l.includes(from)); const l = L.slice(i).find(x => x.startsWith(t + ' s:')); return l ? +/: ([\d.]+) V/.exec(l)[1] : NaN; };
  const c1 = at('cargando', '1.0'), c5 = at('cargando', '5.0'), d1 = at('descargando', '1.0');
  check(Math.abs(c1 - 3.16) < 0.2, `Carga RC a τ = 1 s: ${c1} V (teórico 3,16 V)`);
  check(Math.abs(c5 - 4.97) < 0.1, `Carga a 5τ: ${c5} V`);
  check(Math.abs(d1 - 1.83) < 0.2, `Descarga a τ: ${d1} V (teórico 1,83 V)`);
  check(!/al revés|aguanta/.test(await warns()), 'Sin avisos falsos en el electrolítico');
  await shot('k5-rc');

  // electrolítico invertido
  await exCode('condensador', 'void setup(){ pinMode(7, OUTPUT); digitalWrite(7, HIGH); }\nvoid loop(){}\n', s => { s.wires = s.wires.filter(w => w.id !== 11 && w.id !== 12 && w.id !== 13); s.wires.push({ id: 31, a: 'C1:b', b: 'C2:n', pts: [] }, { id: 32, a: 'C2:p', b: 'B:GND.2', pts: [] }); });
  await p.waitForTimeout(1500);
  check(/al revés/.test(await warns()), 'Electrolítico invertido: avisa');

  // MOSFET con tira de 12 V
  await ex('tiracomun'); await p.waitForTimeout(500);
  const col = await p.evaluate(() => document.querySelector('[data-px="1:0"]').getAttribute('fill'));
  check(col === 'rgb(255,0,0)', 'MOSFET IRLZ44N: la tira de 12 V se pone roja: ' + col);
  check(!/directo a un pin|12 V\. Con 5 V|gate/.test(await warns()), 'Sin avisos en el circuito correcto: ' + JSON.stringify((await warns()).slice(0, 160)));
  await shot('k5-tira12');
  await p.waitForTimeout(1000);
  const col2 = await p.evaluate(() => document.querySelector('[data-px="1:0"]').getAttribute('fill'));
  check(col2 === 'rgb(0,255,0)', 'Cambia a verde: ' + col2);

  // NPN como llave: pin 9 → 1 kΩ → base; LED + 220 Ω del colector a 5 V
  const blink = 'void setup(){ pinMode(9, OUTPUT); }\nvoid loop(){ digitalWrite(9, HIGH); delay(400); digitalWrite(9, LOW); delay(400); }\n';
  const npnCirc = (model, rb = true) => `s.comps = [{ id: 1, type: 'npn', x: 760, y: 320, rot: 0, name: 'Q1', props: { model: '${model}' } }, { id: 2, type: 'res', x: 640, y: 250, rot: 0, name: 'R1', props: { ohms: 1000 } }, { id: 3, type: 'led', x: 900, y: 180, rot: 0, name: 'LED1', props: { color: 'rojo' } }, { id: 4, type: 'res', x: 900, y: 80, rot: 0, name: 'R2', props: { ohms: 220 } }];
    s.wires = [${rb ? "{ id: 10, a: 'B:D9', b: 'C2:a', pts: [] }, { id: 11, a: 'C2:b', b: 'C1:B', pts: [] }" : "{ id: 10, a: 'B:D9', b: 'C1:B', pts: [] }"}, { id: 12, a: 'C1:E', b: 'B:GND.2', pts: [] }, { id: 13, a: 'C1:C', b: 'C3:k', pts: [] }, { id: 14, a: 'C3:a', b: 'C4:b', pts: [] }, { id: 15, a: 'C4:a', b: 'B:5V', pts: [] }];`;
  await exCode('completo', blink, npnCirc('2N2222A'));
  const samples = []; for (let i = 0; i < 10; i++) { samples.push(await led(3)); await p.waitForTimeout(100); }
  const on = Math.max(...samples), off = Math.min(...samples);
  check(on > 0.012 && on < 0.016 && off < 1e-4, `NPN 2N2222A en saturación: LED ${(on * 1000).toFixed(1)} mA / ${(off * 1000).toFixed(2)} mA`);
  const ro = await readout(1);
  check(/2N2222A/.test(ro) && /Estado: (saturación|corte)/.test(ro), 'Lectura del transistor: ' + JSON.stringify(ro.split('\n').slice(1).join(' · ')));
  await shot('k5-npn');
  await exCode('completo', blink, npnCirc('BC547', false)); await p.waitForTimeout(900);
  check(/Falta una resistencia de base/.test(await warns()), 'Base sin resistencia: avisa');

  // PNP: emisor a 5 V, LED del colector a GND, base con 1 kΩ: enciende con el pin en LOW
  await exCode('completo', 'void setup(){ pinMode(9, OUTPUT); digitalWrite(9, LOW); }\nvoid loop(){}\n', `s.comps = [{ id: 1, type: 'pnp', x: 760, y: 320, rot: 0, name: 'Q1', props: { model: 'BC557' } }, { id: 2, type: 'res', x: 640, y: 250, rot: 0, name: 'R1', props: { ohms: 1000 } }, { id: 3, type: 'led', x: 900, y: 380, rot: 0, name: 'LED1', props: { color: 'azul' } }, { id: 4, type: 'res', x: 900, y: 480, rot: 0, name: 'R2', props: { ohms: 220 } }];
    s.wires = [{ id: 10, a: 'B:D9', b: 'C2:a', pts: [] }, { id: 11, a: 'C2:b', b: 'C1:B', pts: [] }, { id: 12, a: 'C1:E', b: 'B:5V', pts: [] }, { id: 13, a: 'C1:C', b: 'C3:a', pts: [] }, { id: 14, a: 'C3:k', b: 'C4:a', pts: [] }, { id: 15, a: 'C4:b', b: 'B:GND.2', pts: [] }];`);
  await p.waitForTimeout(600);
  const ip = await led(3);
  check(ip > 0.005 && ip < 0.012, `PNP BC557 con la base en LOW: LED azul ${(ip * 1000).toFixed(1)} mA`);

  // 7805 desde una batería de 9 V, y con 6 V avisa
  const regCirc = v => `s.comps = [{ id: 1, type: 'vreg', x: 760, y: 320, rot: 0, name: 'U1', props: { model: '7805' } }, { id: 2, type: 'battery', x: 620, y: 470, rot: 0, name: 'BAT1', props: { volts: ${v} } }, { id: 3, type: 'led', x: 900, y: 260, rot: 0, name: 'LED1', props: { color: 'rojo' } }, { id: 4, type: 'res', x: 900, y: 160, rot: 0, name: 'R1', props: { ohms: 220 } }];
    s.wires = [{ id: 10, a: 'C2:p', b: 'C1:IN', pts: [] }, { id: 11, a: 'C2:n', b: 'C1:GND', pts: [] }, { id: 12, a: 'C1:OUT', b: 'C4:a', pts: [] }, { id: 13, a: 'C4:b', b: 'C3:a', pts: [] }, { id: 14, a: 'C3:k', b: 'C1:GND', pts: [] }];`;
  await exCode('completo', 'void setup(){}\nvoid loop(){}\n', regCirc(9)); await p.waitForTimeout(600);
  const rr = await readout(1), vo = volts(rr, 'OUT');
  check(Math.abs(vo - 5) < 0.05 && Math.abs(volts(rr, 'IN') - 9) < 0.2, '7805 con 9 V: ' + JSON.stringify(rr.split('\n')[1]));
  const br = await readout(2); const ib = +((/Corriente: (\d+)/.exec(br) || [])[1]);
  check(ib >= 18 && ib <= 22, `La batería entrega la corriente del LED más el consumo del regulador: ${ib} mA`);
  await exCode('completo', 'void setup(){}\nvoid loop(){}\n', regCirc(6)); await p.waitForTimeout(600);
  check(/necesita al menos 7,0 V/.test(await warns()), '7805 con 6 V: avisa que no le alcanza');
  await shot('k5-7805');

  // Zener de 5,1 V con 470 Ω desde 9 V
  await exCode('completo', 'void setup(){}\nvoid loop(){}\n', `s.comps = [{ id: 1, type: 'zener', x: 800, y: 300, rot: 0, name: 'DZ1', props: { vz: 5.1 } }, { id: 2, type: 'battery', x: 620, y: 470, rot: 0, name: 'BAT1', props: { volts: 9 } }, { id: 3, type: 'res', x: 700, y: 200, rot: 0, name: 'R1', props: { ohms: 470 } }];
    s.wires = [{ id: 10, a: 'C2:p', b: 'C3:a', pts: [] }, { id: 11, a: 'C3:b', b: 'C1:k', pts: [] }, { id: 12, a: 'C1:a', b: 'C2:n', pts: [] }];`);
  await p.waitForTimeout(600);
  const zr = await readout(1), vz = volts(zr, 'ánodo\\)\\:');
  check(/Regulando a 5,1 V/.test(zr) && vz > 5.1 && vz < 5.4, 'Zener 5,1 V: ' + JSON.stringify(zr.split('\n').join(' · ')));

  // cerámico y diodo: se dibujan y simulan sin errores
  await exCode('completo', 'void setup(){ pinMode(9, OUTPUT); }\nvoid loop(){ digitalWrite(9, !digitalRead(9)); delay(1); }\n', `s.comps = [{ id: 1, type: 'cap', x: 800, y: 300, rot: 0, name: 'C1', props: { uf: 0.1 } }, { id: 2, type: 'diode', x: 680, y: 300, rot: 0, name: 'D1', props: { model: '1N4007' } }];
    s.wires = [{ id: 10, a: 'B:D9', b: 'C2:a', pts: [] }, { id: 11, a: 'C2:k', b: 'C1:a', pts: [] }, { id: 12, a: 'C1:b', b: 'B:GND.2', pts: [] }];`);
  await p.waitForTimeout(800);
  const cr = await readout(1);
  check(Math.abs(volts(cr, 'Tensión:') - 4.3) < 0.2, 'Diodo + cerámico (rectificador de pico): ' + JSON.stringify(cr.split('\n')[0]));

  check(!errs.length, 'Sin errores de JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(ok ? 0 : 1);
})();
