'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// EDITE: troque pelo nome da sua empresa (aparece no rodapé da tela de login)
const COMPANY = 'Smoke Euphoria';

// EDITE: textos do resumo que aparece embaixo da mensagem de boas-vindas.
// - resumo: use **duas estrelas** para deixar uma parte em negrito
// - icon: estoque, pedidos, caixa, entregas, endereco ou valores
const INFO = {
  admin: {
    resumo: 'Aqui você controla toda a operação: o **estoque por marca e sabor**, os **pedidos** e o **dinheiro que entra e sai**.',
    itens: [
      { icon: 'estoque', titulo: 'Estoque', texto: 'Marcas, sabores e quantidades' },
      { icon: 'pedidos', titulo: 'Pedidos', texto: 'Cada venda acompanhada' },
      { icon: 'caixa', titulo: 'Caixa', texto: 'Entradas, saídas e repasses' },
    ],
  },
  entregas: {
    resumo: 'Seu painel já está pronto: os **pedidos** chegam até você, com **endereço do cliente** e os **valores que você recebe**.',
    itens: [
      { icon: 'entregas', titulo: 'Pedidos', texto: 'As entregas que chegam pra você' },
      { icon: 'endereco', titulo: 'Endereços', texto: 'Local e contato do cliente' },
      { icon: 'valores', titulo: 'Valores', texto: 'O que você recebe e repassa' },
    ],
  },
};

// Ícones de linha (SVG) — sem emojis
const ICONS = {
  estoque: (<><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>),
  pedidos: (<><path d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6" /></>),
  caixa: (<><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18" /><circle cx="16.5" cy="15" r="1.2" /></>),
  entregas: (<><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  endereco: (<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  valores: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /></>),
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// Corta a foto em quadrado e reduz (256px, JPEG) antes de enviar
async function squarePhoto(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Não foi possível ler essa imagem'));
      i.src = url;
    });
    const s = Math.min(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return await new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao preparar a foto'))), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// **texto** vira negrito
const bold = (s) => s.split('**').map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));

// Mensagem que "digita" sozinha. O texto completo reserva o espaço
// (invisível) para a tela não pular enquanto escreve.
function Typing({ text, speed = 38 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => {
      setN((x) => {
        if (x >= text.length) { clearInterval(id); return x; }
        return x + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <div className="tw" role="heading" aria-level={1} aria-label={text}>
      <span className="tw-full" aria-hidden="true">{text}</span>
      <span className="tw-live" aria-hidden="true">
        <span className="greet-text">{text.slice(0, n)}</span>
      </span>
    </div>
  );
}

export default function Auth({ role, children }) {
  const isAdmin = role === 'admin';
  const nameKey = isAdmin ? 'painel-nome-admin' : 'painel-nome-entregas';

  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [pending, setPending] = useState(false);
  const [splash, setSplash] = useState(false);
  const [hl, setHl] = useState(0);
  const [avBusy, setAvBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data || false));
  }, [session]);

  // Lembra o primeiro nome neste aparelho para personalizar o próximo login
  useEffect(() => {
    try { setSavedName(localStorage.getItem(nameKey) || ''); } catch {}
  }, [nameKey]);

  useEffect(() => {
    if (!profile || !profile.full_name) return;
    const first = profile.full_name.trim().split(' ')[0];
    try { localStorage.setItem(nameKey, first); } catch {}
  }, [profile, nameKey]);

  // Boas-vindas só aparece logo depois de um login (não a cada F5)
  useEffect(() => {
    if (pending && profile) { setSplash(true); setPending(false); }
  }, [pending, profile]);

  useEffect(() => {
    if (!splash) return;
    const t = setTimeout(() => setSplash(false), 2400);
    return () => clearTimeout(t);
  }, [splash]);

  // Destaque que passa de cartão em cartão na tela de login
  useEffect(() => {
    if (session !== null) return;
    const id = setInterval(() => setHl((h) => (h + 1) % 3), 2600);
    return () => clearInterval(id);
  }, [session]);

  async function changeAvatar(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !session) return;
    setAvBusy(true);
    try {
      const blob = await squarePhoto(file);
      const path = `${session.user.id}.jpg`;
      const up = await supabase.storage.from('avatares').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
      if (up.error) throw up.error;
      const url = supabase.storage.from('avatares').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      const r = await supabase.rpc('set_my_avatar', { p_url: url });
      if (r.error) throw r.error;
      setProfile((p) => ({ ...p, avatar_url: url }));
    } catch (err) {
      alert('Não consegui trocar a foto: ' + (err.message || err));
    }
    setAvBusy(false);
  }

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    setErr(error ? 'E-mail ou senha incorretos' : '');
    if (!error) setPending(true);
  }

  if (session === undefined || (session && profile === null)) {
    return <div className="boot"><div className="spin" /></div>;
  }

  if (!session) {
    const greeting = isAdmin
      ? `Bem-vinda ao seu painel de administradora${savedName ? ' ' + savedName : ''}`
      : 'Bem-vindo ao seu painel de Entregas';
    const info = isAdmin ? INFO.admin : INFO.entregas;

    return (
      <div className="login">
        <i className="orb o1" />
        <i className="orb o2" />

        <div className="login-greet">
          <span className="pillrole">{isAdmin ? 'Painel administrativo' : 'Painel de entregas'}</span>
          <Typing key={greeting} text={greeting} />
          <p className="login-sum">{bold(info.resumo)}</p>
          <div className="feats">
            {info.itens.map((it, i) => (
              <div key={it.titulo} className={`feat${hl === i ? ' on' : ''}`} style={{ '--i': i }}>
                <span className="ico"><Icon name={it.icon} /></span>
                <b>{it.titulo}</b>
                <small>{it.texto}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="login-mid">
          <form className="card login-card" onSubmit={login}>
            <h2 className="login-title">Entrar</h2>
            <p className="muted" style={{ marginTop: 0 }}>Use seu e-mail e senha para continuar.</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="pw">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Senha"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
              />
              <button type="button" className="eye" onClick={() => setShow(!show)}>
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {err && <p className="err shake" key={err + busy}>{err}</p>}
            <button className="cta" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
          </form>
        </div>

        <footer className="login-foot">
          <b>{COMPANY}</b>
        </footer>
      </div>
    );
  }

  if (!profile || (role === 'admin' && profile.role !== 'admin')) return (
    <div className="box card">
      <p>Sem permissão para esta área.</p>
      <button onClick={() => supabase.auth.signOut()}>Sair</button>
    </div>
  );

  const first = (profile.full_name || '').trim().split(' ')[0];

  return (
    <>
      {splash && (
        <div className="splash" role="status">
          <div className="check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h2>{isAdmin ? `Bem-vinda, ${first}!` : `Olá, ${first}!`}</h2>
          <p className="muted">Preparando seu painel…</p>
          <div className="loadbar"><i /></div>
        </div>
      )}
      <header className="bar">
        <div className="who">
          <button type="button" className="av avbtn" onClick={() => fileRef.current && fileRef.current.click()}
            aria-label="Trocar minha foto" title="Trocar minha foto" disabled={avBusy}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" />
              : (profile.full_name || '?').trim().charAt(0)}
            <span className="avcam" aria-hidden="true">{avBusy ? '…' : '+'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={changeAvatar} style={{ display: 'none' }} />
          <b>{profile.full_name}</b>
        </div>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      <main>{children}</main>
    </>
  );
}
