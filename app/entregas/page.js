'use client';
import { useEffect, useRef, useState } from 'react';
import Auth from '@/components/Auth';
import AlertSettings from '@/components/AlertSettings';
import { supabase, brl } from '@/lib/supabase';
import { alertNewOrder, armAudio, keepAwake, soundOn, setTitleCount } from '@/lib/alerts';

const BR = 'America/Sao_Paulo';
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: BR }); // AAAA-MM-DD
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDia = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};
const hora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { timeZone: BR, hour: '2-digit', minute: '2-digit' });
const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['14', '14 dias'], ['30', '30 dias']];
function faixa(p) {
  const h = hojeBR();
  if (p === 'hoje') return [h, h];
  if (p === 'ontem') { const o = addDias(h, -1); return [o, o]; }
  return [addDias(h, -(Number(p) - 1)), h];
}

function Ganhos() {
  const [periodo, setPeriodo] = useState('hoje');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  const load = async () => {
    const [de, ate] = faixa(periodo);
    const { data, error } = await supabase.rpc('courier_history', { p_from: de, p_to: ate });
    if (error) { setErr(error.message); setRows([]); return; }
    setErr('');
    setRows(data || []);
  };
  useEffect(() => { setRows(null); load(); }, [periodo]);
  useEffect(() => {
    const back = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [periodo]);

  const list = rows || [];
  const total = list.reduce((t, o) => t + Number(o.courier_pay || 0), 0);
  const dias = {};
  list.forEach((o) => { (dias[o.dia] = dias[o.dia] || []).push(o); });
  const ordem = Object.keys(dias).sort().reverse();

  return (
    <>
      <div className="tabs">
        {PERIODOS.map(([k, nome]) => (
          <button key={k} className={periodo === k ? '' : 'ghost'} onClick={() => setPeriodo(k)}>{nome}</button>
        ))}
      </div>
      {err && <div className="card"><p className="muted">Não consegui carregar os ganhos. Avise o administrador. ({err})</p></div>}
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>Você ganhou</p>
        <h2 style={{ margin: '2px 0 4px' }}>{brl(total)}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {list.length} {list.length === 1 ? 'entrega' : 'entregas'}
          {list.length > 0 ? ` · média ${brl(total / list.length)} por entrega` : ''}
          {ordem.length > 1 ? ` · ${ordem.length} dias` : ''}
        </p>
      </div>
      {rows !== null && list.length === 0 && !err && <p className="muted">Nenhuma entrega nesse período.</p>}
      {ordem.map((d) => {
        const l = dias[d];
        const t = l.reduce((x, o) => x + Number(o.courier_pay || 0), 0);
        return (
          <details className="card" key={d}>
            <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
              <div className="row" style={{ alignItems: 'center' }}>
                <b>{fmtDia(d)}</b>
                <span><b>{brl(t)}</b> <span className="muted">· {l.length} {l.length === 1 ? 'entrega' : 'entregas'}</span></span>
              </div>
            </summary>
            <div style={{ marginTop: 8 }}>
              {l.map((o) => (
                <p key={o.id} className="muted" style={{ margin: '6px 0' }}>
                  #{o.id} · {hora(o.delivered_at)} · {o.address} · <b>{brl(o.courier_pay)}</b>
                </p>
              ))}
            </div>
          </details>
        );
      })}
    </>
  );
}

function Entregas() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState('entregas');
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
    armAudio();
    keepAwake(soundOn());
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
      <div className="tabs">
        {['entregas', 'ganhos', 'ajustes'].map((t) => (
          <button key={t} className={tab === t ? '' : 'ghost'} onClick={() => setTab(t)}>
            {t}
            {t === 'entregas' && abertos.some((o) => o.status === 'novo') && <span className="tabdot">{abertos.filter((o) => o.status === 'novo').length}</span>}
          </button>
        ))}
      </div>
      {tab === 'ganhos' && <Ganhos />}
      {tab === 'ajustes' && <AlertSettings kind="courier" />}
      {tab === 'entregas' && (
        <>
      <div className="card"><h2>Você recebe hoje: {brl(total)}</h2></div>
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
          <p><b>Pagamento: {({ pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' })[o.payment_method] || o.payment_method}</b></p>
          <p className="muted">Você ganha {brl(o.courier_pay)}</p>
          {o.status === 'novo' && <button onClick={() => act('take_order', o.id)}>Peguei</button>}
          {o.status === 'em_entrega' && <button onClick={() => act('deliver_order', o.id)}>Entreguei</button>}
        </div>
      ))}
        </>
      )}
    </>
  );
}

export default function Page() {
  return (<Auth role="courier"><Entregas /></Auth>);
}
