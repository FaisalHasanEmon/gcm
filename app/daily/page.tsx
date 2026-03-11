'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { SeverityBadge, ConfidenceBadge, CountryFlag, SEV_COLOR } from '@/components/ui/Badges';
import EventDrawer from '@/components/ui/EventDrawer';
import type { ConflictEvent } from '@/lib/types';

const TYPE_ICONS: Record<string, string> = {
  airstrike:'✈', missile_launch:'🚀', drone_attack:'🛸', explosion:'💥',
  naval_activity:'⚓', military_movement:'⚔', official_statement:'📢',
  warning_alert:'⚠', infrastructure_damage:'🏗', casualty_update:'🏥', other:'•',
};

const SEV_ORDER = ['critical','high','medium','low'];

interface DailyData {
  date:            string;
  theater_slug:    string;
  theater_name:    string;
  total_incidents: number;
  by_type:         Record<string, number>;
  by_severity:     Record<string, number>;
  top_events:      ConflictEvent[];
  brief:           { brief_id: string; bullets: string[]; sources: string[]; generated_at: string } | null;
}

export default function DailyPage() {
  const sp      = useSearchParams();
  const theater = sp.get('theater') ?? 'me-iran-israel-us';
  const date    = sp.get('date') ?? undefined;

  const [data,    setData]    = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected,setSelected]= useState<ConflictEvent | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ theater });
    if (date) params.set('date', date);
    fetch(`/api/daily?${params}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [theater, date]);

  const formattedDate = data?.date
    ? new Date(data.date + 'T12:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : '';

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Daily Briefing</h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>
          {formattedDate}{data?.theater_name ? ` · ${data.theater_name}` : ''}
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[...Array(3)].map((_,i) => <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '12px' }} />)}
        </div>
      ) : data ? (
        <>
          {/* Totals row */}
          <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Total Incidents</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '48px', fontWeight: 800, color: '#1e293b' }}>{data.total_incidents}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
              {SEV_ORDER.filter(s => data.by_severity[s]).map(sev => (
                <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: SEV_COLOR[sev], flexShrink: 0 }} />
                  <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize', flex: 1 }}>{sev}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{data.by_severity[sev]}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: '8px' }}>
              {Object.entries(data.by_type).sort((a,b) => b[1]-a[1]).map(([type, cnt]) => (
                <div key={type} style={{ background: '#f8fafc', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>{TYPE_ICONS[type] ?? '•'}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#1e293b' }}>{cnt}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'capitalize' }}>{type.replace(/_/g,' ')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Brief */}
          {data.brief && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title" style={{ marginBottom: '14px' }}>
                Strategic Assessment
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '8px' }}>
                  {new Date(data.brief.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.brief.bullets.map((b, i) => (
                  <li key={i} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.55 }}>{b}</li>
                ))}
              </ul>
              {data.brief.sources.length > 0 && (
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8' }}>
                  Sources: {data.brief.sources.join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* Top events */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title" style={{ marginBottom: '14px' }}>Top Developments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.top_events.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                  No confirmed events recorded for this date.
                </div>
              ) : data.top_events.map((ev, i) => (
                <div key={ev.event_id ?? i} onClick={() => setSelected(ev)}
                  style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', cursor: 'pointer',
                    padding: '12px', background: '#f8fafc', borderRadius: '8px',
                    borderLeft: `3px solid ${SEV_COLOR[ev.severity]}` }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff',
                    border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#1e293b', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '5px' }}>
                      {ev.headline ?? ev.summary_20w}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <SeverityBadge value={ev.severity} />
                      <ConfidenceBadge value={ev.confidence} />
                      <CountryFlag country={ev.country_primary} />
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                    {ev.importance_score}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>No data available.</div>
      )}
      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
