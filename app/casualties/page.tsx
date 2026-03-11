'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { CountryFlag, ConfidenceBadge } from '@/components/ui/Badges';

interface CasRow {
  country: string;
  killed: number; injured: number;
  civilian_killed: number; civilian_injured: number;
  military_killed: number; military_injured: number;
  confidence: string;
  sources: { publisher: string }[][];
}

export default function CasualtiesPage() {
  const sp = useSearchParams();
  const theater = sp.get('theater') ?? 'me-iran-israel-us';
  const [range, setRange] = useState(sp.get('range') ?? '24h');
  const [data, setData] = useState<CasRow[]>([]);
  const [totals, setTotals] = useState({ killed: 0, injured: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/casualties?theater=${theater}&range=${range}`)
      .then(r => r.json())
      .then(j => { setData(j.data ?? []); setTotals(j.totals ?? { killed: 0, injured: 0 }); })
      .finally(() => setLoading(false));
  }, [theater, range]);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Casualty Overview</h1>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '12px' }}>
          Figures from explicitly reported sources only. Never inferred from events.
        </p>
      </div>

      {/* Range chips */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '4px' }}>
        {['24h','72h','96h','7d'].map(r => (
          <button key={r} onClick={() => setRange(r)} className={`chip ${range === r ? 'active' : ''}`}>{r}</button>
        ))}
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Total Killed</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 800, color: '#ef4444' }}>{totals.killed}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Total Injured</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 800, color: '#f97316' }}>{totals.injured}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
              {['Country','Killed','Injured','Civilian K','Military K','Confidence'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} style={{ padding: '10px 12px' }}>
                      <div className="skeleton" style={{ height: '16px', borderRadius: '4px' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.map(row => (
              <tr key={row.country} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CountryFlag country={row.country} />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{row.country}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ef4444', fontSize: '13px' }}>{row.killed ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#f97316', fontSize: '13px' }}>{row.injured ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#64748b' }}>{row.civilian_killed ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#64748b' }}>{row.military_killed ?? '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <ConfidenceBadge value={row.confidence as any} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px', fontSize: '13px' }}>
            No casualty reports for this period.
          </div>
        )}
      </div>
    </PageShell>
  );
}
