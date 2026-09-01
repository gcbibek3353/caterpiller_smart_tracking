# Task Checklist — Smart Rental Tracking

> **Single source of truth for who is doing what.**
> `steps.md` = the *what* (schema, contracts, algorithms). `plan-24h.md` = the *when*.
> **This file = the *now*.**

## How to update this file

1. Tick your box the moment a task is **merged to `main`**, not when it works locally.
2. Put your initial + what unblocked in the line: `- [x] **A3** · schema — *pushed, unblocks B4/C4/D4*`
3. If you're blocked, change the box to `- [!]` and write why. Anyone can then see it without asking.
4. If a task lands **partially**, use `- [~]` and say exactly what's missing. A half-done task
   marked done is how integration night goes wrong.
5. Pull before you edit this file. It's the one file all four of us touch — expect conflicts,
   resolve them by keeping *both* sides.

**Legend:** `[ ]` todo · `[~]` partial · `[x]` done · `[!]` blocked · `[-]` cut

---

## ✅ Free to start RIGHT NOW (nothing blocking these)

| Who | Task | Why it's unblocked |
|---|---|---|
| **B** | **B2 — QR camera spike** | Zero deps. **Do this first, this hour.** A camera blocked at H20 kills the demo. |
| **B** | B3 — booking UI on fixtures | Zero deps; build against JSON fixtures |
| **C** | C2 — simulator physics (pure fn → stdout) | Zero deps, no DB, no HTTP |
| **C** | C3 — chart components on fixtures | Zero deps |
| **D** | D2 — `lib/stats.ts` + forecasting | Zero deps, pure functions over arrays |
| **D** | D3 — anomaly detectors (pure fns) | Zero deps |
| **B/C/D** | **Anything needing the DB** | ✅ Schema is pushed — `prisma generate` works |
| **B** | **B4 — Booking API** | ✅ contracts + auth guards + `validate()` all landed |
| **B** | **B5/B6 — confirm, QR, scan** | ✅ `requireRole("ADMIN")` and `ScanCommitInput` ready (still stub `sendMail()` until D4) |
| **C** | **C4 — Ingest + rollup** | ✅ `requireApiKey` + `IngestInput` (accepts bare array *or* `{ticks:[]}`) ready |
| **D** | **D4 — Mailer** | ✅ `Notification` model live · **done, real send verified** |
| **B** | B5 confirm + QR email | ✅ `sendMail()` is real now — import `services/mailer/service.ts`, no need to stub |
| **A** | A7 — Equipment/Site/Operator CRUD | Next on A's list |

## 🚧 Blocked right now

| Task | Waiting on |
|---|---|
| C7 asset page charts | A8 (seeded data) |
| A9 real rollup in seed | C4 (rollup service) |
| B10 phone scanner re-test | A11 (deploy) |
| C12 asset timeline | ✅ unblocked — D5 anomalies exist now |
| D8 `/admin/anomalies`, D10 `/alerts` | A10 (frontend shell/auth — no login page exists to reach an authenticated route yet) |
| D9 `/admin/forecast` | A10 **and** C3 (chart components) |

---

## 📦 What A has shipped that you can import right now

```ts
// guards — src/middleware/auth.ts
import { requireAuth, optionalAuth, requireRole, requireApiKey,
         assertCanSeeEquipment, assertCanSeeBooking } from "../middleware/auth";

// request validation — src/middleware/validate.ts
import { validate, valid } from "../middleware/validate";
app.post("/", requireAuth, validate("json", CreateBookingInput), (c) => {
  const body = valid(c, "json", CreateBookingInput);   // typed, coerced, defaulted
});

// contracts — src/contracts/
import { CreateBookingInput, EquipmentListQuery, IngestInput, ScanCommitInput,
         QR_PREFIX, ANOMALY_TYPES } from "../contracts";

// responses — src/lib/http.ts   (throw the errors; middleware formats them)
import { ok, AppError, notFound, forbidden, badRequest, conflict } from "../lib/http";

// hono generics — src/types.ts
import type { AppEnv, SessionUser } from "../types";
const app = new Hono<AppEnv>();     // gives you c.get("user") typed
```

**Auth endpoints live:** `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`,
`POST /api/auth/sign-out`, `GET /api/auth/me`.
Browser calls need `credentials: "include"`; state-changing calls need an `Origin` header
(better-auth rejects `MISSING_OR_NULL_ORIGIN` — this bites curl, never a browser).
New signups are **always CLIENT** — `role` is `input: false`, so it can't be set from the client.

---

## Decisions locked in A1 — do not relitigate

| Decision | Value |
|---|---|
| Timezone | **UTC everywhere.** Store UTC, convert at the edges only. |
| Auth | **better-auth session cookie**, not localStorage, not a bearer token |
| Response envelope | `{ data }` / `{ error: { code, message, details? } }` |
| Migrations | **None.** `prisma db push` only. |
| Schema ownership | **Only A edits `prisma/schema.prisma`.** Need a field? Message A. |
| Postgres host port | **5433**, not 5432 (5432 is taken on the dev machine) |
| Adminer port | **8081** |
| Repo layout | Backend is **fully self-contained in `backend/`**, incl. `docker-compose.yml` |

### ✅ Resolved — contracts are duplicated, not shared
**Decision: no `shared/` package.** Backend zod schemas live in `backend/src/contracts/`;
the frontend hand-writes matching TypeScript types. Zero build config, fully independent tracks.

⚠️ **The cost:** a field rename becomes a *runtime* bug, not a compile error. So:
**if you change a contract, say so in chat the same minute.** The backend is the source of
truth — `backend/src/contracts/` wins any disagreement.

---

# Person A — Platform & Data
*Everyone is blocked on A until the schema ships. A does nothing else first.*

- [~] **A1** · H0–H0.75 — Contract workshop · *decisions **drafted** in the table above from `steps.md` §2/§3. Not yet signed off by B/C/D — walk the table with them and tick this.*
- [x] **A2** · H0.75–H1.25 — Scaffold + `docker-compose.yml` (postgres :5433 + adminer :8081), `.env` + `.env.example`
- [x] **A3** · H1.25–H2.5 — **`schema.prisma` — THE CRITICAL PATH** · *pushed, 14 tables live; better-auth models verified against `@better-auth/cli generate` (zero drift); round-trip tested incl. idempotent ingest + DailyUsage upsert*
- [x] **A4** · H2.5–H3 — Contracts · *`backend/src/contracts/` — 10 files, zod schema for every endpoint in §3. Enums use `z.nativeEnum` off the generated Prisma client, so a schema change is a compile error here. Import from `../contracts`.*
- [x] **A5** · H3–H4 — better-auth · *mounted at `/api/auth/*`. Guards in `src/middleware/auth.ts`: `requireAuth`, `optionalAuth`, `requireRole(...)`, `requireApiKey`, `assertCanSeeEquipment`, `assertCanSeeBooking`. Verified end-to-end: signup, signin, signout deletes the session row, stale cookie 401s, untrusted origin rejected, `role` escalation at signup blocked.*
- [x] **A6** · H4–H4.5 — Hono hardening · *CORS `credentials:true`, error envelope (Zod + Prisma P2002/P2025), `/health`, and `validate()` / `valid()` in `src/middleware/validate.ts`.*
- [ ] **A7** · H4.5–H5.5 — Equipment / Site / Operator CRUD + availability date-overlap filter
- [ ] **A8** · H5.5–H9 — **`prisma/seed.ts`** — highest-leverage file in the repo. 1 admin + 5 clients (create via better-auth signup so hashing matches), ~40 machines lopsided mix, sites + operators, ~600 bookings with trend + annual seasonality + weekday effects, `DailyUsage` 12 months, raw `Telemetry` **last 21 days only**. Under 90s, re-runnable. **Then `pg_dump` and commit the `.sql`.**
- [ ] **A9** · H9–H9.5 — Swap in C's real rollup for the last 21 days ⛔ *needs C4; skip if late*
- [ ] **A10** · H9.5–H11 — Frontend shell + auth pages, `authClient`, protected-route wrapper, typed `apiFetch()` with `credentials:'include'`
- [ ] **A11** · H11–H13 — **Deploy** (budget the full 2h — the cross-origin session cookie is the trap)
- [ ] **A12** · H13–H17 — 😴 Sleep
- [ ] **A13** · H17–H20 — Integration lead: merge everyone, drive the walkthrough, own the bug list
- [ ] **A14** · H20–H23 — Polish: empty states, skeletons, 404s, verify snapshot restores in 30s
- [ ] **A15** · H23–H24 — Freeze. No merges. Rehearse.

---

# Person B — Bookings, QR & Booking UX

- [ ] **B1** · H0–H0.75 — Contract workshop
- [ ] **B2** · H0.75–H2 — **QR camera spike. DO THIS FIRST.** ⛔ *no deps* — `qr-scanner` (nimiq), `next dev --experimental-https`, **open it on a real phone over LAN right now.** `@zxing/browser` is the fallback.
- [ ] **B3** · H2–H3 — Booking UI on fixtures ⛔ *no deps* — browse/filter + booking form against `frontend/fixtures/*.json`
- [ ] **B4** · H3–H5 — Booking API: `POST /api/bookings` with **overlap validation** (this is where bugs hide), `GET` role-scoped, `GET`/`PATCH /:id` ⛔ *needs A3 ✅ + A4*
- [ ] **B5** · H5–H6.5 — Confirm + QR issuance: `qrToken = base64url(random 32B)`, opaque in DB, `GET /:id/qr.png`, payload `RENT:v1:<token>` and nothing else ⛔ *needs A5* — **stub `sendMail()` if D4 is late**
- [ ] **B6** · H6–H8 — Scan state machine: `/api/scan/resolve` (preview) + `/api/scan/commit`. Wrap commit in `$transaction` and **re-read `booking.status` inside it** so a double-tap can't double-fire. Server decides check-out vs check-in from status, never the client.
- [ ] **B7** · H8–H10 — Client UI live: browse → book → bookings list → QR page (render it **big**)
- [ ] **B8** · H10–H12 — Admin bookings table: confirm / cancel, assign site + operator, filters
- [ ] **B9** · H12–H14 — Admin scanner page for real: camera → preview card → meter/fuel/condition form → commit. **Ship the manual code-entry field next to the camera.**
- [ ] **B10** · H14–H15 — Re-test scanner on the **deployed HTTPS URL from a phone** ⛔ *needs A11* — localhost proves nothing
- [ ] **B11** · H15–H17 — Edge cases: used QR, cancelled booking, `PENDING` rejection, booking detail, overdue badges
- [ ] **B12** · H17–H21 — 😴 Sleep
- [ ] **B13** · H21–H24 — Rehearsal — B drives demo steps 1–3 and 8

---

# Person C — Simulator, Telemetry & the Asset Page

- [ ] **C1** · H0–H0.75 — Contract workshop
- [ ] **C2** · H0.75–H2.5 — **Simulator physics as a pure function** ⛔ *no deps* — stdout only. Duty cycle by hour-of-day, `engineHours += 10/60` when not OFF, fuel burn + refuel <12%, temp → 88±6, random walk in site radius, speed 0–4 kph. **Print a day and eyeball it** — fuel should saw-tooth, temp should follow engine state.
- [ ] **C3** · H2.5–H3.5 — Chart components on fixtures ⛔ *no deps* — stacked bar (working vs idle), line + 7d MA, fuel area w/ refuel markers, temp line w/ 105 °C threshold, engine-state ribbon. **B and D import these — agree props in chat first.** `ResponsiveContainer` needs a parent with explicit height.
- [ ] **C4** · H3.5–H5 — Ingest + rollup ⛔ *needs A3 ✅* — `POST /api/telemetry/ingest` w/ `x-api-key`, idempotent via `createMany({skipDuplicates:true})` on `@@unique([equipmentId, ts])` *(verified working)*. `services/rollup.ts` upsert on `[equipmentId, date]` *(verified working)*. `POST /api/jobs/rollup`. **Message A the second this lands — A9 waits on it.**
- [ ] **C5** · H5–H6.5 — Simulator wired live + `--scenario` injectors: `idle`, `dead`, `theft`, `siphon`, `overheat`, `offline`. **`theft` is the money shot.**
- [ ] **C6** · H6.5–H8 — Query endpoints: `/timeseries` with **server-side** `date_trunc` bucketing (`10m|1h|1d`), `/track`, `/summary`, `/daily`
- [ ] **C7** · H8–H11 — `/asset/[assetId]` sections 1–3 ⛔ *needs A8* — header, KPI row, 5 charts, date-range + bucket toggle, role-aware **enforced in the route, not the UI**
- [ ] **C8** · H11–H12.5 — Leaflet map (section 4) — `react-leaflet` **dynamically imported with `ssr:false`** (Leaflet touches `window` at import and breaks the Next build). Import `leaflet/dist/leaflet.css`. Fix the marker 404 with `L.Icon.Default.mergeOptions`.
- [ ] **C9** · H12.5–H13 — Handoff note: post chart props + map API in chat for B and D
- [ ] **C10** · H13–H17 — 😴 Sleep
- [ ] **C11** · H17–H19 — `/admin` fleet dashboard *(cut candidate #2)*
- [ ] **C12** · H19–H21 — Asset page timeline (section 5) ⛔ *needs D5* *(cut candidate #3)*
- [ ] **C13** · H21–H24 — Rehearsal — C drives demo steps 4–6

---

# Person D — Intelligence & Notifications
*Best-positioned on the team: every algorithm here is a pure function over arrays.*

- [ ] **D1** · H0–H0.75 — Contract workshop
- [x] **D2** · H0.75–H3.5 — **`lib/stats.ts` + forecasting. ZERO deps, zero DB.** · *done — `median`/`mad`/`robustZ`/`ewma`/`mae`/`mase`/`smape`/`haversine`/`stddev` unit-tested; `services/forecast/`: demand-series builder (rental-days), seasonal-naive, Holt-Winters + α/β/γ grid search, rolling-origin backtest, prediction intervals, recommendation-sentence builder + cold-start check. 43 tests passing.*
- [-] **D2b** — Ridge regression model (§8C) — **cut for 24h.** Two models + an honest MASE beats three half-wired.
- [x] **D3** · H3.5–H5 — Every anomaly detector as a pure function ⛔ *no deps* · *done — all daily/realtime/booking rules from §9, plus layer-2 robust-z + EWMA (ahead of schedule). Thresholds centralized in `services/anomaly/config.ts`. 53 tests passing.*
- [x] **D4** · H5–H6.5 — Mailer ⛔ *needs A3 ✅* · *done — all 7 templates, console transport (`.mail/*.html`), Resend transport (direct HTTP, no SDK dep), `MAIL_MODE`-driven `createMailTransport()` factory, `services/mailer/service.ts::sendMail()` writes the `Notification` row `PENDING` → `SENT`/`FAILED` for real (Prisma-wired). **Verified against a live Postgres + a real Resend send** — domain `krishalkarna.com.np` is verified, sent to an external inbox, not just the account owner. Idempotent re-send on the same `dedupeKey` confirmed (no double-send). `sendMail()` is importable by B now — no more stub needed. QR-PNG attachment itself is still Person B's `lib/qr.ts` output, not built here.*
- [x] **D5** · H6.5–H8 — Detector runner + dedupe · *done — `services/anomaly/runner.ts`: `runDailyAnomalyRules`/`runRealtimeAnomalyRules`/`runBookingAnomalyRules`/`runAllAnomalyRules`, all Prisma-wired, joining `booking.status`/`siteId` into `DailyUsage` rows and resolving each equipment's active-booking site for geofence checks. `dedupeKey` + `createMany({skipDuplicates:true})`, same idiom as ingest. `routes/anomalies.ts`: `GET /api/anomalies` (role-scoped), `PATCH /:id`, `POST /api/anomalies/run`. **Verified live**: inserted a real HIGH_IDLE-shaped `DailyUsage` row + an overdue `Booking` on a throwaway Neon Postgres, ran the detectors, confirmed the exact `Anomaly` rows landed with correct `dedupeKey`/severity, re-ran and confirmed 0 duplicates, cleaned up. `UPCOMING_RETURN` is correctly kept out of the `Anomaly` table (informational, not an anomaly — steps.md §9) and returned separately for whoever wires `RETURN_REMINDER`.*
- [x] **D6** · H8–H9.5 — Forecast runner on real data · *done — `services/forecast/runner.ts`: builds the daily series from real bookings, backtests both seasonal-naive and Holt-Winters (grid-searched), picks the lower-MASE model, writes `DemandForecast` with intervals + recommendation sentences. Cold-start (<60 days history) correctly falls back to seasonal-naive only. `routes/forecast.ts`: `GET /api/forecast/demand` (latest generation per type), `POST /api/forecast/run`. **Verified live** against the same throwaway DB — one booking's worth of history correctly triggered `lowConfidence: true` + seasonal-naive fallback + a real recommendation sentence.*
- [x] **D7** · H9.5–H11 — Scheduler (`croner`) · *done — `jobs/scheduler.ts`: 10-min realtime, hourly booking rules, daily 00:15 detectors, weekly Sun 02:00 forecast retrain, `isRunning` guard per job. Mounted in `index.ts` (skipped when `NODE_ENV=test`). Manual POST triggers are the D5/D6 routes above. Note: the daily job runs the *detectors* only — Person C's actual rollup (Telemetry→DailyUsage, C4) isn't called first since that's not D's file; wire that call in once C4 lands.*
- [ ] **D8** · H11–H13 — `/admin/anomalies` ⛔ ***genuinely blocked, not skipped*** — needs **A10** (no login page/`authClient` exists yet, so there's no way to reach an authenticated admin route in the browser). Backend (`GET/PATCH /api/anomalies`) is done and tested; there is nothing on the frontend to connect it to yet.
- [ ] **D9** · H13–H15 — `/admin/forecast` ⛔ *needs **A10** and* **C3's charts** *(neither exists yet)* — backend (`GET /api/forecast/demand`) is done and tested.
- [ ] **D10** · H15–H17 — `/alerts` page ⛔ *needs **A10*** — same auth-shell blocker as D8.
- [ ] **D11** · H17–H21 — 😴 Sleep
- [ ] **D12** · H21–H23 — Threshold tuning: `--scenario theft` end to end, breach → anomaly → HIGH email **under 20s**
- [ ] **D13** · H23–H24 — Rehearsal — D drives demo steps 5 and 7

---

## Sync points — the only 4 moments everyone stops

- [~] **H0.75** — Schema + endpoint contract signed off · *schema ✅ · decision table drafted, awaiting B/C/D sign-off*
- [x] **H2.5** — A pushes `schema.prisma`, `prisma generate` works → unblocks B4, C4, D4
- [ ] **H9** — Seeded DB exists, everyone pulls → unblocks C7, D5, D6
- [ ] **H18** — **Feature freeze** → integration only

## Never cut
Seed script · manual job triggers · manual QR entry fallback · the `theft` scenario

## Cut list, in this order, if behind at H18
1. Layer-2 statistical anomalies (robust z / EWMA)
2. `/admin` fleet dashboard (C11)
3. Asset-page timeline (C12)
4. Map breadcrumb polyline — keep the current-position marker
5. Photo upload, operator assignment UI

---

## Demo running order — rehearse at H22 and H23.5

- [ ] 1–2 · **B** — client books an excavator → admin confirms → QR issued, email visible in `/alerts`
- [ ] 3 · **B** — scan the QR off a laptop screen with a phone → preview → meter + fuel → `CHECKED_OUT`
- [ ] 4 · **C** — `/asset/<id>`, charts + Leaflet breadcrumb moving live at 60×
- [ ] 5 · **C→D** — `--scenario theft` → breach + night movement on the board, HIGH email **within 20s**. *This is the moment that sells it.*
- [ ] 6 · **C** — 21-day range: idle-vs-working bars, fuel saw-tooth, temp threshold line
- [ ] 7 · **D** — `/admin/forecast` — 8-week demand, interval band, MASE badge, recommendation sentences
- [ ] 8 · **B** — scan the same QR again → routed to `CHECK_IN` → total computed, machine `AVAILABLE`, receipt

**Have the `.sql` snapshot ready to restore in 30 seconds. Live demos break.**

---

## Environment quick start

```bash
cd backend
bun install
bun run db:up      # postgres :5433 + adminer :8081
bun run db:push    # sync schema + prisma generate
bun run dev        # :4000  → curl localhost:4000/health

cd ../frontend && bun install && bun run dev   # :3000
```

⚠️ **Postgres is on 5433, not 5432** — `steps.md` §1 says 5432; that port is taken on the
dev machine. Use the `DATABASE_URL` in `backend/.env.example`.
