import './globals.css';

export const metadata = {
  title: 'Smoke Euphoria',
  applicationName: 'Smoke Euphoria',
  manifest: '/pwa?m=loja',
  icons: {
    icon: [{ url: '/pwa?s=192', type: 'image/png' }],
    apple: [{ url: '/pwa?s=180', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: 'Smoke Euphoria', statusBarStyle: 'default' },
};

// viewportFit "cover" libera a área do entalhe/barra do iPhone (safe area)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f6f3fb',
};

export default function Layout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
