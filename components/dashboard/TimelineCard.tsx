'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ConflictEvent } from '@/lib/types';
import { SevDot, CountryFlag, ConfidenceBadge, SourceChip } from '@/components/ui/Badges';

const TIME_CHIPS = ['6h', '24h', '72h', '96h', '7d'];

interface Props { events: ConflictEvent[]; theater: string; }

export default function TimelineCard({ events, theater }: Props) {
  const [range, setRange] = useState('24h');

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="card-title">Conflict Activity Timeline</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {TIME_CHIPS.map(c => (
              <button key={c} onClick={() => setRange(c)} className={`chip ${range === c ? 'active' : ''}`}>{c}</button>
            ))}
          </div>
        </div>
        <Link href={`/timeline?theater=${theater}&range=${range}`} className="view-all">View all &rsaquo;</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
        {events.slice(0, 5).map((ev, i) => (
          <EventRow key={ev.event_id} ev={ev} theater={theater} last={i === events.length - 1} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ ev, theater, last }: { ev: ConflictEvent; theater: string; last: boolean }) {
  const time = ev.timestamp_utc
    ? new Date(ev.timestamp_utc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    : '—';

  return (
    <Link href={`/timeline?theater=${theater}`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '10px 0',
        borderBottom: last ? 'none' : '1px solid #f8fafc',
        cursor: 'pointer',
      }}>
        {/* Severity indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, width: '56px' }}>
          <SevDot value={ev.severity} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
            {time}
          </span>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <CountryFlag country={ev.country_primary} />
            <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{ev.country_primary}</span>
            <span style={{ fontSize: '13px', color: '#475569' }}>
              {ev.headline ?? ev.summary_20w}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <ConfidenceBadge value={ev.confidence} />
            {(ev.sources ?? []).slice(0, 2).map((s, i) => (
              <SourceChip key={i} name={s.publisher} />
            ))}
            {ev.sources_count != null && ev.sources_count > 0 && (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{ev.sources_count} sources</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
