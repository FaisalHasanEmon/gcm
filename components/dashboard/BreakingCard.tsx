import Link from 'next/link';
import type { ConflictEvent } from '@/lib/types';
import { ConfidenceBadge, CountryFlag, SourceChip } from '@/components/ui/Badges';

interface Props { event: ConflictEvent | null; theater: string; }

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BreakingCard({ event, theater }: Props) {
  return (
    <div className="card" style={{ borderTop: '3px solid #ef4444' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '.08em', color: '#ef4444' }}>BREAKING</span>
          {event && (
            <div style={{ display: 'flex', gap: '5px' }}>
              {(event.sources ?? []).slice(0, 3).map((s, i) => (
                <SourceChip key={i} name={s.publisher.slice(0,3).toUpperCase()} />
              ))}
            </div>
          )}
        </div>
        <Link href={`/breaking?theater=${theater}`} className="view-all">View all &rsaquo;</Link>
      </div>

      {event ? (
        <Link href={`/breaking?theater=${theater}`} style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', lineHeight: 1.5, marginBottom: '5px' }}>
                <span style={{ color: '#ef4444', fontStyle: 'italic', marginRight: '6px' }}>
                  {event.headline ?? event.summary_20w}
                </span>
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '13px' }}>
                  — <ConfidenceBadge value={event.confidence} />
                  &nbsp;|&nbsp;{event.country_primary}
                  &nbsp;–&nbsp;{event.timestamp_utc ? timeAgo(event.timestamp_utc) : ''}
                </span>
              </p>
            </div>
            <span style={{ color: '#94a3b8', fontSize: '18px' }}>›</span>
          </div>
        </Link>
      ) : (
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>No breaking events in the last 3 hours.</p>
      )}
    </div>
  );
}
