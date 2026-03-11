'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { ConfidenceBadge, SeverityBadge, CountryFlag, EventTypeIcon, SourceChip, SEV_COLOR } from '@/components/ui/Badges';
import EventDrawer from '@/components/ui/EventDrawer';
import type { ConflictEvent } from '@/lib/types';

const DEFAULT_THEATER = 'me-iran-israel-us';

const EVENT_TYPES = [
  'airstrike','missile_launch','drone_attack','military_movement','naval_activity',
  'official_statement','warning_alert','explosion','infrastructure_damage','other',
];
const SEVERITIES   = ['critical','high','medium','low'];
const CONFIDENCES  = ['confirmed','likely','unconfirmed'];

export default function TimelinePage() {
  const sp      = useSearchParams();
  const theater = sp.get('theater') ?? DEFAULT_THEATER;

  const [range,      setRange]      = useState(sp.get('range') ?? '24h');
  const [type,       setType]       = useState('');
  const [severity,   setSeverity]   = useState('');
  const [confidence, setConfidence] = useState('');
  const [signal,     setSignal]     = useState('');
  const [search,     setSearch]     = useState('');
  const [events,     setEvents]     = useState<ConflictEvent[]>([]);
  const [cursor,     setCursor]     = useState<string | null>(null);
  const [cursorTs,   setCursorTs]   = useState<string | null>(null);
  const [hasMore,    setHasMore]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState<ConflictEvent | null>(null);

  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchEvents = useCallback(async (reset = false) => {
    setLoading(true);
    const params = new URLSearchParams({ theater, range, pageSize: '25' });
    if (type)        params.set('type',        type);
    if (severity)    params.set('severity',    severity);
    if (confidence)  params.set('confidence',  confidence);
    if (signal)      params.set('is_signal',   signal);
    if (search)      params.set('q',           search);
    if (!reset && cursor && cursorTs) {
      params.set('cursor',    cursor);
      params.set('cursor_ts', cursorTs);
    }
    try {
      const res  = await fetch(`/api/timeline?${params}`);
      const json = await res.json();
      setEvents(prev => reset ? json.data : [...prev, ...json.data]);
      setCursor(json.cursor_meta.cursor);
      setCursorTs(json.cursor_meta.cursor_ts);
      setHasMore(json.cursor_meta.hasMore);
    } finally {
      setLoading(false);
    }
  }, [theater, range, type, severity, confidence, signal, search, cursor, cursorTs]);

  // Reset on filter change
  useEffect(() => {
    setCursor(null); setCursorTs(null);
    fetchEvents(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theater, range, type, severity, confidence, signal, search]);

  // Infinite scroll
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) fetchEvents(false);
    }, { threshold: 0.1 });
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, fetchEvents]);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>
          Conflict Activity Timeline
        </h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>
          Full event log · Real-time · Infinite scroll
        </p>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Range */}
          <FilterSelect label="Range" value={range} onChange={setRange}>
            {['1h','6h','24h','72h','96h','7d'].map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
          {/* Type */}
          <FilterSelect label="Type" value={type} onChange={setType}>
            <option value="">All types</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </FilterSelect>
          {/* Severity */}
          <FilterSelect label="Severity" value={severity} onChange={setSeverity}>
            <option value="">All severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
          {/* Confidence */}
          <FilterSelect label="Confidence" value={confidence} onChange={setConfidence}>
            <option value="">All</option>
            {CONFIDENCES.map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
          {/* Signal */}
          <FilterSelect label="Signal" value={signal} onChange={setSignal}>
            <option value="">All</option>
            <option value="true">Signals only</option>
            <option value="false">Verified only</option>
          </FilterSelect>
          {/* Search */}
          <input
            placeholder="Search events…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '6px',
              fontSize: '13px', flex: '1', minWidth: '160px', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
      </div>

      {/* Events list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {events.map(ev => (
          <EventListItem key={ev.event_id} ev={ev} onClick={() => setSelected(ev)} />
        ))}

        {/* Loading skeleton */}
        {loading && [...Array(3)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '72px', borderRadius: '10px' }} />
        ))}

        {/* Infinite scroll sentinel */}
        {!loading && <div ref={loaderRef} style={{ height: '1px' }} />}

        {!hasMore && events.length > 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: '12px', padding: '16px' }}>
            End of results
          </div>
        )}
        {!loading && events.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
            No events match your filters.
          </div>
        )}
      </div>

      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}

function EventListItem({ ev, onClick }: { ev: ConflictEvent; onClick: () => void }) {
  const time = ev.timestamp_utc
    ? new Date(ev.timestamp_utc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    : '—';

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        display: 'flex', gap: '14px', alignItems: 'flex-start',
        cursor: 'pointer', borderLeft: `3px solid ${SEV_COLOR[ev.severity]}`,
        padding: '12px 16px', transition: 'box-shadow .15s',
      }}
    >
      {/* Time */}
      <div style={{ width: '44px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: '#475569' }}>{time}</div>
        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>UTC</div>
      </div>

      {/* Country */}
      <div style={{ width: '100px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
        <CountryFlag country={ev.country_primary} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{ev.country_primary}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b', marginBottom: '4px' }}>
          {ev.headline ?? ev.summary_20w}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <ConfidenceBadge value={ev.confidence} />
          <SeverityBadge value={ev.severity} />
          <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>
            {ev.event_type.replace(/_/g,' ')}
          </span>
          {(ev.sources ?? []).slice(0, 2).map((s, i) => <SourceChip key={i} name={s.publisher} />)}
        </div>
      </div>

      {/* Sources count */}
      {ev.sources_count != null && ev.sources_count > 0 && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{ev.sources_count} src</span>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>
        {children}
      </select>
    </div>
  );
}
