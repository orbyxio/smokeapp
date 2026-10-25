'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth({ role, children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

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
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setErr(error ? 'E-mail ou senha incorretos' : '');
  }

  if (session === undefined || (session && profile === null)) return <p className="box">Carregando...</p>;
  if (!session) return (
    <form className="box card" onSubmit={login}>
      <h2>Entrar</h2>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={pass} onChange={(e) => setPass(e.target.value)} required />
      {err && <p className="err">{err}</p>}
      <button>Entrar</button>
    </form>
  );
  if (!profile || (role === 'admin' && profile.role !== 'admin')) return (
    <div className="box card"><p>Sem permissão para esta área.</p><button onClick={() => supabase.auth.signOut()}>Sair</button></div>
  );
  return (
    <>
      <header className="bar"><b>{profile.full_name}</b><button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button></header>
      <main>{children}</main>
    </>
  );
}
