'use client';
import { useEffect, useState } from 'react';
import PushButton from '@/components/PushButton';
import { alertNewOrder, keepAwake, setSound, soundOn } from '@/lib/alerts';

// Caixa "Som e notificações", usada nos Ajustes do painel e do motoboy.
export default function AlertSettings({ kind, titulo }) {
  const [som, setSom] = useState(false);
  useEffect(() => { setSom(soundOn()); }, []);

  function toggleSom() {
    const on = !som;
    setSound(on);
    setSom(on);
    keepAwake(on);
    if (on) alertNewOrder();
  }

  return (
    <div className="card">
      <b style={{ fontSize: 17 }}>{titulo || 'Som e notificações'}</b>

      <div style={{ marginTop: 12 }}>
        <button type="button" className={som ? '' : 'ghost'} onClick={toggleSom}>
          {som ? 'Som ligado' : 'Ativar som'}
        </button>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.35 }}>
          Toca um aviso quando chega pedido novo, com o app aberto na tela.
        </p>
      </div>

      <PushButton kind={kind} />
    </div>
  );
}
