'use client';
import { useEffect, useState } from 'react';
import Auth from '@/components/Auth';
import { supabase, brl } from '@/lib/supabase';

function Entregas() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const load = async () => {
    const a = await supabase.rpc('courier_orders');
    const b = await supabase.rpc('courier_day_total');
    setRows(a.data || []); setTotal(b.data || 0);
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const act = async (fn, id) => { const { error } = await supabase.rpc(fn, { p_id: id }); if (error) alert(error.message); load(); };
  return (
    <>
      <div className="card"><h2>Você recebe hoje: {brl(total)}</h2></div>
      {rows.length === 0 && <p className="muted">Nenhum pedido no momento.</p>}
      {rows.map((o) => (
        <div className="card" key={o.id}>
          <div className="row"><b>#{o.id} · {o.first_name}</b><span className="tag">{o.status}</span></div>
          <p>{o.items}</p>
          <p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`} target="_blank">{o.address}</a></p>
          <p className="muted">Você ganha {brl(o.courier_pay)}</p>
          {o.status === 'novo' && <button onClick={() => act('take_order', o.id)}>Peguei</button>}
          {o.status === 'em_entrega' && <button onClick={() => act('deliver_order', o.id)}>Entreguei</button>}
        </div>
      ))}
    </>
  );
}

export default function Page() {
  return (<Auth role="courier"><Entregas /></Auth>);
}
