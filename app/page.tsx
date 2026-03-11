import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import TopNav from '@/components/ui/TopNav';
import TheaterSelector from '@/components/ui/TheaterSelector';
import GlobalSnapshot from '@/components/dashboard/GlobalSnapshot';
import BreakingCard from '@/components/dashboard/BreakingCard';
import DevelopmentsCard from '@/components/dashboard/DevelopmentsCard';
import CasualtyCard from '@/components/dashboard/CasualtyCard';
import DamageCard from '@/components/dashboard/DamageCard';
import TimelineCard from '@/components/dashboard/TimelineCard';
import MapPreview from '@/components/dashboard/MapPreview';
import HotspotsCard from '@/components/dashboard/HotspotsCard';
import RegionalSituationCard from '@/components/dashboard/RegionalSituationCard';
import AnalysisCard from '@/components/dashboard/AnalysisCard';
import DailySummaryCard from '@/components/dashboard/DailySummaryCard';
import type { DashboardPayload, CasualtySummary } from '@/lib/types';

const DEFAULT_THEATER = process.env.NEXT_PUBLIC_DEFAULT_THEATER ?? 'me-iran-israel-us';

async function getDashboard(theater: string): Promise<DashboardPayload> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res  = await fetch(`${base}/api/dashboard?theater=${theater}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Dashboard API error: ${res.status}`);
  return res.json();
}

// Build casualty lookup: { '24h': [...], '72h': [...], ... }
async function getCasualties(
  theater: string
): Promise<Record<string, CasualtySummary[]>> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const results: Record<string, CasualtySummary[]> = {};
  await Promise.all(
    ['24h', '72h', '96h', '7d'].map(async range => {
      const r = await fetch(`${base}/api/casualties?theater=${theater}&range=${range}`, {
        next: { revalidate: 60 },
      });
      if (r.ok) {
        const json = await r.json();
        results[range] = json.data ?? [];
      }
    })
  );
  return results;
}

interface Props {
  searchParams: { theater?: string };
}

export default async function DashboardPage({ searchParams }: Props) {
  const theater = searchParams.theater ?? DEFAULT_THEATER;

  let data: DashboardPayload;
  let casData: Record<string, CasualtySummary[]>;

  try {
    [data, casData] = await Promise.all([
      getDashboard(theater),
      getCasualties(theater),
    ]);
  } catch {
    // Show skeleton on error — don't 404
    return <DashboardSkeleton theater={theater} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-gradient)' }}>
      <TopNav />

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 20px 48px' }}>
        {/* Page header with theater selector */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '18px',
        }}>
          <div>
            <h2 style={{ color: '#f8fafc', fontWeight: 700, fontSize: '18px', marginBottom: '2px' }}>
              {data.theater.name}
            </h2>
            <div style={{ color: 'rgba(255,255,255,.45)', fontSize: '12px' }}>
              Updated {new Date(data.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
              &nbsp;·&nbsp;Auto-refreshes every 60s
            </div>
          </div>
          <Suspense fallback={null}>
            <TheaterSelector current={theater} />
          </Suspense>
        </div>

        {/* ── Row 1: Global Snapshot (full width) ─────────────────────── */}
        <div style={{ marginBottom: 'var(--gap)' }}>
          <GlobalSnapshot
            escalation={data.escalation}
            gci={data.gci}
            theater={theater}
          />
        </div>

        {/* ── Row 2: Breaking (full width) ────────────────────────────── */}
        <div style={{ marginBottom: 'var(--gap)' }}>
          <BreakingCard event={data.breaking} theater={theater} />
        </div>

        {/* ── Row 3: Developments | Casualties | Damage ───────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 'var(--gap)',
          marginBottom: 'var(--gap)',
        }}>
          <DevelopmentsCard events={data.developments} theater={theater} />
          <CasualtyCard data={casData} theater={theater} />
          <DamageCard events={data.damage} theater={theater} />
        </div>

        {/* ── Row 4: Timeline (left) | Map + Hotspots (right) ─────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap: 'var(--gap)',
          marginBottom: 'var(--gap)',
          alignItems: 'start',
        }}>
          {/* Timeline */}
          <TimelineCard events={data.timeline} theater={theater} />

          {/* Right column: Map + Hotspots */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
            <MapPreview theater={theater} />
            <HotspotsCard hotspots={data.hotspots} theater={theater} />
          </div>
        </div>

        {/* ── Row 5: Regional Situation (left) | Daily Summary (right) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap: 'var(--gap)',
          marginBottom: 'var(--gap)',
          alignItems: 'start',
        }}>
          <RegionalSituationCard regions={data.regions} theater={theater} />
          <DailySummaryCard summary={data.daily_summary} theater={theater} />
        </div>

        {/* ── Row 6: Analysis (full width) ────────────────────────────── */}
        <div style={{ marginBottom: 'var(--gap)' }}>
          <AnalysisCard brief={data.analysis} theater={theater} />
        </div>

        {/* Footer */}
        <footer style={{
          textAlign: 'center', color: 'rgba(255,255,255,.3)',
          fontSize: '11px', lineHeight: 1.8, marginTop: '32px',
        }}>
          <div>Sources: Reuters, AP, BBC, Al Jazeera, OSINT</div>
          <div>Information is subject to change · Confidence: Confirmed · Likely · Unconfirmed</div>
        </footer>
      </main>
    </div>
  );
}

function DashboardSkeleton({ theater }: { theater: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-gradient)' }}>
      <TopNav />
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
          <TheaterSelector current={theater} />
        </div>
        {/* Snapshot skeleton */}
        <div className="skeleton" style={{ height: '120px', borderRadius: '12px', marginBottom: '18px' }} />
        <div className="skeleton" style={{ height: '60px', borderRadius: '12px', marginBottom: '18px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px', marginBottom: '18px' }}>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: '220px', borderRadius: '12px' }} />)}
        </div>
        <div className="skeleton" style={{ height: '300px', borderRadius: '12px' }} />
      </main>
    </div>
  );
}
