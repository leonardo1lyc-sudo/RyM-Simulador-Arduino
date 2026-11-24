// Prueba de la tanda 5 (NFC, microSD, MP3, IMU, TFT, RF 433, Arduino casero y abrir .ino/.json): node test/e2e-kits7.cjs [url]
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const os = require('os');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|AudioContext/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => /Simulando|Error|sin arrancar/.test(document.querySelector('#status').textContent), null, { timeout: 90000 }); };
  const status = () => p.evaluate(() => document.querySelector('#status').textContent + ' ' + document.querySelector('#err').textContent);
  const load = async st => { await p.evaluate(s => __banco.applyState(s), st); await waitRun(); const s = await status(); if (!/Simulando/.test(s)) console.log('  estado:', s.slice(0, 600)); };
  const ex = name => p.evaluate(n => __banco.exampleState(n), name).then(load);
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const waitSerial = async (re, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const s = await serial(); if (re.test(s)) return s; await p.waitForTimeout(200); } return await serial(); };
  const setProp = (id, k, v) => p.evaluate(([i, k, v]) => { const c = __banco.state.comps.find(c => c.id === i); c.props[k] = v; __banco.refresh(); }, [id, k, v]);
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const led = id => p.evaluate(i => __banco.display.led.get(i) || 0, id);
  const lcdText = () => p.evaluate(() => { const m = [...__banco.lcdModels.values()][0]; return m ? (m.lines ? m.lines() : JSON.stringify(m)) : ''; });

  // NFC PN532 + LCD 20x4
  await ex('nfc');
  let s = await waitSerial(/firmware [\d.]+\s*\n/);
  check(/PN532 firmware 1\.6/.test(s), 'PN532 responde por I2C: ' + (s.match(/PN532 firmware [\d.]+/) || ['—'])[0]);
  await p.click('[data-ctrl="card"]'); s = await waitSerial(/UID:[^\n]*\n/);
  check(/UID: 93 3A 7C 1D/.test(s), 'Lee el UID de la tarjeta: ' + (s.match(/UID:[^\n]*/) || ['—'])[0]);
  await p.waitForTimeout(800); check(await p.evaluate(() => __banco.io.pins[13].val) === 1, 'Tarjeta autorizada prende el LED 13');
  await shot('k7-nfc-lcd2004');
  await setProp(1, 'card', 'ntag'); await p.evaluate(() => document.querySelector('#serialOut').textContent = '');
  s = await waitSerial(/UID:( [0-9A-F]{2}){7}/, 8000);
  check(/UID:( [0-9A-F]{2}){7}/.test(s), 'Etiqueta NTAG213 con UID de 7 bytes');

  // microSD
  await ex('sd');
  s = await waitSerial(/Guardado.*\n.*Guardado/s, 20000);
  check(/Tarjeta lista/.test(s) && /Guardado: \d+/.test(s), 'SD.begin y escribe en DATOS.TXT');
  const files = await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'sdcard'); return c._fs ? c._fs.list().map(e => e.path + ':' + e.size) : []; });
  check(files.some(f => /DATOS\.TXT:\d+/.test(f) && +f.split(':')[1] > 20), 'El archivo aparece en la tarjeta: ' + files.join(', '));
  const txt = await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'sdcard'); const e = c._fs.list().find(e => /DATOS/.test(e.path)); return new TextDecoder().decode(c._fs.readFile(e)); });
  check(/^segundos;valor\r?\n\d+;\d+/.test(txt), 'Contenido correcto: ' + JSON.stringify(txt.slice(0, 40)));
  await p.evaluate(() => __banco.select(1)); await p.waitForTimeout(300);
  const act = await p.$('[data-cact]'); if (act) { await act.click(); await p.waitForTimeout(400); await shot('k7-sd-archivos'); await p.keyboard.press('Escape'); const x = await p.$('.rym-dlg [data-close], .rym-dlg .close'); if (x) await x.click(); }
  check(!!act, 'Botón «Archivos de la tarjeta» en el panel');

  // DFPlayer
  await ex('mp3');
  s = await waitSerial(/Pistas en la tarjeta: \d+\s*\n/);
  check(/Pistas en la tarjeta: 10/.test(s), 'DFPlayer responde: ' + (s.match(/Pistas[^\n]*/) || ['—'])[0]);
  await shot('k7-dfplayer');

  // MPU6050
  await ex('mpu');
  s = await waitSerial(/Acel.*\n.*Acel/s);
  const m = /Acel X:(-?[\d.]+) Y:(-?[\d.]+) Z:(-?[\d.]+)/.exec(s);
  check(/MPU6050 listo/.test(s) && m && Math.abs(Math.hypot(+m[1], +m[2], +m[3]) - 9.8) < 1.2, 'MPU6050 mide la gravedad: ' + (m ? m[0] : s.slice(-200)));
  await shot('k7-mpu6050');

  // TFT ILI9341
  await ex('tft'); await p.waitForTimeout(4000);
  const px = await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'ili9341'); const fb = c._tft && c._tft.fb; if (!fb) return null; const cols = new Set(); for (let i = 0; i < fb.length; i += 4 * 97) cols.add(fb[i] + ',' + fb[i + 1] + ',' + fb[i + 2]); return [...cols].length; });
  check(px >= 4, 'La TFT dibuja (colores distintos en pantalla: ' + px + ')');
  await shot('k7-tft');

  // RF 433
  await ex('rf433');
  s = await waitSerial(/Enviado: 1001/, 6000);
  check(/Enviado: 1001/.test(s) && await p.evaluate(() => __banco.state.comps[0]._seen > 0), 'El emisor transmite (LED del FS1000A)');
  await p.click('[data-ctrl="tap"][data-code="1361"]');
  s = await waitSerial(/Recibido: 1361/, 8000);
  check(/Recibido: 1361 \(24 bits\)/.test(s), 'El receptor recibe el botón A del control: ' + (s.match(/Recibido[^\n]*/) || ['—'])[0]);
  await p.waitForTimeout(300); check(await p.evaluate(() => __banco.io.pins[13].val) === 1, 'El botón A prende el LED 13');
  await shot('k7-rf433');

  // Reloj DS3231 + EEPROM AT24C32 (RTClib)
  await ex('reloj3231');
  s = await waitSerial(/Arranques guardados en la EEPROM: \d+\s*\n/);
  check(/Arranques guardados en la EEPROM: 1\b/.test(s) && !/perdio/.test(s), 'DS3231 responde y la EEPROM cuenta el primer arranque');
  await p.waitForTimeout(1200);
  const lcd4 = () => p.evaluate(() => { const m = [...__banco.lcdModels.values()][0]; let t = ''; for (let r = 0; r < 4; r++) { for (let c = 0; c < 20; c++) t += String.fromCharCode(m.charAt(c, r)); t += '\n'; } return t; });
  let txt4 = await lcd4(); const pc = new Date(); const hh = String(pc.getHours()).padStart(2, '0');
  check(new RegExp('^' + hh + ':\\d\\d:\\d\\d', 'm').test(txt4) && /Temp: 24\.00 C/.test(txt4), 'LCD 20x4 muestra la hora de la PC y la temperatura: ' + JSON.stringify(txt4));
  await shot('k7-ds3231');
  // poner el reloj en el segundo 27 y esperar la alarma del segundo 30
  await p.evaluate(() => { const c = __banco.state.comps.find(c => c.type === 'ds3231'); const d = __banco.simDevs.get(c.id); const now = d.now(); c._d31.base += (Math.floor(now / 60000) * 60000 + 27000) - now; });
  s = await waitSerial(/Alarma a las \d\d:\d\d:\d\d\s*\n/, 8000);
  check(/Alarma a las \d\d:\d\d:3[01]/.test(s), 'Alarma 1 por SQW en el segundo 30: ' + (s.match(/Alarma[^\n]*/) || ['—'])[0]);
  await p.waitForTimeout(300); check(await p.evaluate(() => __banco.io.pins[13].val) === 1, 'La alarma prende el LED 13');
  // reiniciar: la hora sigue (pila) y la EEPROM recuerda
  await p.evaluate(() => { document.querySelector('#serialOut').textContent = ''; __banco.compileAndRun(); }); await waitRun();
  s = await waitSerial(/Arranques guardados en la EEPROM: \d+\s*\n/);
  check(/Arranques guardados en la EEPROM: 2\b/.test(s) && !/perdio/.test(s), 'Tras reiniciar la EEPROM cuenta 2 arranques y la hora se conserva');
  // sin pila: lostPower() y se ajusta a la hora de compilación
  await setProp(1, 'bat', false); await p.evaluate(() => { document.querySelector('#serialOut').textContent = ''; __banco.compileAndRun(); }); await waitRun();
  s = await waitSerial(/Arranques/);
  check(/perdio la hora/.test(s), 'Sin pila, lostPower() avisa que se perdió la hora');

  // Cables: doblar, mover codos, ángulo recto y quitar codos
  await p.evaluate(() => __banco.applyState(__banco.exampleState('blink'), false)); await p.waitForTimeout(500);
  const wid = await p.evaluate(() => __banco.state.wires[0].id);
  const onWire = (id, f = 0.5) => p.evaluate(([id, f]) => { const el = document.querySelector(`[data-wire="${id}"]`); const L = el.getTotalLength(); const q = el.getPointAtLength(L * f); const m = el.getScreenCTM(); return [q.x * m.a + q.y * m.c + m.e, q.x * m.b + q.y * m.d + m.f]; }, [id, f]);
  const dragMouse = async ([x, y], dx, dy) => { await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(x + dx * i / 8, y + dy * i / 8); await p.mouse.up(); await p.waitForTimeout(150); };
  const pts = () => p.evaluate(id => JSON.stringify(__banco.state.wires.find(w => w.id === id).pts), wid);
  await dragMouse(await onWire(wid), 0, 60);
  let P = JSON.parse(await pts());
  check(P.length === 1, 'Arrastrar un cable le agrega un codo: ' + JSON.stringify(P));
  const hp = await p.evaluate(() => { const el = document.querySelector('[data-wpt]'); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await dragMouse(hp, 40, 0);
  const P2 = JSON.parse(await pts());
  check(P2.length === 1 && P2[0][0] > P[0][0], 'El codo se mueve arrastrándolo: ' + JSON.stringify(P2));
  await p.click('[data-act="wortho"]'); await p.waitForTimeout(150);
  const P3 = JSON.parse(await pts());
  const all = await p.evaluate(id => { const el = document.querySelector(`[data-wire="${id}"]`); return el.getAttribute('d'); }, wid);
  const xy = all.replace(/^M/, '').split(' L').map(s => s.trim().split(/\s+/).map(Number));
  check(P3.length >= 2 && xy.every((q, i) => !i || q[0] === xy[i - 1][0] || q[1] === xy[i - 1][1]), 'Ángulo recto: todos los tramos son horizontales o verticales (' + P3.length + ' codos)');
  await shot('k7-cables');
  // mover un tramo entre dos codos lo traslada entero
  const segPt = await p.evaluate(id => { const w = __banco.state.wires.find(w => w.id === id); return w.pts.length; }, wid);
  if (segPt >= 2) { const before = JSON.parse(await pts()); await dragMouse(await onWire(wid, 0.5), 20, 20); const after = JSON.parse(await pts()); check(after.length === before.length && JSON.stringify(after) !== JSON.stringify(before), 'Arrastrar un tramo entre codos lo mueve sin agregar codos'); }
  const h1 = await p.evaluate(() => { const el = document.querySelector('[data-wpt]'); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const n0 = JSON.parse(await pts()).length; await p.mouse.dblclick(h1[0], h1[1]); await p.waitForTimeout(150);
  check(JSON.parse(await pts()).length === n0 - 1, 'Doble clic en un codo lo quita (' + n0 + ' → ' + await pts() + ')');
  await p.click('[data-act="wclear"]'); await p.waitForTimeout(100);
  check((await pts()) === '[]', 'Quitar codos vuelve al cable curvo');
  const savedLS = await p.evaluate(() => new Promise(r => setTimeout(() => r(localStorage.getItem('banco-uno-v2') || ''), 600)));
  check(savedLS.includes('"pts"'), 'Los codos se guardan con el proyecto');

  // Arduino casero
  await ex('casero'); await p.waitForTimeout(2500);
  let seen = new Set(); for (let i = 0; i < 12; i++) { seen.add((await led(9)) > 0.002); await p.waitForTimeout(150); }
  check(seen.size === 2, 'ATmega328P suelto parpadea el LED en la pata 19 (' + (await status()).slice(0, 30) + ' ' + JSON.stringify(await p.evaluate(() => document.querySelector('#warnings').textContent)) + ')');
  await shot('k7-casero');
  await p.evaluate(() => { const st = __banco.state; st.wires = st.wires.filter(w => !/C4:/.test(w.a + w.b)); __banco.applyState(st); });
  await waitRun(); await p.waitForTimeout(1500);
  check(/sin arrancar/.test(await status()), 'Sin cristal el chip no arranca: ' + (await status()).slice(0, 40));

  // Abrir un diagram.json de Wokwi + sketch.ino
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rym-'));
  fs.writeFileSync(path.join(dir, 'diagram.json'), JSON.stringify({ version: 1, author: 'x', editor: 'wokwi', parts: [
    { type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} },
    { type: 'wokwi-led', id: 'led1', top: -80, left: 120, attrs: { color: 'green' } },
    { type: 'wokwi-resistor', id: 'r1', top: -20, left: 80, attrs: { value: '220' } },
    { type: 'wokwi-ssd1306', id: 'oled', top: -100, left: 300, attrs: {} },
  ], connections: [['uno:7', 'r1:1', 'green', []], ['r1:2', 'led1:A', 'green', []], ['led1:C', 'uno:GND.1', 'black', []]] }));
  fs.writeFileSync(path.join(dir, 'sketch.ino'), 'void setup(){ pinMode(7, OUTPUT); digitalWrite(7, HIGH); Serial.begin(9600); Serial.println("hola wokwi"); }\nvoid loop(){}\n');
  await p.setInputFiles('#openFiles', [path.join(dir, 'diagram.json'), path.join(dir, 'sketch.ino')]);
  await waitRun(); s = await waitSerial(/hola wokwi/);
  const st = await p.evaluate(() => ({ comps: __banco.state.comps.map(c => c.type).join(','), wires: __banco.state.wires.length }));
  check(/hola wokwi/.test(s) && st.comps === 'led,res,oled' && st.wires === 3, `Abre diagram.json + .ino de Wokwi (${st.comps}, ${st.wires} cables)`);
  await p.waitForTimeout(500); check(await led(1) > 0.005, 'El LED del diagrama importado enciende');
  await shot('k7-wokwi-importado');
  // guardar como .json y volver a abrir
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#saveJson')]);
  const saved = path.join(dir, 'proyecto.json'); await dl.saveAs(saved);
  await p.evaluate(() => __banco.applyState(__banco.exampleState('blink')));
  await waitRun();
  await p.setInputFiles('#openFiles', saved); await waitRun(); s = await waitSerial(/hola wokwi/);
  check(/hola wokwi/.test(s) && (await p.evaluate(() => __banco.state.comps.length)) === 3, 'Guarda el proyecto en .json y lo vuelve a abrir (' + dl.suggestedFilename() + ')');

  check(!errs.length, 'Sin errores de JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(ok ? 0 : 1);
})();
