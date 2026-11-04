'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth({ role, children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

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

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    setErr(error ? 'E-mail ou senha incorretos' : '');
  }

  if (session === undefined || (session && profile === null)) {
    return <div className="boot"><div className="spin" /></div>;
  }

  if (!session) return (
    <div className="login">
      <div className="login-top">
        <div className="logo">✦</div>
        <h1>Entrar</h1>
        <p className="muted">{role === 'admin' ? 'Painel administrativo' : 'Painel de entregas'}</p>
      </div>
      <form className="card login-card" onSubmit={login}>
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
  );

  if (!profile || (role === 'admin' && profile.role !== 'admin')) return (
    <div className="box card">
      <p>Sem permissão para esta área.</p>
      <button onClick={() => supabase.auth.signOut()}>Sair</button>
    </div>
  );

  return (
    <>
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
