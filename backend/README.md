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
| `bun run seed` | seed script (A8 — not written yet) |

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
