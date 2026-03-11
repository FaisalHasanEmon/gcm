'use client';
import { useRouter, useSearchParams } from 'next/navigation';

interface Theater {
  slug: string;
  name: string;
}

const THEATERS: Theater[] = [
  { slug: 'me-iran-israel-us',   name: 'Middle East – Iran/Israel/US' },
  { slug: 'eu-ukraine-russia',   name: 'Eastern Europe – Ukraine/Russia' },
];

export default function TheaterSelector({ current }: { current: string }) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const onChange = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('theater', slug);
    router.push(`/?${params.toString()}`);
  };

  const theater = THEATERS.find(t => t.slug === current) ?? THEATERS[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px', fontWeight: 500 }}>THEATER</span>
      <select
        value={current}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'rgba(255,255,255,.12)',
          border: '1px solid rgba(255,255,255,.2)',
          color: '#f8fafc',
          borderRadius: '7px',
          padding: '5px 28px 5px 10px',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 6px center',
          backgroundSize: '16px',
        }}>
        {THEATERS.map(t => (
          <option key={t.slug} value={t.slug} style={{ background: '#1e293b', color: '#f8fafc' }}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
