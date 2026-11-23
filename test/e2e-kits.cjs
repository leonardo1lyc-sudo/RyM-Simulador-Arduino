// Prueba de los módulos de la tanda 3a (kit KY, humedad de suelo, agua, relés, semáforo): node test/e2e-kits.cjs [url]
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando' || /Error/.test(document.querySelector('#status').textContent), null, { timeout: 60000 }); };
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const lastLine = async () => { const s = (await serial()).split('\n'); s.pop(); return (s[s.length - 1] || '').trim(); }; // última línea completa
  const val = (line, k) => { const m = new RegExp(k + '=(-?\\d+)').exec(line); return m ? +m[1] : NaN; };
  const comp = t => `__banco.state.comps.find(c => c.type === '${t}')`;
  const set = (t, k, v) => p.evaluate(([t, k, v]) => { const c = __banco.state.comps.find(c => c.type === t); c.props[k] = v; __banco.refresh(); }, [t, k, v]);

  // un circuito con todos los módulos conectados a un Uno
  const parts = [
    ['soil', { AO: 'A0', DO: 'D2' }], ['ntc', { S: 'A1' }], ['water', { S: 'A2' }], ['ldrmod', { S: 'A3' }],
    ['irobst', { OUT: 'D3' }], ['kybtn', { S: 'D4' }], ['touch', { SIG: 'D5' }], ['reed', { S: 'D6' }], ['sound', { DO: 'D7' }],
    ['relay4', { IN1: 'D8', IN2: 'D9', IN3: 'D10', IN4: 'D11' }], ['traffic', { R: 'D12', Y: 'D13', G: 'A4' }], ['buzza', { S: 'A5' }],
  ];
  const st = await p.evaluate(parts => {
    const comps = [], wires = []; let w = 100;
    parts.forEach(([t, pins], i) => {
      const id = i + 1, def = __banco.TYPES[t];
      comps.push({ id, type: t, x: 640 + (i % 5) * 95, y: 110 + Math.floor(i / 5) * 190, rot: 0, name: def.prefix + id, props: def.props() });
      for (const [term, pin] of Object.entries(pins)) wires.push({ id: w++, a: `C${id}:${term}`, b: 'B:' + pin, pts: [], color: '#f9a825' });
      if (def.terms.VCC && !['laser', 'buzza'].includes(t)) wires.push({ id: w++, a: `C${id}:VCC`, b: 'B:5V', pts: [], color: '#e53935' });
      if (def.terms.GND) wires.push({ id: w++, a: `C${id}:GND`, b: 'B:GND.' + (1 + i % 3), pts: [], color: '#212121' });
    });
    return { board: 'uno', comps, wires, counters: {}, nextId: 500, code: `int claps = 0; bool prev = false;
void setup() {
  Serial.begin(115200);
  pinMode(4, INPUT); pinMode(6, INPUT);
  for (int p = 8; p <= 13; p++) pinMode(p, OUTPUT);
  pinMode(A4, OUTPUT); pinMode(A5, OUTPUT);
  digitalWrite(8, LOW); digitalWrite(9, HIGH); digitalWrite(10, LOW); digitalWrite(11, HIGH);
  digitalWrite(12, HIGH); digitalWrite(13, LOW); digitalWrite(A4, HIGH); digitalWrite(A5, HIGH);
}
unsigned long t = 0;
void loop() {
  bool s = digitalRead(7); if (s && !prev) claps++; prev = s;
  if (millis() - t < 100) return; t = millis();
  Serial.print("suelo="); Serial.print(analogRead(A0)); Serial.print(" sueloDO="); Serial.print(digitalRead(2));
  Serial.print(" ntc="); Serial.print(analogRead(A1)); Serial.print(" agua="); Serial.print(analogRead(A2)); Serial.print(" luz="); Serial.print(analogRead(A3));
  Serial.print(" ir="); Serial.print(digitalRead(3)); Serial.print(" btn="); Serial.print(digitalRead(4)); Serial.print(" tch="); Serial.print(digitalRead(5));
  Serial.print(" reed="); Serial.print(digitalRead(6)); Serial.print(" claps="); Serial.println(claps);
}
` };
  }, parts);
  await p.evaluate(s => __banco.applyState(s), st); await waitRun();
  const stt = await p.evaluate(() => document.querySelector('#status').textContent + ' ' + document.querySelector('#err').textContent);
  if (!/Simulando/.test(stt)) console.log('  compilación:', stt.slice(0, 400));
  await p.waitForTimeout(1200);
  let L = await lastLine();
  check(Math.abs(val(L, 'suelo') - 801) < 15 && val(L, 'sueloDO') === 1, 'Suelo seco (35 %): ' + L.slice(0, 22));
  check(Math.abs(val(L, 'ntc') - 512) < 6, 'Termistor a 25 °C: ntc=' + val(L, 'ntc'));
  check(Math.abs(val(L, 'agua') - 398) < 15, 'Nivel de agua 15 mm: agua=' + val(L, 'agua'));
  check(Math.abs(val(L, 'luz') - 112) < 8, 'LDR 200 lux: luz=' + val(L, 'luz'));
  check(val(L, 'ir') === 1 && val(L, 'btn') === 1 && val(L, 'tch') === 0 && val(L, 'reed') === 1, 'Digitales en reposo: ' + L.slice(L.indexOf('ir=')));
  const rel = await p.evaluate(`[1, 2, 3, 4].map(i => !!(${comp('relay4')})._on[i])`);
  check(JSON.stringify(rel) === '[true,false,true,false]', 'Relé 4 canales (activos en LOW): ' + JSON.stringify(rel));
  const tl = await p.evaluate(`(c => ['r', 'y', 'g'].map(k => __banco.display.led.get(c.id + ':' + k) || 0))(${comp('traffic')})`);
  check(tl[0] > 0.005 && tl[1] < 1e-4 && tl[2] > 0.005, 'Semáforo rojo y verde encendidos: ' + tl.map(v => (v * 1000).toFixed(1) + ' mA').join(' / '));
  check(await p.evaluate(`(${comp('buzza')})._freq`) === 2300, 'Zumbador activo suena con S en HIGH');
  await p.screenshot({ path: path.join(OUT, 'k-kit.png') });

  await set('soil', 'hum', 80); await set('irobst', 'cm', 5); await set('reed', 'magnet', true); await set('ntc', 'temp', 60);
  await p.evaluate(`__banco.setPressed(${comp('kybtn')}, true); __banco.setPressed(${comp('touch')}, true)`);
  for (let i = 0; i < 2; i++) { await p.evaluate(`__banco.simDevs.get((${comp('sound')}).id).tap()`); await p.waitForTimeout(300); }
  await p.waitForTimeout(400);
  L = await lastLine();
  check(Math.abs(val(L, 'suelo') - 516) < 15 && val(L, 'sueloDO') === 0, 'Suelo húmedo (80 %): ' + L.slice(0, 22));
  check(val(L, 'ntc') < 250 && val(L, 'ntc') > 150, 'Termistor a 60 °C: ntc=' + val(L, 'ntc'));
  check(val(L, 'ir') === 0 && val(L, 'btn') === 0 && val(L, 'tch') === 1 && val(L, 'reed') === 0, 'Digitales activados: ' + L.slice(L.indexOf('ir=')));
  check(val(L, 'claps') === 2, 'Micrófono: 2 aplausos contados (' + val(L, 'claps') + ')');
  await p.evaluate(`__banco.setPressed(${comp('kybtn')}, false); __banco.setPressed(${comp('touch')}, false)`);
  await p.waitForTimeout(300);
  L = await lastLine(); check(val(L, 'btn') === 1 && val(L, 'tch') === 0, 'Al soltar vuelven a reposo');

  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
