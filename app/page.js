'use client';
import { useEffect, useState } from 'react';
import { supabase, brl } from '@/lib/supabase';

// Cada produto ganha uma cor própria (matiz derivado do nome) — o "camaleão"
const hue = (s = '') => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

const PAY = [
  { id: 'pix', icon: '⚡', label: 'Pix', sub: 'agora' },
  { id: 'card', icon: '💳', label: 'Cartão', sub: 'na entrega' },
  { id: 'cash', icon: '💵', label: 'Dinheiro', sub: 'na entrega' },
];

export default function Loja() {
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cart, setCart] = useState({});
  const [f, setF] = useState({ name: '', phone: '', address: '', payment: 'pix' });
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => supabase.from('products').select('id,name,variants(id,label,price,stock)').order('name')
    .then(({ data }) => { setProducts(data || []); setLoaded(true); });
  useEffect(() => { load(); }, []);

  const all = products.flatMap((p) => p.variants.map((v) => ({ ...v, name: p.name })));
  const lines = all.filter((v) => cart[v.id] > 0);
  const subtotal = lines.reduce((s, v) => s + v.price * cart[v.id], 0);
  const count = lines.reduce((s, v) => s + cart[v.id], 0);
  const setQty = (v, q) => setCart({ ...cart, [v.id]: Math.max(0, Math.min(v.stock, q)) });
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const copy = async (t) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  async function send(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const items = lines.map((v) => ({ variant_id: v.id, qty: cart[v.id] }));
    const { data, error } = await supabase.rpc('create_order', {
      p_name: f.name, p_phone: f.phone, p_address: f.address, p_payment: f.payment, p_items: items,
    });
    setBusy(false);
    if (error) { setErr(error.message); load(); return; }
    setOpen(false);
    setDone({ id: data, pay: f.payment });
    setCart({});
  }

  if (done) {
    const wa = (t) => `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP}?text=${encodeURIComponent(t)}`;
    const pix = process.env.NEXT_PUBLIC_PIX_KEY;
    return (
      <main>
        <div className="card done">
          <div className="check">✓</div>
          <h2>Pedido #{done.id} recebido!</h2>
          {done.pay === 'pix' ? (
            <>
              <p className="muted">Pague via Pix para a chave abaixo e envie o comprovante pelo WhatsApp.</p>
              <div className="pixbox">
                <span>{pix}</span>
                <button type="button" className="ghost" onClick={() => copy(pix)}>
                  {copied ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">O pagamento será feito na entrega.</p>
          )}
          <div className="stack">
            <a className="btn cta" href={wa(`Acabei de fazer o pedido #${done.id} no site, segue o comprovante.`)}>Enviar comprovante</a>
            <a className="btn ghost" href={wa(`Quero acompanhar meu pedido #${done.id}.`)}>Acompanhar pedido</a>
            <button className="ghost" onClick={() => setDone(null)}>Novo pedido</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="hero">
        <h1>Loja</h1>
        <p>Escolha, finalize em segundos e acompanhe pelo WhatsApp.</p>
        <div className="chips">
          <span className="chip">⚡ Pix</span>
          <span className="chip">💳 Cartão na entrega</span>
          <span className="chip">💵 Dinheiro</span>
        </div>
      </header>

      {!loaded && (<><div className="sk" /><div className="sk" /><div className="sk" /></>)}

      {loaded && products.length === 0 && (
        <div className="card"><p className="muted">Nenhum produto disponível no momento.</p></div>
      )}

      {products.map((p, i) => (
        <section className="card prod" key={p.id} style={{ '--h': hue(p.name), '--i': i }}>
          <h3>{p.name}</h3>
          {p.variants.map((v) => {
            const q = cart[v.id] || 0;
            return (
              <div className={`var${v.stock === 0 ? ' soldout' : ''}`} key={v.id}>
                <div className="var-info">
                  <b>{v.label}</b>
                  <span>
                    <span className="price">{brl(v.price)}</span>{' '}
                    {v.stock === 0 && <span className="tag bad">esgotado</span>}
                  </span>
                </div>
                <div className={`qty${q > 0 ? ' on' : ''}`}>
                  <button className="ghost" type="button" aria-label="Diminuir" disabled={q === 0} onClick={() => setQty(v, q - 1)}>−</button>
                  <span>{q}</span>
                  <button className="ghost" type="button" aria-label="Aumentar" disabled={v.stock === 0 || q >= v.stock} onClick={() => setQty(v, q + 1)}>+</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {lines.length > 0 && !open && (
        <div className="cartbar">
          <div>
            <small>{count} {count === 1 ? 'item' : 'itens'}</small>
            <b>{brl(subtotal)}</b>
          </div>
          <button type="button" onClick={() => setOpen(true)}>Ver pedido →</button>
        </div>
      )}

      {open && lines.length > 0 && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <form className="sheet" onSubmit={send}>
            <div className="grab" />
            <h2>Finalizar pedido</h2>

            <div className="sum">
              {lines.map((v) => (
                <div className="sumline" key={v.id}>
                  <span>{cart[v.id]}× {v.name} · {v.label}</span>
                  <b>{brl(v.price * cart[v.id])}</b>
                </div>
              ))}
              <div className="sumline total"><span>Subtotal</span><b>{brl(subtotal)}</b></div>
              <p className="muted" style={{ margin: 0 }}>+ entrega</p>
            </div>

            <input placeholder="Nome completo" autoComplete="name" value={f.name} onChange={upd('name')} required />
            <input type="tel" inputMode="tel" placeholder="WhatsApp (com DDD)" autoComplete="tel" value={f.phone} onChange={upd('phone')} required />
            <input placeholder="Endereço completo" autoComplete="street-address" value={f.address} onChange={upd('address')} required />

            <div className="paygrid">
              {PAY.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className={`opt${f.payment === o.id ? ' on' : ''}`}
                  onClick={() => setF({ ...f, payment: o.id })}
                >
                  <i>{o.icon}</i>{o.label}<small>{o.sub}</small>
                </button>
              ))}
            </div>

            {err && <p className="err">{err}</p>}
            <button className="cta" disabled={busy}>{busy ? 'Enviando...' : `Confirmar pedido · ${brl(subtotal)}`}</button>
            <button type="button" className="ghost" style={{ width: '100%' }} onClick={() => setOpen(false)}>Voltar e editar</button>
          </form>
        </>
      )}
    </main>
  );
}
