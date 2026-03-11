import Link from 'next/link';
import type { ConflictEvent } from '@/lib/types';
import { SevDot, SourceChip } from '@/components/ui/Badges';

interface Props { events: ConflictEvent[]; theater: string; }

export default function DevelopmentsCard({ events, theater }: Props) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-header">
        <span className="card-title">Major Developments</span>
        <Link href={`/developments?theater=${theater}`} className="view-all">View all &rsaquo;</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {events.slice(0, 5).map(ev => (
          <Link key={ev.event_id} href={`/developments?theater=${theater}`} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
              <SevDot value={ev.severity} />
              <span style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, fontWeight: 500 }}>
                {ev.summary_20w}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {events.length > 0 && (
        <div style={{ marginTop: '14px', color: '#94a3b8', fontSize: '11px' }}>
          Sources: {[...new Set(events.flatMap(e => (e.sources ?? []).map(s => s.publisher)).slice(0, 4))].join(' · ')}
        </div>
      )}
    </div>
  );
}
