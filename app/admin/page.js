'use client';
import { useEffect, useRef, useState } from 'react';
import Auth from '@/components/Auth';
import { supabase, brl } from '@/lib/supabase';

const PAY = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' };

function Pedidos() {
  const [rows, setRows] = useState([]);
  const load = () => supabase.from('orders').select('*, order_items(item_label, qty)')
    .order('id', { ascending: false }).limit(50).then(({ data }) => setRows(data || []));
  useEffect(() => {
    load();
    const ch = supabase.channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);
  const act = async (fn, id) => { const { error } = await supabase.rpc(fn, { p_id: id }); if (error) alert(error.message); load(); };
  return rows.map((o) => (
    <div className="card" key={o.id}>
      <div className="row"><b>#{o.id} · {o.customer_name}</b><span className="tag">{o.status}</span></div>
      <p>{o.order_items.map((i) => `${i.qty}x ${i.item_label}`).join(', ')}</p>
      <p className="muted">{o.address} · {o.customer_phone}</p>
      <p>{brl(o.total)} · {PAY[o.payment_method]} · {o.payment_status}</p>
      {o.payment_status === 'pendente' && o.status !== 'cancelado' && <button onClick={() => act('mark_paid', o.id)}>Confirmar pagamento</button>}{' '}
      {['novo', 'em_entrega'].includes(o.status) && <button className="ghost" onClick={() => confirm('Cancelar pedido?') && act('cancel_order', o.id)}>Cancelar</button>}
    </div>
  ));
}

/* ---------- Fotos dos produtos (Supabase Storage, bucket "produtos") ---------- */
// Reduz a foto no próprio celular antes de enviar (máx. 900px, JPEG):
// uma foto de 4 MB vira ~100 KB e a loja continua rápida.
async function shrink(file, max = 900) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Não foi possível ler essa imagem'));
      i.src = url;
    });
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r);
    c.height = Math.round(img.height * r);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao preparar a imagem'))), 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function sendPhoto(file, productId) {
  const blob = await shrink(file);
  const path = `p${productId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('produtos')
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('produtos').getPublicUrl(path).data.publicUrl;
}

const thumb = {
  width: 64, height: 64, flex: 'none', borderRadius: 14, objectFit: 'cover',
  background: 'linear-gradient(135deg,#e4dcff,#fbd3ee)', display: 'grid', placeItems: 'center',
  fontWeight: 800, fontSize: 22, color: '#8f3bff',
};

function Thumb({ src, name }) {
  return src
    ? <img src={src} alt="" style={thumb} />
    : <span style={thumb}>{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

// Linha de cada produto: foto, marca e botões de trocar/remover a foto
function ProductRow({ p, reload, brands }) {
  const [brand, setBrand] = useState(p.brand || '');
  const [busy, setBusy] = useState(false);
  const pick = useRef(null);

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await sendPhoto(file, p.id);
      const { error } = await supabase.from('products').update({ image_url: url }).eq('id', p.id);
      if (error) throw error;
      reload();
    } catch (err) {
      alert('Não consegui enviar a foto: ' + (err.message || err));
    }
    setBusy(false);
  }
  async function removePhoto() {
    if (!confirm('Remover a foto deste produto?')) return;
    setBusy(true);
    const { error } = await supabase.from('products').update({ image_url: null }).eq('id', p.id);
    if (error) alert(error.message);
    setBusy(false);
    reload();
  }
  async function saveBrand() {
    const b = brand.trim();
    if (b === (p.brand || '')) return;
    const { error } = await supabase.from('products').update({ brand: b || null }).eq('id', p.id);
    if (error) alert(error.message);
    reload();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: '1px solid rgba(20,16,31,.08)' }}>
      <Thumb src={p.image_url} name={p.name} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <b>{p.name}</b>
        <input
          list="marcas"
          placeholder="Marca"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          onBlur={saveBrand}
          style={{ marginTop: 6 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy} onClick={() => pick.current && pick.current.click()}>
            {busy ? 'Enviando...' : p.image_url ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {p.image_url && !busy && <button type="button" className="ghost" onClick={removePhoto}>Remover</button>}
        </div>
        <input ref={pick} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

function StockRow({ v, reload }) {
  const [val, setVal] = useState(v.stock);
  async function save() {
    const diff = Number(val) - v.stock;
    if (!diff) return;
    await supabase.from('variants').update({ stock: Number(val) }).eq('id', v.id);
    await supabase.from('stock_movements').insert({ variant_id: v.id, qty_change: diff, reason: 'ajuste' });
    reload();
  }
  return (
    <div className="row">
      <span>{v.products.name} · {v.label} · {brl(v.price)}</span>
      <span><input type="number" min="0" value={val} onChange={(e) => setVal(e.target.value)} /> <button onClick={save}>Salvar</button></span>
    </div>
  );
}

function Estoque() {
  const [rows, setRows] = useState([]);
  const [prods, setProds] = useState([]);
  const empty = { name: '', brand: '', label: '', price: '', stock: '' };
  const [n, setN] = useState(empty);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = useRef(null);

  const load = () => {
    supabase.from('variants').select('*, products(name)').order('product_id').then(({ data }) => setRows(data || []));
    supabase.from('products').select('*').order('id', { ascending: false }).then(({ data }) => setProds(data || []));
  };
  useEffect(() => { load(); }, []);

  const brands = [...new Set(prods.map((p) => p.brand).filter(Boolean))];

  function choose(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
  }

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    const base = { name: n.name };
    if (n.brand.trim()) base.brand = n.brand.trim();
    const { data: p, error } = await supabase.from('products').insert(base).select().single();
    if (error) { setBusy(false); return alert(error.message); }
    const { data: v } = await supabase.from('variants').insert({ product_id: p.id, label: n.label, price: Number(n.price), stock: Number(n.stock || 0) }).select().single();
    if (Number(n.stock) > 0) await supabase.from('stock_movements').insert({ variant_id: v.id, qty_change: Number(n.stock), reason: 'entrada' });
    if (file) {
      try {
        const url = await sendPhoto(file, p.id);
        const { error: e2 } = await supabase.from('products').update({ image_url: url }).eq('id', p.id);
        if (e2) throw e2;
      } catch (err) {
        alert('Produto criado, mas a foto não subiu: ' + (err.message || err) + '\nVocê pode adicionar a foto de novo na lista abaixo.');
      }
    }
    setN(empty);
    clearPhoto();
    setBusy(false);
    load();
  }
  const k = (f) => (e) => setN({ ...n, [f]: e.target.value });

  return (
    <>
      <datalist id="marcas">{brands.map((b) => <option key={b} value={b} />)}</datalist>

      <form className="card" onSubmit={add}>
        <b>Novo produto</b>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {preview ? <img src={preview} alt="" style={thumb} /> : <span style={thumb}>+</span>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="ghost" onClick={() => pick.current && pick.current.click()}>
              {preview ? 'Trocar foto' : 'Escolher foto'}
            </button>
            {preview && <button type="button" className="ghost" onClick={clearPhoto}>Remover</button>}
          </div>
          <input ref={pick} type="file" accept="image/*" onChange={choose} style={{ display: 'none' }} />
        </div>
        <input placeholder="Produto" value={n.name} onChange={k('name')} required />
        <input list="marcas" placeholder="Marca" value={n.brand} onChange={k('brand')} />
        <input placeholder="Variação (sabor, tamanho)" value={n.label} onChange={k('label')} required />
        <input type="number" step="0.01" placeholder="Preço" value={n.price} onChange={k('price')} required />
        <input type="number" placeholder="Quantidade em estoque" value={n.stock} onChange={k('stock')} />
        <button disabled={busy}>{busy ? 'Salvando...' : 'Adicionar'}</button>
      </form>

      <div className="card">
        <b>Fotos e marcas</b>
        {prods.length === 0 && <p className="muted">Nenhum produto ainda.</p>}
        {prods.map((p) => <ProductRow key={p.id + ':' + (p.image_url || '') + ':' + (p.brand || '')} p={p} reload={load} brands={brands} />)}
      </div>

      <div className="card">
        <b>Estoque</b>
        {rows.map((v) => <StockRow key={v.id + ':' + v.stock} v={v} reload={load} />)}
      </div>
    </>
  );
}

function Caixa() {
  const [rows, setRows] = useState([]);
  const [s, setS] = useState({ description: '', amount: '' });
  const load = () => supabase.from('cash_entries').select('*').order('id', { ascending: false }).limit(100).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const sum = (f) => rows.filter(f).reduce((t, r) => t + Number(r.amount), 0);
  const received = sum((r) => r.kind === 'entrada' && r.status === 'recebido') - sum((r) => r.kind === 'saida' && r.status === 'recebido');
  const pending = sum((r) => r.kind === 'entrada' && r.status === 'a_receber');
  async function out(e) {
    e.preventDefault();
    await supabase.from('cash_entries').insert({ kind: 'saida', amount: Number(s.amount), description: s.description, status: 'recebido' });
    setS({ description: '', amount: '' }); load();
  }
  return (
    <>
      <div className="card row"><span>Em caixa: <b>{brl(received)}</b></span><span>A receber: <b>{brl(pending)}</b></span></div>
      <form className="card" onSubmit={out}>
        <b>Registrar saída</b>
        <input placeholder="Descrição" value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} required />
        <input type="number" step="0.01" placeholder="Valor" value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} required />
        <button>Registrar</button>
      </form>
      <div className="card">{rows.map((r) => (
        <div className="row" key={r.id}><span>{r.description} <span className="tag">{r.status}</span></span><b>{r.kind === 'saida' ? '-' : ''}{brl(r.amount)}</b></div>
      ))}</div>
    </>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('pedidos');
  return (
    <Auth role="admin">
      <div className="tabs">
        {['pedidos', 'estoque', 'caixa'].map((t) => (
          <button key={t} className={tab === t ? '' : 'ghost'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'pedidos' && <Pedidos />}
      {tab === 'estoque' && <Estoque />}
      {tab === 'caixa' && <Caixa />}
    </Auth>
  );
}
