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
| **Anomaly detection** | Rule-based (+ statistical) detectors for idle, theft, overheat, overdue, etc. |
| **Demand forecasting** | Holt-Winters + seasonal-naive benchmark, MASE-validated, with recommendations |
| **Asset page** | Per-machine KPIs, charts, GPS map, event timeline |
| **Admin dashboard** | Fleet utilization, status mix, anomalies, forecast |

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
│   │   ├── schema.prisma     # ⚠️ Only Person A edits this file
│   │   └── seed.ts           # Highest-leverage file in the repo
│   ├── src/
│   │   ├── index.ts          # App bootstrap + route mounting
│   │   ├── contracts/        # Zod schemas for every API (source of truth)
│   │   ├── routes/           # auth, equipment, bookings, scan, telemetry, …
│   │   ├── services/         # rollup, forecast, anomaly, mailer
│   │   ├── middleware/       # auth guards, validation, error envelope
│   │   └── lib/              # stats, serialize, http helpers
│   └── docker-compose.yml    # Postgres :5433 + Adminer :8081
├── frontend/                 # Next.js (port 3000)
│   ├── app/                  # pages (asset, admin, auth, scanner, …)
│   ├── components/           # charts, map, timeline, …
│   └── fixtures/             # JSON fixtures for UI-before-API development
├── simulator/                # Standalone telemetry generator (no HTTP server)
├── shared/                   # Shared types (optional; contracts also in backend)
├── steps.md                  # Full build guide — schema, APIs, algorithms
├── plan-24h.md               # 24-hour schedule + team task split
└── checklist.md              # Live task tracker (who's done what)
```

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

### 4. Simulator (when telemetry is wired)

```bash
# from repo root
bun run dev:simulator

# print one simulated day to stdout (debug physics)
bun run sim:print-day
bun run sim:theft             # theft scenario demo
```

### All services from root

```bash
bun install                   # installs all workspaces
bun run dev:backend
bun run dev:frontend
```

---

## Environment variables

### `backend/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection — **use port 5433** (see below) |
| `BETTER_AUTH_SECRET` | ≥ 32 chars |
| `BETTER_AUTH_URL` | `http://localhost:4000` |
| `PORT` | API port (default `4000`) |
| `CORS_ORIGIN` | `http://localhost:3000` |
| `INGEST_API_KEY` | API key for telemetry ingest (`x-api-key` header) |
| `MAIL_MODE` | `console` (dev) or `resend` (production) |
| `MAIL_FROM` | Sender address |
| `RESEND_API_KEY` | Required when `MAIL_MODE=resend` |

### `frontend/.env.local`

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |

> **Postgres runs on port 5433, not 5432.** Port 5432 is often taken on dev machines. Adminer: [http://localhost:8081](http://localhost:8081).

---

## Locked decisions

These were agreed at kickoff — do not relitigate without team consensus.

| Topic | Decision |
|---|---|
| Timezone | **UTC everywhere.** Store UTC; convert at display edges only. |
| Auth | **better-auth session cookie** with `credentials: true` on CORS |
| API envelope | `{ data }` success · `{ error: { code, message, details? } }` failure |
| Migrations | **None.** `prisma db push` only. |
| Schema | **Only Person A** edits `prisma/schema.prisma` |
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
| Bookings | `POST/GET/PATCH /api/bookings`, confirm, QR | 🔲 |
| Scan | `POST /api/scan/resolve`, `/api/scan/commit` | 🔲 |
| Telemetry | `POST /api/telemetry/ingest` (`x-api-key`) | 🔲 |
| Analytics | `/api/equipment/:id/{summary,timeseries,track,daily}` | 🔲 |
| Jobs | `POST /api/jobs/rollup` | 🔲 |
| Anomalies | `GET/PATCH /api/anomalies`, `POST /api/anomalies/run` | 🔲 |
| Forecast | `GET /api/forecast/demand`, `POST /api/forecast/run` | 🔲 |
| Fleet | `GET /api/analytics/fleet` | 🔲 |

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

Standalone Bun script that reads `CHECKED_OUT` bookings and POSTs 10-minute ticks.

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
| `/` | All | Landing |
| `/equipment` | Client | Browse and book |
| `/bookings` | Client | My rentals + QR display |
| `/asset/[assetId]` | Both | Machine detail — KPIs, charts, map, timeline |
| `/alerts` | Both | Notifications + anomaly feed |
| `/admin` | Admin | Fleet KPIs and status donut |
| `/admin/bookings` | Admin | Confirm, assign site/operator |
| `/admin/scanner` | Admin | Camera QR scan + manual entry fallback |
| `/admin/anomalies` | Admin | Severity-sorted anomaly table |
| `/admin/forecast` | Admin | 8-week demand + MASE badge |
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
6. `/admin/forecast` — demand chart, interval band, recommendation sentences
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
bun dev --experimental-https -H <your-LAN-IP>
# phone: https://<your-LAN-IP>:3000/spike/scan
```

The `-H` flag is required so the self-signed cert includes your LAN IP. A manual code-entry fallback ships beside the camera for stage reliability.

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
bun run --cwd backend test:api     # API integration tests (equipment/sites/operators)
bun run --cwd backend db:studio    # Prisma Studio
bun run --cwd backend seed:verify  # validate seed output

# Frontend
bun run --cwd frontend build
bun run --cwd frontend lint

# Simulator
bun run sim:print-day              # stdout one day of ticks
bun run sim:theft                  # theft scenario
```

---

## License

Private hackathon project — not licensed for external use.
