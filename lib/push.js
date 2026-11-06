import { supabase } from '@/lib/supabase';

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!PUB;
}

function key(b64) {
  const p = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushActive() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return !!(reg && (await reg.pushManager.getSubscription()));
  } catch { return false; }
}

// kind: 'admin' ou 'courier'. Devolve { ok, erro }
export async function enablePush(kind) {
  try {
    if (!pushSupported()) return { ok: false, erro: 'Este aparelho/navegador não suporta. No iPhone, abra pelo ícone do app instalado.' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, erro: 'Permissão negada. Ative em Ajustes do iPhone > Notificações > este app.' };
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(PUB) });
    const j = sub.toJSON();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, kind, user_id: u?.user?.id,
    }, { onConflict: 'endpoint' });
    if (error) return { ok: false, erro: 'Não consegui salvar: ' + error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e && e.message || e) };
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {}
}
