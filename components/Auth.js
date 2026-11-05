'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ✏️ Troque pelo nome da sua empresa (aparece no rodapé da tela de login)
const COMPANY = 'Smoke Euphoria';

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

    return (
      <div className="login">
        <i className="orb o1" />
        <i className="orb o2" />

        <div className="login-greet">
          <span className="pillrole">{isAdmin ? 'Painel administrativo' : 'Painel de entregas'}</span>
          <Typing key={greeting} text={greeting} />
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
          <div className="check">✓</div>
          <h2>{isAdmin ? `Bem-vinda, ${first}!` : `Olá, ${first}!`}</h2>
          <p className="muted">Preparando seu painel…</p>
          <div className="loadbar"><i /></div>
        </div>
      )}
      <header className="bar">
        <div className="who">
          <span className="av">{(profile.full_name || '?').trim().charAt(0)}</span>
          <b>{profile.full_name}</b>
        </div>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      <main>{children}</main>
    </>
  );
}
