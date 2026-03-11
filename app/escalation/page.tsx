'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';

interface EscData {
  score: number; level: string; trend: string;
  points_72h: number; points_24h: number; points_prev_24h: number;
  time_series: { hour: string; points: number }[];
  top_contributors: { event_id: string; headline: string; escalation_points: number; severity: string }[];
  methodology: { score_formula: string; level_thresholds: Record<string,string> };
}

const TREND_COLOR = { Increasing: '#f97316', Stable: '#94a3b8', Decreasing: '#3b82f6' };
const LEVEL_COLOR = { High: '#ef4444', Medium: '#f59e0b', Low: '#3b82f6' };

export default function EscalationPage() {
  const sp      = useSearchParams();
  const theater = sp.get('theater') ?? 'me-iran-israel-us';
  const [data,  setData]    = useState<EscData | null>(null);
  const [loading,setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/escalation?theater=${theater}`)
      .then(r => r.json())
      .then(j => setData(j))
      .finally(() => setLoading(false));
  }, [theater]);

  if (loading) return (
    <PageShell>
      <div className="skeleton" style={{ height: '200px', borderRadius: '12px', marginBottom: '16px' }} />
      <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
    </PageShell>
  );

  if (!data) return <PageShell><p style={{ color: '#fff' }}>Error loading data.</p></PageShell>;

  const lvlColor = (LEVEL_COLOR as any)[data.level] ?? '#94a3b8';
  const maxPts   = Math.max(...(data.time_series?.map(t => t.points) ?? [1]), 1);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Escalation Breakdown</h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>72-hour rolling score · Click arrow on dashboard to reach this page</p>
      </div>

      {/* Score card */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Escalation Score</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '48px', fontWeight: 800, color: lvlColor, lineHeight: 1 }}>
            {data.score}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>/100</div>
        </div>
        <div style={{ height: '80px', width: '1px', background: '#f1f5f9' }} />
        <div>
          <MetaItem label="Level">
            <span style={{ fontWeight: 700, fontSize: '18px', color: lvlColor }}>{data.level}</span>
          </MetaItem>
          <MetaItem label="Trend">
            <span style={{ fontWeight: 700, color: (TREND_COLOR as any)[data.trend] ?? '#94a3b8' }}>
              {data.trend === 'Increasing' ? '↑ ' : data.trend === 'Decreasing' ? '↓ ' : '→ '}
              {data.trend}
            </span>
          </MetaItem>
        </div>
        <div style={{ height: '80px', width: '1px', background: '#f1f5f9' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <ScorePill label="72h Points" value={data.points_72h} />
          <ScorePill label="Last 24h" value={data.points_24h} />
          <ScorePill label="Prior 24h" value={data.points_prev_24h} />
          <ScorePill label="Change" value={data.points_24h - data.points_prev_24h} signed />
        </div>
      </div>

      {/* Time series chart */}
      {data.time_series?.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-title" style={{ marginBottom: '14px' }}>72h Escalation Timeline</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
            {data.time_series.map((t, i) => {
              const pct = (t.points / maxPts) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  title={`${new Date(t.hour).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} UTC: ${t.points} pts`}>
                  <div style={{ width: '100%', height: `${pct}%`, minHeight: '2px', background: lvlColor, borderRadius: '2px 2px 0 0', opacity: .8, transition: 'height .4s' }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>72h ago</span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Now</span>
          </div>
        </div>
      )}

      {/* Top contributors */}
      {data.top_contributors?.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-title" style={{ marginBottom: '14px' }}>Top Contributing Events</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.top_contributors.slice(0, 8).map((ev: any) => (
              <div key={ev.event_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: lvlColor, width: '28px', textAlign: 'right', flexShrink: 0 }}>
                  +{ev.escalation_points}
                </span>
                <span style={{ fontSize: '13px', color: '#334155', flex: 1 }}>{ev.headline ?? ev.summary_20w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="card" style={{ background: '#f8fafc' }}>
        <div className="card-title" style={{ marginBottom: '12px' }}>Methodology</div>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.8 }}>
          <p style={{ marginBottom: '8px' }}><strong>Score formula:</strong> {data.methodology?.score_formula}</p>
          <p style={{ marginBottom: '8px' }}><strong>Level thresholds:</strong>&nbsp;
            {data.methodology?.level_thresholds && Object.entries(data.methodology.level_thresholds).map(([k,v]) => `${k}: ${v}`).join(' · ')}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '12px' }}>Only confirmed and likely events are counted toward the escalation score.</p>
        </div>
      </div>
    </PageShell>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '3px' }}>{label}</div>
      {children}
    </div>
  );
}

function ScorePill({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  const color = signed ? (value > 0 ? '#f97316' : value < 0 ? '#3b82f6' : '#94a3b8') : '#1e293b';
  return (
    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '8px 12px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color }}>
        {signed && value > 0 ? '+' : ''}{value}
      </div>
    </div>
  );
}
