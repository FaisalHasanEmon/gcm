'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { ConfidenceBadge, SeverityBadge, CountryFlag, DamageIcon, SourceChip, SEV_COLOR } from '@/components/ui/Badges';
import EventDrawer from '@/components/ui/EventDrawer';
import type { ConflictEvent } from '@/lib/types';

const CATEGORIES = ['','Embassy','Airport','Energy','Military','Civil'];

export default function DamagePage() {
  const sp        = useSearchParams();
  const theater   = sp.get('theater') ?? 'me-iran-israel-us';
  const [range,   setRange]    = useState('72h');
  const [cat,     setCat]      = useState('');
  const [conf,    setConf]     = useState('');
  const [events,  setEvents]   = useState<ConflictEvent[]>([]);
  const [loading, setLoading]  = useState(true);
  const [selected,setSelected] = useState<ConflictEvent | null>(null);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ theater, range });
    if (cat)  p.set('category',   cat);
    if (conf) p.set('confidence', conf);
    fetch(`/api/damage?${p}`)
      .then(r => r.json())
      .then(j => setEvents(j.data ?? []))
      .finally(() => setLoading(false));
  }, [theater, range, cat, conf]);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Major Damage Events</h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>Infrastructure, assets, and strategic sites impacted</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['24h','72h','96h','7d'].map(r => (
            <button key={r} onClick={() => setRange(r)} className={`chip ${range === r ? 'active' : ''}`}>{r}</button>
          ))}
        </div>
        <span style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`chip ${cat === c ? 'active' : ''}`}>
              {c || 'All categories'}
            </button>
          ))}
        </div>
        <span style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
        {['','confirmed','likely'].map(c => (
          <button key={c} onClick={() => setConf(c)} className={`chip ${conf === c ? 'active' : ''}`}>
            {c || 'All confidence'}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? [...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '10px' }} />) :
          events.map(ev => (
            <div key={ev.event_id} className="card"
              onClick={() => setSelected(ev)}
              style={{ cursor: 'pointer', display: 'flex', gap: '14px', alignItems: 'center', borderLeft: `3px solid ${SEV_COLOR[ev.severity]}`, padding: '14px 16px' }}>
              {/* Icon */}
              <div style={{ width: '44px', height: '44px', background: '#fff7ed', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                {ev.damage_asset && <DamageIcon asset={ev.damage_asset} />}
              </div>
              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>
                  {ev.damage_asset}
                  {ev.damage_type && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: '6px' }}>– {ev.damage_type}</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <CountryFlag country={ev.country_primary} />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{ev.location_name ?? ev.country_primary}</span>
                  <ConfidenceBadge value={ev.confidence} />
                  {(ev.sources ?? []).slice(0,2).map((s,i) => <SourceChip key={i} name={s.publisher} />)}
                </div>
              </div>
              <SeverityBadge value={ev.severity} />
            </div>
          ))
        }
        {!loading && events.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
            No damage events match your filters.
          </div>
        )}
      </div>
      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
