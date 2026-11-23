// Prueba de la tanda 4c (protoboards con conexión automática): node test/e2e-kits6.cjs [url]
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
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const led = id => p.evaluate(i => __banco.display.led.get(i) || 0, id);
  const center = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  const dragBy = async (sel, dx, dy) => { const [x, y] = await center(sel); await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(x + dx * i / 6, y + dy * i / 6); await p.mouse.up(); await p.waitForTimeout(400); };
  const pos = id => p.evaluate(i => { const c = __banco.state.comps.find(c => c.id === i); return [c.x, c.y]; }, id);

  await ex('protoboard'); await p.waitForTimeout(500);
  check(await led(2) > 0.01 && await led(4) === 0, `LED rojo enchufado enciende sin cables propios: ${((await led(2)) * 1000).toFixed(1)} mA`);
  await p.waitForTimeout(2100);
  check(await led(4) > 0.01 && await led(2) === 0, 'Después se prende el verde (columnas y riel − unidos)');
  check((await p.evaluate(() => document.querySelectorAll('[data-term^="C1:"]').length)) === 400, 'La protoboard de 400 tiene 400 agujeros');
  await shot('k6-protoboard');

  // mover la protoboard arrastra lo que está enchufado y sigue funcionando
  const before = await pos(4);
  await dragBy('[data-comp="1"] rect', 0, 150);
  const after = await pos(4), bb = await pos(1);
  check(bb[1] > 60 && after[1] - before[1] === bb[1] - 60, `Los LED y resistencias se mueven con la protoboard (${before} → ${after})`);
  await p.waitForTimeout(2600);
  const lit = [await led(2), await led(3), await led(4)];
  check(lit.some(x => x > 0.01), 'Sigue funcionando después de moverla: ' + lit.map(x => (x * 1000).toFixed(1)).join(' / ') + ' mA');

  // sacar un LED de la protoboard lo desconecta
  await p.evaluate(() => { __banco.applyState(__banco.exampleState('protoboard')); });
  await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando', null, { timeout: 60000 }); await p.waitForTimeout(500);
  await dragBy('[data-comp="2"] .outline', 0, 300); console.log('  LED en', await pos(2));
  await p.waitForTimeout(400);
  { const v = await led(2); check(v === 0, 'LED fuera de la protoboard: queda desconectado (' + v + ')'); }

  // la grande (830) y la mini (170)
  await p.evaluate(() => { const s = __banco.exampleState('protoboard'); s.comps = [{ id: 1, type: 'bb830', x: 420, y: 60, rot: 0, name: 'PB1', props: {} }, { id: 2, type: 'bb170', x: 700, y: 300, rot: 0, name: 'PB2', props: {} }]; s.wires = []; __banco.applyState(s); });
  await p.waitForTimeout(1500);
  check((await p.evaluate(() => document.querySelectorAll('[data-term^="C1:"]').length)) === 830 && (await p.evaluate(() => document.querySelectorAll('[data-term^="C2:"]').length)) === 170, 'Protoboard de 830 y mini de 170 puntos');
  await shot('k6-tamanos');

  check(!errs.length, 'Sin errores de JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(ok ? 0 : 1);
})();
