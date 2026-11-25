// Prueba de extremo a extremo: node test/e2e.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando' || /Error/.test(document.querySelector('#status').textContent), null, { timeout: 30000 }); };
  const ex = async (name) => { await p.evaluate(n => __banco.applyState(__banco.exampleState(n)), name); await waitRun(); };
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const status = () => p.evaluate(() => document.querySelector('#status').textContent + ' | ' + document.querySelector('#err').textContent);
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };

  await ex('completo'); await p.waitForTimeout(1500);
  let s = await serial(); check(/pot = \d+\s+brillo = \d+/.test(s), 'completo: serie ' + JSON.stringify(s.slice(-40)));
  let led = await p.evaluate(() => __banco.display.led.get(2)); check(led > 0.003, 'completo: LED con PWM ' + led);
  await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'pot'); c.props.pos = 0; }); await p.evaluate(() => __banco.applyState); 
  await p.evaluate(() => { window.__banco.state.comps.find(c => c.type === 'pot').props.pos = 0.0; });
  await p.evaluate(() => { const b = __banco.state.comps.find(c => c.type === 'btn'); __banco.setPressed(b, true); });
  await p.waitForTimeout(800);
  led = await p.evaluate(() => __banco.display.led.get(2)); s = await serial(); check(/pot = 0   brillo = 255/.test(s), 'completo: botón -> brillo 255 ' + JSON.stringify(s.slice(-30)) + ' led ' + led);
  await p.screenshot({ path: path.join(OUT, 'completo.png') });

  await ex('lcd'); await p.waitForTimeout(1500);
  let lcd = await p.evaluate(() => { const m = [...__banco.lcdModels.values()][0]; let t = ''; for (let r = 0; r < 2; r++) { for (let c = 0; c < 16; c++) { const k = m.charAt(c, r); t += k < 8 ? '♥' : String.fromCharCode(k); } t += '\n'; } return t; });
  check(/Hola, Arduino ♥/.test(lcd) && /Segundos: \d/.test(lcd), 'lcd: ' + JSON.stringify(lcd));
  await p.screenshot({ path: path.join(OUT, 'lcd.png') });

  await ex('servo'); await p.waitForTimeout(1200);
  let ang = await p.evaluate(() => [...__banco.servoAngles.values()][0]);
  check(Math.abs(ang - 54) < 6, 'servo: ángulo ' + ang + ' (esperado ~54)');
  await p.screenshot({ path: path.join(OUT, 'servo.png') });

  await ex('i2c'); await p.waitForTimeout(1500); // LiquidCrystal_I2C ya viene incluida
  lcd = await p.evaluate(() => { const m = [...__banco.lcdModels.values()][0]; let t = ''; for (let r = 0; r < 2; r++) { for (let c = 0; c < 16; c++) t += String.fromCharCode(m.charAt(c, r)); t += '\n'; } return t; });
  check(/RyM Simu \+ I2C/.test(lcd) && /t = \d/.test(lcd), 'i2c (librería incluida): ' + JSON.stringify(lcd));
  await p.click('[data-tab="libs"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'i2c.png') });
  await p.click('[data-tab="code"]');

  await ex('rgb'); await p.waitForTimeout(1500);
  const rgb = await p.evaluate(() => ['r', 'g', 'b'].map(k => __banco.display.led.get('4:' + k)));
  check(rgb.some(v => v > 0.001), 'rgb: corrientes ' + rgb.map(v => (v * 1000).toFixed(1)).join('/'));

  // error de compilación con línea
  await p.evaluate(() => { const v = document.querySelector('.cm-content').cmView.view; });
  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
