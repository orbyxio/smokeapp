'use client';
import { useEffect, useState } from 'react';
import { supabase, brl } from '@/lib/supabase';

export default function Loja() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [f, setF] = useState({ name: '', phone: '', address: '', payment: 'pix' });
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => supabase.from('products').select('id,name,variants(id,label,price,stock)').order('name')
    .then(({ data }) => setProducts(data || []));
  useEffect(() => { load(); }, []);

  const all = products.flatMap((p) => p.variants.map((v) => ({ ...v, name: p.name })));
  const lines = all.filter((v) => cart[v.id] > 0);
  const subtotal = lines.reduce((s, v) => s + v.price * cart[v.id], 0);
  const setQty = (v, q) => setCart({ ...cart, [v.id]: Math.max(0, Math.min(v.stock, q)) });
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function send(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const items = lines.map((v) => ({ variant_id: v.id, qty: cart[v.id] }));
    const { data, error } = await supabase.rpc('create_order', {
      p_name: f.name, p_phone: f.phone, p_address: f.address, p_payment: f.payment, p_items: items,
    });
    setBusy(false);
    if (error) { setErr(error.message); load(); return; }
    setDone({ id: data, pay: f.payment });
    setCart({});
  }

  if (done) {
    const wa = (t) => `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP}?text=${encodeURIComponent(t)}`;
    return (
      <main>
        <div className="card">
          <h2>Pedido #{done.id} recebido!</h2>
          {done.pay === 'pix' && <p>Pague via Pix para a chave <b>{process.env.NEXT_PUBLIC_PIX_KEY}</b> e envie o comprovante pelo WhatsApp.</p>}
          {done.pay !== 'pix' && <p>O pagamento será feito na entrega.</p>}
          <a className="btn" href={wa(`Acabei de fazer o pedido #${done.id} no site, segue o comprovante.`)}>Enviar comprovante</a>
          <a className="btn" href={wa(`Quero acompanhar meu pedido #${done.id}.`)}>Acompanhar pedido</a>
          <button className="ghost" onClick={() => setDone(null)}>Novo pedido</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Loja</h1>
      {products.map((p) => (
        <div className="card" key={p.id}>
          <b>{p.name}</b>
          {p.variants.map((v) => (
            <div className="row" key={v.id}>
              <span>{v.label} · {brl(v.price)} {v.stock === 0 && <span className="tag">esgotado</span>}</span>
              <span>
                <button className="ghost" type="button" onClick={() => setQty(v, (cart[v.id] || 0) - 1)}>-</button>{' '}
                {cart[v.id] || 0}{' '}
                <button className="ghost" type="button" disabled={v.stock === 0} onClick={() => setQty(v, (cart[v.id] || 0) + 1)}>+</button>
              </span>
            </div>
          ))}
        </div>
      ))}
      {lines.length > 0 && (
        <form className="card" onSubmit={send}>
          <h2>Finalizar · {brl(subtotal)} + entrega</h2>
          <input placeholder="Nome completo" value={f.name} onChange={upd('name')} required />
          <input placeholder="WhatsApp (com DDD)" value={f.phone} onChange={upd('phone')} required />
          <input placeholder="Endereço completo" value={f.address} onChange={upd('address')} required />
          <select value={f.payment} onChange={upd('payment')}>
            <option value="pix">Pix agora</option>
            <option value="card">Cartão na entrega</option>
            <option value="cash">Dinheiro na entrega</option>
          </select>
          {err && <p className="err">{err}</p>}
          <button disabled={busy}>{busy ? 'Enviando...' : 'Confirmar pedido'}</button>
        </form>
      )}
    </main>
  );
}
