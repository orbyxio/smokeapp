'use client';
import { useEffect, useRef, useState } from 'react';
import Auth from '@/components/Auth';
import { supabase, brl } from '@/lib/supabase';
import { alertNewOrder, armAudio, keepAwake, setSound, soundOn, setTitleCount } from '@/lib/alerts';

function Entregas() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [som, setSom] = useState(false);
  const seen = useRef(null); // ids de pedidos novos já vistos
  const [fresh, setFresh] = useState([]);
  const [aba, setAba] = useState('abertos');

  const load = async () => {
    const a = await supabase.rpc('courier_orders');
    const b = await supabase.rpc('courier_day_total');
    const list = a.data || [];
    setRows(list);
    setTotal(b.data || 0);

    const novos = list.filter((o) => o.status === 'novo').map((o) => o.id);
    if (seen.current !== null) {
      const ids = novos.filter((id) => !seen.current.has(id));
      if (ids.length) {
        alertNewOrder();
        setFresh((f) => [...list.filter((o) => ids.includes(o.id)).map((o) => ({ id: o.id, address: o.address })), ...f].slice(0, 5));
      }
    }
    seen.current = new Set([...(seen.current || []), ...novos]);
    setTitleCount(novos.length, 'Entregas');
  };

  useEffect(() => {
    const on = soundOn();
    setSom(on);
    armAudio();
    keepAwake(on);
    load();
    const t = setInterval(load, 15000);
    // ao voltar para o app, confere na hora
    const back = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', back);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.removeEventListener('pageshow', back);
    };
  }, []);

  const act = async (fn, id) => { const { error } = await supabase.rpc(fn, { p_id: id }); if (error) alert(error.message); load(); };
  function toggleSom() {
    const on = !som;
    setSound(on);
    setSom(on);
    keepAwake(on);
    if (on) alertNewOrder();
  }

  // novos primeiro; dentro de cada grupo, o mais recente em cima
  const ordem = { novo: 0, em_entrega: 1 };
  const abertos = rows.filter((o) => o.status === 'novo' || o.status === 'em_entrega')
    .sort((a, b) => (ordem[a.status] - ordem[b.status]) || (b.id - a.id));
  const arquivados = rows.filter((o) => o.status === 'entregue').sort((a, b) => b.id - a.id);
  const shown = aba === 'abertos' ? abertos : arquivados;

  return (
    <>
      {fresh.length > 0 && (
        <div className="card" role="alert" style={{ background: '#14101f', color: '#fff' }}>
          <b style={{ fontSize: 17 }}>Entrega nova</b>
          {fresh.map((n) => <p key={n.id} style={{ margin: '4px 0', color: '#fff' }}>#{n.id} · {n.address}</p>)}
          <button type="button" style={{ marginTop: 8, background: '#fff', color: '#14101f' }} onClick={() => setFresh([])}>Ok, vi</button>
        </div>
      )}
      <div className="card"><h2>Você recebe hoje: {brl(total)}</h2></div>
      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <b>Aviso de entrega nova</b>
          <button type="button" className={som ? '' : 'ghost'} onClick={toggleSom}>{som ? 'Som ligado' : 'Ativar som'}</button>
        </div>
        {!som && <p className="muted" style={{ margin: '6px 0 0' }}>Toque em Ativar som para tocar um aviso quando chegar entrega. Deixe esta tela aberta.</p>}
      </div>
      <div className="row" style={{ gap: 8, margin: '4px 0 10px', justifyContent: 'flex-start' }}>
        <button type="button" className={aba === 'abertos' ? '' : 'ghost'} onClick={() => setAba('abertos')}>Em aberto ({abertos.length})</button>
        <button type="button" className={aba === 'arquivados' ? '' : 'ghost'} onClick={() => setAba('arquivados')}>Arquivados ({arquivados.length})</button>
      </div>
      {shown.length === 0 && <p className="muted">{aba === 'abertos' ? 'Nenhum pedido no momento.' : 'Nenhuma entrega arquivada ainda.'}</p>}
      {shown.map((o) => (
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
