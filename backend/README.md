# Backend — Smart Rental Tracking

Bun + Hono + Prisma + Postgres. Everything backend-related lives in this directory,
including `docker-compose.yml`.

## Quick start

```bash
cd backend
cp .env.example .env      # already done on first setup
bun install
bun run db:up             # postgres :5433 + adminer :8081
bun run db:push           # sync schema + generate client
bun run dev               # http://localhost:4000
```

Verify: `curl http://localhost:4000/health`

## Ports

| Service  | Host port | Why not the default |
|----------|-----------|---------------------|
| Postgres | **5433**  | 5432 is taken by another project on this machine |
| Adminer  | **8081**  | 8080 kept free |
| API      | 4000      | — |

Adminer login → System `PostgreSQL`, Server `postgres`, User/Pass/DB all `rental`.

The compose project is named `rental` so it can't collide with the unrelated
`backend-*` containers already present on this machine.

## Scripts

| Command | Does |
|---|---|
| `bun run dev` | API with hot reload |
| `bun run db:up` / `db:down` | start / stop Postgres + Adminer |
| `bun run db:push` | push `schema.prisma` (no migrations — 24h build) |
| `bun run db:reset` | **drops all data** and re-pushes |
| `bun run db:studio` | Prisma Studio |
| `bun run seed` | **wipe + reseed 12 months of history (~12s). Safe to re-run any time.** |
| `bun run seed:fresh` | `db push --force-reset` then seed — use after a schema change |
| `bun run seed:verify` | assert the seeded data still has real seasonality + faults (read-only) |
| `bun run db:dump` | write `prisma/snapshot.sql` — the demo-day parachute |
| `bun run db:restore` | restore that snapshot (~1s) |
| `bun run test:api` | A7 API tests — ⚠️ **destructive, wipes the seed**; re-seed after |

## Conventions

- **All timestamps are UTC.** Convert at the edges only.
- Response envelope: `{ data }` on success, `{ error: { code, message, details? } }` on failure.
  Use `ok(c, data)` and the helpers in `src/lib/http.ts`; throw `AppError` and the
  middleware formats it.
- **Only Person A edits `prisma/schema.prisma`.** Need a field? Message A, then
  everyone re-runs `bun run db:push`.
- No migrations. `db push` only.

## Layout

```
src/
├── index.ts       Hono bootstrap, CORS, /health
├── env.ts         zod-validated env (fails fast at boot)
├── db.ts          PrismaClient singleton
├── lib/
│   ├── http.ts    response envelope + AppError
│   └── auth.ts    better-auth instance
├── middleware/    error handler (auth guards → A5)
├── routes/        one file per resource
├── services/      rollup, forecast, anomaly, mailer
└── jobs/          scheduler
```


## The seed

`bun run seed` — ~12s, and **re-runnable as many times as you like**. It TRUNCATEs
every domain table first, and the PRNG is fixed-seed, so three consecutive runs
produce byte-identical data. The demo looks the same every rehearsal, and any bug
is reproducible.

What it builds:

| | |
|---|---|
| 6 users | `admin@rental.com / admin123` · `client@build.com / client123` (+4 more clients) |
| 40 machines | deliberately lopsided: 12 excavators … 2 forklifts |
| 639 bookings | 12 months back + 4 weeks forward |
| 54k telemetry ticks | 10-minute resolution, last 21 days only |
| 7.7k DailyUsage rows | last 21 days **derived from the real ticks**, older days synthesised |
| 1.1k check events | so the asset timeline has content |

The demand curve is not noise — it carries **trend** (+15%/yr), **annual seasonality**
(peak in the dry season, a ~40% monsoon trough), **weekday effects** (Mon 165 starts
vs Sun 12), and a **type-mix shift** (graders spike in road season, reaching 88%
utilisation while loaders sit at 56%). That contrast is what makes the forecast's
shortage/surplus recommendations say something real.

Four faults are injected into the recent window so the anomaly detectors find
**genuinely detected** anomalies rather than fixture rows: overheat (115 °C),
a machine idling all day, 4 days of zero runtime, and a fuel siphon.

**Tune it in `prisma/seed/config.ts`** — every number lives there. Then run
`bun run seed:verify` to confirm you didn't flatten the curve.
