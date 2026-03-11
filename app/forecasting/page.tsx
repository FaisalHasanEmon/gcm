'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import type { ForecastingReport, ForecastingIndicator, IndicatorLevel } from '@/lib/intelligence/forecasting';

const LEVEL_COLORS: Record<IndicatorLevel, { bar: string; badge: string; text: string }> = {
  none:     { bar:'#334155', badge:'#f1f5f9', text:'#64748b' },
  low:      { bar:'#3b82f6', badge:'#dbeafe', text:'#1e40af' },
  moderate: { bar:'#f59e0b', badge:'#fef3c7', text:'#92400e' },
  elevated: { bar:'#f97316', badge:'#ffedd5', text:'#9a3412' },
  high:     { bar:'#ef4444', badge:'#fee2e2', text:'#991b1b' },
};

const INDICATOR_ICONS: Record<string, string> = {
  escalation_acceleration:  '📈',
  widening_geography:       '🗺',
  strategic_asset_targeting:'🎯',
  mobilization_signals:     '⚔',
};

export default function ForecastingPage() {
  const sp       = useSearchParams();
  const theater  = sp.get('theater') ?? 'me-iran-israel-us';
  const [data,   setData]    = useState<ForecastingReport & { note?: string } | null>(null);
  const [loading,setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/forecasting?theater=${theater}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [theater]);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>
          Forecasting Indicators
        </h1>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: '#fef9c3', color: '#713f12',
          padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          marginBottom: '8px',
        }}>
          ⚠ INDICATOR ONLY — NOT A PREDICTION
        </div>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>
          These signals are derived from confirmed and likely events. They indicate trends — not outcomes. Always verify with primary sources.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height: '100px', borderRadius: '12px' }} />)}
        </div>
      ) : data ? (
        <>
          {/* Composite score */}
          <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>
                Composite Indicator
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '48px', fontWeight: 800, color: LEVEL_COLORS[data.composite_level].bar, lineHeight: 1 }}>
                {data.composite}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>/100</div>
            </div>
            <div style={{ height: '80px', width: '1px', background: '#f1f5f9' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
                Level
              </div>
              <span style={{
                background: LEVEL_COLORS[data.composite_level].badge,
                color: LEVEL_COLORS[data.composite_level].text,
                padding: '4px 14px', borderRadius: '6px', fontWeight: 700, fontSize: '16px',
                textTransform: 'capitalize',
              }}>
                {data.composite_level}
              </span>
            </div>
            <div style={{ flex: 1, fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
              {data.note}
            </div>
          </div>

          {/* Individual indicators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {data.indicators.map(ind => (
              <IndicatorCard key={ind.id} ind={ind} />
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '10px', padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>📋</span>
              <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,.5)', lineHeight: 1.7 }}>
                <strong style={{ color: 'rgba(255,255,255,.7)' }}>Methodology:</strong> Indicators are computed from confirmed and likely events in the database.
                Escalation acceleration compares 0–12h vs 12–24h escalation points.
                Geographic spread counts active countries vs prior 24h.
                Strategic asset targeting counts confirmed damage to embassies, airports, oil facilities, nuclear sites, and power infrastructure.
                Mobilization signals count military movement events and unverified signals.
                <br />
                <strong style={{ color: 'rgba(255,255,255,.7)' }}>Composite</strong> = unweighted average of all four indicators.
                <strong style={{ color: '#fef9c3' }}> This is NOT a prediction of future events.</strong>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
          No data available.
        </div>
      )}
    </PageShell>
  );
}

function IndicatorCard({ ind }: { ind: ForecastingIndicator }) {
  const c = LEVEL_COLORS[ind.level];
  return (
    <div className="card" style={{ borderTop: `3px solid ${c.bar}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px', flexShrink: 0 }}>{INDICATOR_ICONS[ind.id] ?? '📊'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '3px' }}>{ind.label}</div>
          <span style={{ background: c.badge, color: c.text, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {ind.level}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: c.bar, flexShrink: 0 }}>
          {ind.score}
        </div>
      </div>

      {/* Score bar */}
      <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${ind.score}%`, background: c.bar, borderRadius: '3px', transition: 'width .6s' }} />
      </div>

      <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5, marginBottom: '8px' }}>{ind.detail}</p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{ind.data_points} data points</span>
        <span style={{ fontSize: '10px', background: '#fef9c3', color: '#92400e', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
          {ind.disclaimer}
        </span>
      </div>
    </div>
  );
}
