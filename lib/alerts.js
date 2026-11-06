// Aviso de pedido novo: som + vibração. O navegador só libera o som depois
// que a pessoa toca em "Ativar som", por isso existe o botão.
let ctx = null;
const KEY = 'som-pedidos';

export function soundOn() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setSound(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (on) unlock();
}

export function unlock() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!ctx) ctx = new C();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}

function tone(freq, start, dur) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export function alertNewOrder() {
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]); } catch {}
  if (!soundOn()) return;
  try {
    unlock();
    if (!ctx) return;
    tone(880, 0, 0.18);
    tone(1175, 0.22, 0.18);
    tone(1568, 0.44, 0.32);
  } catch {}
}

export function setTitleCount(n, base) {
  try { document.title = n > 0 ? `(${n}) ${base}` : base; } catch {}
}
