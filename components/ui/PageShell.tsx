import TopNav from './TopNav';

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: number;
}

export default function PageShell({ children, maxWidth = 1400 }: PageShellProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-gradient)' }}>
      <TopNav />
      <main style={{ maxWidth, margin: '0 auto', padding: '24px 20px 48px' }}>
        {children}
      </main>
    </div>
  );
}
