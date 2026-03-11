'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';
import { ConfidenceBadge, SeverityBadge, CountryFlag, SourceChip, SEV_COLOR } from '@/components/ui/Badges';
import EventDrawer from '@/components/ui/EventDrawer';
import type { ConflictEvent } from '@/lib/types';

export default function DevelopmentsPage() {
  const sp       = useSearchParams();
  const theater  = sp.get('theater') ?? 'me-iran-israel-us';
  const [range,  setRange]     = useState(sp.get('range') ?? '24h');
  const [sort,   setSort]      = useState('impact');
  const [events, setEvents]    = useState<ConflictEvent[]>([]);
  const [loading,setLoading]   = useState(true);
  const [page,   setPage]      = useState(1);
  const [total,  setTotal]     = useState(0);
  const [selected,setSelected] = useState<ConflictEvent | null>(null);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ theater, range, sort, page: String(page), pageSize: '20' });
    fetch(`/api/developments?${p}`)
      .then(r => r.json())
      .then(j => { setEvents(j.data ?? []); setTotal(j.pagination?.total ?? 0); })
      .finally(() => setLoading(false));
  }, [theater, range, sort, page]);

  return (
    <PageShell>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Major Developments</h1>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>{total} events found</p>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['24h','72h','96h','7d'].map(r => (
            <button key={r} onClick={() => { setRange(r); setPage(1); }} className={`chip ${range === r ? 'active' : ''}`}>{r}</button>
          ))}
        </div>
        <span style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
        <div style={{ display: 'flex', gap: '4px' }}>
          {[{ v: 'impact', l: 'By Impact' },{ v: 'recency', l: 'Most Recent' }].map(s => (
            <button key={s.v} onClick={() => { setSort(s.v); setPage(1); }} className={`chip ${sort === s.v ? 'active' : ''}`}>{s.l}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? [...Array(6)].map((_,i) => <div key={i} className="skeleton" style={{ height: '72px', borderRadius: '10px' }} />) :
          events.map((ev, idx) => (
            <div key={ev.event_id} className="card"
              onClick={() => setSelected(ev)}
              style={{ cursor: 'pointer', display: 'flex', gap: '14px', alignItems: 'flex-start', borderLeft: `3px solid ${SEV_COLOR[ev.severity]}`, padding: '12px 16px' }}>
              {/* Rank */}
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#64748b', flexShrink: 0 }}>
                {(page-1)*20 + idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '5px' }}>
                  {ev.headline ?? ev.summary_20w}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <SeverityBadge value={ev.severity} />
                  <ConfidenceBadge value={ev.confidence} />
                  <CountryFlag country={ev.country_primary} />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{ev.country_primary}</span>
                  {(ev.sources ?? []).slice(0,2).map((s,i) => <SourceChip key={i} name={s.publisher} />)}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                {ev.importance_score}
              </div>
            </div>
          ))
        }
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="chip" style={{ opacity: page === 1 ? .4 : 1 }}>← Prev</button>
          <span style={{ color: 'rgba(255,255,255,.6)', padding: '4px 8px', fontSize: '12px' }}>
            Page {page} of {Math.ceil(total/20)}
          </span>
          <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/20)}
            className="chip" style={{ opacity: page >= Math.ceil(total/20) ? .4 : 1 }}>Next →</button>
        </div>
      )}

      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
