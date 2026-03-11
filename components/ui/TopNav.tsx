'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/',          label: 'Dashboard' },
  { href: '/timeline',  label: 'Timeline'  },
  { href: '/map',       label: 'Map'       },
  { href: '/daily',     label: 'Reports'   },
];

export default function TopNav() {
  const path = usePathname();

  return (
    <nav style={{
      background: 'rgba(15,23,42,.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,.08)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px',
      display: 'flex', alignItems: 'center', height: '52px', gap: '32px',
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          background: 'linear-gradient(135deg,#ef4444,#f97316)',
          borderRadius: '6px', width: '30px', height: '30px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '13px', color: '#fff',
          fontFamily: 'var(--font-mono)', letterSpacing: '-.02em',
        }}>GCM</span>
        <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '14px', letterSpacing: '.02em' }}>
          Global Conflict Monitor
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
        {NAV_LINKS.map(l => {
          const active = path === l.href || (l.href !== '/' && path.startsWith(l.href));
          return (
            <Link key={l.href} href={l.href} style={{
              color: active ? '#f8fafc' : '#94a3b8',
              fontWeight: active ? 600 : 400,
              fontSize: '13.5px',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
              transition: 'all .15s',
            }}>{l.label}</Link>
          );
        })}
      </div>

      {/* Subscribe CTA */}
      <Link href="/subscribe" style={{
        background: '#3b82f6',
        color: '#fff',
        fontWeight: 600,
        fontSize: '13px',
        padding: '7px 16px',
        borderRadius: '7px',
        textDecoration: 'none',
        letterSpacing: '.02em',
        transition: 'background .15s',
      }}>Subscribe Alerts</Link>
    </nav>
  );
}
