// Prueba del ESP32 en modo compatible: node test/e2e-esp32.cjs [url]
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
  const load = async st => { await p.evaluate(s => __banco.applyState(s), st); await waitRun(); const s = await status(); if (!/Simulando/.test(s)) console.log('  compilación:', s.slice(0, 800)); };
  const ex = name => p.evaluate(n => __banco.exampleState(n), name).then(load);
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const waitSerial = (re, ms = 8000) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#serialOut').textContent), re, { timeout: ms }).catch(() => {});
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const frame = () => p.frameLocator('#webView');

  // servidor web: conecta, muestra la página, el enlace prende el LED y fetch() lee el potenciómetro
  await ex('esp32web'); await waitSerial('IP: 192\\.168\\.1\\.50');
  check(/Conectado\. IP: 192\.168\.1\.50/.test(await serial()), 'WiFi simulado conecta: ' + JSON.stringify((await serial()).trim().split('\n').pop()));
  await frame().locator('h2').waitFor({ timeout: 8000 }).catch(() => {});
  const h2 = await frame().locator('h2').textContent().catch(() => '');
  check(/Servidor web/.test(h2), 'La página aparece en el Navegador: ' + JSON.stringify(h2));
  await frame().locator('a.on').click(); await p.waitForTimeout(1200);
  const led = await p.evaluate(() => __banco.display.led.get(1) || 0);
  const txt = await frame().locator('body').textContent().catch(() => '');
  check(led > 0.002 && /ENCENDIDO/.test(txt), `Enlace /on prende el LED en GPIO26 (${(led * 1000).toFixed(1)} mA, 3,3 V)`);
  const pot1 = +(await frame().locator('#pot').textContent());
  await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'pot'); c.props.pos = 0.9; __banco.refresh(); }); await p.waitForTimeout(2200);
  const pot2 = +(await frame().locator('#pot').textContent());
  check(Math.abs(pot1 - 2047) < 60 && Math.abs(pot2 - 3685) < 80, `analogRead(34) de 12 bits y fetch('/pot'): ${pot1} → ${pot2}`);
  await shot('e-web');

  // LEDC, botón BOOT con interrupción y Serial.printf
  await ex('esp32pwm'); await p.waitForTimeout(800);
  const duty = []; for (let i = 0; i < 8; i++) { duty.push(await p.evaluate(() => __banco.io.pins[2].duty)); await p.waitForTimeout(80); }
  check(duty.filter(d => d != null && d > 0.05 && d < 0.95).length >= 3, 'LEDC en GPIO2 cambia el brillo: ' + duty.map(d => d == null ? '-' : d.toFixed(2)).join(' '));
  for (let i = 0; i < 2; i++) { await p.evaluate(() => { const r = document.querySelector('[data-ctrl="boot"] rect').getBoundingClientRect(); window.__bootXY = [r.x + r.width / 2, r.y + r.height / 2]; }); const xy = await p.evaluate(() => window.__bootXY); await p.mouse.move(xy[0], xy[1]); await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(150); }
  await waitSerial('Pulsaciones de BOOT: 2', 6000);
  const s = await serial();
  check(/Chip ESP32-D0WD-V3 a 240 MHz/.test(s) && /Pulsaciones de BOOT: 2/.test(s), 'Serial.printf y BOOT (GPIO0) con interrupción: ' + JSON.stringify(s.trim().split('\n').slice(-1)));
  await shot('e-pwm');

  // Bluetooth: el panel Celular habla con BluetoothSerial
  await ex('esp32bt'); await p.waitForTimeout(1000);
  await p.fill('#btIn', '1'); await p.click('#btForm button'); await p.waitForTimeout(800);
  const bt = await p.evaluate(() => document.querySelector('#btOut').textContent), led2 = await p.evaluate(() => __banco.io.pins[2].val);
  check(/LED encendido/.test(bt) && led2 === 1, 'BluetoothSerial ↔ panel Celular: ' + JSON.stringify(bt.trim()));
  await shot('e-bt');

  // ESP32-CAM: la página muestra la foto de la cámara simulada; el botón saca otra con flash
  await ex('esp32cam'); await waitSerial('Camara lista');
  await frame().locator('#foto').waitFor({ timeout: 8000 }).catch(() => {});
  const imgOk = () => frame().locator('#foto').evaluate(i => i.getAttribute('src').startsWith('data:image/jpeg') && i.naturalWidth).catch(() => 0);
  await p.waitForTimeout(1500);
  const w1 = await imgOk();
  check(w1 === 640, `Foto de la ESP32-CAM en la página (ancho ${w1}, VGA 640)`);
  await frame().locator('button').click();
  const flash = await p.waitForFunction(() => /255,255,235/.test(document.querySelector('#bF').getAttribute('fill')), null, { timeout: 3000 }).then(() => true).catch(() => false);
  await waitSerial('Foto 2:', 5000);
  check(flash && /Foto 2: 640x480/.test(await serial()), 'Botón «Tomar foto» saca otra con flash en GPIO4: ' + JSON.stringify((await serial()).match(/Foto \d+: [^\n]*/g)));
  const red = await p.evaluate(() => document.querySelector('#bL').getAttribute('fill'));
  check(/255,40,30/.test(red), 'LED rojo (GPIO33, activo en LOW) encendido tras conectar: ' + red);
  const warnTxt = await p.evaluate(() => document.querySelector('#warnings').textContent);
  check(!/Cortocircuito/.test(warnTxt), 'Sin avisos falsos en la ESP32-CAM: ' + JSON.stringify(warnTxt.slice(0, 120)));
  await shot('esp32cam');
  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
