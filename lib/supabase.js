import { createClient } from '@supabase/supabase-js';

// Cada painel guarda a sessão em uma chave própria no navegador
const isMotoboy =
  typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/entregas');

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: { storageKey: isMotoboy ? 'sb-motoboy-auth' : 'sb-admin-auth' },
  }
);

export const brl = (n) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
