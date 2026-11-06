'use client';
import { useEffect, useState } from 'react';
import { pushSupported, pushActive, enablePush, disablePush } from '@/lib/push';

export default function PushButton({ kind }) {
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setOk(pushSupported());
    pushActive().then(setOn);
  }, []);

  const toggle = async () => {
    setBusy(true); setMsg('');
    if (on) { await disablePush(); setOn(false); }
    else {
      const r = await enablePush(kind);
      if (r.ok) setOn(true); else setMsg(r.erro);
    }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className={on ? '' : 'ghost'} disabled={busy} onClick={toggle}>
        {on ? 'Notificações ligadas' : 'Ativar notificações no celular'}
      </button>
      {!on && ok && <p className="muted" style={{ margin: '6px 0 0' }}>Receba o aviso de pedido novo mesmo com o app fechado.</p>}
      {!ok && <p className="muted" style={{ margin: '6px 0 0' }}>Para notificações no iPhone, abra pelo ícone do app na tela inicial.</p>}
      {msg && <p style={{ margin: '6px 0 0', color: '#b42318' }}>{msg}</p>}
    </div>
  );
}
