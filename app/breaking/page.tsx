'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { ConfidenceBadge, SeverityBadge, CountryFlag, SourceChip, SEV_COLOR } from '@/components/ui/Badges';
import EventDrawer from '@/components/ui/EventDrawer';
import type { ConflictEvent } from '@/lib/types';

export default function BreakingPage() {
  const sp       = useSearchParams();
  const theater  = sp.get('theater') ?? 'me-iran-israel-us';
  const [range,  setRange]      = useState('24h');
  const [conf,   setConf]       = useState('');
  const [events, setEvents]     = useState<ConflictEvent[]>([]);
  const [loading,setLoading]    = useState(true);
  const [selected,setSelected]  = useState<ConflictEvent | null>(null);

  useEffect(() => {
    const p = new URLSearchParams({ theater, range, pageSize: '40' });
    if (conf) p.set('confidence', conf);
    fetch(`/api/breaking?${p}`)
      .then(r => r.json())
      .then(j => setEvents(j.data ?? []))
      .finally(() => setLoading(false));
  }, [theater, range, conf]);

  // Group by hour
  const grouped = events.reduce<Record<string, ConflictEvent[]>>((acc, ev) => {
    const hour = ev.timestamp_utc
      ? new Date(ev.timestamp_utc).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric', timeZone: 'UTC' }).slice(0, 15)
      : 'Unknown';
    (acc[hour] ??= []).push(ev);
    return acc;
  }, {});

  const pinned = events[0] ?? null;

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>⚠ Breaking Alerts</h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>Ranked by importance score</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {['24h','72h','7d'].map(r => (
          <button key={r} onClick={() => setRange(r)} className={`chip ${range === r ? 'active' : ''}`}>{r}</button>
        ))}
        <span style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
        {['','confirmed','likely','unconfirmed'].map(c => (
          <button key={c} onClick={() => setConf(c)} className={`chip ${conf === c ? 'active' : ''}`}>
            {c || 'All confidence'}
          </button>
        ))}
      </div>

      {/* Pinned breaking */}
      {pinned && (
        <div style={{ marginBottom: '20px', background: '#fff', borderRadius: '12px', borderTop: '4px solid #ef4444', padding: '18px 20px', boxShadow: '0 2px 12px rgba(239,68,68,.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontWeight: 800, color: '#ef4444', letterSpacing: '.08em', fontSize: '12px' }}>📌 PINNED BREAKING</span>
            <SeverityBadge value={pinned.severity} />
            <ConfidenceBadge value={pinned.confidence} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', marginBottom: '8px', lineHeight: 1.4 }}>
            {pinned.headline ?? pinned.summary_20w}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '12px' }}>
            <CountryFlag country={pinned.country_primary} />
            <span>{pinned.country_primary}</span>
            {pinned.location_name && <span>· {pinned.location_name}</span>}
            {(pinned.sources ?? []).slice(0, 3).map((s, i) => <SourceChip key={i} name={s.publisher} />)}
          </div>
        </div>
      )}

      {/* Grouped hourly list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: '60px', borderRadius: '10px' }} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(grouped).map(([hour, evs]) => (
            <div key={hour}>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                {hour} UTC
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {evs.map(ev => (
                  <div key={ev.event_id} className="card"
                    onClick={() => setSelected(ev)}
                    style={{ cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'center', borderLeft: `3px solid ${SEV_COLOR[ev.severity]}`, padding: '10px 14px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b', marginBottom: '4px' }}>
                        {ev.headline ?? ev.summary_20w}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <ConfidenceBadge value={ev.confidence} />
                        <CountryFlag country={ev.country_primary} />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{ev.country_primary}</span>
                        {(ev.sources ?? []).slice(0, 2).map((s, i) => <SourceChip key={i} name={s.publisher} />)}
                      </div>
                    </div>
                    <span style={{ color: '#94a3b8' }}>›</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
