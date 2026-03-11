import Link from 'next/link';
import type { DailySummary } from '@/lib/types';
import { SevDot } from '@/components/ui/Badges';

interface Props { summary: DailySummary; theater: string; }

const TYPE_ICONS: Record<string, string> = {
  airstrike: '✈', missile_launch: '🚀', drone_attack: '🛸',
  explosion: '💥', naval_activity: '⚓', military_movement: '⚔',
  official_statement: '📢', warning_alert: '⚠', infrastructure_damage: '🏗',
  casualty_update: '🏥', other: '•',
};

const TYPE_COLORS: Record<string, string> = {
  airstrike: '#ef4444', missile_launch: '#f97316', drone_attack: '#f59e0b',
  explosion: '#ef4444', naval_activity: '#3b82f6', military_movement: '#8b5cf6',
  official_statement: '#64748b', warning_alert: '#f59e0b',
};

export default function DailySummaryCard({ summary, theater }: Props) {
  const dateStr = new Date(summary.date).toLocaleDateString('en-GB', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const topTypes = Object.entries(summary.by_type)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Daily Summary</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{dateStr}</span>
          <Link href={`/daily?theater=${theater}`} className="view-all">&rsaquo;</Link>
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>
          Total incidents: <strong style={{ color: '#1e293b', fontFamily: 'var(--font-mono)' }}>{summary.total_incidents}</strong>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#ef4444' }}>
          {summary.total_incidents}.{topTypes[0]?.[1] ?? 0}
        </span>
      </div>

      {/* By type bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
        {topTypes.map(([type, cnt]) => {
          const pct = summary.total_incidents > 0 ? (cnt / summary.total_incidents) * 100 : 0;
          const color = TYPE_COLORS[type] ?? '#94a3b8';
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', width: '16px', flexShrink: 0 }}>{TYPE_ICONS[type] ?? '•'}</span>
              <span style={{ fontSize: '12px', color: '#475569', width: '100px', flexShrink: 0, textTransform: 'capitalize' }}>
                {type.replace(/_/g, ' ')}
              </span>
              <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px' }}>
                <div style={{ height: '100%', borderRadius: '3px', background: color, width: `${pct}%`, transition: 'width .4s' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: '#1e293b', width: '24px', textAlign: 'right' }}>
                {cnt}
              </span>
            </div>
          );
        })}
      </div>

      {/* Top events */}
      {summary.top_events.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>
            Top 3 Developments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {summary.top_events.slice(0, 3).map((ev, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <SevDot value={ev.severity} />
                  <span style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>
                    {ev.headline ?? ev.summary_20w?.slice(0, 45)}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: '#64748b', flexShrink: 0 }}>
                  {ev.importance_score}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
