export const metadata = {
  title: 'Painel · Smoke Euphoria',
  manifest: '/pwa?m=admin',
  appleWebApp: { capable: true, title: 'Painel', statusBarStyle: 'default' },
};

export default function AdminLayout({ children }) {
  return children;
}
