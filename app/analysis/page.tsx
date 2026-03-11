'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';

interface AnalysisBrief {
  brief_id?: string;
  bullets: string[];
  sources?: string[];
  generated_at: string;
  theater_slug?: string;
}

function parseTag(bullet: string) {
  const m = bullet.match(/\((Confirmed|Likely|Unconfirmed)\)$/);
  return m
    ? { text: bullet.slice(0, -m[0].length).trim(), tag: m[1] }
    : { text: bullet, tag: null };
}

export default function AnalysisPage() {
  const sp      = useSearchParams();
  const theater = sp.get('theater') ?? 'me-iran-israel-us';
  const [brief, setBrief]        = useState<AnalysisBrief | null>(null);
  const [allBriefs, setAllBriefs] = useState<AnalysisBrief[]>([]);
  const [loading,setLoading]     = useState(true);

  useEffect(() => {
    fetch(`/api/analysis?theater=${theater}&limit=5`)
      .then(r => r.json())
      .then(j => {
        if (j.data?.length) {
          setBrief(j.data[0]);
          setAllBriefs(j.data);
        }
      })
      .finally(() => setLoading(false));
  }, [theater]);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Strategic Analysis</h1>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '12px' }}>
          AI-generated briefs. Neutral tone. Source-cited. Not a prediction.
        </p>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      ) : brief ? (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              Generated: {new Date(brief.generated_at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
            </div>
            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
              Latest Brief
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {brief.bullets.map((bullet, i) => {
              const { text, tag } = parseTag(bullet);
              return (
                <div key={i} style={{
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                  padding: '12px 14px', background: '#f8fafc', borderRadius: '8px',
                  borderLeft: '3px solid #3b82f6',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#3b82f6', fontSize: '12px', flexShrink: 0, marginTop: '2px' }}>
                    {String(i+1).padStart(2,'0')}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.6 }}>{text}</span>
                    {tag && (
                      <span style={{
                        marginLeft: '8px', fontSize: '10px', padding: '2px 6px', borderRadius: '3px', fontWeight: 600,
                        background: tag === 'Confirmed' ? '#d1fae5' : tag === 'Likely' ? '#ede9fe' : '#f1f5f9',
                        color: tag === 'Confirmed' ? '#065f46' : tag === 'Likely' ? '#5b21b6' : '#64748b',
                      }}>{tag}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sources cited */}
          {brief.sources && brief.sources.length > 0 && (
            <div style={{ marginTop: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '7px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>
                Sources cited
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {brief.sources.map((s: string, i: number) => (
                  <span key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, color: '#475569', fontFamily: 'var(--font-mono)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px', padding: '10px 14px', background: '#fef9c3', borderRadius: '7px', fontSize: '12px', color: '#713f12' }}>
            ⚠ Analysis is AI-generated from verified event data. Always cross-reference with primary sources. Not a prediction.
          </div>

          {/* Brief history */}
          {allBriefs.length > 1 && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '10px' }}>
                Previous Briefs
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {allBriefs.slice(1).map((b, i) => (
                  <button key={i} onClick={() => setBrief(b)}
                    style={{
                      background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                      borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                      color: 'rgba(255,255,255,.7)', fontSize: '12px', fontFamily: 'var(--font-sans)',
                      transition: 'background .15s',
                    }}>
                    {new Date(b.generated_at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
                    &nbsp;·&nbsp;{b.bullets?.length ?? 0} bullets
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
          No analysis brief available.
        </div>
      )}
    </PageShell>
  );
}
