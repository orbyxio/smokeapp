import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAY = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' };
const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

// Chamado pelo banco (Supabase) toda vez que entra um pedido novo.
export async function POST(request) {
  if (!process.env.PUSH_SECRET || request.headers.get('x-push-secret') !== process.env.PUSH_SECRET) {
    return new Response('negado', { status: 401 });
  }
  let id;
  try { id = (await request.json()).order_id; } catch { return new Response('ruim', { status: 400 }); }
  if (!id) return new Response('ruim', { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: o } = await db.from('orders').select('id,total,payment_method,address').eq('id', id).single();
  if (!o) return new Response('sem pedido', { status: 404 });
  const { data: subs } = await db.from('push_subscriptions').select('*');

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contato@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const pay = PAY[o.payment_method] || 'Pedido';
  const msg = {
    admin: { title: 'Pedido novo', body: `${pay}: ${brl(o.total)}`, tag: `p${o.id}`, url: '/admin' },
    courier: { title: 'Entrega nova', body: o.address || `${pay}: ${brl(o.total)}`, tag: `p${o.id}`, url: '/entregas' },
  };

  let sent = 0;
  const errors = [];
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg[s.kind] || msg.admin),
        { TTL: 3600, urgency: 'high' },
      );
      sent++;
    } catch (e) {
      errors.push({ kind: s.kind, status: e && e.statusCode, msg: String((e && (e.body || e.message)) || e).slice(0, 200) });
      if (e && e.statusCode === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }));
  return Response.json({ ok: true, sent, subs: (subs || []).length, errors });
}
