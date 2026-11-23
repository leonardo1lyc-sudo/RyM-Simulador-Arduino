// Asistente de IA: genera el sketch y arma el circuito con las piezas del simulador.
// La clave de la API la pega cada usuario y queda sólo en su navegador (localStorage).
import Anthropic from '@anthropic-ai/sdk';

const CFG_KEY = 'banco-uno-ia';
const PROVIDERS = {
  gemini: { name: 'Google Gemini (gratis)', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…' },
  claude: { name: 'Anthropic Claude (pago por uso)', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…' },
};
const LIBS = 'Servo.h, LiquidCrystal.h, LiquidCrystal_I2C.h, Wire.h, SPI.h, SoftwareSerial.h, Adafruit_GFX.h + Adafruit_SSD1306.h, DHT.h, LedControl.h, TM1637Display.h, Keypad.h, IRremote.hpp, MFRC522.h, RtcDS1302.h (+ThreeWire.h), OneWire.h + DallasTemperature.h, Stepper.h; en placas ESP32 también WiFi.h, WebServer.h, BluetoothSerial.h';

function loadCfg(){ try { return { provider: 'gemini', keys: {}, models: {}, circuit: true, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; } catch { return { provider: 'gemini', keys: {}, models: {}, circuit: true }; } }
function saveCfg(c){ try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch {} }

/* ---------- Instrucciones para el modelo ---------- */
function catalog(TYPES){
  return Object.entries(TYPES).map(([k, t]) => {
    let p = ''; try { const o = t.props(); const keep = Object.fromEntries(Object.entries(o).filter(([n]) => !['pressed', 'contact', 'key'].includes(n))); p = Object.keys(keep).length ? ' props ' + JSON.stringify(keep) : ''; } catch {}
    return `- ${k}: ${t.label} · terminales ${Object.entries(t.terms).map(([id, d]) => d.name && d.name !== id ? `${id} (${d.name})` : id).join(', ')}${p}`;
  }).join('\n');
}
function systemPrompt(TYPES, BOARDS){
  return `Sos el asistente de "Banco Uno", un simulador de Arduino en el navegador con emulación real del microcontrolador. El usuario te pide proyectos en español. Respondés SIEMPRE con un único objeto JSON válido, sin texto fuera de él ni bloques de código markdown.

Formato:
{
  "respuesta": "explicación breve en español (2 a 6 frases): qué hace, cómo usarlo en el simulador y qué conectar",
  "placa": "id de placa",
  "codigo": "sketch Arduino completo (.ino), comentado en español",
  "circuito": { "componentes": [ { "ref": "LED1", "tipo": "led", "props": { "color": "verde" } } ], "conexiones": [ ["B:D13", "R1.a"], ["R1.b", "LED1.a"], ["LED1.k", "B:GND.1"] ] }
}

Reglas del circuito:
- "tipo" debe ser uno de los del catálogo; "ref" es un nombre corto único (LED1, R1, BTN1…).
- Cada conexión une dos terminales: "B:<pin>" para la placa (ids exactos de la lista de la placa) o "<ref>.<terminal>" para un componente.
- Usá los pines de alimentación de la placa (5V o 3V3, y GND.1, GND.2…; podés repetir el mismo GND en varias conexiones).
- Todo LED suelto lleva resistencia en serie (220 Ω). Los pulsadores conviene leerlos con INPUT_PULLUP entre el pin y GND.
- Los pines del circuito y del código deben coincidir. I2C del Uno/Nano: SDA=A4, SCL=A5; Mega: D20/D21.
- Si el usuario sólo pide código o cambios en el código, "circuito" puede ser null y se mantiene el circuito actual.
- Si se te da el circuito actual y piden modificarlo, devolvé el circuito COMPLETO resultante conservando los ref existentes.
- Elegí "placa" entre: ${Object.values(BOARDS).map(b => `${b.id} (${b.name})`).join(', ')}. Mantené la placa actual salvo que el usuario pida otra o el proyecto la necesite.

Librerías disponibles para #include: ${LIBS}.
El monitor serie va a 9600 baudios.

Catálogo de componentes:
${catalog(TYPES)}

Pines de cada placa (ids para "B:<pin>"):
${Object.values(BOARDS).map(b => `- ${b.id}: ${Object.keys(b.terms).join(', ')}`).join('\n')}`;
}
function describeState(st, TYPES){
  const refOf = new Map(st.comps.map(c => [c.id, c.name]));
  const term = k => k.startsWith('B:') ? k : (m => m ? `${refOf.get(+m[1]) || m[1]}.${m[2]}` : k)(/^C(\d+):(.+)$/.exec(k));
  const comps = st.comps.map(c => ({ ref: c.name, tipo: c.type, props: Object.fromEntries(Object.entries(c.props || {}).filter(([k]) => !k.startsWith('_'))) }));
  return `Placa actual: ${st.board}\nCircuito actual: ${JSON.stringify({ componentes: comps, conexiones: st.wires.map(w => [term(w.a), term(w.b)]) })}\nCódigo actual:\n${st.code}`;
}

/* ---------- Llamadas a los proveedores ---------- */
// Si el alias del modelo deja de existir, busca el Flash más nuevo disponible para esa clave.
async function newestFlash(key){
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) return null;
  const ms = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini-[\d.]+-flash$|^gemini-[\d.]+-flash-\d{3}$/.test(n));
  const ver = n => parseFloat(/gemini-([\d.]+)/.exec(n)[1]);
  ms.sort((a, b) => ver(b) - ver(a));
  return ms[0] || null;
}
async function askGemini(key, model, system, user, retried){
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 16000 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 && !retried) { const alt = await newestFlash(key); if (alt && alt !== model) return askGemini(key, alt, system, user, true); }
  if (!r.ok) throw new Error(r.status === 400 && /API key/i.test(j.error?.message || '') ? 'La clave de Gemini no es válida.' : r.status === 429 ? 'Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto (o hasta mañana) y vuelve a intentar.' : `Gemini respondió ${r.status}: ${j.error?.message || 'error'}`);
  const cand = j.candidates?.[0];
  const txt = (cand?.content?.parts || []).map(p => p.text || '').join('');
  if (!txt) throw new Error(cand?.finishReason === 'SAFETY' ? 'Gemini rechazó el pedido.' : 'Gemini no devolvió respuesta.');
  return txt;
}
async function askClaude(key, model, system, user){
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  try {
    const msg = await client.beta.messages.create({
      model, max_tokens: 16000, system,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: user }],
    });
    if (msg.stop_reason === 'refusal') throw new Error('Claude rechazó el pedido.');
    return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La clave de Claude no es válida.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Claude está limitando pedidos; espera un momento.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude respondió ${e.status}: ${e.message}`);
    throw e;
  }
}
function parseJson(txt){
  const s = txt.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('La IA no devolvió un resultado legible. Prueba de nuevo.');
}

/* ---------- Del JSON de la IA al estado del simulador ---------- */
export function buildCircuit(spec, prev, TYPES, BOARDS, boardId, wireColor){
  const notes = [], BRD = BOARDS[boardId];
  const comps = [], byRef = new Map(), counters = {};
  let id = 1;
  for (const c of spec.componentes || []) {
    const t = TYPES[c.tipo];
    if (!t) { notes.push(`Se omitió «${c.ref}»: el simulador no tiene el tipo «${c.tipo}».`); continue; }
    const ref = String(c.ref || t.prefix + id);
    if (byRef.has(ref)) { notes.push(`Referencia repetida «${ref}» omitida.`); continue; }
    const old = prev.comps.find(o => o.name === ref && o.type === c.tipo);
    const props = { ...t.props(), ...(old ? old.props : {}), ...(c.props && typeof c.props === 'object' ? c.props : {}) };
    const comp = { id: id++, type: c.tipo, x: old ? old.x : null, y: old ? old.y : null, rot: old ? old.rot : 0, name: ref, props };
    comps.push(comp); byRef.set(ref, comp);
    const m = /(\d+)$/.exec(ref); counters[c.tipo] = Math.max(counters[c.tipo] || 0, m ? +m[1] : 1);
  }
  // Coloca primero las piezas en el orden en que aparecen en las conexiones (así R1 queda junto a LED1).
  const order = new Map(); (spec.conexiones || []).flat().forEach((t, i) => { const r = String(t).split(/[.:]/)[0]; if (!order.has(r)) order.set(r, i); });
  const free = comps.filter(c => c.x == null).sort((a, b) => (order.get(a.name) ?? 1e9) - (order.get(b.name) ?? 1e9));
  layout(free, comps.filter(c => c.x != null), BRD, TYPES);
  const key = s => {
    s = String(s).trim();
    if (s.startsWith('B:')) return BRD.terms[s.slice(2)] ? s : (BRD.terms[s.slice(2) + '.1'] ? s + '.1' : null);
    const m = /^(.+?)[.:]([^.:]+)$/.exec(s); if (!m) return null;
    const c = byRef.get(m[1]); if (!c) return null;
    return TYPES[c.type].terms[m[2]] ? `C${c.id}:${m[2]}` : null;
  };
  const wires = [], seen = new Set();
  for (const pair of spec.conexiones || []) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const a = key(pair[0]), b = key(pair[1]);
    if (!a || !b) { notes.push(`Conexión omitida: ${pair[0]} → ${pair[1]} (terminal desconocido).`); continue; }
    const h = [a, b].sort().join('|'); if (a === b || seen.has(h)) continue; seen.add(h);
    wires.push({ id: 1000 + wires.length, a, b, pts: [], color: wireColor(a, b, wires.length) });
  }
  return { comps, wires, counters, notes };
}
function layout(free, placed, BRD, TYPES){
  if (!free.length) return;
  let bx1 = 1e9, by1 = 1e9, bx2 = -1e9, by2 = -1e9;
  for (const t of Object.values(BRD.terms)) { bx1 = Math.min(bx1, t.x); by1 = Math.min(by1, t.y); bx2 = Math.max(bx2, t.x); by2 = Math.max(by2, t.y); }
  const busy = placed.map(c => { const b = TYPES[c.type].box || [-40, -40, 80, 80]; return [c.x + b[0], c.y + b[1], c.x + b[0] + b[2], c.y + b[1] + b[3]]; });
  busy.push([bx1 - 50, by1 - 50, bx2 + 50, by2 + 50]);
  const hit = r => busy.some(o => r[0] < o[2] + 20 && r[2] + 20 > o[0] && r[1] < o[3] + 20 && r[3] + 20 > o[1]);
  for (const c of free) {
    const b = TYPES[c.type].box || [-40, -40, 80, 80];
    let done = false;
    for (let y = 40; y < 1400 && !done; y += 20) for (let x = Math.max(40, bx2 + 90); x < 1080 && !done; x += 20) {
      const r = [x, y, x + b[2], y + b[3]];
      if (!hit(r)) { c.x = Math.round((x - b[0]) / 10) * 10; c.y = Math.round((y - b[1]) / 10) * 10; busy.push(r); done = true; }
    }
    if (!done) { c.x = 700; c.y = 700 + busy.length * 40; }
  }
}

/* ---------- Interfaz ---------- */
export function initAI(api){
  const $ = s => document.querySelector(s);
  const cfg = loadCfg();
  const provSel = $('#aiProvider'), keyIn = $('#aiKey'), modelIn = $('#aiModel'), out = $('#aiOut'), form = $('#aiForm'), prompt = $('#aiPrompt'), circ = $('#aiCircuit'), undo = $('#aiUndo'), go = $('#aiGo');
  provSel.innerHTML = Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  const sync = () => {
    const p = PROVIDERS[cfg.provider];
    provSel.value = cfg.provider; keyIn.value = cfg.keys[cfg.provider] || ''; keyIn.placeholder = p.keyHint;
    modelIn.value = cfg.models[cfg.provider] || p.model; $('#aiKeyLink').href = p.keyUrl;
    $('#aiSetup').open = !cfg.keys[cfg.provider];
    circ.checked = cfg.circuit !== false;
  };
  sync();
  provSel.addEventListener('change', () => { cfg.provider = provSel.value; saveCfg(cfg); sync(); });
  keyIn.addEventListener('change', () => { cfg.keys[cfg.provider] = keyIn.value.trim(); saveCfg(cfg); });
  modelIn.addEventListener('change', () => { const v = modelIn.value.trim(); if (v && v !== PROVIDERS[cfg.provider].model) cfg.models[cfg.provider] = v; else delete cfg.models[cfg.provider]; saveCfg(cfg); });
  circ.addEventListener('change', () => { cfg.circuit = circ.checked; saveCfg(cfg); });
  for (const b of document.querySelectorAll('[data-ai-idea]')) b.addEventListener('click', () => { prompt.value = b.dataset.aiIdea; prompt.focus(); });
  prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });

  let before = null;
  const msg = (html, cls = '') => { out.insertAdjacentHTML('beforeend', `<div class="aimsg ${cls}">${html}</div>`); out.scrollTop = out.scrollHeight; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  undo.addEventListener('click', () => { if (!before) return; api.applyState(before); before = null; undo.hidden = true; msg('Se restauró el circuito y el código anteriores.', 'sys'); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = prompt.value.trim(); if (!text) return;
    const key = (cfg.keys[cfg.provider] || '').trim();
    if (!key) { $('#aiSetup').open = true; keyIn.focus(); msg('Primero pega tu clave de API (es gratis en Google AI Studio).', 'bad'); return; }
    const model = cfg.models[cfg.provider] || PROVIDERS[cfg.provider].model;
    const st = api.getState();
    const wantCircuit = circ.checked;
    const user = `${describeState(st, api.TYPES)}\n\nPedido del usuario: ${text}\n\n${wantCircuit ? 'Arma también el circuito completo en "circuito".' : 'NO cambies el circuito: devuelve "circuito": null.'}`;
    msg(esc(text), 'me'); prompt.value = ''; go.disabled = true; go.textContent = 'Pensando…';
    try {
      const sys = systemPrompt(api.TYPES, api.BOARDS);
      const raw = cfg.provider === 'claude' ? await askClaude(key, model, sys, user) : await askGemini(key, model, sys, user);
      const r = parseJson(raw);
      if (typeof r.codigo !== 'string' || !r.codigo.trim()) throw new Error('La IA no devolvió código.');
      const board = api.BOARDS[r.placa] ? r.placa : st.board;
      before = JSON.parse(JSON.stringify(st, (k, v) => k.startsWith('_') ? undefined : v));
      let next = { ...before, board, code: r.codigo };
      let notes = [];
      if (wantCircuit && r.circuito && Array.isArray(r.circuito.componentes)) {
        const c = buildCircuit(r.circuito, st.board === board ? before : { comps: [] }, api.TYPES, api.BOARDS, board, api.wireColor);
        next = { ...next, comps: c.comps, wires: c.wires, counters: c.counters, nextId: 2000 };
        notes = c.notes;
      }
      api.applyState(next);
      undo.hidden = false; $('#aiSetup').open = false;
      msg(esc(r.respuesta || 'Listo.') + (notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '') + `<small>${wantCircuit && r.circuito ? `Circuito armado con ${next.comps.length} piezas y ${next.wires.length} cables. ` : ''}Código cargado en el editor.</small>`, 'ai');
    } catch (err) {
      msg(esc(err.message || String(err)), 'bad');
    } finally { go.disabled = false; go.textContent = 'Generar'; }
  });
}
