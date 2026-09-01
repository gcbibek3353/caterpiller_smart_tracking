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
| **B** | B2 — QR camera spike | 🔨 *Page built & merged — **only the real-phone HTTPS test is left.** Until that runs, the H20 risk is not actually retired.* |
| **B** | B3 — booking UI on fixtures | Zero deps; build against JSON fixtures |
| **C** | **C2 — simulator physics** | ✅ done — `simulator/src/physics.ts`, merged, never ticked until now |
| **D** | D2 — `lib/stats.ts` + forecasting | Zero deps, pure functions over arrays |
| **D** | D3 — anomaly detectors (pure fns) | Zero deps |
| **B/C/D** | **Anything needing the DB** | ✅ Schema is pushed — `prisma generate` works |
| **B** | **B4 — Booking API** | ✅ contracts + auth guards + `validate()` all landed |
| **B** | **B5/B6 — confirm, QR, scan** | ✅ `requireRole("ADMIN")` and `ScanCommitInput` ready (still stub `sendMail()` until D4) |
| **C** | **C4 — Ingest + rollup** | ✅ `requireApiKey` + `IngestInput` (accepts bare array *or* `{ticks:[]}`) ready |
| **D** | **D4 — Mailer** | ✅ `Notification` model live · **done, real send verified** |
| **B** | B5 confirm + QR email | ✅ `sendMail()` is real now — import `services/mailer/service.ts`, no need to stub |
| **C** | **C5 — simulator wired live + scenarios** | ✅ done — `simulator/src/index.ts` + `scenarios.ts`, merged, never ticked until now |
| **C** | **C7 — asset page charts** | ✅ **Wired to live endpoints now, not fixtures** — see below |
| **D** | **D5 — detector runner** | ✅ Seeded data has **4 real injected faults** to fire on — done, see below |
| **D** | **D6 — forecast runner** | ✅ 12 months of demand with trend + seasonality to learn — done, see below |
| **A** | **A10 — frontend shell + auth pages** | ✅ Login/register + authenticated `(app)` shell (admin, dashboard) landed on `main` |
| **D** | **D8 — `/admin/anomalies`** | ✅ done, see below |
| **D** | **D9 — `/admin/forecast`** | ✅ done, see below (built C3's chart primitives too — nobody else had picked them up yet) |
| **D** | **D10 — `/alerts`** | ✅ done, see below |
| **A** | A11 — deploy | A9 still needs C4 · **now also blocks B10, the last unretired demo risk** |

## 🚧 Blocked right now

| Task | Waiting on |
|---|---|
| A9 real rollup in seed | C4 (rollup service) |
| B10 phone scanner re-test | ~~A11~~ — **unblocked locally via `bun run dev:https`; only the *deployed* re-test still needs A11** |

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

**Endpoints live now:**
`POST /api/auth/sign-up/email` · `POST /api/auth/sign-in/email` · `POST /api/auth/sign-out` · `GET /api/auth/me`
`GET|POST /api/equipment` · `GET|PATCH|DELETE /api/equipment/:id` (DELETE = soft delete → `RETIRED`)
`GET|POST /api/sites` · `GET|PATCH|DELETE /api/sites/:id`
`GET|POST /api/operators` · `GET|PATCH|DELETE /api/operators/:id`

**Two serialization traps already handled for you** (`src/lib/serialize.ts`, imported in `index.ts`):
`BigInt.prototype.toJSON` is patched — without it, returning a `Telemetry` row throws
"Do not know how to serialize a BigInt". And Prisma `Decimal` is converted to a **number**,
not the string Prisma gives you (`"450" * 2 === NaN` on the frontend). Use
`serializeEquipment()` / `serializeBooking()` / `num()` on anything with money in it.
Browser calls need `credentials: "include"`; state-changing calls need an `Origin` header
(better-auth rejects `MISSING_OR_NULL_ORIGIN` — this bites curl, never a browser).
New signups are **always CLIENT** — `role` is `input: false`, so it can't be set from the client.

---

## 📦 What D has shipped that you can import right now

**Endpoints live now:**
`GET /api/anomalies` (role-scoped, filters: `status`/`severity`/`type`/`equipmentId`/`from`/`to`) ·
`PATCH /api/anomalies/:id` (`ACKNOWLEDGED`/`RESOLVED`/`FALSE_POSITIVE` — `OPEN` only ever moves forward) ·
`POST /api/anomalies/run` (ADMIN, manual trigger)
`GET /api/forecast/demand?weeks=8&type=` (ADMIN) — **now includes a `recommendation` sentence per row**,
rebuilt server-side from the row's own columns since `DemandForecast` never persisted it ·
`POST /api/forecast/run` (ADMIN, manual trigger)
`GET /api/notifications` (ADMIN sees all, CLIENT sees own) — **new**, D10's feed needed it and it didn't exist

**Chart components — `frontend/components/charts/`** (C3, built by D to unblock D9 — nobody else had picked
it up yet; import barrel is `@/components/charts`):
`WorkIdleBar` (working vs idle stacked bar) · `TrendLine` + `movingAverage()` (line + N-day moving average) ·
`FuelArea` (fuel area with refuel markers) · `TempLine` (temp line, 105°C threshold from
`services/anomaly/config.ts`'s `overheat.maxTempC` — kept in sync manually, no shared package) ·
`EngineStateRibbon` (CSS flex segments, not a Recharts chart — reads better as a Gantt bar than SVG would) ·
`ForecastBand` (D9's own — line + shaded prediction interval, the stacked-Area trick since Recharts has no
native band geometry). All take plain typed props over arrays, same "on fixtures" spirit as the original
C3 spec — C7/C12 can feed them real endpoint data with no changes needed.
**Recharts is now a frontend dependency** (`^2.15.0`) — added for these.

---

## 📦 What B has shipped that you can import right now

**Pages live now:** `/admin/equipment` · `/admin/bookings` · `/admin/scanner` — all three admin
nav links resolve, so the shell has no dead entries left.

**Frontend primitives — reuse these instead of retyping the class strings:**
```tsx
import { Select } from "@/components/ui/select";       // Field, but a <select>
import { TextArea } from "@/components/ui/textarea";   // Field, but multi-line
import { Dialog, Drawer } from "@/components/ui/dialog"; // modal / right-hand panel, Esc + backdrop
import { CameraScanner } from "@/components/scan/CameraScanner";
// <CameraScanner onToken={(raw) => …} paused={showingPreview} />
```
`CameraScanner` is B2's spike, generalised: camera + manual entry side by side, the
secure-context banner, repeat-decode collapsing, and a `paused` prop that freezes the feed
without releasing the camera. It emits the raw string — `QrToken` on the backend takes the
full `RENT:v1:` payload or a bare token, so manual entry needs no special casing.

**New wire types in `frontend/lib/types.ts`:** `BookingWithRelations`, `ConfirmedBooking`,
`ScanPreview`, `ScanReceipt`, `CheckEvent`, `CheckType`.

**Two endpoints gained a filter** (they had none, and the assign dropdowns needed one):
`GET /api/sites?clientId=` · `GET /api/operators?clientId=` — ADMIN only, ignored for a
CLIENT exactly like `GET /api/bookings?clientId=`.

## ↩️ Upcoming returns

`GET /api/bookings?returningWithinDays=N` — still out, **not yet late**, due back inside N
days, sorted soonest-first. Drives the *Upcoming returns* tab on `/bookings`.

It is deliberately **disjoint from `?overdue=true`**: the two partition the CHECKED_OUT set
rather than both claiming the machines that matter most. `test:api:b8` asserts that
partition, including the case the seed happens not to contain (a genuinely late rental).
Only CHECKED_OUT counts — a machine that never left the yard cannot be returned, the same
rule `detectUpcomingReturn` applies.

Every list row now also carries **`daysUntilReturn`** (null unless out): whole UTC days to
the last rental day, `0` = due today. Server-computed for the same reason `isOverdue` is —
React's purity rule forbids reading the clock during render, and deriving it per-component
is exactly how the two sides drifted apart on `isOverdue`.

## 🖼 Fleet photographs

Every machine now carries a real photo. **Sourced from Wikimedia Commons**, openly licensed
(CC BY / CC BY-SA / CC0), catalogued with licence + author in
`backend/prisma/equipment-images.ts` — 36 photos across all 9 types, and every URL was
fetched and confirmed `200 image/*` before being written down.

They are **baked in as literals, not fetched at seed time**: `seed:verify` requires three
consecutive seeds to produce byte-identical data, which a live search API cannot give.
The pick is `photoFor(type, code)` — a hash of the machine code, so a machine keeps its
photo across reseeds and two excavators side by side don't show the same picture. It
deliberately does **not** draw from `rng`, or adding images would have shifted every
downstream random draw and silently changed the dataset the demo is tuned against.

```bash
cd backend && bun run images:backfill     # ~1s, idempotent — no reseed needed
bun run images:backfill --force           # also replace existing
```
Use the backfill rather than `bun run seed` on the shared Neon DB: reseeding wipes 80
seconds of everyone else's in-flight work to achieve the same thing.

⚠️ `upload.wikimedia.org` must stay listed in `frontend/next.config.ts` under
`images.remotePatterns` — `next/image` refuses any host that isn't, and the failure is a
silent broken image.

## 🌱 The seeded database — what's in it for you

```bash
cd backend && bun run seed        # ~80s against Neon, wipes and rebuilds. A only.
bun run seed:verify               # asserts the data still has real structure (13 checks)
bun run images:backfill           # give existing machines photos, no reseed (~1s)
bun run db:restore                # restore prisma/snapshot.sql in ~1s (demo parachute)
```

Logins: `admin@rental.com / admin123` · `client@build.com / client123`

| For | What's there |
|---|---|
| **C** (asset page) | 54k ticks at 10-min resolution over the **last 21 days**. Fuel saw-tooths with real refuels, temp tracks engine state (OFF 28 °C · IDLE 66 °C · WORKING 82 °C). ~17 machines `CHECKED_OUT` right now. |
| **D** (forecast) | 639 bookings over 12 months carrying **trend +15%/yr**, an annual cycle with a **~40% monsoon trough** (peak/trough 3.6×), weekday effects (Mon 165 starts vs Sun 12), and a type-mix shift. **GRADER peaks at 88% utilisation** in road season (→ shortage recommendation) while **LOADER sits at 56%** (→ surplus). Weekly peaks hit 100%. |
| **D** (anomalies) | **Four faults deliberately injected** so your detectors find real signals: `BLD-0003` overheats to 115 °C · `EXC-0012` idles all day for 5 days · `LDR-0001` 4 days zero runtime · `CRN-0003` fuel siphon. Plus 52 bookings with **no operator** and 39 late returns. |
| **B** (bookings) | 639 bookings across all 5 statuses. **No machine is ever double-booked** — asserted in `seed:verify`. |

⚠️ **`bun run test:api` truncates the database** — so it no longer runs against Neon at all.
It targets local Postgres on :4001 (`bun run db:up` + `bun run dev:test`), and the test file
hard-refuses any non-localhost `DATABASE_URL`. See *Environment quick start*.

### ✅ Resolved — the overdue grace day (was: "one semantic D needs to decide")
`endDate` is stored at **midnight UTC of the last rental day**, and the availability
rule treats it as **inclusive** (a booking ending the 10th blocks a booking starting
the 10th). So the naive `OVERDUE` rule `now > endDate` fires at 00:01 on the return
day, before the machine could possibly be back. **Use `now > endDate + 1 day`** — or
the demo shows every active rental as overdue. The seed follows the inclusive reading:
on-time returns land in business hours *of* `endDate`; the 39 genuinely-late ones are
a calendar day or more past it.

**Now implemented**, on that recommendation, in `backend/src/lib/overdue.ts` —
`isBookingOverdue()` and `overdueCutoff()`. All four places that had the rule now import
it: the `?overdue=true` list filter, `isOverdue` on the booking detail, `isOverdue` on the
scan preview, and **`isOverdue` on every list row**, which the list endpoint never used to
send at all — `/admin/bookings` needs it to badge a row, and the client `/bookings` page was
re-deriving it in the browser. **D/A: say so if you want the grace day gone**, it is one
constant in one file. Until then the two definitions cannot drift, which they already had.

---

## 🎨 The frontend shell — build your pages inside it

```bash
cd frontend && bun run dev        # :3000   (backend must be on :4000)
```

Your page goes in `app/(app)/<route>/page.tsx` and inherits the shell — nav,
auth guard and role routing are already done. Add your route to
`components/nav-config.ts` and the link lights up.

```tsx
"use client";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";              // api.get/post/patch/delete
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useSession } from "@/lib/auth-client";

const { data, error, loading, refetch } = useApi<Paginated<Equipment>>("/api/equipment", { limit: 20 });
```

`apiFetch` already sets `credentials:"include"`, unwraps `{ data }`, and throws
`ApiError` (with `.fieldErrors` for 422s) — so you `try/catch` instead of
checking envelope shapes. Types are in `lib/types.ts`.

**The design system — "data plate".** Machines carry stamped ID plates, so the
app does too: graphite/steel/concrete-dust, condensed caps for labels
(`.stamp`), mono for machine data, and **hi-vis orange strictly for things you
can act on**. Equipment state uses the status ramp instead, so one colour always
means one thing. Don't introduce new accent colours — use `StatusPill`.

⚠️ **Port 3000 must be free.** If it isn't, Next silently falls back to 3001 and
every sign-in fails with `INVALID_ORIGIN`. `CORS_ORIGIN` now allows both 3000
and 3001, but check which port `bun run dev` actually printed.

---

## Decisions locked in A1 — do not relitigate

| Decision | Value |
|---|---|
| Timezone | **UTC everywhere.** Store UTC, convert at the edges only. |
| Auth | **better-auth session cookie**, not localStorage, not a bearer token |
| Response envelope | `{ data }` / `{ error: { code, message, details? } }` |
| Migrations | **None.** `prisma db push` only. |
| Schema ownership | **Only A edits `prisma/schema.prisma`.** Need a field? Message A. |
| **Database** | **Shared Neon cloud Postgres.** One database, all four of us. Ask A for the URLs. |
| Local Postgres | **:5433**, Postgres **18** (matches Neon). Fallback + destructive tests only. |
| Adminer | **Dropped.** Use `bun run db:studio` or the Neon console. |
| Destructive tests | `test:api` runs against **local** on **:4001**, never Neon. Guarded in code. |
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
- [x] **A7** · H4.5–H5.5 — Equipment / Site / Operator CRUD · *`/api/equipment`, `/api/sites`, `/api/operators`. Availability overlap + soft delete + cross-client isolation. **28 API tests pass** — `bun run test:api`.*
- [x] **A8** · H5.5–H9 — **`prisma/seed.ts`** · ***12.3s** (budget was 90s). 6 users, 40 machines, 639 bookings, 54k ticks, 7.7k DailyUsage, 1.1k check events. **Re-runnable and deterministic** — 3 consecutive runs give byte-identical data. Snapshot committed at `prisma/snapshot.sql` (9.4 MB, restores in 1.1s). 13 structure assertions pass via `bun run seed:verify`.*
- [ ] **A9** · H9–H9.5 — Swap in C's real rollup for the last 21 days ⛔ *needs C4; skip if late*
- [x] **A10** · H9.5–H11 — Frontend shell + auth pages · *role-aware nav, login + register, protected route, `apiFetch()`, `useApi()`, and the **"data plate" design system**. Verified in a real browser: both roles sign in, a CLIENT hitting `/admin` is bounced to `/dashboard`.*
- [x] **A7b** · — `/admin/equipment` · *table (search / type / status filters, pagination) + create-edit drawer over all 14 fields + retire / reactivate. **This page had no task and no owner** — A7 shipped the API and the nav credited the page to it, but no line item said to build it. Built alongside B8/B9; reassign if that was someone's plan. Retire goes through DELETE (which refuses a machine with live bookings), so RETIRED is deliberately absent from the drawer's status select — offering it there would route around that guard and strand a checked-out machine.*
- [ ] **A11** · H11–H13 — **Deploy** (budget the full 2h — the cross-origin session cookie is the trap)
- [ ] **A12** · H13–H17 — 😴 Sleep
- [ ] **A13** · H17–H20 — Integration lead: merge everyone, drive the walkthrough, own the bug list
- [ ] **A14** · H20–H23 — Polish: empty states, skeletons, 404s, verify snapshot restores in 30s
- [ ] **A15** · H23–H24 — Freeze. No merges. Rehearse.

---

# Person B — Bookings, QR & Booking UX

- [ ] **B1** · H0–H0.75 — Contract workshop
- [~] **B2** · H0.75–H2 — **QR camera spike** · *B — code merged to `main` (`b4696f4`): `frontend/app/spike/scan/page.tsx`. `qr-scanner` (nimiq) decoding, **manual code-entry input beside the camera from day one**, secure-context banner that shows `isSecureContext`/`mediaDevices` so a blocked camera can't be mistaken for a permissions bug, and a commented-out `@zxing/browser` fallback with the swap note inline. `bun run build` + `lint` clean; page prerenders (scanner is dynamic-imported, so SSR is safe).* **⚠️ The phone test over LAN HTTPS — the entire point of B2 — is now one command (`bun run dev:https`) and everything short of holding a phone is verified. See B10.** Command + the `-H` gotcha are in *Environment quick start*. **Teammates: `bun install` in `frontend/` — two new deps.**
- [~] **B3** · H2–H3 — Booking UI on fixtures · *superseded — B7 landed straight onto the live API, so the fixture stage was skipped. Nothing outstanding.*
- [x] **B4** · H3–H5 — Booking API · *B — `POST /api/bookings` with overlap validation, role-scoped `GET`, `GET`/`PATCH /:id`. Overlap semantics reused verbatim from `routes/equipment.ts` (inclusive bounds, blocking = PENDING/CONFIRMED/CHECKED_OUT) so the catalogue and the endpoint cannot disagree. Create runs Serializable + bounded retry, so two requests for one window cannot both win. **`bun run test:api:b4` — 67/67.***
  > 📐 **The overlap rule is already written and tested** in `GET /api/equipment?availableFrom=&availableTo=`
  > (`src/routes/equipment.ts`). Reuse it, don't re-derive it:
  > blocking statuses are `PENDING | CONFIRMED | CHECKED_OUT`; bounds are **inclusive**
  > (`startDate <= to && endDate >= from`), so a booking ending the 10th collides with one
  > starting the 10th. `bun run test:api` has 6 boundary cases pinning this down — if you
  > change the rule, run them.
- [x] **B5** · H5–H6.5 — Confirm + QR issuance · *B — `POST /:id/confirm` (ADMIN), `GET /:id/qr.png`, `lib/qr.ts`. Payload is `RENT:v1:<token>`; the prefix is imported from `contracts/scan.ts` and a check round-trips it back through `QrToken.parse`, so B6's reader cannot drift from the writer. **D4's mailer is wired for real, not stubbed.** ⚠️ `qrToken` is issued at CREATE, not confirm — the column is NOT NULL + @unique so a row cannot insert without one; it is never exposed and is rotated at confirm. **`test:api:b5` — 32/32.***
- [x] **B6** · H6–H8 — Scan state machine · *B — `/api/scan/resolve` + `/commit`, ADMIN-only, §5 side effects complete (CheckEvent, equipment status, totalAmount, receipts). Server picks the action from status; a disagreeing body `action` is refused. **Found a real bug: a status guard alone let two concurrent commits both win — one CHECK_OUT then a legal CHECK_IN, leaving a booking RETURNED seconds after leaving the yard.** Both are valid transitions, so only a 10s rescan cooldown catches it. **`test:api:b6` — 44/44.***
- [x] **B7** · H8–H10 — Client UI live · *B — `/equipment` (filter + availability window + booking dialog), `/bookings`, `/bookings/[id]` with a large QR. The QR is fetched as a **blob with credentials**, not an `<img src>` — the cookie only rides a cross-origin `<img>` while API and app are same-site, so the naive version works on localhost and breaks on the deploy (B10). **`test:api:b7` — 40/40** pins every field these pages read, since `frontend/lib/types.ts` is hand-duplicated and a rename there is a runtime bug, not a compile error.*
- [x] **B8** · H10–H12 — Admin bookings table · *`/admin/bookings` — status chips + overdue-only + window filters, confirm / cancel, and a dispatch dialog for site + operator + extending the return date. **Confirm renders the QR inline** from `qrDataUrl`, which `POST /:id/confirm` already returned and nothing was reading — so demo step 1–2 no longer needs curl. Two backend gaps had to close first: `GET /api/sites|/api/operators` had **no `clientId` filter**, so the assign dropdowns would have offered every client's yards at once; and `PATCH /:id` checked only that a site *existed*, not that it belonged to this booking's client — a cross-client dispatch was accepted. Both fixed and pinned.*
- [x] **B9** · H12–H14 — Admin scanner page for real · *`/admin/scanner` — a four-state machine (idle → preview → committed, plus refused), camera and **manual code entry side by side**, both feeding one path. B2's spike is now `components/scan/CameraScanner.tsx`, restyled onto the plate. Check-in prefills the meter from `lastCheckout` and warns if the new reading is *lower* than the check-out one. The camera **pauses** rather than stops while a preview is up — stopping re-prompts for permission on some phones between every scan. All three refusals (rescan cooldown, PENDING booking, already used) render as readable states, and the PENDING 409's `details.booking` is used to still show what was scanned. Location is opt-in, off by default — no permission prompt mid-demo.* ⚠️ **Still laptop-only — see B10.**
- [~] **B10** · H14–H15 — Re-test scanner from a phone ⛔ *the deployed run still needs A11* · ***but it no longer has to wait for it.*** `cd frontend && bun run dev:https` serves the app over LAN HTTPS in one command. **Everything up to a human holding a phone is verified** — cert covers the LAN IP, page 200s over TLS, sign-in and an authenticated `/api/equipment` both succeed from `https://<LAN-IP>:3000`. **What is left is literally: pick up a phone, open the URL, scan a QR.** Three traps were found and closed doing this — see below.*
- [x] **B11** · H15–H17 — Edge cases · *all four scanner refusals now render as states with a next step rather than a red string: an already-used QR shows **when it was checked in**, a `PENDING` one gets a **Confirm it** button deep-linking to `/admin/bookings?status=PENDING` (the person holding the scanner is the person who can confirm it), cancelled says the client must rebook, and an unknown code says to retype. Overdue badges on both lists now read the server's `isOverdue` instead of re-deriving the rule in two browsers. Refusal panels are **not** hi-vis — DESIGN.md rule 1, the accent means actionable, so it goes on the button. 24 assertions in `test:api:b8` cover the used-QR / cancelled / grace-day-boundary paths.*
- [ ] **B12** · H17–H21 — 😴 Sleep
- [ ] **B13** · H21–H24 — Rehearsal — B drives demo steps 1–3 and 8

---

# Person C — Simulator, Telemetry & the Asset Page

- [x] **C2** · H0.75–H2.5 — **Simulator physics as a pure function** · *done — `simulator/src/physics.ts` + `print-day.ts`, merged in `190b1ee`. Checklist never got ticked for it.*
- [x] **C3** · H2.5–H3.5 — Chart components on fixtures · *done — `WorkingIdleChart`, `UsageLineChart`, `FuelAreaChart`, `TemperatureLineChart`, `EngineStateRibbon` in `frontend/components/charts/`. D's `ForecastBand` (prediction-interval band, for D9) sits alongside rather than in this set — different shape of chart, no overlap.*
- [x] **C4** · H3.5–H5 — Ingest + rollup ⛔ *needs A3 ✅* — `POST /api/telemetry/ingest` w/ `x-api-key`, idempotent via `createMany({skipDuplicates:true})` on `@@unique([equipmentId, ts])` *(verified working)*. `services/rollup.ts` upsert on `[equipmentId, date]` *(verified working)*. `POST /api/jobs/rollup` — **now guarded ADMIN-only, it had no auth at all**.
- [x] **C5** · H5–H6.5 — Simulator wired live + `--scenario` injectors: `idle`, `dead`, `theft`, `siphon`, `overheat`, `offline`. **`theft` is the money shot.**
- [x] **C6** · H6.5–H8 — Query endpoints: `/timeseries` with **server-side** `date_bin` bucketing (`10m|1h|1d`), `/track`, `/summary`, `/daily` — `routes/equipment-analytics.ts`, mounted at `/api/equipment` and `/api/analytics`. (Started as `date_trunc`, which cannot express a 10-minute stride at all — fixed to `date_bin`.)
- [x] **C7** · H8–H11 — `/asset/[assetId]` sections 1–3 · ***route moved:*** *the page is now `/equipment/[equipmentId]`, with `/asset/:id` kept as a real **308 redirect** in `next.config.ts` so steps.md §11 and the demo script still work. The implementation moved intact to `components/asset/EquipmentDetail.tsx` and is unchanged apart from a photo + spec line in the header — one copy, so the two URLs cannot drift. Original note: wired to C6's live endpoints (`/summary`, `/daily`, `/timeseries` ×3, `/track`). Moved from the unauthenticated `app/asset/…` into `app/(app)/asset/…`, so it now gets the AppShell and the session guard; `params` read via `use()` per Next 16. Verified against the reseeded DB: 8 daily rows, 169 hourly points, 1,008 GPS fixes. Fixtures deleted.*
- [x] **C8** · H11–H12.5 — Leaflet map (section 4) · *done and verified rendering — breadcrumb polyline, dashed site geofence, hi-vis current position. Dropped the marker-404 problem entirely rather than shimming it: `CircleMarker` is SVG, needs no image, and takes design-system colours directly. `ssr:false` dynamic import confirmed load-bearing.*
- [ ] **C9** · H12.5–H13 — Handoff note: post chart props + map API in chat for B and D
- [ ] **C10** · H13–H17 — 😴 Sleep
- [x] **C11** · H17–H19 — `/admin` fleet dashboard · *done — on the real `GET /api/analytics/fleet`, plus open anomalies and machines-out. Live: 63% utilisation, 17/40 out, 2 overdue, 62 open anomalies. The status donut became a horizontal part-to-whole bar: the category names are long and a donut asks the reader to compare arcs by colour alone (the 5-slice donut palette also failed the contrast/CVD check). Also fixed a route collision: this page landed at the unauthenticated `app/admin/page.tsx`, colliding with the existing protected `app/(app)/admin/page.tsx` placeholder — Next.js would have refused to build. Moved into the `(app)` slot the placeholder's own comment was waiting for.* Also added `attentionItems` to `/api/analytics/fleet`'s response (D) — the earlier fixture had it, nothing server-side produced it until this pass.
- [x] **C12** · H19–H21 — Asset page timeline (section 5) · *done — real `CheckEvent`s interleaved with D5's real anomalies, newest first. Needed a new `GET /api/equipment/:id/events` (same booking-window clamp as the rest of the router). The timeline runs on its own 90-day window rather than the chart range: the check-out that started the current rental is usually older than 7 days, and clamping it hid the one event most worth seeing.*
- [ ] **C13** · H21–H24 — Rehearsal — C drives demo steps 4–6

> ⚠️ **C — your last push clobbered the shared shell, not just added to it.** `app/globals.css`,
> `app/layout.tsx` and `app/page.tsx` came in as full replacements (stock `create-next-app`
> Geist/zinc boilerplate) instead of extensions — that deleted the "data plate" design system
> (`--color-*` tokens, `.stamp`, fonts) every existing component reads, and replaced the `/`
> role-redirect with a static landing page, and added a *second* `app/admin/page.tsx` that
> collided with the existing route at `(app)/admin/page.tsx` (Next.js refuses to build two pages
> at the same path). All three restored/merged in this pass — your chart/asset/admin components
> themselves were fine and are kept. **If your local checkout still has the old globals.css/
> layout.tsx/page.tsx, `git pull` before your next push** or this comes back.
> Also removed `frontend/package-lock.json` — this repo is bun-only (root `bun.lock`); an npm
> lockfile alongside it risks a different resolved dependency tree than what `bun install` gives
> everyone else.

> ⚠️ **Everyone — the shared Neon DB got truncated again after `a7.api.check.ts` got its
> localhost-only guard.** `b4.api.check.ts` didn't have the same guard, and something ran it
> directly (not via `bun run test:api:b4`) against the shared DB — caught it mid-merge: admin
> login was suddenly rejecting `admin123` (the real seed's password) and accepting
> `password123` (b4's fixture password) instead, with equipment/booking/telemetry counts down
> to b4's own tiny fixtures. Added the identical guard to `b4.api.check.ts` — it now refuses
> to run against anything but `localhost`, same as `a7`. If your `admin@rental.com` login stops
> working, this is almost certainly why — `bun run seed:fresh` puts it back.

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
- [x] **D8** · H11–H13 — `/admin/anomalies` · *done, once A10 landed — severity-sorted table (backend already sorts by severity desc, detectedAt desc), status/severity filters, acknowledge/resolve/false-positive actions via `PATCH /:id`.*
- [x] **D9** · H13–H15 — `/admin/forecast` · *done — per-type selector, `ForecastBand` chart (shaded prediction interval — nothing in C3's own set covered this, built it alongside), MASE badge, recommendation list, first-week-≥85% callout. Also fixed a real gap: `GET /api/forecast/demand` never returned the recommendation sentence (only the one-off `POST /run` response had it) — now rebuilt server-side per row from the row's own columns.*
- [x] **D10** · H15–H17 — `/alerts` page · *done — anomaly feed + `GET /api/notifications` (new route, didn't exist — nothing let you list `Notification` rows) merged into one chronological timeline.*
- [ ] **D11** · H17–H21 — 😴 Sleep
- [ ] **D12** · H21–H23 — Threshold tuning: `--scenario theft` end to end, breach → anomaly → HIGH email **under 20s**
- [ ] **D13** · H23–H24 — Rehearsal — D drives demo steps 5 and 7

---

## Sync points — the only 4 moments everyone stops

- [~] **H0.75** — Schema + endpoint contract signed off · *schema ✅ · decision table drafted, awaiting B/C/D sign-off*
- [x] **H2.5** — A pushes `schema.prisma`, `prisma generate` works → unblocks B4, C4, D4
- [x] **H9** — **Seeded DB exists** → C7, D5, D6 are unblocked. `cd backend && bun run seed` (12s).
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

- [x] 1–2 · **B** — client books an excavator → admin confirms → QR issued, email visible in `/alerts` · *end to end in the UI now — Confirm on `/admin/bookings` shows the QR inline and says whether the mail sent*
- [~] 3 · **B** — scan the QR off a laptop screen with a phone → preview → meter + fuel → `CHECKED_OUT` · *page done (B9); **the phone-over-HTTPS run is still outstanding** — B2/B10*
- [ ] 4 · **C** — `/asset/<id>`, charts + Leaflet breadcrumb moving live at 60×
- [ ] 5 · **C→D** — `--scenario theft` → breach + night movement on the board, HIGH email **within 20s**. *This is the moment that sells it.*
- [ ] 6 · **C** — 21-day range: idle-vs-working bars, fuel saw-tooth, temp threshold line
- [ ] 7 · **D** — `/admin/forecast` — 8-week demand, interval band, MASE badge, recommendation sentences
- [x] 8 · **B** — scan the same QR again → routed to `CHECK_IN` → total computed, machine `AVAILABLE`, receipt · *B9's receipt panel shows billable days, engine hours used and the total*

**Have the `.sql` snapshot ready to restore in 30 seconds. Live demos break.**

---

## Environment quick start

**The team shares ONE cloud Postgres (Neon).** Ask A for `DATABASE_URL` + `DIRECT_URL`;
they are not committed. Copy `.env.example` → `.env` and paste them in.

```bash
cd backend
bun install
bun run generate   # prisma generate
bun run dev        # :4000  → curl localhost:4000/health

cd ../frontend && bun install && bun run dev   # :3000
```

You do **not** need Docker for day-to-day work any more. No `db:up`, no `db:push` —
the schema is already live on Neon and it is seeded.

| Command | What it does |
|---|---|
| `bun run dev` | server → **shared Neon** |
| `bun run seed` | wipes and reseeds **shared Neon** (~80s). Banner names the host first. **A only.** |
| `bun run seed:verify` | read-only, 13 structure assertions |
| `bun run db:studio` | browse the data (replaces Adminer, which was dropped) |
| `bun run db:dump` | Neon → `prisma/snapshot.sql` (~80s) |
| `bun run db:restore` | `prisma/snapshot.sql` → DB (~1s) — **the demo parachute** |
| `bun run dev:test` | server → **local** Postgres on **:4001** |
| `bun run test:api` | 28 destructive API tests → **local**, needs `dev:test` running |

### ⚠️ Destructive commands and the shared database

`test:api` TRUNCATEs users, sessions, equipment, sites, operators and bookings.
Against Neon that logs all four of us out and deletes everyone's fixtures. So it
runs against **local Docker Postgres** instead, and a guard in the test file hard-refuses
any non-localhost `DATABASE_URL` (override only with `ALLOW_REMOTE_TRUNCATE=1`).

```bash
bun run db:up        # local postgres :5433 — only needed for the tests
bun run dev:test     # terminal 1 — server on local DB, port 4001
bun run test:api     # terminal 2
```

`dev:test` uses **port 4001** deliberately, so it cannot collide with a `bun run dev`
already holding 4000 against Neon. That collision fails as a baffling
`P2025 record not found`, not as a port error.

The same guard is on every suite. With `dev:test` running in terminal 1:

```bash
bun run test:api        # A7  — equipment / site / operator CRUD + availability   28
bun run test:api:b4     # B4  — booking create, overlap rule, role scoping        67
bun run test:api:b5     # B5  — confirm, QR issuance, qr.png                      32
bun run test:api:b6     # B6  — scan state machine, double-fire guard             44
bun run test:api:b7     # B7  — response shapes the client booking pages read     40
bun run test:api:b8     # B8/B9 — admin pages, equipment detail, returns tab   173
```

**`with-test-db` also forces `MAIL_MODE=console`.** `MAIL_MODE` is `resend` with a live
key, and the suites sign up fabricated clients (`c1@b.com`); confirming a booking sent a
real Resend message to an address that does not exist, burning quota and collecting hard
bounces against the sending domain on every run. Mail now lands in `backend/.mail/*.html`
(gitignored). If you ran a booking-confirm flow before this landed, check the Resend
dashboard for bounces.

### Neon gotchas, all three hit already

- **Pooled vs direct.** `DATABASE_URL` is the `-pooler` host (the app). `DIRECT_URL` is the
  same host *without* `-pooler` — `prisma db push` and `pg_dump` need a session-level
  connection pgbouncer cannot give. Both are in `.env`; the datasource block wires them.
- **Cold start.** Free-tier Neon suspends compute when idle. The first command after a
  quiet spell can die mid-flight — the first seed attempt failed with an FK violation
  halfway through. **Just run it again**; the second run succeeded in 81.7s.
- **Local Postgres is now 18, not 16**, to match Neon's server — a dump from an 18 server
  will not restore into 16. If you have an old `pgdata` volume it will crash-loop on start:
  `docker compose down -v` then `bun run db:restore`.

### Scanner over LAN HTTPS — needed for B2, B9, B10

```bash
cd frontend && bun run dev:https      # finds your LAN IP, issues the cert, prints the phone URL
# then on the phone: https://<LAN-IP>:3000/admin/scanner
```

**One manual step**, which the banner prints: add `https://<LAN-IP>:3000` to `CORS_ORIGIN`
in `backend/.env` and restart it. That variable is also better-auth's `trustedOrigins`
(`src/lib/auth.ts`), so leaving it out fails **sign-in** with `INVALID_ORIGIN` — not with
a CORS error, which is why it does not look like a CORS problem.

**Three traps this ran into, all now handled by the script — do not undo them:**

1. **`--experimental-https` silently downgrades to http.** It shells out to `mkcert -install`,
   which needs sudo to write the CA into the system trust store. With no TTY it fails, and
   Next prints *"Falling back to http"* **and serves the app anyway**. The server looks
   healthy, the phone connects, and `navigator.mediaDevices` is undefined — a dead camera
   with no error. The script issues the cert itself and passes `--experimental-https-key/-cert`,
   so that branch is unreachable. `mkcert -install` is **not needed**: it only makes the CA
   trusted on *this* laptop, and the phone warns either way. Tap through — bypassing still
   gives a secure context.
2. **`-H` is still not optional** — without it the cert names only `localhost/127.0.0.1/::1`
   and the phone rejects it outright. The script detects the LAN address (skipping docker and
   bridge interfaces, which a phone cannot route to) and also **re-checks an existing cert
   still covers it**, since moving networks silently invalidates one.
3. **The API is unreachable from a phone, three times over.** `NEXT_PUBLIC_API_URL=http://localhost:4000`
   is the *phone's* localhost; pointed at the LAN IP instead it is blocked as active mixed
   content on an https page; and that origin is not in `CORS_ORIGIN`. `dev:https` therefore
   proxies `/api/*` through Next itself (`API_PROXY_TARGET` in `next.config.ts`) so the page
   only ever calls its own origin. **Off by default** — plain `bun run dev` is unchanged.
   This is also the `/api` rewrite `lib/auth-client.ts` names as the A11 cookie escape hatch.

The old throwaway page is still at `/spike/scan`; the real one is `/admin/scanner`.

⚠️ **The `-H` flag is not optional.** Next only puts `localhost, 127.0.0.1, ::1` in the
generated cert unless you pass a hostname (`next/dist/lib/mkcert.js` → `createSelfSignedCertificate`),
so plain `--experimental-https` yields a cert the phone rejects outright. Two more things:
first run downloads mkcert and **prompts for your Mac password** (`mkcert -install`); and the
phone will *still* show a cert warning, because that CA is trusted on the Mac only — tap
through, bypassing still gives a secure context so the camera works. If iOS Safari refuses,
`cloudflared tunnel --url https://localhost:3000` gives a genuinely trusted cert.

`http://192.168.x.x:3000` will **never** work — `navigator.mediaDevices` is `undefined`
outside a secure context. The banner on `/spike/scan` tells you which side of that line you're on.
