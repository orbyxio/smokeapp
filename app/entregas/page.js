'use client';
import { useEffect, useRef, useState } from 'react';
import Auth from '@/components/Auth';
import { supabase, brl } from '@/lib/supabase';
import { alertNewOrder, setSound, soundOn, setTitleCount } from '@/lib/alerts';

function Entregas() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [som, setSom] = useState(false);
  const seen = useRef(null); // ids de pedidos novos já vistos

  const load = async () => {
    const a = await supabase.rpc('courier_orders');
    const b = await supabase.rpc('courier_day_total');
    const list = a.data || [];
    setRows(list);
    setTotal(b.data || 0);

    const novos = list.filter((o) => o.status === 'novo').map((o) => o.id);
    if (seen.current !== null && novos.some((id) => !seen.current.has(id))) alertNewOrder();
    seen.current = new Set([...(seen.current || []), ...novos]);
    setTitleCount(novos.length, 'Entregas');
  };

  useEffect(() => {
    setSom(soundOn());
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const act = async (fn, id) => { const { error } = await supabase.rpc(fn, { p_id: id }); if (error) alert(error.message); load(); };
  function toggleSom() {
    const on = !som;
    setSound(on);
    setSom(on);
    if (on) alertNewOrder();
  }

  return (
    <>
      <div className="card"><h2>Você recebe hoje: {brl(total)}</h2></div>
      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <b>Aviso de entrega nova</b>
          <button type="button" className={som ? '' : 'ghost'} onClick={toggleSom}>{som ? 'Som ligado' : 'Ativar som'}</button>
        </div>
        {!som && <p className="muted" style={{ margin: '6px 0 0' }}>Toque em Ativar som para tocar um aviso quando chegar entrega. Deixe esta tela aberta.</p>}
      </div>
      {rows.length === 0 && <p className="muted">Nenhum pedido no momento.</p>}
      {rows.map((o) => (
        <div className="card" key={o.id}>
          <div className="row"><b>#{o.id} · {o.first_name}</b><span className="tag">{o.status}</span></div>
          <p>{o.items}</p>
          <p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`} target="_blank" rel="noreferrer">{o.address}</a></p>
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
