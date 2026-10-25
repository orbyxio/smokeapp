'use client';
import { useEffect, useState } from 'react';
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
  const [n, setN] = useState({ name: '', label: '', price: '', stock: '' });
  const load = () => supabase.from('variants').select('*, products(name)').order('product_id').then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault();
    const { data: p, error } = await supabase.from('products').insert({ name: n.name }).select().single();
    if (error) return alert(error.message);
    const { data: v } = await supabase.from('variants').insert({ product_id: p.id, label: n.label, price: Number(n.price), stock: Number(n.stock || 0) }).select().single();
    if (Number(n.stock) > 0) await supabase.from('stock_movements').insert({ variant_id: v.id, qty_change: Number(n.stock), reason: 'entrada' });
    setN({ name: '', label: '', price: '', stock: '' }); load();
  }
  const k = (f) => (e) => setN({ ...n, [f]: e.target.value });
  return (
    <>
      <form className="card" onSubmit={add}>
        <b>Novo produto</b>
        <input placeholder="Produto" value={n.name} onChange={k('name')} required />
        <input placeholder="Variação (sabor, tamanho)" value={n.label} onChange={k('label')} required />
        <input type="number" step="0.01" placeholder="Preço" value={n.price} onChange={k('price')} required />
        <input type="number" placeholder="Quantidade em estoque" value={n.stock} onChange={k('stock')} />
        <button>Adicionar</button>
      </form>
      <div className="card">{rows.map((v) => <StockRow key={v.id + ':' + v.stock} v={v} reload={load} />)}</div>
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
