import Link from 'next/link';
import type { RegionSummary } from '@/lib/types';
import { CountryFlag, ConfidenceBadge, SevDot, SourceChip } from '@/components/ui/Badges';

interface Props { regions: RegionSummary[]; theater: string; }

export default function RegionalSituationCard({ regions, theater }: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Regional Situation</span>
        <Link href={`/regions?theater=${theater}`} className="view-all">View all &rsaquo;</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {regions.slice(0, 4).map(region => (
          <Link key={region.country} href={`/regions?theater=${theater}&country=${region.country}`} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', gap: '12px', padding: '10px', background: '#f8fafc', borderRadius: '8px', cursor: 'pointer' }}>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: '6px', paddingTop: '2px' }}>
                <CountryFlag country={region.country} />
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', width: '70px' }}>{region.country}</span>
              </div>
              <div style={{ flex: 1 }}>
                {region.bullets.slice(0, 2).map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '3px' }}>
                    <span style={{ color: '#94a3b8', flexShrink: 0 }}>•</span>
                    <span style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>{b}</span>
                  </div>
                ))}
              </div>
              {region.key_events.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <SevDot value={region.key_events[0].severity} />
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#1e293b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {region.key_events[0].summary_20w?.slice(0, 50)}…
                    </span>
                    <span style={{ fontSize: '10px', color: '#3b82f6' }}>›</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(region.key_events[0].sources ?? []).slice(0, 2).map((s, i) => (
                      <SourceChip key={i} name={s.publisher.slice(0, 8)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
