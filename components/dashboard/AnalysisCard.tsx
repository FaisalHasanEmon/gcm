import Link from 'next/link';
import type { AnalysisBrief } from '@/lib/types';

interface Props { brief: AnalysisBrief | null; theater: string; }

function parseConfidenceTag(bullet: string): { text: string; tag: string | null } {
  const m = bullet.match(/\((Confirmed|Likely|Unconfirmed)\)$/);
  return m
    ? { text: bullet.slice(0, -m[0].length).trim(), tag: m[1] }
    : { text: bullet, tag: null };
}

export default function AnalysisCard({ brief, theater }: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🌐</span>
          <span className="card-title">Regional Situation</span>
        </div>
        <Link href={`/analysis?theater=${theater}`} className="view-all">View all &rsaquo;</Link>
      </div>
      {brief ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {brief.bullets.slice(0, 4).map((bullet, i) => {
            const { text, tag } = parseConfidenceTag(bullet);
            return (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: '#3b82f6', fontWeight: 700, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                  {text}
                  {tag && (
                    <span style={{
                      marginLeft: '6px', fontSize: '10px', padding: '1px 5px',
                      borderRadius: '3px', fontWeight: 600,
                      background: tag === 'Confirmed' ? '#d1fae5' : tag === 'Likely' ? '#ede9fe' : '#f1f5f9',
                      color: tag === 'Confirmed' ? '#065f46' : tag === 'Likely' ? '#5b21b6' : '#64748b',
                    }}>{tag}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>Analysis brief not available.</p>
      )}
    </div>
  );
}
