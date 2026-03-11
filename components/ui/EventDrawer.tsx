'use client';
import { useEffect } from 'react';
import type { ConflictEvent } from '@/lib/types';
import { ConfidenceBadge, SeverityBadge, CountryFlag, EventTypeIcon, DamageIcon, SourceChip } from './Badges';

interface EventDrawerProps {
  event: ConflictEvent | null;
  onClose: () => void;
}

export default function EventDrawer({ event, onClose }: EventDrawerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!event) return null;

  const time = event.timestamp_utc
    ? new Date(event.timestamp_utc).toLocaleString('en-GB', { hour12: false, timeZone: 'UTC' })
    : '—';

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
        zIndex: 200, backdropFilter: 'blur(2px)',
      }} />

      {/* Drawer */}
      <aside style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px',
        background: '#fff', zIndex: 201, overflowY: 'auto',
        boxShadow: '-4px 0 32px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn .2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', background: '#0f172a',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <EventTypeIcon type={event.event_type} />
              <span style={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                {event.event_type.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 style={{ color: '#f8fafc', fontWeight: 700, fontSize: '16px', lineHeight: 1.4, marginBottom: '8px' }}>
              {event.headline ?? event.summary_20w}
            </h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <SeverityBadge value={event.severity} />
              <ConfidenceBadge value={event.confidence} />
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.1)', border: 'none', color: '#94a3b8',
            width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer',
            fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <MetaField label="Country">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CountryFlag country={event.country_primary} />
                {event.country_primary}
              </span>
            </MetaField>
            <MetaField label="Location">{event.location_name ?? '—'}</MetaField>
            <MetaField label="Time (UTC)">{time}</MetaField>
            <MetaField label="Evidence">{event.evidence_type}</MetaField>
          </div>

          {/* Summary */}
          <div>
            <SectionLabel>Summary</SectionLabel>
            <p style={{ color: '#334155', lineHeight: 1.6, fontSize: '14px' }}>
              {event.summary_20w}
            </p>
          </div>

          {/* Actors */}
          {event.actors_involved?.length > 0 && (
            <div>
              <SectionLabel>Actors Involved</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {event.actors_involved.map(a => (
                  <span key={a} style={{
                    background: '#f1f5f9', color: '#1e293b', padding: '3px 9px',
                    borderRadius: '4px', fontSize: '12px', fontWeight: 500,
                  }}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Damage */}
          {event.damage_asset && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '12px' }}>
              <SectionLabel>Damage / Impact</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <DamageIcon asset={event.damage_asset} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{event.damage_asset}</div>
                  {event.damage_type && (
                    <div style={{ fontSize: '12px', color: '#78350f', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {event.damage_type}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {event.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {event.tags.map(t => (
                <span key={t} style={{
                  background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px',
                  borderRadius: '20px', fontSize: '11px', fontWeight: 500,
                }}>#{t}</span>
              ))}
            </div>
          )}

          {/* Scores */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <ScorePill label="Importance" value={event.importance_score} max={100} color="#3b82f6" />
            <ScorePill label="Esc. Points" value={event.escalation_points} max={60} color="#f97316" />
          </div>

          {/* Sources */}
          {event.sources && event.sources.length > 0 ? (
            <div>
              <SectionLabel>Sources ({event.sources.length})</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {event.sources.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', background: '#f8fafc', borderRadius: '7px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TierBadge tier={s.reliability_tier} />
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{s.publisher}</span>
                    </div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#3b82f6', fontSize: '11px', textDecoration: 'none' }}>
                      View ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : event.sources_count != null && event.sources_count > 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              {event.sources_count} source{event.sources_count > 1 ? 's' : ''}
            </div>
          ) : null}
        </div>
      </aside>

      <style>{`
        @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
    </>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ color: '#1e293b', fontSize: '13px', fontWeight: 500 }}>{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
      {children}
    </div>
  );
}

function ScorePill({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</span>
      </div>
      <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px' }}>
        <div style={{ height: '100%', borderRadius: '2px', background: color, width: `${pct}%`, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    tier1: { bg: '#d1fae5', color: '#065f46' },
    tier2: { bg: '#ede9fe', color: '#5b21b6' },
    tier3: { bg: '#f1f5f9', color: '#64748b' },
  };
  const c = map[tier] ?? map.tier3;
  return (
    <span style={{
      ...c, padding: '1px 6px', borderRadius: '3px',
      fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)',
    }}>T{tier.slice(-1)}</span>
  );
}
