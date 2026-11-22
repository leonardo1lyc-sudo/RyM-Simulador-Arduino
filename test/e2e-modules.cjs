// Prueba de los módulos de la tanda 1: node test/e2e-modules.cjs [url]
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando' || /Error/.test(document.querySelector('#status').textContent), null, { timeout: 60000 }); };
  const ex = async (name) => { await p.evaluate(n => __banco.applyState(__banco.exampleState(n)), name); await waitRun(); const st = await p.evaluate(() => document.querySelector('#status').textContent + ' ' + document.querySelector('#err').textContent); if (!/Simulando/.test(st)) console.log('  compilación:', st.slice(0, 300)); };
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const clear = () => p.evaluate(() => { document.querySelector('#serialOut').textContent = ''; });
  const prop = (type, k, v) => p.evaluate(([t, k, v]) => { const c = __banco.state.comps.find(c => c.type === t); c.props[k] = v; __banco.refresh(); }, [type, k, v]);
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const last = s => s.trim().split('\n').pop();

  await ex('ultrasonido'); await p.waitForTimeout(1200);
  let s = last(await serial()); check(/Distancia: (29|30|31)\.\d cm/.test(s), 'HC-SR04 30 cm: ' + s);
  await prop('sr04', 'cm', 150); await clear(); await p.waitForTimeout(1000);
  s = last(await serial()); check(/Distancia: 1(49|50|51)\.\d cm/.test(s), 'HC-SR04 150 cm: ' + s); await shot('m-ultrasonido');

  await ex('dht'); await p.waitForTimeout(4500);
  s = await serial(); check(/Temperatura: 24\.0 C\s+Humedad: 55\.0 %/.test(s), 'DHT22: ' + JSON.stringify(last(s)));
  await prop('dht', 'temp', -5.3); await prop('dht', 'hum', 81.5); await clear(); await p.waitForTimeout(4200);
  s = await serial(); check(/Temperatura: -5\.3 C\s+Humedad: 81\.5 %/.test(s), 'DHT22 negativo: ' + JSON.stringify(last(s))); await shot('m-dht');

  await ex('pir'); await p.waitForTimeout(500);
  await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'pir'); __banco.simDevs.get(c.id).tap(); }); await p.waitForTimeout(500);
  s = await serial(); let led = await p.evaluate(() => __banco.display.led.get(2)); check(/Movimiento!/.test(s) && led > 0.003, 'PIR: ' + JSON.stringify(s) + ' led ' + led); await shot('m-pir');

  await ex('joystick'); await prop('joy', 'x', 1); await prop('joy', 'y', -1); await prop('joy', 'pressed', true);
  await p.evaluate(() => { __banco.state.comps[0]._dummy = 1; }); await p.waitForTimeout(100);
  await p.evaluate(() => __banco.compileAndRun()); await waitRun(); await prop('joy', 'x', 1); await p.waitForTimeout(800);
  s = last(await serial()); check(/X=10(1\d|2\d)\s+Y=\d\s+\[pulsado\]/.test(s), 'Joystick: ' + s);

  await ex('alarma'); await p.waitForTimeout(700);
  s = last(await serial()); check(/llama=10\d\d\s+gas=\d+$/.test(s), 'Alarma en reposo: ' + s);
  await prop('flame', 'level', 0.9); await p.waitForTimeout(700); s = last(await serial());
  const f = await p.evaluate(() => __banco.io.pins[8].freq); check(/ALARMA/.test(s) && f > 1000, 'Alarma con llama: ' + s + ' tono ' + Math.round(f));
  await shot('m-alarma');

  await ex('rele'); await p.waitForTimeout(800);
  let r = await p.evaluate(() => [__banco.state.comps.find(c => c.type === 'relay')._on, __banco.display.led.get(4)]);
  check(r[0] === true && r[1] > 0.005, 'Relé activado y lámpara: ' + JSON.stringify(r)); await shot('m-rele');
  await p.waitForTimeout(1600); r = await p.evaluate(() => [__banco.state.comps.find(c => c.type === 'relay')._on, __banco.display.led.get(4)]);
  check(r[0] === false && r[1] < 0.0005, 'Relé en reposo: ' + JSON.stringify(r));

  await ex('motor'); await p.waitForTimeout(1200);
  const mv = await p.evaluate(() => { const D = __banco.display.sol; const st = __banco.state; const m = st.comps.find(c => c.type === 'motor'); return [m._spd, document.querySelector(`[data-rpm="${m.id}"]`).textContent]; });
  check(mv[0] > 0.2, 'Motor gira: ' + JSON.stringify(mv)); await shot('m-motor');
  await prop('pot', 'pos', 0.1); await p.waitForTimeout(1500);
  const mv2 = await p.evaluate(() => __banco.state.comps.find(c => c.type === 'motor')._spd); check(mv2 < -0.2, 'Motor al revés: ' + mv2);

  await ex('oled'); await p.waitForTimeout(1500);
  const px = await p.evaluate(() => { const m = __banco.state.comps.find(c => c.type === 'oled')._oled; let n = 0; for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) n += m.pixel(x, y); return [m.on, n]; });
  check(px[0] && px[1] > 300, 'OLED encendida con píxeles: ' + JSON.stringify(px)); await shot('m-oled');

  await ex('matriz'); await p.waitForTimeout(700);
  const mx = await p.evaluate(() => { const m = __banco.state.comps.find(c => c.type === 'max7219')._max; return [m.shutdown, Array.from(m.digits)]; });
  check(!mx[0] && mx[1].join(',') === '60,66,165,129,165,153,66,60', 'MAX7219 cara: ' + JSON.stringify(mx)); await shot('m-matriz');

  await ex('bluetooth'); await p.waitForTimeout(800);
  let bt = await p.evaluate(() => document.querySelector('#btOut').textContent);
  check(/Hola desde el Arduino/.test(bt), 'BT Arduino→celular: ' + JSON.stringify(bt));
  await p.fill('#btIn', '1'); await p.click('#btForm button'); await p.waitForTimeout(600);
  bt = await p.evaluate(() => document.querySelector('#btOut').textContent); led = await p.evaluate(() => __banco.display.led.get(2));
  check(/LED encendido/.test(bt) && led > 0.003, 'BT celular→Arduino: ' + JSON.stringify(bt.slice(-30)) + ' led ' + led); await shot('m-bluetooth');

  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
