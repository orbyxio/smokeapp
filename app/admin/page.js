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
      <p>{brl(o.total)}{o.zone_name ? ` (entrega ${brl(o.delivery_fee)})` : ''} · {PAY[o.payment_method]} · {o.payment_status}</p>
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
      <span style={{ minWidth: 0 }}><b>{v.label}</b><br /><span className="muted">{brl(v.price)}</span></span>
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
        <span><b>{z.name}</b> {hidden && <span className="tag">Oculto</span>}</span>
        <b>{brl(z.fee)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ghost" onClick={() => setEdit(true)}>Editar</button>
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
  const load = () => supabase.from('delivery_zones').select('*').order('name').then(({ data, error }) => {
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
        <p className="muted" style={help}>O valor é o que o cliente paga de entrega naquele local.</p>
        <span style={lab}>Local (bairro ou cidade)</span>
        <input placeholder="Ex.: Holambra" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} required />
        <span style={lab}>Valor (R$)</span>
        <input type="number" step="0.01" min="0" placeholder="Ex.: 35.00" value={n.fee} onChange={(e) => setN({ ...n, fee: e.target.value })} required />
        <button style={{ marginTop: 12 }}>Adicionar</button>
      </form>
      <div className="card">
        <b style={{ fontSize: 17 }}>Locais e valores ({rows.length})</b>
        <p className="muted" style={help}>Locais ocultos não aparecem para o cliente.</p>
        {rows.map((z) => <ZoneRow key={z.id + ':' + z.name + ':' + z.fee + ':' + z.active} z={z} reload={load} />)}
      </div>
    </>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('pedidos');
  return (
    <Auth role="admin">
      <div className="tabs">
        {['pedidos', 'estoque', 'caixa', 'locais'].map((t) => (
          <button key={t} className={tab === t ? '' : 'ghost'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'pedidos' && <Pedidos />}
      {tab === 'estoque' && <Estoque />}
      {tab === 'caixa' && <Caixa />}
      {tab === 'locais' && <Locais />}
    </Auth>
  );
}
