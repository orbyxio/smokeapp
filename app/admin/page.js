'use client';
import { useEffect, useRef, useState } from 'react';
import Auth from '@/components/Auth';
import PushButton from '@/components/PushButton';
import { supabase, brl } from '@/lib/supabase';
import { alertNewOrder, armAudio, keepAwake, setSound, soundOn, setTitleCount } from '@/lib/alerts';

const STORE = 'Smoke Euphoria';
const LOW = 5; // abaixo ou igual a isso, o estoque entra no aviso de "estoque baixo"
const PAY = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' };
const STATUS_PED = { novo: 'Novo', em_entrega: 'Em entrega', entregue: 'Entregue', cancelado: 'Cancelado' };

const BR = 'America/Sao_Paulo';
const dtFull = (v) => {
  try {
    return v ? new Date(v).toLocaleString('pt-BR', { timeZone: BR, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  } catch { return ''; }
};

const waLink = (o) => {
  const d = String(o.customer_phone || '').replace(/\D/g, '');
  if (!d) return null;
  const num = d.length <= 11 ? '55' + d : d;
  const nome = String(o.customer_name || '').trim().split(' ')[0];
  return `https://wa.me/${num}?text=${encodeURIComponent(`Oi ${nome}! Aqui é da ${STORE}, sobre o seu pedido.`)}`;
};

function Pedidos({ onCount }) {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(50);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('abertos');
  const [som, setSom] = useState(false);
  const [fresh, setFresh] = useState([]); // pedidos novos ainda não vistos
  const limRef = useRef(50);
  const lastMax = useRef(null);
  limRef.current = limit;

  const load = async () => {
    const { data } = await supabase.from('orders').select('*, order_items(item_label, qty)')
      .order('id', { ascending: false }).limit(limRef.current);
    const list = data || [];
    setRows(list);
    const max = list.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
    if (lastMax.current !== null && max > lastMax.current) {
      alertNewOrder();
      const novosPedidos = list.filter((o) => Number(o.id) > lastMax.current).map((o) => ({ id: o.id, name: o.customer_name, total: o.total, prod: (o.order_items || []).map((i) => `${i.qty}x ${i.item_label}`).join(', ') }));
      setFresh((f) => [...novosPedidos, ...f].slice(0, 5));
    }
    if (lastMax.current === null || max > lastMax.current) lastMax.current = max;
    const novos = list.filter((o) => o.status === 'novo').length;
    if (onCount) onCount(novos);
    setTitleCount(novos, 'Painel');
  };

  useEffect(() => {
    const on = soundOn();
    setSom(on);
    armAudio();
    keepAwake(on);
    load();
    const ch = supabase.channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
    const t = setInterval(load, 30000);
    // ao voltar para o app (celular desbloqueado, outra aba), confere na hora
    const back = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', back);
    return () => {
      supabase.removeChannel(ch); clearInterval(t);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.removeEventListener('pageshow', back);
    };
  }, []);
  useEffect(() => { load(); }, [limit]);

  const act = async (fn, id) => { const { error } = await supabase.rpc(fn, { p_id: id }); if (error) alert(error.message); load(); };
  function toggleSom() {
    const on = !som;
    setSound(on);
    setSom(on);
    keepAwake(on);
    if (on) alertNewOrder();
  }

  const FILTERS = { abertos: 'Em aberto', arquivados: 'Arquivados', cancelados: 'Cancelados', todos: 'Todos' };
  const t = q.trim().toLowerCase();
  const shown = rows.filter((o) => {
    if (!t) {
      // arquivado = entregue E pagamento confirmado; entregue sem pagamento confirmado continua em aberto
      const feito = o.status === 'entregue' && o.payment_status !== 'pendente';
      if (filter === 'abertos' && (o.status === 'cancelado' || feito)) return false;
      if (filter === 'arquivados' && !feito) return false;
      if (filter === 'cancelados' && o.status !== 'cancelado') return false;
      return true;
    }
    const digits = t.replace(/\D/g, '');
    return String(o.id) === t.replace('#', '')
      || String(o.customer_name || '').toLowerCase().includes(t)
      || String(o.address || '').toLowerCase().includes(t)
      || (digits.length >= 3 && String(o.customer_phone || '').replace(/\D/g, '').includes(digits));
  });

  return (
    <>
      {fresh.length > 0 && (
        <div className="card" role="alert" style={{ background: '#14101f', color: '#fff' }}>
          {fresh.map((n) => (
            <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.15)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>🛒 Pedido novo – {n.prod || n.name}</div>
              <div style={{ fontWeight: 800, fontSize: 24, color: '#4ade80', marginTop: 2 }}>{brl(n.total)}</div>
              <div style={{ fontSize: 12, opacity: .7, color: '#fff' }}>#{n.id} · {n.name}</div>
            </div>
          ))}
          <button type="button" style={{ marginTop: 10, background: '#fff', color: '#14101f' }} onClick={() => setFresh([])}>Ok, vi</button>
        </div>
      )}
      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <b style={{ fontSize: 17 }}>Pedidos</b>
          <button type="button" className={som ? '' : 'ghost'} onClick={toggleSom}>
            {som ? 'Som ligado' : 'Ativar som de pedido novo'}
          </button>
        </div>
        {!som && <p className="muted" style={help}>Toque no botão para tocar um aviso sempre que chegar um pedido. Mantenha esta tela aberta.</p>}
        <PushButton kind="admin" />
        <input type="search" placeholder="Buscar por nome, telefone, endereço ou número" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 10 }} />
        <Choice value={filter} onChange={setFilter} options={FILTERS} />
      </div>

      {shown.length === 0 && <div className="card"><p className="muted">Nenhum pedido encontrado.</p></div>}
      {shown.map((o) => {
        const wa = waLink(o);
        return (
          <div className="card" key={o.id} style={o.status === 'novo' ? { boxShadow: 'inset 4px 0 0 #8f3bff' } : undefined}>
            <div className="row"><b>#{o.id} · {o.customer_name}</b><span className="tag">{STATUS_PED[o.status] || o.status}</span></div>
            <p className="muted" style={{ margin: '2px 0' }}>{dtFull(o.created_at)}</p>
            <p>{(o.order_items || []).map((i) => `${i.qty}x ${i.item_label}`).join(', ')}</p>
            <p className="muted">{o.address} · {o.customer_phone}</p>
            <p>{brl(o.total)}{o.zone_name ? ` (entrega ${brl(o.delivery_fee)})` : ''} · {PAY[o.payment_method]} · {o.payment_status === 'pendente' ? 'pagamento pendente' : o.payment_status}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {o.payment_status === 'pendente' && o.status !== 'cancelado' && <button onClick={() => act('mark_paid', o.id)}>Confirmar pagamento</button>}
              {wa && <a className="btn ghost" href={wa} target="_blank" rel="noreferrer">WhatsApp do cliente</a>}
              {['novo', 'em_entrega'].includes(o.status) && <button className="ghost" onClick={() => confirm('Cancelar pedido?') && act('cancel_order', o.id)}>Cancelar</button>}
            </div>
          </div>
        );
      })}
      {rows.length >= limit && (
        <button type="button" className="ghost" onClick={() => setLimit(limit + 50)}>Ver pedidos mais antigos</button>
      )}
    </>
  );
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

const line = { borderTop: '1px solid rgba(20,16,31,.08)' };
const help = { margin: '2px 0 8px', fontSize: 13, lineHeight: 1.35 };
const lab = { display: 'block', margin: '10px 0 4px', fontSize: 13, fontWeight: 700 };

// Quantidade de um sabor/variação
function VariantRow({ v, reload }) {
  const [val, setVal] = useState(v.stock);
  async function save() {
    const diff = Number(val) - v.stock;
    if (!diff) return;
    await supabase.from('variants').update({ stock: Number(val) }).eq('id', v.id);
    await supabase.from('stock_movements').insert({ variant_id: v.id, qty_change: diff, reason: 'ajuste' });
    reload();
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', ...line }}>
      <span style={{ minWidth: 0 }}><b>{v.label}</b><br /><span className="muted">{brl(v.price)}</span>{v.stock <= LOW && <span className="tag" style={{ marginLeft: 6 }}>{v.stock <= 0 ? 'Zerado' : 'Baixo'}</span>}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="number" min="0" value={val} aria-label={`Estoque de ${v.label}`}
          onChange={(e) => setVal(e.target.value)} style={{ width: 84 }} />
        <button type="button" onClick={save}>Salvar</button>
      </span>
    </div>
  );
}

// Um cartão completo por produto
function ProductCard({ p, reload }) {
  const [brand, setBrand] = useState(p.brand || '');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nv, setNv] = useState({ label: '', price: '', stock: '' });
  const pick = useRef(null);
  const hidden = p.active === false;
  const vars = p.variants || [];

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
    if (!confirm('Tirar a foto deste produto?')) return;
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
  async function toggleHidden() {
    const { error } = await supabase.from('products').update({ active: hidden }).eq('id', p.id);
    if (error) return alert('Não deu para ocultar: ' + error.message + '\n\nRode no Supabase: alter table products add column if not exists active boolean not null default true;');
    reload();
  }
  async function addVariant(e) {
    e.preventDefault();
    const { data: v, error } = await supabase.from('variants')
      .insert({ product_id: p.id, label: nv.label, price: Number(nv.price), stock: Number(nv.stock || 0) }).select().single();
    if (error) return alert(error.message);
    if (Number(nv.stock) > 0) await supabase.from('stock_movements').insert({ variant_id: v.id, qty_change: Number(nv.stock), reason: 'entrada' });
    setNv({ label: '', price: '', stock: '' });
    setAdding(false);
    reload();
  }
  async function remove() {
    if (!confirm(`Apagar "${p.name}" de vez?\n\nIsso remove o produto, os sabores e a foto, e não dá para desfazer.\n\nSe você só quer tirar da loja por um tempo, use "Ocultar da loja".`)) return;
    setBusy(true);
    const ids = vars.map((v) => v.id);
    try {
      if (ids.length) {
        const used = await supabase.from('order_items').select('id').in('variant_id', ids).limit(1);
        if (!used.error && used.data && used.data.length) {
          setBusy(false);
          return alert('Esse produto já foi vendido em algum pedido, então não pode ser apagado (o histórico de pedidos ficaria quebrado).\n\nUse "Ocultar da loja": ele some para os clientes e continua guardado aqui.');
        }
        await supabase.from('stock_movements').delete().in('variant_id', ids);
        const r1 = await supabase.from('variants').delete().in('id', ids);
        if (r1.error) throw r1.error;
      }
      const r2 = await supabase.from('products').delete().eq('id', p.id);
      if (r2.error) throw r2.error;
      if (p.image_url && p.image_url.includes('/produtos/')) {
        await supabase.storage.from('produtos').remove([decodeURIComponent(p.image_url.split('/produtos/')[1].split('?')[0])]);
      }
    } catch (err) {
      alert('Não consegui apagar: ' + (err.message || err) + '\n\nSe o produto já tem pedidos, use "Ocultar da loja".');
    }
    setBusy(false);
    reload();
  }

  return (
    <div className="card" style={hidden ? { opacity: 0.75 } : undefined}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Thumb src={p.image_url} name={p.name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 17 }}>{p.name}</b>
          <div>{hidden ? <span className="tag">Oculto na loja</span> : <span className="muted">Aparecendo na loja</span>}</div>
        </div>
      </div>

      <span style={lab}>Foto do produto</span>
      <p className="muted" style={help}>É a imagem que o cliente vê na loja.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => pick.current && pick.current.click()}>
          {busy ? 'Aguarde...' : p.image_url ? 'Trocar foto' : 'Adicionar foto'}
        </button>
        {p.image_url && !busy && <button type="button" className="ghost" onClick={removePhoto}>Tirar foto</button>}
      </div>
      <input ref={pick} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

      <span style={lab}>Marca</span>
      <input list="marcas" placeholder="Ex.: Ignite" value={brand}
        onChange={(e) => setBrand(e.target.value)} onBlur={saveBrand} />

      <span style={lab}>Sabores e estoque</span>
      <p className="muted" style={help}>Mude a quantidade e toque em Salvar.</p>
      {vars.length === 0 && <p className="muted">Nenhum sabor cadastrado.</p>}
      {vars.map((v) => <VariantRow key={v.id + ':' + v.stock} v={v} reload={reload} />)}

      {adding ? (
        <form onSubmit={addVariant} style={{ ...line, paddingTop: 10 }}>
          <input placeholder="Sabor ou tamanho (ex.: Menta)" value={nv.label} onChange={(e) => setNv({ ...nv, label: e.target.value })} required />
          <input type="number" step="0.01" placeholder="Preço" value={nv.price} onChange={(e) => setNv({ ...nv, price: e.target.value })} required />
          <input type="number" placeholder="Quantidade em estoque" value={nv.stock} onChange={(e) => setNv({ ...nv, stock: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button>Adicionar sabor</button>
            <button type="button" className="ghost" onClick={() => setAdding(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 6 }}>
          <button type="button" className="ghost" onClick={() => setAdding(true)}>+ Adicionar outro sabor</button>
        </div>
      )}

      <div style={{ ...line, marginTop: 14, paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ghost" disabled={busy} onClick={toggleHidden}>
          {hidden ? 'Mostrar na loja' : 'Ocultar da loja'}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={remove} style={{ color: '#d6204b' }}>Apagar produto</button>
      </div>
      <p className="muted" style={{ ...help, marginTop: 8 }}>
        Ocultar: o produto some para os clientes, mas continua guardado aqui. Apagar: remove de vez.
      </p>
    </div>
  );
}

function Estoque() {
  const [prods, setProds] = useState([]);
  const empty = { name: '', brand: '', label: '', price: '', stock: '' };
  const [n, setN] = useState(empty);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const pick = useRef(null);

  const load = () => {
    supabase.from('products').select('*, variants(*)').order('id', { ascending: false })
      .then(({ data }) => setProds((data || []).map((p) => ({ ...p, variants: (p.variants || []).sort((x, y) => String(x.label).localeCompare(String(y.label), 'pt-BR', { numeric: true })) }))));
  };
  useEffect(() => { load(); }, []);

  const brands = [...new Set(prods.map((p) => p.brand).filter(Boolean))];
  const low = prods
    .filter((p) => p.active !== false)
    .flatMap((p) => (p.variants || []).filter((v) => Number(v.stock) <= LOW).map((v) => ({ p, v })))
    .sort((x, y) => x.v.stock - y.v.stock);
  const shown = prods.filter((p) => {
    const t = q.trim().toLowerCase();
    return !t || p.name.toLowerCase().includes(t) || (p.brand || '').toLowerCase().includes(t);
  });

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
        alert('Produto criado, mas a foto não subiu: ' + (err.message || err) + '\nVocê pode adicionar a foto de novo no cartão do produto.');
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

      {low.length > 0 && (
        <div className="card">
          <b style={{ fontSize: 17 }}>Estoque baixo ({low.length})</b>
          <p className="muted" style={help}>Sabores com {LOW} unidades ou menos. Hora de repor.</p>
          {low.map(({ p, v }) => (
            <div key={v.id} className="row" style={{ ...line, padding: '8px 0' }}>
              <span>{p.name} · {v.label}</span>
              <b style={{ color: '#d6204b' }}>{v.stock <= 0 ? 'Zerado' : `${v.stock} restantes`}</b>
            </div>
          ))}
        </div>
      )}

      <form className="card" onSubmit={add}>
        <b style={{ fontSize: 17 }}>Cadastrar produto novo</b>
        <p className="muted" style={help}>Preencha e toque em Adicionar. O produto aparece na loja na hora.</p>

        <span style={lab}>Foto (opcional)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {preview ? <img src={preview} alt="" style={thumb} /> : <span style={thumb}>+</span>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="ghost" onClick={() => pick.current && pick.current.click()}>
              {preview ? 'Trocar foto' : 'Escolher foto'}
            </button>
            {preview && <button type="button" className="ghost" onClick={clearPhoto}>Tirar</button>}
          </div>
          <input ref={pick} type="file" accept="image/*" onChange={choose} style={{ display: 'none' }} />
        </div>

        <span style={lab}>Nome do produto</span>
        <input placeholder="Ex.: Ignite V50" value={n.name} onChange={k('name')} required />
        <span style={lab}>Marca</span>
        <input list="marcas" placeholder="Ex.: Ignite" value={n.brand} onChange={k('brand')} />
        <span style={lab}>Primeiro sabor ou tamanho</span>
        <input placeholder="Ex.: Menta" value={n.label} onChange={k('label')} required />
        <span style={lab}>Preço (R$)</span>
        <input type="number" step="0.01" placeholder="Ex.: 89.90" value={n.price} onChange={k('price')} required />
        <span style={lab}>Quantidade em estoque</span>
        <input type="number" placeholder="Ex.: 10" value={n.stock} onChange={k('stock')} />
        <button disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Salvando...' : 'Adicionar'}</button>
      </form>

      <div style={{ margin: '18px 4px 8px' }}>
        <b style={{ fontSize: 17 }}>Produtos cadastrados ({prods.length})</b>
        <p className="muted" style={help}>Aqui você troca foto, marca e estoque, adiciona sabores, oculta ou apaga.</p>
        {prods.length > 3 && <input type="search" placeholder="Buscar produto ou marca" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {prods.length === 0 && <div className="card"><p className="muted">Nenhum produto ainda.</p></div>}
      {shown.map((p) => <ProductCard key={p.id} p={p} reload={load} />)}
    </>
  );
}

const KIND = { entrada: 'Entrada', saida: 'Saída' };
const STATUS = { recebido: 'Recebido', a_receber: 'A receber' };
const dt = (v) => { try { return v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''; } catch { return ''; } };

// Escolha entre duas opções (botões)
function Choice({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.entries(options).map(([k, label]) => (
        <button key={k} type="button" className={value === k ? '' : 'ghost'} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

function CashRow({ r, reload }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ kind: r.kind, description: r.description || '', amount: String(r.amount), status: r.status });
  const [busy, setBusy] = useState(false);
  const out = r.kind === 'saida';

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('cash_entries')
      .update({ kind: f.kind, description: f.description, amount: Number(f.amount), status: f.status }).eq('id', r.id);
    setBusy(false);
    if (error) return alert('Não consegui salvar: ' + error.message);
    setEdit(false);
    reload();
  }
  async function remove() {
    if (!confirm(`Apagar este lançamento?\n\n${r.description || ''} · ${brl(r.amount)}\n\nNão dá para desfazer.`)) return;
    const { error } = await supabase.from('cash_entries').delete().eq('id', r.id);
    if (error) return alert('Não consegui apagar: ' + error.message);
    reload();
  }

  if (edit) {
    return (
      <form onSubmit={save} style={{ ...line, padding: '12px 0' }}>
        <span style={lab}>Tipo</span>
        <Choice value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={KIND} />
        <span style={lab}>Descrição</span>
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required />
        <span style={lab}>Valor (R$)</span>
        <input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <span style={lab}>Situação</span>
        <Choice value={f.status} onChange={(status) => setF({ ...f, status })} options={STATUS} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</button>
          <button type="button" className="ghost" onClick={() => setEdit(false)}>Cancelar</button>
        </div>
      </form>
    );
  }
  return (
    <div style={{ ...line, padding: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          <b>{r.description || 'Sem descrição'}</b><br />
          <span className="muted">{KIND[r.kind] || r.kind} · {dt(r.created_at)} {dt(r.created_at) ? '· ' : ''}</span>
          <span className="tag">{STATUS[r.status] || r.status}</span>
          {r.order_id ? <span className="muted"> · pedido #{r.order_id}</span> : null}
        </span>
        <b style={{ whiteSpace: 'nowrap', color: out ? '#d6204b' : undefined }}>{out ? '- ' : ''}{brl(r.amount)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="ghost" onClick={() => setEdit(true)}>Editar</button>
        <button type="button" className="ghost" onClick={remove} style={{ color: '#d6204b' }}>Apagar</button>
        {r.status === 'a_receber' && r.kind === 'entrada' && (
          <button type="button" onClick={async () => {
            const { error } = await supabase.from('cash_entries').update({ status: 'recebido' }).eq('id', r.id);
            if (error) alert(error.message);
            reload();
          }}>Marcar recebido</button>
        )}
      </div>
    </div>
  );
}

function Caixa() {
  const [rows, setRows] = useState([]);
  const empty = { kind: 'saida', description: '', amount: '', status: 'recebido' };
  const [s, setS] = useState(empty);
  const [filter, setFilter] = useState('todos');
  const [busy, setBusy] = useState(false);
  const load = () => supabase.from('cash_entries').select('*').order('id', { ascending: false }).limit(200).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const sum = (f) => rows.filter(f).reduce((t, r) => t + Number(r.amount), 0);
  const received = sum((r) => r.kind === 'entrada' && r.status === 'recebido') - sum((r) => r.kind === 'saida' && r.status === 'recebido');
  const pending = sum((r) => r.kind === 'entrada' && r.status === 'a_receber');

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('cash_entries')
      .insert({ kind: s.kind, amount: Number(s.amount), description: s.description, status: s.status });
    setBusy(false);
    if (error) return alert(error.message);
    setS(empty);
    load();
  }

  const FILTERS = { todos: 'Todos', entrada: 'Entradas', saida: 'Saídas', a_receber: 'A receber' };
  const shown = rows.filter((r) =>
    filter === 'todos' ? true : filter === 'a_receber' ? r.status === 'a_receber' : r.kind === filter);

  return (
    <>
      <div className="card row"><span>Em caixa: <b>{brl(received)}</b></span><span>A receber: <b>{brl(pending)}</b></span></div>

      <form className="card" onSubmit={add}>
        <b style={{ fontSize: 17 }}>Novo lançamento</b>
        <p className="muted" style={help}>Use para registrar qualquer dinheiro que entrou ou saiu, mesmo fora dos pedidos do site.</p>
        <span style={lab}>Tipo</span>
        <Choice value={s.kind} onChange={(kind) => setS({ ...s, kind })} options={KIND} />
        <span style={lab}>Descrição</span>
        <input placeholder="Ex.: Venda direta, gasolina, acerto" value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} required />
        <span style={lab}>Valor (R$)</span>
        <input type="number" step="0.01" placeholder="Ex.: 50.00" value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} required />
        <span style={lab}>Situação</span>
        <Choice value={s.status} onChange={(status) => setS({ ...s, status })} options={STATUS} />
        <button disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Salvando...' : 'Registrar'}</button>
      </form>

      <div className="card">
        <b style={{ fontSize: 17 }}>Lançamentos</b>
        <p className="muted" style={help}>Os pedidos entram aqui sozinhos. Toque em Editar para corrigir qualquer um, ou em Apagar para remover.</p>
        <Choice value={filter} onChange={setFilter} options={FILTERS} />
        {shown.length === 0 && <p className="muted">Nada por aqui.</p>}
        {shown.map((r) => <CashRow key={r.id + ':' + r.amount + ':' + r.status + ':' + r.kind + ':' + r.description} r={r} reload={load} />)}
      </div>
    </>
  );
}

/* ---------- Locais de entrega e valores ---------- */
function ZoneRow({ z, reload }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: z.name, fee: String(z.fee) });
  const hidden = z.active === false;

  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from('delivery_zones').update({ name: f.name.trim(), fee: Number(f.fee) }).eq('id', z.id);
    if (error) return alert(error.message);
    setEdit(false);
    reload();
  }
  async function toggle() {
    const { error } = await supabase.from('delivery_zones').update({ active: hidden }).eq('id', z.id);
    if (error) alert(error.message);
    reload();
  }
  async function pin() {
    const { error } = await supabase.from('delivery_zones').update({ priority: (z.priority || 0) > 0 ? 0 : 1 }).eq('id', z.id);
    if (error) alert(error.message);
    reload();
  }
  async function remove() {
    if (!confirm(`Apagar o local "${z.name}"?\n\nPedidos antigos não são afetados. Se só quer parar de atender lá por um tempo, use "Ocultar".`)) return;
    const { error } = await supabase.from('delivery_zones').delete().eq('id', z.id);
    if (error) return alert('Não consegui apagar: ' + error.message + '\n\nTente "Ocultar".');
    reload();
  }

  if (edit) {
    return (
      <form onSubmit={save} style={{ ...line, padding: '12px 0' }}>
        <span style={lab}>Local</span>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <span style={lab}>Valor (R$)</span>
        <input type="number" step="0.01" min="0" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} required />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button>Salvar</button>
          <button type="button" className="ghost" onClick={() => setEdit(false)}>Cancelar</button>
        </div>
      </form>
    );
  }
  return (
    <div style={{ ...line, padding: '12px 0', opacity: hidden ? 0.65 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <span><b>{z.name}</b> {(z.priority || 0) > 0 && <span className="tag">No topo</span>} {hidden && <span className="tag">Oculto</span>}</span>
        <b>{brl(z.fee)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ghost" onClick={() => setEdit(true)}>Editar</button>
        <button type="button" className="ghost" onClick={pin}>{(z.priority || 0) > 0 ? 'Tirar do topo' : 'Fixar no topo'}</button>
        <button type="button" className="ghost" onClick={toggle}>{hidden ? 'Mostrar' : 'Ocultar'}</button>
        <button type="button" className="ghost" onClick={remove} style={{ color: '#d6204b' }}>Apagar</button>
      </div>
    </div>
  );
}

function Locais() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [n, setN] = useState({ name: '', fee: '' });
  const load = () => supabase.from('delivery_zones').select('*').order('priority', { ascending: false }).order('name').then(({ data, error }) => {
    setErr(error ? error.message : '');
    setRows(data || []);
  });
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    const { error } = await supabase.from('delivery_zones').insert({ name: n.name.trim(), fee: Number(n.fee) });
    if (error) return alert(error.message);
    setN({ name: '', fee: '' });
    load();
  }

  return (
    <>
      {err && (
        <div className="card">
          <b>Falta criar a tabela de locais</b>
          <p className="muted" style={help}>Rode o SQL de locais de entrega no Supabase e volte aqui. ({err})</p>
        </div>
      )}
      <form className="card" onSubmit={add}>
        <b style={{ fontSize: 17 }}>Novo local de entrega</b>
        <p className="muted" style={help}>O cliente digita o CEP e o sistema aplica o valor sozinho, sem mostrar esta lista. Use o nome exatamente como a <b>cidade</b> (ex.: Holambra) ou o <b>bairro</b> (ex.: Bairrinho). Se o CEP bater com um bairro e com a cidade, vale o bairro.</p>
        <span style={lab}>Cidade ou bairro</span>
        <input placeholder="Ex.: Holambra" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} required />
        <span style={lab}>Valor (R$)</span>
        <input type="number" step="0.01" min="0" placeholder="Ex.: 35.00" value={n.fee} onChange={(e) => setN({ ...n, fee: e.target.value })} required />
        <button style={{ marginTop: 12 }}>Adicionar</button>
      </form>
      <div className="card">
        <b style={{ fontSize: 17 }}>Locais e valores ({rows.length})</b>
        <p className="muted" style={help}>Local oculto = não entregamos lá. Quem digitar um CEP que não está na lista recebe o aviso de que ainda não entregamos.</p>
        {rows.map((z) => <ZoneRow key={z.id + ':' + z.name + ':' + z.fee + ':' + z.active} z={z} reload={load} />)}
      </div>
    </>
  );
}

/* ---------- Vendas (relatório por período) ---------- */
const ymdToday = () => new Date().toLocaleDateString('en-CA', { timeZone: BR });
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: BR });
const fmtDay = (ymd) => ymd.split('-').reverse().slice(0, 2).join('/');
const startOf = (ymd) => new Date(`${ymd}T00:00:00-03:00`).toISOString();

const PRESETS = { hoje: 'Hoje', ontem: 'Ontem', d7: '7 dias', d14: '14 dias', d30: '30 dias', custom: 'Período' };
function rangeFor(key, from, to) {
  const t = ymdToday();
  if (key === 'hoje') return [t, t];
  if (key === 'ontem') return [addDays(t, -1), addDays(t, -1)];
  if (key === 'd7') return [addDays(t, -6), t];
  if (key === 'd14') return [addDays(t, -13), t];
  if (key === 'd30') return [addDays(t, -29), t];
  return [from || t, to || t];
}

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ margin: 0, padding: 14 }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {sub && <span className="muted" style={{ fontSize: 12 }}>{sub}</span>}
    </div>
  );
}

// Lista com barra proporcional (para "mais vendidos", "por local" etc.)
function Rank({ items, empty = 'Sem dados no período.' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted">{empty}</p>;
  return items.map((i) => (
    <div key={i.key} style={{ padding: '8px 0', ...line }}>
      <div className="row"><span style={{ minWidth: 0 }}>{i.label}</span><b style={{ whiteSpace: 'nowrap' }}>{i.right}</b></div>
      {i.sub && <span className="muted" style={{ fontSize: 12 }}>{i.sub}</span>}
      <div style={{ height: 5, borderRadius: 9, background: 'rgba(20,16,31,.07)', marginTop: 4 }}>
        <div style={{ height: 5, borderRadius: 9, width: `${Math.max(3, (i.value / max) * 100)}%`, background: 'linear-gradient(90deg,#1a9bff,#8f3bff,#ff2fd0)' }} />
      </div>
    </div>
  ));
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const num = (n) => String(Number(n || 0).toFixed(2)).replace('.', ',');

function Vendas() {
  const [key, setKey] = useState('hoje');
  const t0 = ymdToday();
  const [from, setFrom] = useState(t0);
  const [to, setTo] = useState(t0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [allCust, setAllCust] = useState(false);
  const [r0, r1] = rangeFor(key, from, to);

  const load = async () => {
    if (r0 > r1) { setRows([]); setErr('A data inicial é depois da final.'); setLoading(false); return; }
    setLoading(true); setErr('');
    const { data, error } = await supabase.from('orders')
      .select('*, order_items(item_label, qty, unit_price)')
      .gte('created_at', startOf(r0)).lt('created_at', startOf(addDays(r1, 1)))
      .order('created_at', { ascending: true }).limit(1000);
    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [r0, r1]);

  const ok = rows.filter((o) => o.status !== 'cancelado');
  const canceled = rows.length - ok.length;
  const sum = (arr, f) => arr.reduce((t, o) => t + Number(f(o) || 0), 0);
  const total = sum(ok, (o) => o.total);
  const entrega = sum(ok, (o) => o.delivery_fee);
  const recebido = sum(ok.filter((o) => o.payment_status !== 'pendente'), (o) => o.total);
  const areceber = total - recebido;
  const itens = ok.reduce((t, o) => t + (o.order_items || []).reduce((a, i) => a + Number(i.qty || 0), 0), 0);
  const ticket = ok.length ? total / ok.length : 0;

  const group = (arr, keyFn) => {
    const m = new Map();
    arr.forEach((o) => { const k = keyFn(o); const g = m.get(k) || { n: 0, total: 0 }; g.n += 1; g.total += Number(o.total || 0); m.set(k, g); });
    return m;
  };
  const byPay = [...group(ok, (o) => o.payment_method).entries()].map(([k, g]) => ({
    key: k, label: PAY[k] || k, right: brl(g.total), sub: `${g.n} pedido${g.n > 1 ? 's' : ''}`, value: g.total,
  })).sort((a, b) => b.value - a.value);
  const byZone = [...group(ok, (o) => o.zone_name || 'Sem local').entries()].map(([k, g]) => ({
    key: k, label: k, right: brl(g.total), sub: `${g.n} pedido${g.n > 1 ? 's' : ''}`, value: g.total,
  })).sort((a, b) => b.value - a.value);

  const items = new Map();
  ok.forEach((o) => (o.order_items || []).forEach((i) => {
    const g = items.get(i.item_label) || { qty: 0, total: 0 };
    g.qty += Number(i.qty || 0); g.total += Number(i.qty || 0) * Number(i.unit_price || 0);
    items.set(i.item_label, g);
  }));
  const byItem = [...items.entries()].map(([k, g]) => ({
    key: k, label: k, right: `${g.qty} un.`, sub: brl(g.total), value: g.qty,
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  const cust = new Map();
  ok.forEach((o) => {
    const d = String(o.customer_phone || '').replace(/\D/g, '').slice(-11);
    const k = d || String(o.customer_name || '').toLowerCase();
    const g = cust.get(k) || { name: o.customer_name, phone: o.customer_phone, n: 0, total: 0, last: o.created_at };
    g.n += 1; g.total += Number(o.total || 0); g.name = o.customer_name; g.last = o.created_at;
    cust.set(k, g);
  });
  const custList = [...cust.entries()].map(([k, g]) => ({ k, ...g })).sort((a, b) => b.total - a.total);
  const custShown = allCust ? custList : custList.slice(0, 10);

  // gráfico por dia (só até 31 dias)
  const days = [];
  for (let d = r0; d <= r1 && days.length < 62; d = addDays(d, 1)) days.push(d);
  const perDay = new Map();
  ok.forEach((o) => { const d = dayOf(o.created_at); perDay.set(d, (perDay.get(d) || 0) + Number(o.total || 0)); });
  const maxDay = Math.max(1, ...days.map((d) => perDay.get(d) || 0));
  const showChart = days.length > 1 && days.length <= 31;

  function exportCsv() {
    const head = ['Pedido', 'Data', 'Cliente', 'Telefone', 'Endereço', 'Local', 'Itens', 'Total', 'Entrega', 'Pagamento', 'Situação do pagamento', 'Status'];
    const lines = rows.map((o) => [
      o.id, dtFull(o.created_at), o.customer_name, o.customer_phone, o.address, o.zone_name || '',
      (o.order_items || []).map((i) => `${i.qty}x ${i.item_label}`).join(' | '),
      num(o.total), num(o.delivery_fee), PAY[o.payment_method] || o.payment_method, o.payment_status, STATUS_PED[o.status] || o.status,
    ].map(csvCell).join(';'));
    const blob = new Blob(['﻿' + [head.map(csvCell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vendas-${r0}_a_${r1}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <>
      <div className="card">
        <b style={{ fontSize: 17 }}>Vendas</b>
        <p className="muted" style={help}>Escolha o período. Pedidos cancelados não entram na soma.</p>
        <Choice value={key} onChange={setKey} options={PRESETS} />
        {key === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div><span style={lab}>De</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><span style={lab}>Até</span><input type="date" value={to} min={from} max={t0} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}
        <p className="muted" style={{ ...help, marginTop: 10 }}>
          {r0 === r1 ? fmtDay(r0) : `${fmtDay(r0)} a ${fmtDay(r1)}`} · {ok.length} pedido{ok.length === 1 ? '' : 's'}
          {canceled > 0 ? ` · ${canceled} cancelado${canceled > 1 ? 's' : ''}` : ''}
          {loading ? ' · carregando...' : ''}
        </p>
        {err && <p className="err">{err}</p>}
        {rows.length >= 1000 && <p className="err">Mostrando os primeiros 1000 pedidos. Escolha um período menor.</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={load}>Atualizar</button>
          <button type="button" className="ghost" disabled={!rows.length} onClick={exportCsv}>Baixar planilha</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0' }}>
        <Stat label="Faturamento" value={brl(total)} />
        <Stat label="Pedidos" value={ok.length} sub={`${itens} ${itens === 1 ? 'item' : 'itens'}`} />
        <Stat label="Ticket médio" value={brl(ticket)} />
        <Stat label="Entregas cobradas" value={brl(entrega)} sub={`produtos: ${brl(total - entrega)}`} />
        <Stat label="Já recebido" value={brl(recebido)} />
        <Stat label="A receber" value={brl(areceber)} />
      </div>

      {showChart && (
        <div className="card">
          <b style={{ fontSize: 17 }}>Por dia</b>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110, marginTop: 10 }}>
            {days.map((d) => {
              const v = perDay.get(d) || 0;
              return <div key={d} title={`${fmtDay(d)}: ${brl(v)}`} style={{ flex: 1, height: `${Math.max(3, (v / maxDay) * 100)}%`, borderRadius: 4, background: v ? 'linear-gradient(180deg,#8f3bff,#1a9bff)' : 'rgba(20,16,31,.10)' }} />;
            })}
          </div>
          <div className="row muted" style={{ fontSize: 12, marginTop: 4 }}><span>{fmtDay(days[0])}</span><span>{fmtDay(days[days.length - 1])}</span></div>
        </div>
      )}

      <div className="card"><b style={{ fontSize: 17 }}>Mais vendidos</b><Rank items={byItem} /></div>
      <div className="card"><b style={{ fontSize: 17 }}>Forma de pagamento</b><Rank items={byPay} /></div>
      <div className="card"><b style={{ fontSize: 17 }}>Por local de entrega</b><Rank items={byZone} /></div>

      <div className="card">
        <b style={{ fontSize: 17 }}>Clientes ({custList.length})</b>
        <p className="muted" style={help}>Quem mais comprou no período.</p>
        {custList.length === 0 && <p className="muted">Sem dados no período.</p>}
        {custShown.map((c) => {
          const wa = waLink({ customer_phone: c.phone, customer_name: c.name });
          return (
            <div key={c.k} style={{ padding: '10px 0', ...line }}>
              <div className="row"><b>{c.name}</b><b>{brl(c.total)}</b></div>
              <span className="muted" style={{ fontSize: 12 }}>{c.n} pedido{c.n > 1 ? 's' : ''} · último em {dtFull(c.last)}</span>
              {wa && <div style={{ marginTop: 6 }}><a className="btn ghost" href={wa} target="_blank" rel="noreferrer">Chamar no WhatsApp</a></div>}
            </div>
          );
        })}
        {custList.length > 10 && (
          <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={() => setAllCust(!allCust)}>
            {allCust ? 'Mostrar menos' : `Ver todos (${custList.length})`}
          </button>
        )}
      </div>
    </>
  );
}

/* ---------- Ajustes da loja: aberta/fechada e horário ---------- */
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function LojaConfig() {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('store_config').select('*').eq('id', 1).single();
    if (error) { setErr(error.message); return; }
    setErr('');
    setC({ mode: data.mode, open_time: String(data.open_time).slice(0, 5), close_time: String(data.close_time).slice(0, 5), days: data.days || [] });
    const st = await supabase.rpc('store_status');
    const row = Array.isArray(st.data) ? st.data[0] : st.data;
    if (row) setNow(row.is_open);
  };
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setSaved(false);
    const { error } = await supabase.from('store_config')
      .update({ mode: c.mode, open_time: c.open_time, close_time: c.close_time, days: c.days }).eq('id', 1);
    setBusy(false);
    if (error) return alert('Não consegui salvar: ' + error.message);
    setSaved(true);
    load();
  }
  const toggleDay = (d) => setC({ ...c, days: c.days.includes(d) ? c.days.filter((x) => x !== d) : [...c.days, d].sort() });

  if (err) {
    return (
      <div className="card">
        <b>Falta criar a configuração da loja</b>
        <p className="muted" style={help}>Rode o arquivo tudo.sql no Supabase e volte aqui. ({err})</p>
      </div>
    );
  }
  if (!c) return <div className="card"><p className="muted">Carregando...</p></div>;

  return (
    <div className="card">
      <b style={{ fontSize: 17 }}>Loja aberta ou fechada</b>
      {now !== null && (
        <p style={{ margin: '6px 0' }}>Agora a loja está <b style={{ color: now ? '#12a150' : '#d6204b' }}>{now ? 'ABERTA' : 'FECHADA'}</b>.</p>
      )}
      <p className="muted" style={help}>Fechada: o cliente vê o aviso e não consegue finalizar pedido. Ele ainda pode olhar os produtos.</p>
      <Choice value={c.mode} onChange={(mode) => setC({ ...c, mode })} options={{ auto: 'Pelo horário', aberta: 'Sempre aberta', fechada: 'Fechada agora' }} />
      {c.mode === 'auto' && (
        <>
          <span style={lab}>Horário de atendimento</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><span className="muted" style={{ fontSize: 12 }}>Abre às</span><input type="time" value={c.open_time} onChange={(e) => setC({ ...c, open_time: e.target.value })} /></div>
            <div><span className="muted" style={{ fontSize: 12 }}>Fecha às</span><input type="time" value={c.close_time} onChange={(e) => setC({ ...c, close_time: e.target.value })} /></div>
          </div>
          <span style={lab}>Dias em que atende</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DIAS.map((n, d) => (
              <button key={d} type="button" className={c.days.includes(d) ? '' : 'ghost'} onClick={() => toggleDay(d)}>{n}</button>
            ))}
          </div>
        </>
      )}
      <button style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? 'Salvando...' : 'Salvar'}</button>
      {saved && <span className="muted" style={{ marginLeft: 10 }}>Salvo.</span>}
    </div>
  );
}

function Ajustes() {
  return (
    <>
      <LojaConfig />
      <Locais />
    </>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('pedidos');
  const [novos, setNovos] = useState(0);
  const TABS = ['pedidos', 'estoque', 'caixa', 'vendas', 'ajustes'];
  return (
    <Auth role="admin">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? '' : 'ghost'} onClick={() => setTab(t)}>
            {t}
            {t === 'pedidos' && novos > 0 && <span className="tabdot">{novos}</span>}
          </button>
        ))}
      </div>
      {/* Pedidos fica sempre carregado para avisar de pedido novo mesmo em outra aba */}
      <div style={{ display: tab === 'pedidos' ? 'block' : 'none' }}><Pedidos onCount={setNovos} /></div>
      {tab === 'estoque' && <Estoque />}
      {tab === 'caixa' && <Caixa />}
      {tab === 'vendas' && <Vendas />}
      {tab === 'ajustes' && <Ajustes />}
    </Auth>
  );
}
