'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { CasualtySummary } from '@/lib/types';
import { CountryFlag, ConfidenceBadge } from '@/components/ui/Badges';

const CHIPS = ['24h', '72h', '96h', '7d'];

interface Props {
  data:    Record<string, CasualtySummary[]>;
  theater: string;
}

export default function CasualtyCard({ data, theater }: Props) {
  const [range, setRange] = useState('24h');
  const rows = data[range] ?? data['24h'] ?? [];

  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span className="card-title">Casualty Overview</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {CHIPS.map(c => (
              <button key={c} onClick={() => setRange(c)} className={`chip ${range === c ? 'active' : ''}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <Link href={`/casualties?theater=${theater}&range=${range}`} className="view-all">View all &rsaquo;</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>No casualty reports for this period.</p>
        )}
        {rows.map(row => (
          <div key={row.country} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 0', borderBottom: '1px solid #f1f5f9',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CountryFlag country={row.country} />
              <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b' }}>{row.country}</span>
            </div>
            <div style={{ fontSize: '13px', color: '#334155', fontFamily: 'var(--font-mono)' }}>
              <span style={{ fontWeight: 700, color: '#ef4444' }}>{row.killed}</span>
              <span style={{ color: '#94a3b8' }}> killed / </span>
              <span style={{ fontWeight: 600, color: '#f97316' }}>{row.injured}</span>
              <span style={{ color: '#94a3b8' }}> injured</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
