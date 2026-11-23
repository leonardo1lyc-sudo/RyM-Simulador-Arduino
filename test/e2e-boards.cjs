// Prueba de las placas de la tanda 2 (Nano y Mega 2560): node test/e2e-boards.cjs [url]
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando' || /Error/.test(document.querySelector('#status').textContent), null, { timeout: 60000 }); };
  const status = () => p.evaluate(() => document.querySelector('#status').textContent + ' ' + document.querySelector('#err').textContent);
  const load = async st => { await p.evaluate(s => __banco.applyState(s), st); await waitRun(); const s = await status(); if (!/Simulando/.test(s)) console.log('  compilación:', s.slice(0, 300)); };
  const ex = name => p.evaluate(n => __banco.exampleState(n), name).then(load);
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const last = s => s.trim().split('\n').pop();
  const sketch = (board, code, comps = [], wires = []) => ({ board, code, comps, wires, counters: {}, nextId: 100 });

  // Nano: A7 es solo analógica
  await ex('nano'); await p.waitForTimeout(1500);
  let s = last(await serial()); let led = await p.evaluate(() => __banco.display.led.get(2));
  check(/A7 = 30[5-9]/.test(s) && led > 0.001, `Nano: ${s.trim()} · LED ${(led * 1000).toFixed(1)} mA`); await shot('b-nano');

  // Mega: secuencia en 22-28, potenciómetro en A8 (canal ADC 8, MUX5)
  await ex('mega'); await p.waitForTimeout(2500);
  s = await serial(); check(/pausa = 31\d ms/.test(s), 'Mega A8: ' + JSON.stringify(last(s)));
  const seen = new Set();
  for (let i = 0; i < 12; i++) { const on = await p.evaluate(() => [22, 24, 26, 28].filter(q => __banco.io.pins[q].val)); on.forEach(q => seen.add(q)); await p.waitForTimeout(110); }
  check(seen.size === 4, 'Mega puertos A (22-28) en secuencia: ' + [...seen].join(','));
  await shot('b-mega');

  // Mega: PWM en los 15 pines (timers 0, 1, 2, 3, 4 y 5)
  const pwmPins = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46];
  await load(sketch('mega', `const int P[] = {${pwmPins.join(', ')}};\nvoid setup(){ for (int i = 0; i < 15; i++) analogWrite(P[i], 20 + i * 15); }\nvoid loop(){}\n`));
  await p.waitForTimeout(800);
  const duties = await p.evaluate(P => P.map(q => __banco.io.pins[q].duty), pwmPins);
  const bad = pwmPins.filter((q, i) => !(duties[i] != null && Math.abs(duties[i] - (20 + i * 15) / 255) < 0.02));
  check(!bad.length, 'Mega PWM en 15 pines: ' + (bad.length ? 'fallan ' + bad.join(',') + ' ' + JSON.stringify(duties) : 'todos con el ciclo esperado'));

  // Mega: interrupción externa INT4 (pin 2) y millis() con el timer 0 del 2560
  await load(sketch('mega', `volatile int n = 0;\nvoid cuenta(){ n++; }\nvoid setup(){ Serial.begin(9600); pinMode(2, INPUT_PULLUP); attachInterrupt(digitalPinToInterrupt(2), cuenta, FALLING); }\nvoid loop(){ Serial.print("n="); Serial.print(n); Serial.print(" t="); Serial.println(millis()); delay(100); }\n`,
    [{ id: 1, type: 'btn', x: 900, y: 300, rot: 0, name: 'BTN1', props: { pressed: false, latch: false, bounce: false } }],
    [{ id: 10, a: 'B:D2', b: 'C1:a', pts: [], color: '#f9a825' }, { id: 11, a: 'C1:b', b: 'B:GND.2', pts: [], color: '#212121' }]));
  await p.waitForTimeout(400);
  for (let i = 0; i < 3; i++) { await p.evaluate(() => __banco.setPressed(__banco.state.comps[0], true)); await p.waitForTimeout(120); await p.evaluate(() => __banco.setPressed(__banco.state.comps[0], false)); await p.waitForTimeout(120); }
  await p.waitForTimeout(300);
  s = last(await serial()); const t = +(/t=(\d+)/.exec(s) || [0, 0])[1], clk = await p.evaluate(() => __banco.uno.cycles / 16000);
  check(/n=3 /.test(s) && Math.abs(t - clk) < 150, `Mega INT4 y millis(): ${s.trim()} (reloj ${clk.toFixed(0)} ms)`);

  // Mega: Serial1 con el HC-05 (pines 18 y 19)
  await ex('megaSerial1'); await p.waitForTimeout(1500);
  let bt = await p.evaluate(() => document.querySelector('#btOut').textContent);
  check(/Hola desde el Mega/.test(bt), 'Mega Serial1 → celular: ' + JSON.stringify(bt));
  await p.fill('#btIn', '1'); await p.click('#btForm button'); await p.waitForTimeout(700);
  bt = await p.evaluate(() => document.querySelector('#btOut').textContent); led = await p.evaluate(() => __banco.display.led.get(2)); s = await serial();
  check(/LED encendido/.test(bt) && /Recibido: 1/.test(s) && led > 0.003, 'Mega celular → Serial1: ' + JSON.stringify(bt.slice(-16)) + ' ' + JSON.stringify(last(s)) + ' led ' + led);
  const warn = await p.evaluate(() => document.querySelector('#warnings').textContent);
  check(!/flotante/.test(warn), 'TX1 activo no se marca como entrada flotante'); await shot('b-mega-serial1');

  // Mega: OLED por I2C en SDA 20 / SCL 21 (TWI del 2560)
  const oled = await p.evaluate(() => { const s = __banco.exampleState('oled'); s.board = 'mega'; for (const w of s.wires) { for (const k of ['a', 'b']) { if (w[k] === 'B:A4') w[k] = 'B:D20'; if (w[k] === 'B:A5') w[k] = 'B:D21'; } w.pts = []; } return s; });
  await load(oled); await p.waitForTimeout(1500);
  const px = await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'oled'); let n = 0; for (const v of c._oled.ram) n += (v.toString(2).match(/1/g) || []).length; return n; });
  check(px > 200, 'Mega OLED en 20/21: ' + px + ' píxeles'); await shot('b-mega-oled');

  // Cambio de placa: Uno → Mega conserva los cables, Mega → Uno quita los de pines que no existen
  await ex('completo'); const nw = await p.evaluate(() => __banco.state.wires.length);
  await p.selectOption('#boardSel', 'mega'); await waitRun();
  const nw2 = await p.evaluate(() => [__banco.state.board, __banco.state.wires.length]);
  check(nw2[0] === 'mega' && nw2[1] === nw, `Uno → Mega conserva ${nw2[1]} de ${nw} cables`);
  await ex('mega'); await p.selectOption('#boardSel', 'uno'); await waitRun();
  const left = await p.evaluate(() => [__banco.state.board, __banco.state.wires.filter(w => /B:D2[2-8]/.test(w.a + w.b)).length, document.querySelector('#hint').textContent]);
  check(left[0] === 'uno' && left[1] === 0 && /Se quitaron/.test(left[2]), 'Mega → Uno: ' + left[2]);

  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
