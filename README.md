# Global Conflict Monitor (GCM)

Neutral, confidence-labeled conflict event tracking platform. Multi-theater support.  
Built with Next.js 14 (App Router) · TypeScript · TailwindCSS · PostgreSQL + PostGIS.

---

## Quick Start (Local)

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with PostGIS extension
- OpenAI or Anthropic API key (for ingestion pipeline)

### 1. Install PostGIS

```bash
# Ubuntu / Debian
sudo apt install postgresql-15-postgis-3

# macOS (Homebrew)
brew install postgis
```

### 2. Clone and install

```bash
git clone <repo>
cd global-conflict-monitor
npm install
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL at minimum
```

### 3. Validate environment

```bash
npm run validate-env
# Exits non-zero and lists any missing required variables
```

### 4. Create database and run migrations

```bash
psql -U postgres -c "CREATE DATABASE gcm;"
psql -U postgres -d gcm -c "CREATE EXTENSION postgis;"
npm run db:migrate
# Applies all /db/migrations/*.sql in order (idempotent)
```

### 5. Seed reference data

```bash
npm run seed
# Inserts 2 theaters, 30 events, 20 sources, 10 casualty reports
```

### 6. Start dev server

```bash
npm run dev
# http://localhost:3000
```

---

## Deploy to Vercel + Supabase

### 1. Supabase database

1. Create project at [supabase.com](https://supabase.com)
2. In SQL Editor: `CREATE EXTENSION postgis;`
3. Copy the **Transaction Mode** connection string from Project Settings → Database
4. Append `?pgbouncer=true&connection_limit=1` for the pooler URL

### 2. Vercel deployment

```bash
npm install -g vercel
vercel deploy
```

Set all env vars from `.env.example` in the Vercel dashboard.  
Migrations run automatically before each build via the `prebuild` hook.

### 3. Register Telegram webhook (one-time, after first deploy)

```bash
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app \
npx tsx scripts/register-telegram-webhook.ts
```

Re-run whenever your domain changes.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build (runs migrations first) |
| `npm run validate-env` | Check all required env vars before deploy |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:status` | Show applied/pending migrations (dry-run) |
| `npm run seed` | Seed theaters + sample events |
| `npm test` | Run test suite (vitest) |
| `npm run ingest` | Run ingestion worker once (CLI) |
| `npm run brief` | Run brief generation worker once (CLI) |
| `npm run alerts:hourly` | Dispatch hourly alerts (CLI) |
| `npm run alerts:daily` | Dispatch daily alerts (CLI) |

---

## Required Environment Variables

See `.env.example` for the full list.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CRON_SECRET` | ✅ Production | Protects `/api/cron/*` routes |
| `ADMIN_SECRET` | ✅ Production | Protects `/api/admin/*` routes |
| `OPENAI_API_KEY` | For ingestion | Event extraction + AI scoring |
| `ANTHROPIC_API_KEY` | Alternative LLM | Claude for extraction |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | For map page | Mapbox GL access token |
| `NEXT_PUBLIC_APP_URL` | For email links | Your deployed domain |
| `TELEGRAM_BOT_TOKEN` | For Telegram alerts | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | For Telegram alerts | Random secret, set in Vercel env |
| `SMTP_HOST` | For email alerts | SMTP server hostname |
| `SENTRY_DSN` | Recommended | Error tracking |

---

## API Endpoints

All list endpoints support `?theater=slug` and `?range=1h|6h|24h|72h|7d|30d`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | All card payloads in one response |
| GET | `/api/breaking` | Breaking alerts, ranked by importance |
| GET | `/api/developments` | Major developments |
| GET | `/api/casualties` | Casualty data by country |
| GET | `/api/damage` | Infrastructure damage events |
| GET | `/api/timeline` | Full event log, cursor-paginated |
| GET | `/api/hotspots` | Geospatial hotspot clusters |
| GET | `/api/regions` | Per-country situation summaries |
| GET | `/api/escalation` | Escalation score + time-series |
| GET | `/api/global-index` | Global Conflict Index (all theaters) |
| GET | `/api/analysis` | AI strategic analysis briefs |
| GET | `/api/daily` | Daily briefing summary |
| GET | `/api/map/events` | Lightweight map markers |
| GET | `/api/health` | DB + config health check |
| POST | `/api/subscribe` | Create alert subscription (double opt-in) |
| POST | `/api/unsubscribe` | Unsubscribe |
| GET | `/api/verify` | Email verification link handler |
| POST | `/api/telegram-webhook` | Telegram Bot API updates |
| GET | `/api/admin/job-runs` | Background worker health (requires `ADMIN_SECRET`) |
| GET | `/api/admin/monitor` | Job alerts + Slack integration (requires `ADMIN_SECRET`) |
| GET | `/api/admin/subscribers` | List/inspect subscribers (requires `ADMIN_SECRET`) |
| DELETE | `/api/admin/subscribers?id=` | Remove a subscriber (requires `ADMIN_SECRET`) |

---

## Background Workers (Vercel Cron)

Configured in `vercel.json`. All protected by `CRON_SECRET`.

| Cron | Schedule | Description |
|---|---|---|
| `/api/cron/ingest` | Every 5 min | Fetch RSS feeds → extract events → dispatch instant alerts |
| `/api/cron/alerts?freq=hourly` | Every hour | Dispatch hourly digest alerts |
| `/api/cron/alerts?freq=daily` | 06:00 UTC daily | Dispatch daily digest alerts |
| `/api/cron/brief` | Every 6 hours | Generate AI strategic analysis briefs |
| `/api/cron/retention` | 03:00 UTC daily | Prune old rows from raw_items, job_runs, alert_dispatch_log |
| `/api/admin/monitor` | Every 15 min | Job health check + Slack alerts |

---

## Alert Subscriptions

Subscribers go through double opt-in before receiving any alerts:

1. `POST /api/subscribe` — creates unverified subscriber, sends verification email/Telegram message
2. User clicks link (email) or sends `/start <token>` (Telegram) to verify
3. Verified subscribers receive alerts matching their filters (theater, country, severity, frequency)

Subscribers are automatically suspended after 5 consecutive delivery failures.  
Review suspended subscribers via `GET /api/admin/subscribers?suspended=true`.

---

## Adding Theaters

```sql
INSERT INTO theaters (name, slug, importance_weight)
VALUES ('Taiwan Strait – China/Taiwan/US', 'tw-china-taiwan-us', 1.2);
```

Then add relevant RSS feeds to `workers/feeds.ts` with `theater: 'tw-china-taiwan-us'`.

---

## Project Structure

```
/app/api/            API route handlers (Next.js App Router)
/components/         UI components (dashboard cards, layout)
/db/migrations/      SQL migrations — applied in order by scripts/migrate.ts
/lib/db/             Database pool, query helpers, timeframe parser
/lib/scoring/        Confidence, escalation, GCI, WPI algorithms
/lib/geo/            PostGIS hotspot clustering
/lib/email/          Email templates (alert digest, verification)
/lib/monitoring/     Job health checks, Slack alerts
/scripts/            migrate.ts · seed.ts · validate-env.ts · register-telegram-webhook.ts
/workers/            Ingestion pipeline, alert dispatch, brief generation, retention
```

---

## Intelligence Algorithms

All in `/lib/scoring/`:

- **Confidence** (`confidence.ts`) — Tier1/2/3 publisher rules + evidence weighting
- **Deterministic score** (`deterministic.ts`) — hybrid importance score
- **Escalation** (`escalation.ts`) — 72h rolling escalation_points → 0–100 index + trend
- **GCI** (`gci.ts`) — weighted cross-theater average + spread factor
- **WPI** (`wpi.ts`) — 5-factor war probability indicator

---

## Notes

- **Casualty figures** are sourced from explicit reports only; never inferred from event text.
- **Confidence labels** are shown on every event: Confirmed / Likely / Unconfirmed.
- **Signals** (`is_signal=true`) are unverified events shown with distinct styling and excluded from the escalation score.
- **No speculation** — all summaries and analysis bullets are constrained to ≤20 words, neutral tone.
