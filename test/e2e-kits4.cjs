// Prueba de la tanda 4a (tiras y aros LED inteligentes y comunes): node test/e2e-kits4.cjs [url]
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
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const px = id => p.evaluate(i => (__banco.state.comps.find(c => c.id === i)._px || []).map(x => x ? x.join(',') : '-'), id);
  const warns = () => p.evaluate(() => document.querySelector('#warnings').textContent);

  // tira de 10 (arcoíris) y aro de 10 (luz que gira)
  await ex('neopixel'); await p.waitForTimeout(1200);
  const s1 = await px(1), r1 = await px(2);
  check(s1.length === 10 && new Set(s1).size === 10 && !s1.includes('0,0,0'), 'Tira WS2812B: 10 LED con colores distintos: ' + s1.slice(0, 4).join(' '));
  check(r1.filter(x => x !== '0,0,0' && x !== '-').length === 2, 'Aro WS2812B: 2 LED encendidos: ' + r1.join(' '));
  const fills = await p.evaluate(() => [...document.querySelectorAll('[data-px^="1:"]')].map(e => e.getAttribute('fill')));
  check(fills.length === 10 && fills.every(f => f.startsWith('rgb(')), 'Los LED de la tira se pintan del color recibido');
  await p.waitForTimeout(400); const r2 = await px(2);
  check(r2.join() !== r1.join(), 'La luz del aro gira');
  check(!/sin alimentación|DIN sin conectar/.test(await warns()), 'Sin avisos falsos: ' + JSON.stringify((await warns()).slice(0, 200)));
  await shot('k4-neopixel');

  // cambiar la cantidad de LED mueve DOUT y dibuja más LED
  const x0 = await p.evaluate(() => +document.querySelector('[data-term="C1:DOUT"]').getAttribute('cx'));
  await p.click('[data-comp="1"] [data-px="1:3"]', { force: true });
  await p.selectOption('#props select[data-prop="n"]', '15');
  await p.waitForTimeout(300);
  const x1 = await p.evaluate(() => +document.querySelector('[data-term="C1:DOUT"]').getAttribute('cx'));
  const cells = await p.evaluate(() => document.querySelectorAll('[data-px^="1:"]').length);
  check(cells === 15 && x1 - x0 === 5 * 26, `Tira de 15 LED: ${cells} celdas, DOUT se corre ${x1 - x0}px`);

  // dos tiras encadenadas: DOUT de la primera a DIN de la segunda
  const chain = `#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel t(7, 6, NEO_GRB + NEO_KHZ800);\nvoid setup(){ t.begin(); for (int i = 0; i < 7; i++) t.setPixelColor(i, t.Color(10 * i + 5, 200, 7)); t.show(); }\nvoid loop(){}\n`;
  await exCode('neopixel', chain, s => { s.comps[0].props.n = 4; s.comps[1] = { id: 2, type: 'neostrip', x: 640, y: 260, rot: 0, name: 'NEO2', props: { n: 3 } }; s.wires = s.wires.filter(w => w.id !== 13); s.wires.push({ id: 16, a: 'C1:DOUT', b: 'C2:DIN', pts: [], color: '#1565c0' }); });
  await p.waitForTimeout(800);
  const c1 = await px(1), c2 = await px(2);
  check(c1.join(' ') === '5,200,7 15,200,7 25,200,7 35,200,7' && c2.join(' ') === '45,200,7 55,200,7 65,200,7', 'DOUT → DIN: los LED 5 a 7 pasan a la segunda tira: ' + c2.join(' '));

  // tira RGB común de 5 V: rojo a GND (vía transistor simulado por un cable), verde por pin directo → aviso
  const common = `void setup(){ pinMode(9, OUTPUT); digitalWrite(9, LOW); }\nvoid loop(){}\n`;
  await exCode('neopixel', common, s => { s.comps = [{ id: 1, type: 'rgbstrip', x: 640, y: 140, rot: 0, name: 'TIRA1', props: { n: 6, volts: 5 } }]; s.wires = [{ id: 10, a: 'B:5V', b: 'C1:V', pts: [], color: '#e53935' }, { id: 11, a: 'C1:R', b: 'B:GND.1', pts: [], color: '#212121' }]; });
  await p.waitForTimeout(600);
  let col = await p.evaluate(() => document.querySelector('[data-px="1:0"]').getAttribute('fill'));
  check(/^rgb\(255,0,0\)$/.test(col), 'Tira RGB común: R a GND → rojo: ' + col);
  await exCode('neopixel', common, s => { s.comps = [{ id: 1, type: 'rgbstrip', x: 640, y: 140, rot: 0, name: 'TIRA1', props: { n: 6, volts: 5 } }]; s.wires = [{ id: 10, a: 'B:5V', b: 'C1:V', pts: [], color: '#e53935' }, { id: 11, a: 'C1:G', b: 'B:D9', pts: [], color: '#2e7d32' }]; });
  await p.waitForTimeout(600);
  check(/directo a un pin/.test(await warns()), 'Aviso al manejar un canal directo con un pin: ' + JSON.stringify((await warns()).slice(0, 160)));
  await exCode('neopixel', common, s => { s.comps = [{ id: 1, type: 'rgbring', x: 700, y: 200, rot: 0, name: 'ARO1', props: { n: 10, volts: 12 } }]; s.wires = [{ id: 10, a: 'B:5V', b: 'C1:V', pts: [], color: '#e53935' }, { id: 11, a: 'C1:B', b: 'B:GND.1', pts: [], color: '#212121' }]; });
  await p.waitForTimeout(600);
  check(/es una tira de 12 V/.test(await warns()), 'Aro de 12 V con 5 V: avisa que no enciende');
  await shot('k4-comun');

  // ESP32 (modo compatible): tira en GPIO 13
  const esp = `#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel t(5, 13, NEO_GRB + NEO_KHZ800);\nvoid setup(){ t.begin(); t.fill(t.Color(0, 0, 255)); t.show(); }\nvoid loop(){}\n`;
  await exCode('neopixel', esp, s => { s.board = 'esp32'; s.comps = [{ id: 1, type: 'neostrip', x: 640, y: 140, rot: 0, name: 'NEO1', props: { n: 5 } }]; s.wires = [{ id: 10, a: 'B:D13', b: 'C1:DIN', pts: [], color: '#f9a825' }, { id: 11, a: 'B:VIN', b: 'C1:VCC', pts: [], color: '#e53935' }, { id: 12, a: 'B:GND.1', b: 'C1:GND', pts: [], color: '#212121' }]; });
  await p.waitForTimeout(1000);
  const e1 = await px(1);
  check(e1.length === 5 && e1.every(x => x === '0,0,255'), 'ESP32: tira en GPIO13 azul: ' + e1.join(' '));

  check(!errs.length, 'Sin errores de JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(ok ? 0 : 1);
})();
