// Modo compatible de ESP32: canal interno con el programa (Serial3 = red simulada, Serial1 = Bluetooth).
// El programa envía eventos (0x05 tipo:dato\n) y respuestas HTTP (entre 0x02 y 0x04); el panel Navegador
// le envía peticiones HTTP en texto.
const HOST = '192.168.1.50';
const dec = new TextDecoder();

export class Esp32Link {
  constructor(write){ this.write = write; this.reset(); }
  reset(){
    this.wifi = null; this.ap = null; this.port = 0; this.bt = null; this.warn = new Set(); this.events = [];
    this.ev = null; this.resp = null; this.queue = []; this.pending = null; this.btText = ''; this.ver = 0; this.started = 0;
  }
  // bytes que el programa escribe en Serial1 (Bluetooth) y Serial3 (red)
  onByte(n, b){
    if (n === 1) { this.btText += String.fromCharCode(b); return; }
    if (n !== 3) return;
    if (this.ev) { if (b === 10) { this.event(dec.decode(new Uint8Array(this.ev))); this.ev = null; } else this.ev.push(b); return; }
    if (this.resp) { if (b === 4) { const r = this.resp; this.resp = null; this.response(new Uint8Array(r)); } else this.resp.push(b); return; }
    if (b === 5) this.ev = []; else if (b === 2) this.resp = [];
  }
  event(s){
    const i = s.indexOf(':'), t = s.slice(0, i), d = s.slice(i + 1);
    if (t === 'W') { this.wifi = { ssid: d, connected: false }; }
    else if (t === 'C') { if (this.wifi) this.wifi.connected = true; }
    else if (t === 'D') { if (this.wifi) this.wifi.connected = false; }
    else if (t === 'A') { this.ap = d; }
    else if (t === 'S') { this.port = +d || 80; if (!this.started) { this.started = 1; this.onServer && this.onServer(); } }
    else if (t === 'B') { this.bt = d || 'ESP32'; }
    else if (t === 'X') this.warn.add(`El ESP32 intentó conectarse a ${d || 'internet'}: en la simulación no hay internet, solo el panel Navegador puede conectarse al ESP32.`);
    else if (t === 'T') this.warn.add(`Las tareas de FreeRTOS (xTaskCreate${d ? ' «' + d + '»' : ''}) no se simulan: el modo compatible tiene un solo núcleo. Pon ese código en loop().`);
    else if (t === 'I') this.warn.add(`GPIO${d}: en la simulación este pin no admite interrupciones. Usa GPIO 0, 4, 5, 12, 13, 14, 15, 18, 19, 21, 22, 23, 27 o 34–39.`);
    else if (t === 'Z') this.events.push(`Sueño profundo${+d ? ` por ${(+d / 1000).toFixed(1).replace('.', ',')} s` : ''}`);
    else if (t === 'R') this.events.push('ESP.restart(): el ESP32 se reinicia');
    this.ver++;
  }
  // ---- Navegador ----
  host(){ return this.ap && !(this.wifi && this.wifi.connected) ? '192.168.4.1' : HOST; }
  request(method, path, body = '', cb){
    this.queue.push({ method, path, body, cb }); this.pump();
  }
  pump(){
    if (this.pending || !this.queue.length) return;
    const r = this.pending = this.queue.shift(); r.t0 = performance.now();
    let txt = `${r.method} ${r.path} HTTP/1.1\r\nHost: ${this.host()}\r\n`;
    if (r.body) txt += `Content-Type: application/x-www-form-urlencoded\r\nContent-Length: ${new TextEncoder().encode(r.body).length}\r\n`;
    txt += '\r\n' + r.body;
    this.write([...new TextEncoder().encode(txt)], 3);
  }
  response(bytes){
    const r = this.pending; this.pending = null;
    let status = 200, type = 'text/html', headers = {}, body = bytes;
    if (/^HTTP\/1\.[01] \d+/.test(dec.decode(bytes.subarray(0, 16)))) {
      let k = -1; for (let i = 0; i + 3 < bytes.length; i++) if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) { k = i; break; }
      const head = dec.decode(k >= 0 ? bytes.subarray(0, k) : bytes); body = k >= 0 ? bytes.subarray(k + 4) : new Uint8Array(0);
      const lines = head.split('\r\n'); status = +lines[0].split(' ')[1];
      for (const l of lines.slice(1)) { const j = l.indexOf(':'); if (j > 0) headers[l.slice(0, j).trim().toLowerCase()] = l.slice(j + 1).trim(); }
      type = headers['content-type'] || 'text/html';
      const n = +headers['content-length']; if (headers['content-length'] && !isNaN(n)) body = body.subarray(0, n); // cuenta en bytes, no en caracteres
    }
    if (r && r.cb) r.cb({ status, type, headers, body: dec.decode(body), ms: performance.now() - r.t0 });
    this.pump();
  }
  // sin respuesta en 4 s (por ejemplo, si el programa no llama a server.handleClient())
  check(now){
    const r = this.pending; if (!r || now - r.t0 < 4000) return;
    this.pending = null; this.resp = null;
    if (r.cb) r.cb({ status: 0, type: 'text/plain', headers: {}, body: '', timeout: true });
    this.pump();
  }
}

// Script que se inyecta en la página para que enlaces, formularios y fetch() vayan al ESP32 simulado
export const PAGE_SHIM = `<script>(function(){
var seq=0,wait={};
function go(href,method,body){parent.postMessage({banco:'nav',href:href,method:method||'GET',body:body||''},'*');}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(/^(https?:)?\\/\\//.test(h)&&h.indexOf('${HOST}')<0)return;e.preventDefault();go(h);});
document.addEventListener('submit',function(e){e.preventDefault();var f=e.target,d=new URLSearchParams(new FormData(f)).toString(),m=(f.getAttribute('method')||'GET').toUpperCase(),a=f.getAttribute('action')||'';if(m==='GET')go(a.split('?')[0]+'?'+d);else go(a,m,d);});
window.fetch=function(u,o){o=o||{};var id=++seq;return new Promise(function(ok,ko){wait[id]=[ok,ko];parent.postMessage({banco:'fetch',id:id,href:String(u),method:(o.method||'GET').toUpperCase(),body:typeof o.body==='string'?o.body:(o.body instanceof URLSearchParams?o.body.toString():'')},'*');});};
function X(){this.readyState=0;this.status=0;this.responseText='';}
X.prototype.open=function(m,u){this._m=m;this._u=u;this.readyState=1;};X.prototype.setRequestHeader=function(){};
X.prototype.send=function(b){var x=this;fetch(x._u,{method:x._m,body:b||''}).then(function(r){return r.text().then(function(t){x.status=r.status;x.responseText=t;x.response=t;x.readyState=4;if(x.onreadystatechange)x.onreadystatechange();if(x.onload)x.onload();});});};
window.XMLHttpRequest=X;
// imágenes servidas por el ESP32 (por ejemplo, la foto de la ESP32-CAM): se piden por el canal simulado
var imgWait={};
function ext(h){return /^(https?:)?\\/\\//.test(h)&&h.indexOf('${HOST}')<0&&h.indexOf('192.168.4.1')<0;}
function imgs(){var l=document.images;for(var i=0;i<l.length;i++){var im=l[i],h=im.getAttribute('src');if(!h||/^(data|blob):/.test(h)||ext(h)||im.dataset.bancoSrc===h)continue;im.dataset.bancoSrc=h;var id=++seq;imgWait[id]=im;parent.postMessage({banco:'img',id:id,href:h},'*');}}
new MutationObserver(imgs).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
document.addEventListener('DOMContentLoaded',imgs);
window.addEventListener('message',function(e){var d=e.data;if(!d||d.banco!=='img'||!imgWait[d.id])return;var im=imgWait[d.id];delete imgWait[d.id];if(d.src){im.src=d.src;im.dataset.bancoSrc=d.src;if(im.onload)setTimeout(function(){im.dispatchEvent(new Event('load'));},0);}else im.dispatchEvent(new Event('error'));});
window.addEventListener('message',function(e){var d=e.data;if(!d||d.banco!=='resp'||!wait[d.id])return;var w=wait[d.id];delete wait[d.id];
 if(d.error){w[1](new TypeError(d.error));return;}
 w[0]({ok:d.status>=200&&d.status<300,status:d.status,headers:{get:function(k){return (d.headers||{})[k.toLowerCase()]||null;}},text:function(){return Promise.resolve(d.body);},json:function(){return Promise.resolve(JSON.parse(d.body));}});});
})();</script>`;
