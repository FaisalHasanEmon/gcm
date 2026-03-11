import Link from 'next/link';
import type { EscalationData, GciData } from '@/lib/types';

const LEVEL_COLORS = {
  High:   { dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,.15)' },
  Medium: { dot: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  Low:    { dot: '#3b82f6', text: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
};

const TREND_ARROW = { Increasing: '↑', Stable: '→', Decreasing: '↓' };
const TREND_COLOR = { Increasing: '#f97316', Stable: '#94a3b8', Decreasing: '#3b82f6' };

interface Props {
  escalation: EscalationData;
  gci:        GciData;
  theater:    string;
}

export default function GlobalSnapshot({ escalation, gci, theater }: Props) {
  const lc = LEVEL_COLORS[escalation.level] ?? LEVEL_COLORS.Low;

  return (
    <div style={{
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #f97316 0%, #ef4444 40%, #7c3aed 80%, #1e3a8a 100%)',
      padding: '20px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '24px', flexWrap: 'wrap',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Noise overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: .06,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '11px', fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Global Conflict Snapshot
        </div>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '22px', letterSpacing: '.02em', marginBottom: '10px' }}>
          GLOBAL CONFLICT SNAPSHOT
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: lc.dot, display: 'inline-block', boxShadow: `0 0 8px ${lc.dot}` }} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '16px' }}>
            Escalation Level: <span style={{ color: '#fff' }}>{escalation.level.toUpperCase()}</span>
          </span>
        </div>
      </div>

      {/* Right: Score + Trend */}
      <div style={{ position: 'relative', display: 'flex', gap: '16px', alignItems: 'center' }}>
        {/* GCI */}
        <div style={{
          background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(8px)',
          borderRadius: '10px', padding: '12px 18px', textAlign: 'center',
          border: '1px solid rgba(255,255,255,.2)',
        }}>
          <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>GCI</div>
          <div style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700, lineHeight: 1.2 }}>
            {gci.gci_score}<span style={{ fontSize: '14px', color: 'rgba(255,255,255,.6)' }}>/100</span>
          </div>
        </div>

        {/* Escalation Score */}
        <Link href={`/escalation?theater=${theater}`} style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)',
            borderRadius: '10px', padding: '12px 18px', textAlign: 'center',
            border: '1px solid rgba(255,255,255,.25)',
            cursor: 'pointer', transition: 'background .15s',
          }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Escalation Score
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '30px', fontWeight: 800, lineHeight: 1.2 }}>
              {escalation.score}<span style={{ fontSize: '14px', color: 'rgba(255,255,255,.6)' }}>/100</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '3px' }}>
              <span style={{ color: TREND_COLOR[escalation.trend], fontSize: '14px', fontWeight: 700 }}>
                {TREND_ARROW[escalation.trend]}
              </span>
              <span style={{ color: 'rgba(255,255,255,.7)', fontSize: '12px' }}>{escalation.trend}</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
