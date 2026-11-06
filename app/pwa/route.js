import { ICONS } from '@/lib/icons';

// Serve dois tipos de arquivo, sem precisar subir imagens no GitHub:
//   /pwa?s=192  -> ícone do app (180, 192 ou 512)
//   /pwa?m=admin -> manifesto do app instalável (admin, entregas ou loja)
const APPS = {
  loja: { name: 'Smoke Euphoria', short_name: 'Smoke', start_url: '/', scope: '/' },
    admin: { name: 'Smoke', short_name: 'Smoke', start_url: '/admin', scope: '/admin' },
  entregas: { name: 'Entregas Smoke Euphoria', short_name: 'Entregas', start_url: '/entregas', scope: '/entregas' },
};

export async function GET(request) {
  const url = new URL(request.url);
  const size = url.searchParams.get('s');
  const app = url.searchParams.get('m');

  if (size) {
    const b64 = ICONS[size];
    if (!b64) return new Response('Não encontrado', { status: 404 });
    return new Response(Buffer.from(b64, 'base64'), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  if (app) {
    const a = APPS[app] || APPS.loja;
    const manifest = {
      ...a,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#14101f',
      theme_color: '#14101f',
      lang: 'pt-BR',
      icons: [
        { src: '/pwa?s=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa?s=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa?s=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    return new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  return new Response('Não encontrado', { status: 404 });
}
