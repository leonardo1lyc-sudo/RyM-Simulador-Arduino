/* Paneles plegables (componentes a la izquierda, código a la derecha) para ganar lienzo.
   El estado se recuerda en este navegador. */
const KEY = 'banco-layout';
export function initLayout(){
  const app = document.querySelector('.app');
  let st = { lib: true, code: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const btn = { lib: document.getElementById('togLib'), code: document.getElementById('togCode') };
  function apply(){
    app.classList.toggle('lib-off', !st.lib); app.classList.toggle('code-off', !st.code);
    for (const k in btn) btn[k].setAttribute('aria-pressed', st[k]);
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
  }
  const set = (k, v) => { st[k] = v; apply(); };
  btn.lib.onclick = () => set('lib', !st.lib);
  btn.code.onclick = () => set('code', !st.code);
  for (const b of document.querySelectorAll('[data-collapse]')) b.onclick = () => set(b.dataset.collapse, false);
  for (const b of document.querySelectorAll('[data-expand]')) b.onclick = () => set(b.dataset.expand, true);
  document.getElementById('openAI').onclick = () => {
    set('code', true);
    document.querySelector('[data-tab="ai"]').click();
    setTimeout(() => document.getElementById('aiPrompt')?.focus(), 50);
  };
  apply();
  return { set };
}
