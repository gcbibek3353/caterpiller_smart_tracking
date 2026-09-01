# Smart Rental Tracking

A demo-grade **equipment rental and monitoring platform** for construction and mining fleets. Clients book machines, admins manage check-out/check-in via QR, and the system tracks live telemetry, detects anomalies, and forecasts demand.

Built as a **24-hour team hackathon** (4 developers). This README is the entry point; detailed specs live in the docs linked below.

---

## What it does

| Capability | Description |
|---|---|
| **Equipment rental** | Browse fleet, create bookings, confirm rentals, issue QR codes |
| **QR check-out / check-in** | Same token for both; server decides the action from booking status |
| **Simulated telemetry** | 10-minute equipment ticks (fuel, temp, GPS, engine state) via a standalone simulator |
| **Analytics** | Daily rollups power fast charts; raw telemetry is never queried by dashboards |
| **Anomaly detection** | Rule-based + statistical (robust z-score, EWMA) detectors for idle, theft, overheat, overdue, etc. |
| **Demand forecasting** | Per-site *and* company-wide, at `date + siteId + equipmentType` granularity. Seasonal-naive benchmark vs. Holt-Winters vs. a hand-rolled gradient-boosting challenger (lag/rolling/calendar features), picked independently per series by rolling-origin-backtested MASE. Cold-start series fall back to seasonal-naive and get flagged `LOW_CONFIDENCE` rather than a fake-confident number. |
| **Asset page** | Per-machine KPIs, charts, GPS map, event timeline |
| **Admin dashboard** | Fleet utilization, status mix, anomalies, forecast-risk chart, anomaly trend |

---

## Architecture

```
Simulator ──POST──▶ Ingest API ──▶ Telemetry (raw, 10-min ticks)
                                        │
                                   Rollup job (nightly + on demand)
                                        ▼
                                   DailyUsage (1 row / equipment / day)
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                  Asset charts     Forecasting     Anomaly rules
                                        │               │
                                        └──────┬────────┘
                                               ▼
                                        Email / Alerts
```

**Three design rules that shape everything:**

1. **Telemetry is simulated, but the contract is real.** The simulator POSTs to `/api/telemetry/ingest` exactly like real telematics hardware would. Swapping in real devices later means changing the sender, not the system.

2. **Seed ~12 months of history on day one.** Forecasting and anomaly detection need data. An empty database produces flat charts and useless models.

3. **Dashboards read `DailyUsage`, not raw `Telemetry`.** Raw ticks are append-only; a rollup job collapses them into one row per equipment per day. This keeps the asset page fast.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| API | [Hono](https://hono.dev) + [Prisma](https://www.prisma.io) + PostgreSQL 16 |
| Auth | [better-auth](https://www.better-auth.com) (session cookie, not bearer token) |
| Frontend | [Next.js 16](https://nextjs.org) App Router + [Tailwind CSS 4](https://tailwindcss.com) |
| Charts | [Recharts](https://recharts.org) |
| Maps | [Leaflet](https://leafletjs.com) + react-leaflet |
| Email | Resend (production) / console transport (dev) |
| QR | `qrcode` (generate) + `qr-scanner` (scan) |
| Jobs | `croner` (in-process scheduler) |

---

## Repository layout

```
caterpiller_smart_tracking/
├── backend/                  # Hono API (port 4000)
│   ├── prisma/
│   │   ├── schema.prisma     # additive changes only — back up + verify row
│   │   │                     #   counts before/after any push (see steps.md)
│   │   └── seed.ts           # Highest-leverage file in the repo
│   ├── simulator/            # Standalone telemetry generator — moved inside
│   │   │                     #   backend/ when the root bun workspace was
│   │   │                     #   dropped; no HTTP server of its own
│   │   └── src/
│   ├── scripts/               # with-test-db.ts (routes destructive test
│   │   │                      #   suites at TEST_DATABASE_URL, never Neon),
│   │   │                      #   db-snapshot.ts (dump/restore parachute)
│   │   └── db-snapshot.ts
│   ├── src/
│   │   ├── index.ts          # App bootstrap + route mounting
│   │   ├── shared/           # Shared types — moved inside backend/ with the
│   │   │                     #   simulator; frontend hand-mirrors these (lib/types.ts)
│   │   ├── contracts/        # Zod schemas for every API (source of truth)
│   │   ├── routes/           # auth, equipment, bookings, scan, telemetry, …
│   │   ├── services/
│   │   │   ├── forecast/     # pure model functions (series/features/gbm/
│   │   │   │                 #   holtWinters/backtest) + runner.ts (the only
│   │   │   │                 #   file that touches Prisma)
│   │   │   ├── anomaly/      # daily/realtime/booking rules + statistical layer
│   │   │   └── mailer/       # templates + console/Resend transports
│   │   ├── middleware/       # auth guards, validation, error envelope
│   │   └── lib/              # stats, serialize, http helpers
│   └── docker-compose.yml    # Postgres :5433 + Adminer :8081
├── frontend/                 # Next.js (port 3000)
│   ├── app/                  # pages (asset, admin, auth, scanner, …)
│   ├── components/           # charts, map, timeline, …
│   ├── lib/design-system.ts  # validated colour ramp + chart geometry —
│   │                         #   Recharts/Leaflet take literal values, not classes
│   └── fixtures/             # legacy JSON fixtures — no page reads these anymore
├── steps.md                  # Full build guide — schema, APIs, algorithms
├── plan-24h.md               # 24-hour schedule + team task split
└── checklist.md              # Live task tracker (who's done what)
```

> `simulator/` and `shared/` used to be sibling workspaces at the repo root
> (bun workspaces); both moved inside `backend/` when that setup was dropped
> in favor of each app managing its own independent `bun.lock`.

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) (or Node.js + npm as fallback)
- [Docker](https://www.docker.com) (for Postgres)

### 1. Database

```bash
cd backend
cp .env.example .env          # edit if needed
bun install
bun run db:up                 # Postgres on localhost:5433, Adminer on :8081
bun run db:push               # sync schema + prisma generate
bun run seed                  # when seed.ts lands (~90s, 12+ months of history)
```

### 2. Backend

```bash
cd backend
bun run dev                   # http://localhost:4000
curl http://localhost:4000/health
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
bun install
bun run dev                   # http://localhost:3000
```

### 4. Simulator

Lives inside `backend/` now (moved when the root bun workspace was dropped —
each app manages its own independent `bun.lock`):

```bash
cd backend
bun run sim                   # reads CHECKED_OUT bookings, POSTs live ticks
bun run sim:print-day         # print one simulated day to stdout (debug physics)
bun run sim:print-day -- --scenario theft   # theft scenario demo
```

### All services from root

Convenience wrappers only — each app still installs and manages its own deps:

```bash
bun run dev:backend           # from repo root
bun run dev:frontend
bun run sim:print-day
bun run sim:theft
```

---

## Environment variables

### `backend/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection — pooled endpoint. **Use port 5433** locally (see below); against Neon this is the `-pooler` host, since the running server always talks through pgbouncer. |
| `DIRECT_URL` | Same Postgres, the **non-pooled** endpoint (against Neon: same host, minus `-pooler`). Only `prisma db push` and `pg_dump` (`db:dump`/`db:restore`) use it — both need a session-level connection pgbouncer can't give. Optional for plain local Postgres, which has no pooler at all. |
| `TEST_DATABASE_URL` | Where the *destructive* suites (`test:api`, `test:api:b4`, `test:api:b5`) point — defaults to local Docker. `scripts/with-test-db.ts` swaps `DATABASE_URL` for this and runs the server on `:4001` so it can't collide with a `dev` server holding `:4000` against Neon. Every one of those suites also refuses outright if it detects it's about to run against anything but `localhost`. |
| `BETTER_AUTH_SECRET` | ≥ 32 chars |
| `BETTER_AUTH_URL` | `http://localhost:4000` |
| `PORT` | API port (default `4000`) |
| `CORS_ORIGIN` | `http://localhost:3000` |
| `INGEST_API_KEY` | API key for telemetry ingest (`x-api-key` header) |
| `MAIL_MODE` | `console` (dev) or `resend` (production) |
| `MAIL_FROM` | Sender address |
| `RESEND_API_KEY` | Required when `MAIL_MODE=resend` |

> ⚠️ **`DATABASE_URL` in a real `.env` points at the team's shared Neon
> database.** Never run a destructive suite directly (`bun tests/a7.api.check.ts`)
> — always through its `bun run test:api*` script, which routes it at
> `TEST_DATABASE_URL` instead.

### `frontend/.env.local`

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |
| `API_PROXY_TARGET` | Unset by default. When set, `next.config.ts` rewrites `/api/*` to this origin, so the frontend only ever talks to itself. |

> **Postgres runs on port 5433, not 5432.** Port 5432 is often taken on dev machines. Adminer: [http://localhost:8081](http://localhost:8081).

> **A11's known trap, solved ahead of time:** on a phone over the LAN, an `https://<LAN-IP>` page cannot fetch `http://localhost:4000` (mixed content) or `http://<LAN-IP>:4000` (not in `CORS_ORIGIN`, and the session cookie goes cross-site). `bun run dev:https` sets `API_PROXY_TARGET` automatically, which collapses all three problems into a same-origin request — no mixed content, no CORS, no cross-site cookie. The same mechanism is the deploy escape hatch, not just the phone-test one.

---

## Locked decisions

These were agreed at kickoff — do not relitigate without team consensus.

| Topic | Decision |
|---|---|
| Timezone | **UTC everywhere.** Store UTC; convert at display edges only. |
| Auth | **better-auth session cookie** with `credentials: true` on CORS |
| API envelope | `{ data }` success · `{ error: { code, message, details? } }` failure |
| Migrations | **None.** `prisma db push` only. |
| Schema | In practice, several people have needed to extend `prisma/schema.prisma` as their feature required it (site-level forecasting, B5's QR fields, C4's telemetry). What actually held: **additive changes only** (new nullable columns/indexes, never a drop or type change), a `bun run db:dump` backup and a recorded row count *before* touching it, `prisma db push` (never `--force-reset` against the shared DB), then the same row counts re-verified identical *after*. |
| Contracts | Backend `src/contracts/` is source of truth; frontend mirrors types manually |
| Postgres | Host port **5433**; container internal port 5432 |

---

## Roles

| Role | Access |
|---|---|
| **ADMIN** | Full fleet visibility, confirm bookings, scan QR, manage equipment, view all anomalies |
| **CLIENT** | Own bookings only; asset data scoped to their rental window — **enforced server-side** |

Demo accounts (after seed):

```
admin@rental.com / admin123     (ADMIN)
client@build.com / client123    (CLIENT)
```

---

## API overview

All routes live under `/api`. Auth via session cookie unless noted.

| Area | Key endpoints | Status |
|---|---|---|
| Auth | `POST /api/auth/*` (better-auth) | ✅ |
| Equipment | `GET/POST/PATCH/DELETE /api/equipment` | ✅ |
| Sites / Operators | CRUD under `/api/sites`, `/api/operators` | ✅ |
| Bookings | `POST/GET/PATCH /api/bookings`, `/:id/confirm` (QR issuance), `/:id/qr.png` | ✅ |
| Scan | `POST /api/scan/resolve` (preview), `/api/scan/commit` (transactional) | ✅ |
| Telemetry | `POST /api/telemetry/ingest` (`x-api-key`), `GET /api/telemetry/active-bookings` | ✅ |
| Analytics | `/api/equipment/:id/{summary,timeseries,track,daily,events}` | ✅ |
| Jobs | `POST /api/jobs/rollup` (ADMIN-only) | ✅ |
| Anomalies | `GET/PATCH /api/anomalies` (joins equipment code/name), `POST /api/anomalies/run` | ✅ |
| Forecast | `GET /api/forecast/demand?type=&siteId=&weeks=`, `GET /api/forecast/sites`, `POST /api/forecast/run` | ✅ |
| Notifications | `GET /api/notifications` — the feed behind `/alerts` | ✅ |
| Fleet | `GET /api/analytics/fleet` (includes `attentionItems`: top open anomalies) | ✅ |

`forecast/demand`'s `siteId` is tri-state: omit it for every series (company-wide
+ every site), `siteId=company` for company-wide only, or a real site id to
scope to one site. `forecast/run` takes an optional `type`+`siteId` to run just
one series (seconds) instead of the full sweep (every type × every site,
~4 minutes on the current seed).

> Every scheduled job also gets a **manual `POST` trigger** for demo reliability.

Full contract details: `steps.md` §3 and `backend/src/contracts/`.

---

## QR check-out / check-in

```
PENDING ──(admin confirms)──▶ CONFIRMED ──(scan)──▶ CHECKED_OUT ──(scan)──▶ RETURNED
```

- QR payload: `RENT:v1:<opaqueToken>` — no PII in the code.
- **Same token** serves check-out and check-in; the server picks the action from `booking.status`.
- Two-step flow: `/api/scan/resolve` (preview) → `/api/scan/commit` (transactional, re-reads status inside `$transaction`).

---

## Telemetry simulator

Standalone Bun script (`backend/simulator/`) that reads `CHECKED_OUT` bookings via `GET /api/telemetry/active-bookings` and POSTs 10-minute ticks to `POST /api/telemetry/ingest`.

**Scenarios** (`--scenario`):

| Scenario | Behaviour |
|---|---|
| `idle` | Force idle during working hours |
| `dead` | Machine stops operating |
| `theft` | Leaves geofence — **primary demo moment** |
| `siphon` | Rapid fuel drop without engine use |
| `overheat` | Temperature exceeds 105 °C |
| `offline` | Stops emitting telemetry |

Ingest is idempotent: `@@unique([equipmentId, ts])` + `createMany({ skipDuplicates: true })`.

---

## Frontend pages

| Route | Audience | Purpose |
|---|---|---|
| `/` | All | Role-based redirect — client → `/dashboard`, admin → `/admin`, else → `/login` |
| `/dashboard` | Client | Available equipment, own sites |
| `/equipment` | Client | Browse and book |
| `/bookings`, `/bookings/[id]` | Client | My rentals, QR display |
| `/equipment/[equipmentId]` | Both | Machine detail — KPIs, 5 charts, GPS map, event timeline, equipment photo. `/asset/:id` (the original C7 route, still named in `steps.md` §11 and the demo script below) is kept working as a real 308 redirect in `next.config.ts`, not a client-side stub — old bookmarks and links never break. |
| `/alerts` | Both | Notification feed + anomaly feed, merged into one chronological timeline |
| `/admin` | Admin | Fleet KPIs, status bar, needs-attention list, **forecast-risk bar** (utilization by type, next week), **anomaly trend** (stacked by severity, last 14 days) |
| `/admin/equipment` | Admin | Fleet CRUD |
| `/admin/bookings` | Admin | Confirm, assign site/operator |
| `/admin/scanner` | Admin | Camera QR scan + manual entry fallback |
| `/admin/anomalies` | Admin | Severity-sorted table, open-count-by-severity strip, links straight to `/asset/<id>` |
| `/admin/forecast` | Admin | Site + equipment-type selectors (Company-wide by default), shaded prediction band, MASE/model/`LOW CONFIDENCE` badges, recommendation sentences, and a **fleet-wide shortage radar** ranking every site×type series by projected gap |
| `/spike/scan` | Dev | QR camera spike (B2) |

---

## Team ownership

| Person | Owns |
|---|---|
| **A** | Schema, auth, CRUD, seed script, deployment |
| **B** | Bookings, QR, scan state machine, booking UX |
| **C** | Simulator, telemetry ingest/rollup, asset page, charts, map, fleet dashboard |
| **D** | Forecasting, anomaly detection, mailer, scheduler, intelligence UI |

Task status: see [`checklist.md`](checklist.md).

---

## Demo script (rehearse 2× before presenting)

1. Client books an excavator → admin confirms → QR issued, email in `/alerts`
2. Scan QR from laptop screen → preview → meter + fuel → `CHECKED_OUT`
3. Open `/asset/<id>` — live charts and GPS breadcrumb (simulator at 60×)
4. Run `--scenario theft` → geofence breach → HIGH alert in `/alerts` within 20 s
5. Switch to 21-day range — working/idle bars, fuel saw-tooth, temp threshold
6. `/admin/forecast` — pick a site, watch the shortage radar re-rank; shaded interval band, MASE/model badges, recommendation sentences ("SITE A: Excavator demand is projected to reach 8 units next week...")
7. Scan same QR again → `CHECK_IN` → total computed, machine `AVAILABLE`

Keep a `.sql` snapshot ready to restore in 30 seconds. Live demos break.

```bash
cd backend
bun run db:dump      # save snapshot
bun run db:restore   # restore before demo
```

---

## QR scanner on a phone (HTTPS required)

`navigator.mediaDevices` is blocked on plain `http://192.168.x.x`. Use HTTPS:

```bash
cd frontend
bun run dev:https
# phone: https://<your-LAN-IP>:3000/spike/scan
```

`next dev --experimental-https` alone generates a cert that isn't valid for
your LAN IP; `scripts/dev-https.ts` (`dev:https`) generates one that is and
launches `next dev` with it — no manual `-H`/cert flags needed. Override the
detected IP with `HTTPS_HOST=<your-ip> bun run dev:https` if it guesses wrong.
A manual code-entry fallback ships beside the camera for stage reliability.

---

## Documentation map

| File | Contents |
|---|---|
| [`steps.md`](steps.md) | Authoritative spec — data model, API contract, algorithms, seeding, demo |
| [`plan-24h.md`](plan-24h.md) | Hour-by-hour schedule, dependency graph, cut list |
| [`checklist.md`](checklist.md) | Live progress tracker — what's done, blocked, partial |
| [`backend/README.md`](backend/README.md) | Backend-specific notes |
| [`frontend/README.md`](frontend/README.md) | Frontend-specific notes |

---

## Development commands

```bash
# Backend
bun --cwd backend test                  # unit tests (built-in `bun test`) — pure functions, no DB
bun run --cwd backend test:api          # A7 equipment/sites/operators, against TEST_DATABASE_URL
bun run --cwd backend test:api:b4       # B4 booking overlap + RBAC
bun run --cwd backend test:api:b5       # B5 confirm + QR issuance
bun run --cwd backend dev:test          # dev server on the test DB (:4001) — pairs with the above
bun run --cwd backend db:studio         # Prisma Studio
bun run --cwd backend db:dump/db:restore # snapshot parachute — run dump before any schema change
bun run --cwd backend seed:verify       # validate seed output

# Frontend
bun run --cwd frontend build
bun run --cwd frontend lint
bun run --cwd frontend dev:https        # HTTPS dev server for the phone QR-scan test

# Simulator (backend/simulator/)
bun run sim:print-day                   # stdout one day of ticks
bun run sim:theft                       # theft scenario
```

---

## License

Private hackathon project — not licensed for external use.
