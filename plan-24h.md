# 24-Hour Build Plan — Smart Rental Tracking

> Companion to [steps.md](steps.md). `steps.md` is the **what** (schema, contracts, algorithms — still authoritative).
> This file is the **when and who**, compressed to 24 hours.
>
> **Stack:** Bun + Hono + Prisma + Postgres · Next.js 16 + Tailwind 4 · **better-auth** · Recharts · **Leaflet** · **Resend** · qrcode + qr-scanner · croner

---

## Ground rules for 24 hours

1. **No migrations.** `bun prisma db push` only. Migrations cost 20 minutes you don't have.
2. **Push to `main` every ~90 minutes.** No long-lived branches. A half-working merged stub unblocks three people; a perfect unmerged branch unblocks nobody.
3. **Only Person A edits `schema.prisma`.** Need a field? Message A, A pushes, everyone re-runs `prisma generate`.
4. **Every scheduled job also gets a manual `POST /api/*/run`.** You cannot wait for a cron on stage.
5. **Sleep stagger** — nobody survives 24 straight. A+C sleep H13–H17, B+D sleep H17–H21. Integration (H18+) always has two people awake.
6. **Hour markers are from kickoff (H0), not clock time.**

---

## Sync points (the only 4 moments the whole team stops)

| When | What | Blocks |
|---|---|---|
| **H0.75** | Schema + endpoint contract signed off | everything |
| **H2.5** | A pushes `schema.prisma` + `prisma generate` works | B4, C4, D4 |
| **H9** | Seeded DB exists, everyone pulls it | C7, D5, D6 |
| **H18** | Feature freeze → integration only | all |

---

# Person A — Platform & Data
*Front-loaded on purpose. Everyone is blocked on A until H2.5. A does nothing else until the schema is out.*

**A1 · H0–H0.75 — Contract workshop (all four in the room).**
Walk §2 and §3 of `steps.md` line by line. Decide and write down: UTC everywhere; better-auth session cookie (not localStorage); response envelope `{ data }` / `{ error: { code, message } }`. Argue now, not at H15.

**A2 · H0.75–H1.25 — Scaffold and push.**
Bun workspaces (`backend/ frontend/ simulator/ shared/`), `docker-compose.yml` (postgres + adminer), both `.env` files committed as `.env.example`, `bun run dev` boots both servers. **Push immediately** — this unblocks everyone's local setup before the schema even lands.

**A3 · H1.25–H2.5 — `schema.prisma`. THE CRITICAL PATH.**
Run `bunx @better-auth/cli generate` **first** so better-auth's `User/Session/Account/Verification` models land in the file, then merge the domain models from §2 on top (add `role`, `companyName`, `phone` to `User`). `bun prisma db push` → `prisma generate` → **push to main and announce it in chat.** Nothing you do today matters more than shipping this by H2.5.

**A4 · H2.5–H3 — `shared/src/contracts.ts`.**
Zod schema for every request/response in §3. Push. B, C and D now import types instead of guessing field names.

**A5 · H3–H4 — better-auth.**
Prisma adapter, `emailAndPassword`, `user.additionalFields.role`, `trustedOrigins: [CORS_ORIGIN]`. Mount at `/api/auth/*` in Hono. Write `requireAuth`, `requireRole('ADMIN')`, `assertCanSeeEquipment(user, equipmentId)`. **Announce the import paths in chat** — B, C and D all need the middleware.

**A6 · H4–H4.5 — Hono hardening.** CORS with `credentials: true`, error envelope, zod validation middleware, `/health`.

**A7 · H4.5–H5.5 — Equipment / Site / Operator CRUD.** Including the availability date-overlap filter (`?availableFrom=&availableTo=`). Write that SQL carefully.

**A8 · H5.5–H9 — `prisma/seed.ts`. The single highest-leverage file in the repo.**
Per §7, trimmed for 24h: 1 admin + 5 clients (create them **through better-auth's signup API** so password hashing matches), ~40 machines with a lopsided type mix, sites + operators, ~600 bookings carrying real trend + annual seasonality + weekday effects, `DailyUsage` for **12 months**, raw `Telemetry` for the **last 21 days only** (not 45 — it's the difference between 40 s and 4 minutes). Must be re-runnable in under 90 s. **Then `pg_dump` it and commit the `.sql`** — that dump is your demo-day parachute.
> ⛔ *Blocked by A3 only. Do not wait for C's rollup — write `DailyUsage` synthetically.*

**A9 · H9–H9.5 — Swap in the real rollup.** ⛔ *needs C4.* Re-derive the last 21 days of `DailyUsage` by calling C's rollup over the seeded ticks, so seeded data and live data are provably identical in shape. If C4 is late, skip this and move on.

**A10 · H9.5–H11 — Frontend shell + auth pages.** App shell with role-aware nav, `authClient` from better-auth/react, login + register pages, protected-route wrapper, typed `apiFetch()` helper with `credentials: 'include'`.

**A11 · H11–H13 — Deploy.**
Postgres + backend (Railway/Fly), frontend (Vercel), simulator as a worker. **Budget the full 2 hours** — the cross-origin session cookie between Vercel and Railway is the trap: set `trustedOrigins`, `advanced.crossSubDomainCookies` or proxy `/api` through Next rewrites. Restore the seed dump on the remote DB.

**A12 · H13–H17 — Sleep.**

**A13 · H17–H20 — Integration lead.** Merge everyone to main, drive the end-to-end walkthrough, own the bug list.

**A14 · H20–H23 — Polish.** Empty states, loading skeletons, 404s, re-run seed clean, verify the snapshot restores in 30 seconds.

**A15 · H23–H24 — Freeze.** No merges. Restore snapshot. Rehearse.

---

# Person B — Bookings, QR & Booking UX

**B1 · H0–H0.75 — Contract workshop.**

**B2 · H0.75–H2 — QR camera spike. Do this FIRST, at hour one.** ⛔ *no deps.*
Throwaway `/spike/scan` page with `qr-scanner` (nimiq). Start Next with `next dev --experimental-https`, open it **on a real phone over your LAN, right now.** A camera that turns out to be blocked at H20 kills the demo; a camera you fixed at H2 costs nothing. `@zxing/browser` is the fallback.

**B3 · H2–H3 — Booking UI on fixtures.** ⛔ *no deps* — build equipment browse/filter + booking form against `frontend/fixtures/*.json`, using the field names agreed in A1.

**B4 · H3–H5 — Booking API.** ⛔ *needs A3 + A4.*
`POST /api/bookings` with **overlap validation** (no double-booking intersecting dates — this is where the bugs hide), `GET /api/bookings` role-scoped, `GET`/`PATCH /api/bookings/:id`.

**B5 · H5–H6 — Confirm + QR issuance.** ⛔ *needs A5 for the ADMIN guard.*
`POST /api/bookings/:id/confirm` → `qrToken = base64url(random 32 bytes)`, opaque in DB, status→`CONFIRMED`. `GET /api/bookings/:id/qr.png` via `qrcode.toBuffer`. Payload is `RENT:v1:<token>` and nothing else. Call `sendMail()` behind an interface — **stub it if D4 hasn't landed**, D fills it in later.

**B6 · H6–H8 — The scan state machine.**
`POST /api/scan/resolve` (preview only) and `POST /api/scan/commit`, both ADMIN. Wrap commit in `prisma.$transaction` and **re-read `booking.status` inside the transaction** so a double-tap can't double-fire. Same token serves check-out and check-in; the server decides from status, never the client. Side effects per the §5 table: `CheckEvent` row, equipment status, `checkoutAt`/`checkinAt`, `totalAmount`.

**B7 · H8–H10 — Client UI live.** Browse → book → bookings list → QR display page (render it **big** — it gets scanned off a laptop screen from three feet away).

**B8 · H10–H12 — Admin bookings table.** Confirm / cancel, assign site + operator, status filters.

**B9 · H12–H14 — Admin scanner page for real.** Camera → preview card (client, machine photo, dates, the action about to happen) → meter hours / fuel / condition form → commit. **Ship the manual code-entry field right next to the camera.** Cameras fail on stage.

**B10 · H14–H15 — Re-test the scanner on the deployed HTTPS URL from a phone.** ⛔ *needs A11.* Different origin, different cookie behaviour, different camera prompt. Do not assume localhost proves anything.

**B11 · H15–H17 — Edge cases + overdue UI.** Already-used QR, cancelled booking, `PENDING` scan rejection, booking detail page, overdue badges.

**B12 · H17–H21 — Sleep.**

**B13 · H21–H24 — Rehearsal.** B drives demo steps 1–3 and 8 (book → confirm → check-out → check-in).

---

# Person C — Simulator, Telemetry & the Asset Page

**C1 · H0–H0.75 — Contract workshop.**

**C2 · H0.75–H2.5 — Simulator physics as a pure function.** ⛔ *no deps* — emits JSON to stdout, no DB, no HTTP.
Duty cycle by hour-of-day, `engineHours += 10/60` when not OFF, fuel burn with refuel at <12%, temp rising toward 88±6, random walk inside the site radius, speed 0–4 kph. Print a simulated day and **eyeball it** — the fuel curve should saw-tooth and the temp should follow the engine state.

**C3 · H2.5–H3.5 — Chart components on fixtures.** ⛔ *no deps.*
`frontend/components/charts/`: stacked bar (working vs idle), line + 7-day moving average, fuel area with refuel markers, temp line with a 105 °C threshold, engine-state ribbon. **B and D import these — agree the props in chat before you build them.** Recharts' `ResponsiveContainer` needs a parent with an explicit height; set it now.

**C4 · H3.5–H5 — Ingest + rollup.** ⛔ *needs A3.*
`POST /api/telemetry/ingest` with `x-api-key`, idempotent via `@@unique([equipmentId, ts])` + `createMany({ skipDuplicates: true })`. `services/rollup.ts`: Telemetry → DailyUsage, upsert on `[equipmentId, date]`, handles partial days and re-runs. `POST /api/jobs/rollup`. **Message A the second this lands — A9 is waiting on it.**

**C5 · H5–H6.5 — Simulator wired live.** Reads `CHECKED_OUT` bookings, 60× sim clock, POSTs batches. Then the `--scenario` injectors: `idle`, `dead`, `theft`, `siphon`, `overheat`, `offline`. **`theft` is the money shot** — get it working and keep it working.

**C6 · H6.5–H8 — Query endpoints.** `/timeseries` with **server-side** bucketing (`date_trunc`, `10m|1h|1d`), `/track` GPS breadcrumb, `/summary` KPIs, `/daily`. Sending 21 days × 144 raw points to React and downsampling there is the classic way to make this page feel broken.

**C7 · H8–H11 — `/asset/[assetId]`, sections 1–3.** ⛔ *needs A8 (seeded data).* Header, KPI row, all five charts on real endpoints, shared date-range + bucket toggle, role-aware (admin sees rates; client sees only their rental window — **enforced in the route, not the UI**).

**C8 · H11–H12.5 — Leaflet map, section 4.**
`react-leaflet` **dynamically imported with `ssr: false`** (Leaflet touches `window` at import time and will break the Next build otherwise). Import `leaflet/dist/leaflet.css`. Fix the default marker 404 with the `L.Icon.Default.mergeOptions` shim — it catches everyone. Draw: breadcrumb `Polyline`, site geofence `Circle`, current-position `Marker`, OSM tiles.

**C9 · H12.5–H13 — Handoff note.** Post the chart-component props and the map component's API in chat for D (forecast chart) and B.

**C10 · H13–H17 — Sleep.**

**C11 · H17–H19 — `/admin` fleet dashboard.** Utilization %, machines out, overdue count, revenue, status donut.

**C12 · H19–H21 — Asset page timeline, section 5.** ⛔ *needs D5.* Check events + anomalies interleaved.

**C13 · H21–H24 — Rehearsal.** C drives demo steps 4–6 (live telemetry, trigger the theft, 21-day history).

---

# Person D — Intelligence & Notifications
*Best-positioned person on the team: every algorithm here is a pure function over arrays. You can build for three hours before the database exists.*

**D1 · H0–H0.75 — Contract workshop.**

**D2 · H0.75–H3.5 — `lib/stats.ts` + forecasting. ZERO deps, zero DB.**
Pure and unit-tested: median, MAD, robust z, EWMA, MAE, MASE, haversine. Then `services/forecast/`: demand-series builder (forecast **rental-days**, not booking counts), seasonal-naive benchmark, Holt-Winters with an α/β/γ grid search, rolling-origin backtest, prediction intervals from per-horizon residual σ. Test against synthetic arrays with a seasonality you injected yourself, so you know the right answer.
> **Cut for 24h:** the ridge-regression model (§8C). Two models plus an honest MASE beats three models half-wired.

**D3 · H3.5–H5 — Every anomaly detector, as a pure function.** ⛔ *no deps.*
Daily rules over a `DailyUsage[]` shape, realtime rules over a `Telemetry[]` shape, booking rules. **All thresholds in one `services/anomaly/config.ts`** — you will be retuning these live at H19, and you do not want to be grepping for magic numbers then. Unit-test each detector against a handcrafted array.

**D4 · H5–H6.5 — Mailer.** ⛔ *needs A3 for the `Notification` model.*
`MAIL_MODE=console` writes rendered HTML to `backend/.mail/*.html`; `MAIL_MODE=resend` for real. Templates: `BOOKING_CONFIRMED` (QR as a PNG attachment), `CHECKOUT_RECEIPT`, `CHECKIN_RECEIPT`, `RETURN_REMINDER`, `OVERDUE`, `ANOMALY_ALERT`, `ANOMALY_DIGEST`. **Every send writes a `Notification` row `PENDING` first, then flips to `SENT`/`FAILED`**, with a unique `dedupeKey`. **Message B the moment `sendMail()` is importable** — B5 has a stub waiting for it.
> **Resend gotchas:** an unverified account can only send to the address that owns it, so send everything to one teammate's inbox in dev, or use `onboarding@resend.dev` as the from. Verifying a real domain takes DNS propagation time — if you want it, start it at H1, not H20. Everyone develops in `console` mode regardless.

**D5 · H6.5–H8 — Detector runner + dedupe.** ⛔ *needs A8.*
Loads windows from the DB, calls the pure functions, upserts with `dedupeKey = "{type}:{equipmentId}:{dayBucket}"` (hour bucket for realtime rules) behind a unique index. **Build the dedupe with the detector, not after** — without it, one stuck-idle machine emits 144 anomalies and 144 emails, and your inbox becomes the story. Then `GET /api/anomalies` (role-scoped), `PATCH /api/anomalies/:id`, `POST /api/anomalies/run`.

**D6 · H8–H9.5 — Forecast runner on real data.** ⛔ *needs A8.*
Build the series from seeded bookings, run both models, pick by MASE, write `DemandForecast`. `GET /api/forecast/demand?weeks=8`, `POST /api/forecast/run`. Generate the **recommendation sentences** — "Excavators: 92% projected utilization, week of Oct 12. Short ~3 units." The sentences are what people remember, not the chart.

**D7 · H9.5–H11 — Scheduler.** `croner`, in-process: 10-min realtime detectors, hourly booking rules + digest flush, daily rollup → daily detectors, forecast retrain. `isRunning` guard so a slow job can't overlap itself. **Every one of them also gets a manual POST trigger.**

**D8 · H11–H13 — `/admin/anomalies`.** Severity-sorted table, filters, acknowledge / resolve / false-positive.

**D9 · H13–H15 — `/admin/forecast`.** ⛔ *uses C3's chart primitives.* Per-type forecast with the shaded interval band, **MASE badge on screen** (showing your own error metric reads as confidence), recommendation list, and the week each type first crosses 85%.

**D10 · H15–H17 — `/alerts` page.** Notification + anomaly feed. This is what you show on stage instead of opening a real mail client.

**D11 · H17–H21 — Sleep.**

**D12 · H21–H23 — Threshold tuning against live data.** Run `--scenario theft` end to end and time it: breach → anomaly row → HIGH email in the Alerts feed should be under 20 seconds. Tune `config.ts` until it is.

**D13 · H23–H24 — Rehearsal.** D drives demo steps 5 and 7 (the theft alert, the forecast).

---

## The dependency graph, in one place

```
H0.75  ALL ──── contract signed
         │
H2.5   A3 schema ──┬──▶ B4 booking API
                   ├──▶ C4 ingest + rollup ──▶ A9 real rollup in seed
                   └──▶ D4 mailer ──▶ B5 confirmation email
H3     A4 contracts ──▶ everyone's typed work
H4     A5 better-auth ──▶ B5/B6 admin guards, C7 role-aware asset page
H9     A8 seed ──┬──▶ C7 asset page charts
                 ├──▶ D5 detector runner ──▶ C12 asset timeline
                 └──▶ D6 forecast runner ──▶ D9 forecast UI
H3.5   C3 charts ──▶ D9 forecast chart
H11    A11 deploy ──▶ B10 phone scanner re-test
H18    FREEZE ──▶ integration only
```

**Three things that can sink the day, and when you defuse them:**
- Camera blocked over plain HTTP → **B2, at hour one.**
- Cross-origin auth cookie between Vercel and Railway → **A11, with two hours budgeted.**
- Seed script crashing at H20 → **A8 finishes by H9 and commits a `.sql` dump.**

---

## Cut list (in this order, if you're behind at H18)

1. Layer-2 statistical anomalies (robust z / EWMA) — the rules cover 100% of the required cases
2. `/admin` fleet dashboard (C11)
3. Asset-page timeline (C12)
4. The map breadcrumb polyline — keep the current-position marker
5. Photo upload, operator assignment UI

**Never cut:** the seed script, the manual job triggers, the manual QR entry fallback, the `theft` scenario.

---

## Demo running order (rehearse twice, H22 and H23.5)

| # | Who | Beat |
|---|---|---|
| 1–2 | B | Client books an excavator → admin confirms → QR issued, confirmation email visible in `/alerts` |
| 3 | B | Scan the QR off a laptop screen with a phone → preview card → meter + fuel → `CHECKED_OUT` |
| 4 | C | Open `/asset/<id>` — charts and the Leaflet breadcrumb moving live at 60× |
| 5 | C→D | `--scenario theft` → geofence breach + night movement on the board, HIGH email in `/alerts` **within 20 s.** *This is the moment that sells it.* |
| 6 | C | Switch to a 21-day range — idle-vs-working bars, fuel saw-tooth, temp threshold line |
| 7 | D | `/admin/forecast` — 8-week demand, interval band, MASE badge beating seasonal-naive, recommendation sentences |
| 8 | B | Scan the same QR again → server routes it to `CHECK_IN` → total computed, machine `AVAILABLE`, receipt email |

Have the `.sql` snapshot ready to restore in 30 seconds. Live demos break.
