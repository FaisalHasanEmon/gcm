'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { CountryFlag, SeverityBadge, ConfidenceBadge, SourceChip, SEV_COLOR } from '@/components/ui/Badges';
import EventDrawer from '@/components/ui/EventDrawer';
import type { ConflictEvent } from '@/lib/types';

interface Region {
  country:    string;
  bullets:    string[];
  key_events: ConflictEvent[];
}

export default function RegionsPage() {
  const sp      = useSearchParams();
  const theater = sp.get('theater') ?? 'me-iran-israel-us';
  const initCountry = sp.get('country') ?? '';
  const [range,   setRange]    = useState('24h');
  const [regions, setRegions]  = useState<Region[]>([]);
  const [active,  setActive]   = useState(initCountry);
  const [loading, setLoading]  = useState(true);
  const [selected,setSelected] = useState<ConflictEvent | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/regions?theater=${theater}&range=${range}`)
      .then(r => r.json())
      .then(j => {
        setRegions(j.data ?? []);
        if (!active && j.data?.[0]) setActive(j.data[0].country);
      })
      .finally(() => setLoading(false));
  }, [theater, range]);

  const region = regions.find(r => r.country === active);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Regional Situation</h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>Per-country briefings and key events</p>
      </div>

      {/* Range */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '4px' }}>
        {['6h','24h','72h','7d'].map(r => (
          <button key={r} onClick={() => setRange(r)} className={`chip ${range === r ? 'active' : ''}`}>{r}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Country tabs */}
        <div className="card" style={{ padding: '8px' }}>
          {loading ? (
            [...Array(5)].map((_,i) => <div key={i} className="skeleton" style={{ height: '36px', borderRadius: '6px', marginBottom: '4px' }} />)
          ) : regions.map(r => (
            <button key={r.country}
              onClick={() => setActive(r.country)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: active === r.country ? '#1e3a8a' : 'transparent',
                color: active === r.country ? '#fff' : '#1e293b',
                fontWeight: active === r.country ? 600 : 400,
                fontSize: '13px', fontFamily: 'var(--font-sans)',
                marginBottom: '2px', transition: 'background .15s',
              }}>
              <CountryFlag country={r.country} />
              {r.country}
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: active === r.country ? 'rgba(255,255,255,.6)' : '#94a3b8' }}>
                {r.key_events.length}
              </span>
            </button>
          ))}
        </div>

        {/* Region detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {region ? (
            <>
              {/* Summary bullets */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <CountryFlag country={region.country} />
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{region.country}</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {region.bullets.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: '#3b82f6', fontWeight: 700, flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.6 }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key events */}
              <div>
                <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Key Events
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {region.key_events.map(ev => (
                    <div key={ev.event_id} className="card"
                      onClick={() => setSelected(ev)}
                      style={{ cursor: 'pointer', borderLeft: `3px solid ${SEV_COLOR[ev.severity]}`, padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b', marginBottom: '5px' }}>
                        {ev.headline ?? ev.summary_20w}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <ConfidenceBadge value={ev.confidence} />
                        <SeverityBadge value={ev.severity} />
                        {(ev.sources ?? []).slice(0,3).map((s,i) => <SourceChip key={i} name={s.publisher} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
              Select a country to view details.
            </div>
          )}
        </div>
      </div>
      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
