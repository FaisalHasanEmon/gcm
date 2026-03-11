import Link from 'next/link';
import type { ConflictEvent } from '@/lib/types';
import { DamageIcon, ConfidenceBadge } from '@/components/ui/Badges';

interface Props { events: ConflictEvent[]; theater: string; }

export default function DamageCard({ events, theater }: Props) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-header">
        <span className="card-title">Major Damage Events</span>
        <Link href={`/damage?theater=${theater}`} className="view-all">View all &rsaquo;</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {events.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>No damage events reported.</p>
        )}
        {events.slice(0, 4).map(ev => (
          <Link key={ev.event_id} href={`/damage?theater=${theater}`} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <div style={{ width: '28px', height: '28px', background: '#fff7ed', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px' }}>
                {ev.damage_asset && <DamageIcon asset={ev.damage_asset} />}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>
                  {ev.damage_asset} {ev.damage_type ? `– ${ev.damage_type}` : ''}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                  {ev.location_name ?? ev.country_primary}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
