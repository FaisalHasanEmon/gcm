import Link from 'next/link';
import type { Hotspot } from '@/lib/types';
import { SEV_COLOR } from '@/components/ui/Badges';

interface Props { hotspots: Hotspot[]; theater: string; }

export default function HotspotsCard({ hotspots, theater }: Props) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Hotspots</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{today}</span>
          <Link href={`/map?theater=${theater}`} className="view-all">&rsaquo;</Link>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {hotspots.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>No hotspot clusters computed.</p>
        )}
        {hotspots.slice(0, 5).map((hs, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: i < hotspots.length - 1 ? '1px solid #f8fafc' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: SEV_COLOR[hs.max_severity],
                boxShadow: `0 0 5px ${SEV_COLOR[hs.max_severity]}66`,
                display: 'inline-block',
              }} />
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{hs.location_name}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
              {hs.event_count}.{String(Math.round(hs.lat * 1000)).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
