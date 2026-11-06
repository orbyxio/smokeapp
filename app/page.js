'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, brl } from '@/lib/supabase';
import { LOGO } from '@/lib/logo';

/* ==========================================================
   EDITE AQUI: nome da loja, logo e faixas do topo
   ========================================================== */
const STORE = 'Smoke Euphoria';

// A logo fica no arquivo lib/logo.js. Para trocar no futuro, é só
// substituir esse arquivo por um novo (mesmo nome, mesma linha "export const LOGO").
function Logo() {
  return <img src={LOGO} alt="" />;
}

const BANNERS = [
  { t: STORE, s: 'Escolha seus produtos, finalize em segundos e acompanhe pelo WhatsApp.', bg: 'radial-gradient(120% 140% at 88% 10%,rgba(143,59,255,.55),transparent 55%),radial-gradient(90% 120% at 100% 100%,rgba(255,47,208,.4),transparent 60%),#14101f', logo: true },
  { t: 'Pague do seu jeito', s: 'Pix na hora, ou cartão e dinheiro na entrega.', bg: 'linear-gradient(120deg,#8f3bff,#ff2fd0)' },
  { t: 'Favoritou, ficou salvo', s: 'Toque no coração e encontre seus preferidos rapidinho.', bg: 'linear-gradient(120deg,#ff2fd0,#ff8a1f)' },
];

// Chave Pix (se existir a variável NEXT_PUBLIC_PIX_KEY na Vercel, ela tem prioridade)
const PIX = process.env.NEXT_PUBLIC_PIX_KEY || '50653671830';

const WA = process.env.NEXT_PUBLIC_WHATSAPP;
const wa = (t) => `https://wa.me/${WA}?text=${encodeURIComponent(t)}`;

// Tenta primeiro com foto e marca; se essas colunas ainda não existirem no
// Supabase, cai automaticamente para a consulta simples (a loja nunca quebra).
const SELECTS = [
  '*,variants(id,label,price,stock)', // traz foto, marca e "oculto" quando existirem
];

const PAY = [
  { id: 'pix', icon: 'pix', label: 'Pix', sub: 'agora' },
  { id: 'card', icon: 'card', label: 'Cartão', sub: 'na entrega' },
  { id: 'cash', icon: 'cash', label: 'Dinheiro', sub: 'na entrega' },
];

/* ---------- ícones de linha (sem emojis) ---------- */
const ICONS = {
  search: (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bag: (<><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  home: (<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  chat: <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z" />,
  card: (<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18" /></>),
  cash: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /></>),
  pix: <path d="M12 3l9 9-9 9-9-9 9-9z" />,
  truck: (<><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  tag: (<><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.2" /></>),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z" /><path d="M10 21a2 2 0 0 0 4 0" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>),
};

function Icon({ name, size = 20, fill = 'none', sw = 1.9 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/* ---------- utilitários ---------- */
// Cada produto ganha uma cor própria (matiz derivado do nome) só no fundo da foto
const hue = (s = '') => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
const norm = (s = '') => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initial = (s = '') => (String(s).trim().charAt(0) || '?');

// Foto do produto (com fallback colorido caso não tenha foto ou o link falhe)
function Photo({ src, name, className }) {
  return (
    <div className={className} style={{ '--h': hue(name) }}>
      <span className="ph-fallback" aria-hidden="true">{initial(name)}</span>
      {src && (
        <img src={src} alt={name} loading="lazy" decoding="async"
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      )}
    </div>
  );
}

// Seletor de quantidade
function Qty({ v, q, onChange, h }) {
  return (
    <div className={`qty${q > 0 ? ' on' : ''}`} style={h !== undefined ? { '--h': h } : undefined}>
      <button className="ghost" type="button" aria-label="Diminuir" disabled={q === 0} onClick={() => onChange(q - 1)}>
        <Icon name="minus" size={18} sw={2.4} />
      </button>
      <span>{q}</span>
      <button className="ghost" type="button" aria-label="Aumentar" disabled={v.stock === 0 || q >= v.stock} onClick={() => onChange(q + 1)}>
        <Icon name="plus" size={18} sw={2.4} />
      </button>
    </div>
  );
}

export default function Loja() {
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [cart, setCart] = useState({});
  const [favs, setFavs] = useState([]);
  const [ready, setReady] = useState(false);

  const [query, setQuery] = useState('');
  const [brandSel, setBrandSel] = useState('');
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [sort, setSort] = useState('padrao');

  const [menu, setMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [payInfo, setPayInfo] = useState(false);
  const [prodOpen, setProdOpen] = useState(null);
  const [slide, setSlide] = useState(0);
  const [toast, setToast] = useState(null);

  const [f, setF] = useState({ name: '', phone: '', payment: 'pix', cep: '', street: '', number: '', comp: '', bairro: '', city: '', uf: '' });
  // cep: 'idle' | 'loading' | 'ok' | 'notfound' | 'error'
  const [cepState, setCepState] = useState('idle');
  // quote: null | 'loading' | 'out' | 'error' | { zone, fee }
  const [quote, setQuote] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // situação da loja: null = ainda não sei (tratado como aberta)
  const [shop, setShop] = useState(null);
  const [hp, setHp] = useState(''); // campo-isca contra robôs: pessoas nunca preenchem
  const [copied, setCopied] = useState(false);

  const selIdx = useRef(0);

  async function load() {
    setLoadErr(false);
    for (let i = selIdx.current; i < SELECTS.length; i++) {
      const { data, error } = await supabase.from('products').select(SELECTS[i]).order('name');
      if (!error) {
        selIdx.current = i;
        setProducts(data || []);
        setLoaded(true);
        return;
      }
    }
    setLoadErr(true);
    setLoaded(true);
  }

  /* ---------- loja aberta ou fechada ---------- */
  useEffect(() => {
    let off = false;
    const check = () => supabase.rpc('store_status').then(({ data, error }) => {
      if (off || error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setShop(row);
    });
    check();
    const t = setInterval(check, 60000);
    return () => { off = true; clearInterval(t); };
  }, []);
  const closed = shop && shop.is_open === false;

  /* ---------- carregamento e persistência ---------- */
  useEffect(() => {
    load();
    try { setCart(JSON.parse(localStorage.getItem('loja-cart') || '{}') || {}); } catch {}
    try { setFavs(JSON.parse(localStorage.getItem('loja-favs') || '[]') || []); } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('loja-cart', JSON.stringify(cart)); } catch {}
  }, [cart, ready]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('loja-favs', JSON.stringify(favs)); } catch {}
  }, [favs, ready]);

  // Ajusta o carrinho salvo ao estoque atual (remove o que acabou)
  useEffect(() => {
    if (!loaded || !products.length) return;
    const stock = {};
    products.forEach((p) => (p.variants || []).forEach((v) => { stock[v.id] = Number(v.stock) || 0; }));
    setCart((c) => {
      let changed = false;
      const n = {};
      for (const [id, q] of Object.entries(c)) {
        const s = stock[id];
        const nq = s === undefined ? 0 : Math.min(Number(q) || 0, s);
        if (nq !== q) changed = true;
        if (nq > 0) n[id] = nq;
      }
      return changed ? n : c;
    });
  }, [products, loaded]);

  // Faixas do topo passam sozinhas
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % BANNERS.length), 4200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  const anyOpen = menu || cartOpen || payInfo || prodOpen !== null;

  useEffect(() => {
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') { setMenu(false); setCartOpen(false); setPayInfo(false); setProdOpen(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [anyOpen]);

  /* ---------- dados derivados ---------- */
  const catalog = useMemo(() => products
    .filter((p) => p.active !== false && p.variants && p.variants.length)
    .map((p) => {
      const variants = p.variants
        .map((v) => ({ ...v, price: Number(v.price) || 0, stock: Number(v.stock) || 0 }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR', { numeric: true }));
      const prices = variants.map((v) => v.price);
      return {
        ...p,
        variants,
        min: Math.min(...prices),
        max: Math.max(...prices),
        stock: variants.reduce((s, v) => s + v.stock, 0),
      };
    }), [products]);

  const all = useMemo(() => catalog.flatMap((p) => p.variants.map((v) => ({
    ...v, name: p.name, image_url: p.image_url, h: hue(p.name),
  }))), [catalog]);

  const brands = useMemo(() => [...new Set(catalog.map((p) => String(p.brand || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [catalog]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    let list = catalog.filter((p) =>
      (!brandSel || String(p.brand || '').trim() === brandSel) &&
      (!onlyFavs || favs.includes(p.id)) &&
      (!q || norm(p.name).includes(q) || norm(p.brand).includes(q) || p.variants.some((v) => norm(v.label).includes(q))));
    if (sort === 'menor') list = [...list].sort((a, b) => a.min - b.min);
    else if (sort === 'maior') list = [...list].sort((a, b) => b.max - a.max);
    else if (sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return list;
  }, [catalog, query, brandSel, onlyFavs, favs, sort]);

  const lines = all.filter((v) => cart[v.id] > 0);
  const subtotal = lines.reduce((s, v) => s + v.price * cart[v.id], 0);
  const count = lines.reduce((s, v) => s + cart[v.id], 0);
  const prod = prodOpen !== null ? catalog.find((p) => p.id === prodOpen) : null;
  const filtering = Boolean(query.trim() || brandSel || onlyFavs);

  /* ---------- ações ---------- */
  const qtyOf = (id) => cart[id] || 0;
  const setQty = (v, q) => setCart((c) => {
    const nq = Math.max(0, Math.min(v.stock, q));
    const n = { ...c };
    if (nq > 0) n[v.id] = nq; else delete n[v.id];
    return n;
  });
  const notify = (m) => setToast({ k: Date.now(), m });
  const add = (v) => {
    if (qtyOf(v.id) >= v.stock) { notify('Estoque máximo atingido'); return; }
    setQty(v, qtyOf(v.id) + 1);
    notify('Adicionado ao carrinho');
  };
  const quickAdd = (p) => (p.variants.length === 1 ? add(p.variants[0]) : setProdOpen(p.id));
  const toggleFav = (id) => setFavs((fs) => (fs.includes(id) ? fs.filter((x) => x !== id) : [...fs, id]));

  const closeAll = () => { setMenu(false); setCartOpen(false); setPayInfo(false); setProdOpen(null); };
  const openCart = () => { closeAll(); setToast(null); setCartOpen(true); };
  const resetFilters = () => { setQuery(''); setBrandSel(''); setOnlyFavs(false); };
  const scrollToProducts = () => setTimeout(() => {
    const el = document.getElementById('produtos');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
  const goHome = () => { closeAll(); resetFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const goProducts = () => { closeAll(); resetFilters(); scrollToProducts(); };
  const goFavs = () => { closeAll(); setBrandSel(''); setQuery(''); setOnlyFavs(true); scrollToProducts(); };
  const goBrand = (b) => { closeAll(); setOnlyFavs(false); setQuery(''); setBrandSel(b); scrollToProducts(); };

  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cepDigits = f.cep.replace(/\D/g, '');
  const fee = quote && typeof quote === 'object' ? Number(quote.fee) || 0 : 0;
  const total = subtotal + fee;
  const canSend = !closed && quote && typeof quote === 'object' && f.street.trim() && f.number.trim();
  const maskCep = (v) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; };
  const copy = async (t) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  /* ---------- CEP: busca o endereço e calcula a entrega ---------- */
  useEffect(() => {
    if (cepDigits.length !== 8) { setCepState('idle'); setQuote(null); return; }
    let off = false;
    setCepState('loading'); setQuote(null);
    fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        if (d.erro) { setCepState('notfound'); setF((x) => ({ ...x, street: '', bairro: '', city: '', uf: '' })); return; }
        setF((x) => ({ ...x, street: d.logradouro || '', bairro: d.bairro || '', city: d.localidade || '', uf: d.uf || '' }));
        setCepState('ok');
      })
      .catch(() => { if (!off) setCepState('error'); });
    return () => { off = true; };
  }, [cepDigits]);

  useEffect(() => {
    if (cepState !== 'ok' || !f.city) return;
    let off = false;
    setQuote('loading');
    supabase.rpc('delivery_quote', { p_city: f.city, p_bairro: f.bairro || '' }).then(({ data, error }) => {
      if (off) return;
      if (error) return setQuote('error');
      const row = Array.isArray(data) ? data[0] : data;
      setQuote(row && row.fee !== undefined && row.fee !== null ? { zone: row.zone_name, fee: row.fee } : 'out');
    });
    return () => { off = true; };
  }, [cepState, f.city, f.bairro]);

  async function send(e) {
    e.preventDefault();
    if (hp) { closeAll(); setDone({ pay: f.payment, total, name: '' }); setCart({}); return; } // robô: finge que deu certo
    setBusy(true); setErr('');
    const items = lines.map((v) => ({ variant_id: v.id, qty: cart[v.id] }));
    const address = `${f.street.trim()}, ${f.number.trim()}${f.comp.trim() ? ' - ' + f.comp.trim() : ''} - ${f.bairro ? f.bairro + ', ' : ''}${f.city}/${f.uf} - CEP ${maskCep(f.cep)}`;
    const { data, error } = await supabase.rpc('create_order', {
      p_name: f.name, p_phone: f.phone, p_address: address, p_payment: f.payment, p_items: items,
      p_city: f.city, p_bairro: f.bairro || '',
    });
    setBusy(false);
    if (error) { setErr(error.message); load(); return; }
    closeAll();
    setDone({ pay: f.payment, total, name: f.name.trim().split(' ')[0] });
    setCart({});
    setF((x) => ({ ...x, cep: '', street: '', number: '', comp: '', bairro: '', city: '', uf: '' }));
  }

  /* ---------- pedido recebido ---------- */
  if (done) {
    const pix = PIX;
    return (
      <main className="shop">
        <div className="card done">
          <div className="check"><Icon name="check" size={44} sw={3} /></div>
          <h2>Pedido recebido!</h2>
          <p className="muted" style={{ margin: 0 }}>Total: <b style={{ color: 'var(--ink)' }}>{brl(done.total)}</b></p>
          {done.pay === 'pix' ? (
            <>
              <p className="muted">Pague via Pix para a chave abaixo e envie o comprovante pelo WhatsApp.</p>
              <div className="pixbox">
                <span>{pix}</span>
                <button type="button" className="ghost" onClick={() => copy(pix)}>
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">O pagamento será feito na entrega.</p>
          )}
          <div className="stack">
            <a className="btn cta" href={wa(`Oi! Sou ${done.name || 'cliente'}, acabei de fazer um pedido no site (${brl(done.total)}). Segue o comprovante.`)}>Enviar comprovante</a>
            <a className="btn ghost" href={wa(`Oi! Sou ${done.name || 'cliente'}, quero acompanhar meu pedido de ${brl(done.total)}.`)}>Acompanhar pedido</a>
            <button className="ghost" onClick={() => setDone(null)}>Novo pedido</button>
          </div>
        </div>
      </main>
    );
  }

  /* ---------- loja ---------- */
  return (
    <>
      <header className="topbar">
        <div className="tb-in">
          <button className="logo-btn" aria-label={`${STORE}, início`} onClick={goHome}>
            <Logo />
          </button>
          <label className="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Buscar produtos"
              aria-label="Buscar produtos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="clear" aria-label="Limpar busca" onClick={() => setQuery('')}>
                <Icon name="x" size={14} sw={2.6} />
              </button>
            )}
          </label>
          <button className="iconbtn" aria-label="Abrir carrinho" onClick={openCart}>
            <Icon name="bag" />
            {count > 0 && <span key={count} className="badge">{count}</span>}
          </button>
          <button className="iconbtn" aria-label="Abrir menu" onClick={() => { closeAll(); setMenu(true); }}>
            <Icon name="menu" />
          </button>
        </div>
      </header>

      <main className="shop">
        {closed && (
          <div className="closedbar" role="status">
            <b>Estamos fechados no momento</b>
            {shop.mode === 'auto' ? `Atendemos das ${shop.open_time} às ${shop.close_time}. Você pode olhar os produtos, mas só consegue finalizar o pedido quando abrirmos.` : 'Voltamos em breve. Você pode olhar os produtos, mas só consegue finalizar o pedido quando abrirmos.'}
          </div>
        )}
        <section className="banner" aria-label="Destaques">
          <div className="btrack" style={{ transform: `translateX(-${slide * 100}%)` }}>
            {BANNERS.map((b) => (
              <div className={`slide${b.logo ? ' has-logo' : ''}`} key={b.t} style={{ background: b.bg }}>
                <b>{b.t}</b>
                <span>{b.s}</span>
                {b.logo && <img className="slide-logo" src={LOGO} alt="" />}
              </div>
            ))}
          </div>
          <div className="dots" aria-hidden="true">
            {BANNERS.map((b, i) => <i key={b.t} className={i === slide ? 'on' : ''} />)}
          </div>
        </section>

        <div className="fchips" id="produtos">
          <button className={`fchip${!filtering ? ' on' : ''}`} onClick={resetFilters}>Todos</button>
          <button className={`fchip${onlyFavs ? ' on' : ''}`} onClick={() => setOnlyFavs(!onlyFavs)}>
            <Icon name="heart" size={15} fill={onlyFavs ? 'currentColor' : 'none'} />
            Favoritos{favs.length ? ` · ${favs.length}` : ''}
          </button>
          {brands.map((b) => (
            <button key={b} className={`fchip${brandSel === b ? ' on' : ''}`} onClick={() => setBrandSel(brandSel === b ? '' : b)}>
              {b}
            </button>
          ))}
        </div>

        <div className="toolbar">
          <span className="muted">
            {loaded ? `${visible.length} ${visible.length === 1 ? 'produto' : 'produtos'}` : 'Carregando…'}
          </span>
          <div className="sort">
            <select aria-label="Ordenar produtos" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="padrao">Ordenar: padrão</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
              <option value="az">Nome, A a Z</option>
            </select>
          </div>
        </div>

        {!loaded && (
          <div className="pgrid">
            {[0, 1, 2, 3].map((i) => <div className="sk-card" key={i} />)}
          </div>
        )}

        {loaded && loadErr && (
          <div className="card empty">
            <h3>Não foi possível carregar os produtos</h3>
            <p className="muted">Confira sua conexão e tente de novo.</p>
            <button onClick={() => { setLoaded(false); load(); }}>Tentar de novo</button>
          </div>
        )}

        {loaded && !loadErr && visible.length === 0 && (
          <div className="card empty">
            <h3>{filtering ? 'Nenhum produto encontrado' : 'Nenhum produto disponível no momento'}</h3>
            <p className="muted">{filtering ? 'Tente outra busca ou limpe os filtros.' : 'Volte em breve.'}</p>
            {filtering && <button className="ghost" onClick={resetFilters}>Limpar filtros</button>}
          </div>
        )}

        {loaded && visible.length > 0 && (
          <div className="pgrid">
            {visible.map((p, i) => {
              const soldOut = p.stock === 0;
              const inCart = p.variants.reduce((s, v) => s + qtyOf(v.id), 0);
              const fav = favs.includes(p.id);
              return (
                <article className="pcard" key={p.id} style={{ '--i': Math.min(i, 8) }}>
                  <div className="ph-wrap">
                    <div onClick={() => setProdOpen(p.id)}>
                      <Photo src={p.image_url} name={p.name} className="ph" />
                    </div>
                    {soldOut && <span className="sold">Esgotado</span>}
                    {!soldOut && inCart > 0 && <span className="incart">{inCart} no carrinho</span>}
                    <button
                      className={`fav${fav ? ' on' : ''}`}
                      aria-label={fav ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
                      aria-pressed={fav}
                      onClick={() => toggleFav(p.id)}
                    >
                      <Icon name="heart" size={18} fill={fav ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="pinfo">
                    {p.brand ? <span className="pbrand">{p.brand}</span> : null}
                    <h3 className="pname">
                      <button className="plink" onClick={() => setProdOpen(p.id)}>{p.name}</button>
                    </h3>
                    <p className="pmeta">{p.variants.length === 1 ? p.variants[0].label : `${p.variants.length} opções`}</p>
                    <div className="pbuy">
                      <div>
                        {p.min !== p.max && <span className="pfrom">a partir de</span>}
                        <span className="pprice">{brl(p.min)}</span>
                      </div>
                      {soldOut ? (
                        WA ? (
                          <a className="padd alert" href={wa(`Quero ser avisado quando ${p.name} voltar ao estoque.`)}>
                            <Icon name="bell" size={16} />Avisar
                          </a>
                        ) : null
                      ) : (
                        <button className="padd" aria-label={`Adicionar ${p.name}`} onClick={() => quickAdd(p)}>
                          <Icon name="plus" size={20} sw={2.4} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* ---------- barra do carrinho ---------- */}
      {lines.length > 0 && !anyOpen && (
        <div className="cartbar">
          <div>
            <small>{count} {count === 1 ? 'item' : 'itens'}</small>
            <b>{brl(subtotal)}</b>
          </div>
          <button type="button" onClick={openCart}>Ver pedido</button>
        </div>
      )}

      {toast && (
        <div className="toast" key={toast.k} role="status">
          <Icon name="check" size={16} sw={2.8} />{toast.m}
        </div>
      )}

      {/* ---------- menu lateral ---------- */}
      {menu && (
        <>
          <div className="scrim" onClick={closeAll} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="dr-head">
              <span className="dr-logo"><Logo /></span>
              <div>
                <b>{STORE}</b>
                <small>Menu</small>
              </div>
              <button className="iconbtn" aria-label="Fechar menu" onClick={closeAll}><Icon name="x" /></button>
            </div>
            <nav className="dr-nav">
              <button className="dr-item" onClick={goHome}><Icon name="home" /> Início</button>
              <button className="dr-item" onClick={goProducts}><Icon name="grid" /> Todos os produtos</button>
              <button className="dr-item" onClick={goFavs}>
                <Icon name="heart" /> Favoritos{favs.length ? ` (${favs.length})` : ''}
              </button>
              <button className="dr-item" onClick={openCart}>
                <Icon name="bag" /> Meu carrinho{count ? ` (${count})` : ''}
              </button>
              {WA && (
                <a className="dr-item" href={wa('Quero acompanhar meu pedido.')}><Icon name="truck" /> Acompanhar pedido</a>
              )}
              {WA && (
                <a className="dr-item" href={wa(`Olá! Vim pelo site da ${STORE} e gostaria de ajuda.`)}><Icon name="chat" /> Falar com a loja</a>
              )}
              <button className="dr-item" onClick={() => { closeAll(); setPayInfo(true); }}>
                <Icon name="card" /> Formas de pagamento
              </button>
            </nav>
            {brands.length > 0 && (
              <>
                <p className="dr-title">Marcas</p>
                <div className="dr-brands">
                  {brands.map((b) => (
                    <button key={b} className={`fchip${brandSel === b ? ' on' : ''}`} onClick={() => goBrand(b)}>{b}</button>
                  ))}
                </div>
              </>
            )}
            <p className="dr-foot muted">{STORE}</p>
          </aside>
        </>
      )}

      {/* ---------- formas de pagamento ---------- */}
      {payInfo && (
        <>
          <div className="scrim" onClick={closeAll} />
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Formas de pagamento">
            <div className="grab" />
            <div className="sheet-head">
              <h2>Formas de pagamento</h2>
              <button className="iconbtn" aria-label="Fechar" onClick={closeAll}><Icon name="x" /></button>
            </div>
            <div className="payrow"><span className="pico"><Icon name="pix" /></span><div><b>Pix</b><p className="muted">Pague na hora pela chave Pix e envie o comprovante pelo WhatsApp.</p></div></div>
            <div className="payrow"><span className="pico"><Icon name="card" /></span><div><b>Cartão</b><p className="muted">Pague na entrega, direto na maquininha.</p></div></div>
            <div className="payrow"><span className="pico"><Icon name="cash" /></span><div><b>Dinheiro</b><p className="muted">Pague na entrega, direto ao entregador.</p></div></div>
            <div className="sheet-actions">
              <button className="cta" onClick={closeAll}>Entendi</button>
            </div>
          </section>
        </>
      )}

      {/* ---------- ficha do produto ---------- */}
      {prod && (
        <>
          <div className="scrim" onClick={closeAll} />
          <section className="sheet psheet" role="dialog" aria-modal="true" aria-label={prod.name} style={{ '--h': hue(prod.name) }}>
            <div className="grab" />
            <div className="pbig-wrap">
              <Photo src={prod.image_url} name={prod.name} className="pbig" />
              <button className="iconbtn close" aria-label="Fechar" onClick={closeAll}><Icon name="x" /></button>
              <button
                className={`fav${favs.includes(prod.id) ? ' on' : ''}`}
                aria-label={favs.includes(prod.id) ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
                aria-pressed={favs.includes(prod.id)}
                onClick={() => toggleFav(prod.id)}
              >
                <Icon name="heart" size={18} fill={favs.includes(prod.id) ? 'currentColor' : 'none'} />
              </button>
            </div>
            {prod.brand ? <span className="pbrand">{prod.brand}</span> : null}
            <h2>{prod.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {prod.min === prod.max ? brl(prod.min) : `${brl(prod.min)} a ${brl(prod.max)}`}
            </p>
            <div className="vlist">
              {prod.variants.map((v) => {
                const q = qtyOf(v.id);
                return (
                  <div className={`vrow${v.stock === 0 ? ' soldout' : ''}`} key={v.id}>
                    <div className="vinfo">
                      <b>{v.label}</b>
                      <span>{brl(v.price)}</span>
                      {v.stock > 0 && v.stock <= 5 && <small>Restam {v.stock}</small>}
                    </div>
                    {v.stock === 0 ? (
                      <span className="tag bad">Esgotado</span>
                    ) : (
                      <Qty v={v} q={q} onChange={(n) => setQty(v, n)} h={hue(prod.name)} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="sheet-actions">
              {count > 0 && <button className="cta" onClick={openCart}>Ver carrinho · {brl(subtotal)}</button>}
              <button className="ghost" onClick={closeAll}>Continuar comprando</button>
            </div>
          </section>
        </>
      )}

      {/* ---------- carrinho e finalização ---------- */}
      {cartOpen && (
        <>
          <div className="scrim" onClick={closeAll} />
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Seu pedido">
            <div className="grab" />
            <div className="sheet-head">
              <h2>Seu pedido</h2>
              <button className="iconbtn" aria-label="Fechar" onClick={closeAll}><Icon name="x" /></button>
            </div>

            {lines.length === 0 ? (
              <div className="empty">
                <h3>Seu carrinho está vazio</h3>
                <p className="muted">Toque no + dos produtos para adicionar.</p>
                <button className="ghost" onClick={closeAll}>Ver produtos</button>
              </div>
            ) : (
              <>
                <div className="clines">
                  {lines.map((v) => (
                    <div className="cline" key={v.id} style={{ '--h': v.h }}>
                      <Photo src={v.image_url} name={v.name} className="cthumb" />
                      <div className="cinfo">
                        <b>{v.name}</b>
                        <small>{v.label} · {brl(v.price)}</small>
                        <span>{brl(v.price * cart[v.id])}</span>
                        <button type="button" className="rm" onClick={() => setQty(v, 0)}>Remover</button>
                      </div>
                      <Qty v={v} q={cart[v.id]} onChange={(n) => setQty(v, n)} h={v.h} />
                    </div>
                  ))}
                </div>

                <div className="sum">
                  <div className="sumline"><span>Subtotal</span><b>{brl(subtotal)}</b></div>
                  <div className="sumline">
                    <span>Entrega</span>
                    <b>
                      {quote && typeof quote === 'object' ? brl(fee)
                        : quote === 'loading' || cepState === 'loading' ? 'calculando...'
                        : 'informe o CEP'}
                    </b>
                  </div>
                  {quote && typeof quote === 'object' && (
                    <div className="sumline total"><span>Total</span><b>{brl(total)}</b></div>
                  )}
                </div>

                <form onSubmit={send}>
                  <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} />
                  <input placeholder="Nome completo" autoComplete="name" value={f.name} onChange={upd('name')} required />
                  <input type="tel" inputMode="tel" placeholder="WhatsApp (com DDD)" autoComplete="tel" value={f.phone} onChange={upd('phone')} required />
                  <input
                    inputMode="numeric"
                    placeholder="CEP"
                    autoComplete="postal-code"
                    value={maskCep(f.cep)}
                    onChange={(e) => setF({ ...f, cep: e.target.value })}
                    maxLength={9}
                    required
                  />
                  {cepState === 'loading' && <p className="muted" style={{ margin: '0 0 8px' }}>Buscando endereço...</p>}
                  {cepState === 'notfound' && <p className="err">CEP não encontrado. Confira os números.</p>}
                  {cepState === 'error' && <p className="err">Não consegui buscar o CEP agora. Tente de novo em instantes.</p>}
                  {cepState === 'ok' && (
                    <>
                      <input placeholder="Rua" autoComplete="address-line1" value={f.street} onChange={upd('street')} required />
                      {!f.bairro && <input placeholder="Bairro" value={f.bairro} onChange={upd('bairro')} required />}
                      <p className="muted" style={{ margin: '0 0 8px' }}>{f.bairro ? f.bairro + ' · ' : ''}{f.city}/{f.uf}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
                        <input placeholder="Número" inputMode="numeric" value={f.number} onChange={upd('number')} required />
                        <input placeholder="Complemento (opcional)" value={f.comp} onChange={upd('comp')} />
                      </div>
                    </>
                  )}
                  {quote === 'out' && (
                    <p className="err">
                      Ainda não entregamos nesse endereço.
                      {WA && <> <a href={wa(`Oi! Meu CEP é ${maskCep(f.cep)}, vocês conseguem entregar?`)} style={{ textDecoration: 'underline' }}>Falar com a loja</a></>}
                    </p>
                  )}
                  {quote === 'error' && <p className="err">Não consegui calcular a entrega. Tente de novo.</p>}

                  <div className="paygrid">
                    {PAY.map((o) => (
                      <button
                        type="button"
                        key={o.id}
                        className={`opt${f.payment === o.id ? ' on' : ''}`}
                        onClick={() => setF({ ...f, payment: o.id })}
                      >
                        <i><Icon name={o.icon} /></i>{o.label}<small>{o.sub}</small>
                      </button>
                    ))}
                  </div>

                  {err && <p className="err">{err}</p>}
                  <button className="cta" disabled={busy || !canSend}>{busy ? 'Enviando...' : closed ? 'Loja fechada no momento' : canSend ? `Confirmar pedido · ${brl(total)}` : 'Informe o CEP para continuar'}</button>
                </form>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
