# Smart Rental Tracking System — Build Guide

> Living document. Edit freely as decisions change.
> **Stack:** Bun + Hono + Prisma + PostgreSQL (backend) · Next.js 16 + Tailwind 4 (frontend) · Recharts + Leaflet (viz) · Resend (email)
> **Team:** 4 people · **Mode:** hackathon / demo build (days, not months)

---

## 0. Read this first — the three decisions that shape everything

1. **Telemetry is simulated, but the contract is real.** A separate simulator service generates 10-minute ticks and POSTs them to `/api/telemetry/ingest` exactly the way a real telematics box would. Nothing downstream knows the difference. Swapping in real hardware later means changing the sender, not the system.

2. **You must seed ~12 months of fake history on day one.** Forecasting and anomaly detection have *nothing to learn from* on an empty database. A demo where the forecast chart is a flat line is a dead demo. The seed script is not a "nice to have" — it is the single highest-leverage file in the repo. Details in §7.

3. **Analytics never queries raw telemetry.** Raw ticks go into `Telemetry`. A nightly (and on-demand) rollup job collapses them into `DailyUsage`. Dashboards, forecasting, and daily anomaly rules read `DailyUsage`. This keeps the asset page fast and makes the math simple.

```
Simulator ──POST──▶ Ingest API ──▶ Telemetry (raw, 10-min)
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
                                        Email notifier
```

---

## 1. Architecture & repo layout

```
caterpillar/
├── backend/                 # Bun + Hono API  (port 4000)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── index.ts         # Hono app bootstrap
│   │   ├── env.ts           # zod-validated env
│   │   ├── db.ts            # PrismaClient singleton
│   │   ├── middleware/      # auth, role guard, error handler
│   │   ├── routes/          # auth, equipment, bookings, scan, telemetry,
│   │   │                    # sites, operators, analytics, anomalies, forecast
│   │   ├── services/
│   │   │   ├── rollup.ts
│   │   │   ├── forecast/    # pure functions + runner
│   │   │   ├── anomaly/     # pure detectors + runner
│   │   │   └── mailer/      # transport + templates
│   │   ├── jobs/scheduler.ts
│   │   └── lib/             # qr.ts, geo.ts, stats.ts, dates.ts
│   └── package.json
├── simulator/               # standalone Bun script (port-less)
│   └── src/index.ts
├── frontend/                # Next.js 16 App Router (port 3000)
│   └── app/
│       ├── (auth)/login, register
│       ├── (client)/dashboard, bookings, assets, alerts
│       ├── (admin)/admin/{equipment,bookings,scanner,anomalies,forecast}
│       ├── asset/[assetId]/page.tsx     # shared, role-aware
│       └── api/                          # BFF proxy only if needed
├── shared/                  # types + zod schemas imported by BOTH sides
│   └── src/{types.ts,contracts.ts}
├── docker-compose.yml       # postgres + adminer
└── steps.md
```

**Why a `shared/` folder:** four people moving fast will drift on field names. One file of zod schemas that both the API and the UI import makes drift a compile error instead of a 2am bug.

### Ports & env

`backend/.env`
```
DATABASE_URL="postgresql://rental:rental@localhost:5432/rental?schema=public"
JWT_SECRET="change-me-32-chars-minimum-please"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
INGEST_API_KEY="sim-dev-key"
RESEND_API_KEY=""                 # empty => console transport
MAIL_FROM="alerts@rental.local"
MAIL_MODE="console"               # console | resend
SIM_SPEED=60                      # 1 real second = 60 sim seconds
```

`frontend/.env.local`
```
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

---

## 2. Data model (Prisma)

This is the contract everyone codes against. **Only Person A edits `schema.prisma`** — everyone else opens a request. Get this merged by end of Day 1 morning.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role          { ADMIN CLIENT }
enum EquipmentType { EXCAVATOR CRANE BULLDOZER GRADER LOADER BACKHOE DUMP_TRUCK COMPACTOR FORKLIFT }
enum EquipmentStatus { AVAILABLE RESERVED CHECKED_OUT MAINTENANCE RETIRED }
enum BookingStatus { PENDING CONFIRMED CHECKED_OUT RETURNED CANCELLED }
enum CheckType     { CHECK_OUT CHECK_IN }
enum EngineState   { OFF IDLE WORKING }
enum Severity      { LOW MEDIUM HIGH }
enum AnomalyStatus { OPEN ACKNOWLEDGED RESOLVED FALSE_POSITIVE }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  companyName  String?
  phone        String?
  role         Role     @default(CLIENT)
  createdAt    DateTime @default(now())

  bookings   Booking[]  @relation("ClientBookings")
  sites      Site[]
  operators  Operator[]
  scans      CheckEvent[] @relation("ScannedBy")
  notifications Notification[]
}

model Site {
  id           String  @id @default(cuid())
  name         String
  address      String?
  lat          Float
  lng          Float
  radiusMeters Int     @default(500)   // geofence
  clientId     String
  client       User    @relation(fields: [clientId], references: [id])
  bookings     Booking[]
  @@index([clientId])
}

model Operator {
  id         String  @id @default(cuid())
  name       String
  licenseNo  String?
  phone      String?
  clientId   String
  client     User    @relation(fields: [clientId], references: [id])
  bookings   Booking[]
  @@index([clientId])
}

model Equipment {
  id            String          @id @default(cuid())
  code          String          @unique          // "EXC-0007"
  name          String
  type          EquipmentType
  make          String?
  model         String?
  year          Int?
  status        EquipmentStatus @default(AVAILABLE)
  dailyRate     Decimal         @db.Decimal(10,2)
  hourlyRate    Decimal?        @db.Decimal(10,2)
  meterHours    Float           @default(0)      // lifetime engine hours
  fuelCapacityL Int             @default(300)
  homeLat       Float                            // depot location
  homeLng       Float
  imageUrl      String?
  notes         String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  bookings   Booking[]
  telemetry  Telemetry[]
  dailyUsage DailyUsage[]
  anomalies  Anomaly[]
  @@index([type, status])
}

model Booking {
  id          String        @id @default(cuid())
  code        String        @unique              // "BK-2026-000418"
  equipmentId String
  clientId    String
  siteId      String?
  operatorId  String?
  startDate   DateTime
  endDate     DateTime                            // expected return
  status      BookingStatus @default(PENDING)
  qrToken     String        @unique               // opaque, revocable
  qrIssuedAt  DateTime      @default(now())
  checkoutAt  DateTime?
  checkinAt   DateTime?
  dailyRate   Decimal       @db.Decimal(10,2)     // snapshot at booking time
  totalAmount Decimal?      @db.Decimal(10,2)
  createdAt   DateTime      @default(now())

  equipment  Equipment  @relation(fields: [equipmentId], references: [id])
  client     User       @relation("ClientBookings", fields: [clientId], references: [id])
  site       Site?      @relation(fields: [siteId], references: [id])
  operator   Operator?  @relation(fields: [operatorId], references: [id])
  checkEvents CheckEvent[]
  telemetry   Telemetry[]
  dailyUsage  DailyUsage[]
  anomalies   Anomaly[]

  @@index([clientId, status])
  @@index([equipmentId, startDate, endDate])
  @@index([status, endDate])          // powers overdue + upcoming-return jobs
}

model CheckEvent {
  id           String    @id @default(cuid())
  bookingId    String
  type         CheckType
  at           DateTime  @default(now())
  scannedById  String
  lat          Float?
  lng          Float?
  meterHours   Float?
  fuelPct      Float?
  conditionNotes String?
  photoUrl     String?

  booking   Booking @relation(fields: [bookingId], references: [id])
  scannedBy User    @relation("ScannedBy", fields: [scannedById], references: [id])
  @@index([bookingId])
}

/// Raw 10-minute tick. Append-only. Never queried directly by dashboards.
model Telemetry {
  id            BigInt      @id @default(autoincrement())
  equipmentId   String
  bookingId     String?
  ts            DateTime
  lat           Float
  lng           Float
  engineState   EngineState
  engineHours   Float        // cumulative meter reading
  fuelPct       Float
  engineTempC   Float
  ambientTempC  Float?
  speedKph      Float        @default(0)
  operatorId    String?

  equipment Equipment @relation(fields: [equipmentId], references: [id])
  booking   Booking?  @relation(fields: [bookingId], references: [id])

  @@unique([equipmentId, ts])          // idempotent ingest
  @@index([equipmentId, ts(sort: Desc)])
  @@index([bookingId, ts])
}

/// One row per equipment per day. The analytics table.
model DailyUsage {
  id            String   @id @default(cuid())
  equipmentId   String
  bookingId     String?
  date          DateTime @db.Date
  engineHours   Float    @default(0)   // WORKING + IDLE
  workingHours  Float    @default(0)
  idleHours     Float    @default(0)
  idleRatio     Float    @default(0)
  isOperatingDay Boolean @default(false) // engineHours >= 0.5
  fuelUsedPct   Float    @default(0)
  fuelPerHour   Float?
  distanceKm    Float    @default(0)
  maxTempC      Float?
  avgTempC      Float?
  nightMoveMin  Int      @default(0)   // minutes moving 22:00–05:00
  offSiteMin    Int      @default(0)   // minutes outside site geofence
  sampleCount   Int      @default(0)
  hasOperator   Boolean  @default(false)

  equipment Equipment @relation(fields: [equipmentId], references: [id])
  booking   Booking?  @relation(fields: [bookingId], references: [id])
  @@unique([equipmentId, date])
  @@index([date])
}

model Anomaly {
  id          String        @id @default(cuid())
  type        String        // see §9 catalogue
  severity    Severity
  equipmentId String
  bookingId   String?
  detectedAt  DateTime      @default(now())
  windowStart DateTime
  windowEnd   DateTime
  metric      String?       // "idleRatio"
  value       Float?
  threshold   Float?
  message     String
  status      AnomalyStatus @default(OPEN)
  dedupeKey   String        @unique   // "HIGH_IDLE:eq_123:2026-08-30"
  notifiedAt  DateTime?

  equipment Equipment @relation(fields: [equipmentId], references: [id])
  booking   Booking?  @relation(fields: [bookingId], references: [id])
  @@index([status, severity, detectedAt])
}

model Notification {
  id        String    @id @default(cuid())
  userId    String
  type      String    // BOOKING_CONFIRMED | RETURN_REMINDER | OVERDUE | ANOMALY_DIGEST | ...
  subject   String
  body      String
  channel   String    @default("EMAIL")
  status    String    @default("PENDING") // PENDING | SENT | FAILED
  dedupeKey String    @unique
  sentAt    DateTime?
  error     String?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])
  @@index([userId, createdAt])
}

model DemandForecast {
  id            String        @id @default(cuid())
  equipmentType EquipmentType
  periodStart   DateTime      @db.Date   // Monday of forecast week
  horizonWeek   Int                      // 1..8 weeks ahead
  predicted     Float                    // rental-days demanded
  lower         Float
  upper         Float
  fleetSize     Int
  capacity      Float                    // fleetSize * 7
  utilization   Float                    // predicted / capacity
  gapUnits      Float                    // shortage(+) / surplus(-) in units
  model         String                   // "holt-winters" | "seasonal-naive"
  mase          Float?                   // backtest score
  generatedAt   DateTime      @default(now())
  @@unique([equipmentType, periodStart, generatedAt])
  @@index([equipmentType, periodStart])
}
```

**Note on `Telemetry` volume:** 144 rows/day/equipment. 40 machines × 365 days ≈ 2.1M rows. Postgres handles that fine with the index above. If you ever go to thousands of machines, partition `Telemetry` by month or add TimescaleDB — out of scope here.

---

## 3. API contract

All responses `{ data }` or `{ error: { code, message, details? } }`. Auth via `Authorization: Bearer <jwt>` (or httpOnly cookie). Roles enforced in middleware.

### Auth
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Client self-signup |
| POST | `/api/auth/login` | – | Returns JWT + user |
| GET | `/api/auth/me` | any | Current user |

### Equipment
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/equipment` | any | List; filters `?type=&status=&availableFrom=&availableTo=&q=` |
| POST | `/api/equipment` | ADMIN | Create |
| GET | `/api/equipment/:id` | any | Detail + current booking |
| PATCH | `/api/equipment/:id` | ADMIN | Update details / rate / status |
| DELETE | `/api/equipment/:id` | ADMIN | Soft delete → `RETIRED` |
| GET | `/api/equipment/:id/summary` | any\* | KPI block for asset page |
| GET | `/api/equipment/:id/timeseries` | any\* | `?metric=fuel,temp,engineHours&from=&to=&bucket=10m\|1h\|1d` |
| GET | `/api/equipment/:id/track` | any\* | GPS breadcrumb for map |
| GET | `/api/equipment/:id/daily` | any\* | `DailyUsage` rows for charts |

\* CLIENT sees it only if they have/had a booking on that equipment. **Enforce this in the route, not the UI.**

### Bookings & QR
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/bookings` | any | Admin: all. Client: own only. |
| POST | `/api/bookings` | CLIENT | Create; validates no date overlap |
| GET | `/api/bookings/:id` | owner/ADMIN | Detail |
| PATCH | `/api/bookings/:id` | owner/ADMIN | Assign site/operator, extend, cancel |
| POST | `/api/bookings/:id/confirm` | ADMIN | → `CONFIRMED`, issue QR, email it |
| GET | `/api/bookings/:id/qr.png` | owner/ADMIN | QR image |
| POST | `/api/scan/resolve` | ADMIN | `{token}` → booking preview + next action |
| POST | `/api/scan/commit` | ADMIN | `{token, action, meterHours, fuelPct, notes, lat, lng}` |

### Telemetry & analytics
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/telemetry/ingest` | `x-api-key` | Batch array of ticks, idempotent |
| GET | `/api/analytics/fleet` | ADMIN | Utilization, revenue, status mix |
| GET | `/api/analytics/utilization` | ADMIN | By type, by week |
| POST | `/api/jobs/rollup` | ADMIN | Manual trigger (demo button) |

### Intelligence
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/forecast/demand` | ADMIN | `?weeks=8` → per-type forecast + gap |
| POST | `/api/forecast/run` | ADMIN | Recompute now (demo button) |
| GET | `/api/anomalies` | any | Admin: all. Client: own bookings only. |
| PATCH | `/api/anomalies/:id` | any | Acknowledge / resolve / false-positive |
| POST | `/api/anomalies/run` | ADMIN | Recompute now (demo button) |
| GET | `/api/notifications` | any | Sent-mail log |

> **Every scheduled job also gets a manual POST trigger.** During a live demo you cannot wait for a cron. This is the difference between a demo that lands and one that doesn't.

---

## 4. Auth

Hackathon-appropriate, still not embarrassing:

- `bcrypt` (or `Bun.password.hash`) for passwords.
- JWT, 7-day expiry, `{ sub, role, email }`. Sign with `JWT_SECRET`.
- Hono middleware `requireAuth` and `requireRole('ADMIN')`.
- Ownership guard helper: `assertCanSeeEquipment(user, equipmentId)` — admin always; client only if a booking row links them.
- Frontend stores the JWT in an httpOnly cookie set by a small Next route handler, or `localStorage` if you're moving fast. Pick one on Day 0 and don't relitigate.

Seed two demo logins so everyone tests against the same accounts:
```
admin@rental.com / admin123    (ADMIN)
client@build.com / client123   (CLIENT, ~6 sites, ~40 bookings of history)
```

---

## 5. QR check-in / check-out — the state machine

### Token design
- On `POST /api/bookings/:id/confirm`, generate `qrToken = base64url(crypto.getRandomValues(32))`.
- Store it **opaque in the DB** rather than as a self-contained JWT — that way it is instantly revocable and carries no payload to tamper with.
- QR payload string: `RENT:v1:<qrToken>`. Nothing else. No PII in the QR.
- The **same token serves both check-out and check-in**. The server decides which action applies from `booking.status` — the client never picks. This is the cleanest part of the design; don't issue two QRs.

### State machine

```
PENDING ──(admin confirms)──▶ CONFIRMED ──(scan)──▶ CHECKED_OUT ──(scan)──▶ RETURNED
   │                              │                      │
   └──────(cancel)────────────────┴──────(cancel)────────┘ ──▶ CANCELLED
```

| booking.status at scan | Action taken | Side effects |
|---|---|---|
| `CONFIRMED` | `CHECK_OUT` | status→`CHECKED_OUT`, `checkoutAt=now`, equipment→`CHECKED_OUT`, simulator starts emitting for this booking, email receipt |
| `CHECKED_OUT` | `CHECK_IN` | status→`RETURNED`, `checkinAt=now`, equipment→`AVAILABLE`, compute `totalAmount`, simulator stops, final rollup, email receipt |
| `PENDING` | reject | "Booking not confirmed yet" |
| `RETURNED` / `CANCELLED` | reject | "This QR has already been used / cancelled" |

### Two-step scan (do this)
`/api/scan/resolve` returns a **preview** — client name, equipment code + photo, dates, the action about to happen. Staff eyeballs it, fills in meter hours / fuel / condition notes, then `/api/scan/commit` performs it. One-step scanning causes accidental check-ins that are painful to undo, and the preview screen also happens to demo beautifully.

Wrap `commit` in `prisma.$transaction` and re-read `booking.status` inside the transaction, so a double-tap can't double-fire.

### Libraries
- Generate: `qrcode` (`toDataURL` for UI, `toBuffer` for email attachment).
- Scan: **`qr-scanner`** (nimiq) — small, worker-based, good camera handling. `@zxing/browser` is the fallback.
- The scanner page must be `'use client'` and needs HTTPS or `localhost` for camera access. **Test on a phone over your LAN early** — `http://192.168.x.x:3000` will block the camera. Use `next dev --experimental-https` or a tunnel. This bites teams on demo day.
- Ship a **manual code-entry fallback** next to the scanner. Cameras fail on stage.

---

## 6. Telemetry simulator

A standalone Bun script. It is the heartbeat of the whole demo.

**Loop:** every `10_000 / SIM_SPEED * 60` ms → advance sim clock by 10 minutes → for each `CHECKED_OUT` booking, produce one tick → POST the batch.

**Per-tick model:**
```ts
// State per equipment: position, engineState, engineHours, fuelPct, tempC
// 1. Duty cycle by hour-of-day
//    07:00–17:00 weekday → WORKING 65% | IDLE 30% | OFF 5%
//    outside hours       → OFF 95%     | IDLE 5%
//    Sunday              → OFF 90%
// 2. engineHours += (state !== OFF) ? 10/60 : 0
// 3. fuelPct -= WORKING ? N(1.4, .3) : IDLE ? N(0.4, .1) : 0    // refuel at <12%
// 4. engineTempC: OFF → decay toward ambient; WORKING → rise toward 88±6, cap ~95
// 5. position: random walk within site.radiusMeters when WORKING/IDLE; static when OFF
// 6. speedKph: 0 when OFF, 0–4 when WORKING (tracked machines crawl)
```

**Inject anomalies on purpose.** Give the simulator a `--scenario` flag so you can trigger, on demand:

| Scenario | What it does | Fires anomaly |
|---|---|---|
| `idle` | force IDLE all working hours for one machine | `HIGH_IDLE` |
| `dead` | force OFF for 3 straight days | `ZERO_RUNTIME` |
| `theft` | teleport 40 km off-site at 02:00 at 70 km/h | `GEOFENCE_BREACH`, `NIGHT_MOVEMENT`, `IMPLAUSIBLE_SPEED` |
| `siphon` | drop fuel 35% in one tick with engine OFF | `FUEL_DROP` |
| `overheat` | ramp temp to 112 °C | `OVERHEAT` |
| `offline` | stop emitting for 3 hours | `TELEMETRY_GAP` |

Being able to say "watch — I'll trigger a theft" and have an email arrive 20 seconds later is the demo.

**Ingest endpoint** must be idempotent: `@@unique([equipmentId, ts])` + `createMany({ skipDuplicates: true })`. The simulator will retry, and you'll replay history during seeding.

---

## 7. Seeding history (do not skip)

`prisma/seed.ts` generates **~14 months ending today**:

1. **Users** — 1 admin, 5 clients.
2. **Equipment** — ~40 machines with a deliberately lopsided type mix (12 excavators, 8 loaders, 6 bulldozers, 5 graders, 4 cranes, 3 dump trucks, 2 forklifts). Uneven fleets make the shortage/surplus output interesting.
3. **Sites & operators** — 3–6 sites and 2–4 operators per client, scattered around one city.
4. **Bookings** — ~600 historical bookings with *deliberate structure*, because this is what the forecaster learns:
   - **Trend:** demand grows ~15% over the year.
   - **Annual seasonality:** peak in the dry construction season, a pronounced monsoon trough (~40% drop for ~8 weeks).
   - **Weekly seasonality:** weekend starts are rare; Monday is the busiest start day.
   - **Type mix shift:** graders spike in road-season months; cranes are steady; excavators track overall trend.
   - **Noise:** ±20% multiplicative, plus 3–4 one-off spikes (a "big project").
   - ~8% of past bookings returned late (so overdue history is real).
5. **Telemetry** — full 10-minute ticks for the **last 45 days only**, plus derived `DailyUsage` for the **full 14 months**. Generating a year of raw ticks for 40 machines is ~2M inserts and minutes of wall time; you don't need the raw resolution beyond the chart window, but you *do* need `DailyUsage` all the way back for the models.
6. **Anomalies** — do **not** hand-write these. Run the real detector over the seeded `DailyUsage` so what you show is genuinely detected, not fixture data. Judges ask.
7. **Run the forecaster** at the end of seeding so the dashboard has content on first load.

Make it re-runnable: `bun prisma db push --force-reset && bun run seed`, target under ~90 seconds.

---

## 8. Forecasting — how to actually do it

### The question you're answering
*"Over the next 8 weeks, how many units of each equipment type will clients want, and do we have enough?"*

### Step 1 — Build the demand series
Don't forecast "number of bookings" — a 30-day booking and a 1-day booking are not the same demand. Forecast **rental-days**.

```ts
// For each equipment type, for each day D in history:
demand[type][D] = count of bookings B where
    B.type === type && B.startDate <= D <= B.endDate && B.status != CANCELLED
```
That gives a daily series of "units on rent". Keep it **daily**, not weekly — daily lets you model day-of-week effects, and you can always sum up to weeks for reporting.

### Step 2 — Choose the model (and a benchmark)

Run three, always. The benchmark is not optional: without it you cannot claim your model is any good.

**A. Seasonal naive (the benchmark).**
`ŷ(t) = y(t − 7)`. Twelve lines of code. Surprisingly hard to beat. Every other model must justify itself against this.

**B. Holt-Winters additive triple exponential smoothing (the recommended primary).**
Season length `m = 7`. Level, trend, seasonal components:

```ts
export function holtWinters(y: number[], m = 7, a = .3, b = .05, g = .3, h = 56) {
  // seasonal init: average of each weekday over the first few seasons
  let level = mean(y.slice(0, m));
  let trend = (mean(y.slice(m, 2 * m)) - level) / m;
  const s = initSeasonals(y, m);                    // length m, additive
  for (let t = 0; t < y.length; t++) {
    const prevLevel = level;
    const si = t % m;
    level = a * (y[t] - s[si]) + (1 - a) * (level + trend);
    trend = b * (level - prevLevel) + (1 - b) * trend;
    s[si] = g * (y[t] - level) + (1 - g) * s[si];
  }
  return Array.from({ length: h }, (_, k) =>
    Math.max(0, level + (k + 1) * trend + s[(y.length + k) % m]));
}
```

Grid-search `α, β, γ` over `{0.05 … 0.6}` on a held-out tail and keep the best triple per equipment type. That's ~200 fits per type — milliseconds. Store the chosen params so the result is reproducible.

**C. Ridge-regularised linear regression on features (the stretch).**
Features per day: `[1, t, sin/cos(2πt/365) ×2 harmonics, sin/cos(2πt/7), lag7, lag14, lag28, rollingMean28, isHoliday]`. Solve by normal equations with a small λ on the diagonal. This captures *annual* seasonality that Holt-Winters with `m=7` cannot, so it's the better model once you have 12+ months — which you will, because you seeded it. If you have time for one upgrade, make it this.

> **Why not Prophet / ARIMA / an LSTM?** Prophet and ARIMA mean adding a Python service and a second deploy target for a days-long build. An LSTM on ~400 points will overfit and you won't be able to explain it when asked. Holt-Winters plus a regression is explainable, fast, and defensible — and "we benchmarked against seasonal-naive and beat it by 31% MASE" is a much stronger claim than "we used deep learning."

### Step 3 — Validate honestly
**Rolling-origin backtest.** Train on `[0..k]`, predict `[k+1..k+14]`, slide `k` forward by 7, repeat across the last ~12 origins.

Metrics:
- **MAE** — interpretable ("off by 1.8 units").
- **MASE** — `MAE(model) / MAE(seasonal-naive on training)`. **< 1.0 means you beat the benchmark.** This is the number to put on the dashboard.
- Avoid raw **MAPE**: demand hits zero for rare types and MAPE explodes to infinity. If you want a percentage, use sMAPE.

Store `mase` on `DemandForecast` and **show it in the UI**. Displaying your own error metric reads as confidence, not weakness.

### Step 4 — Prediction intervals
Compute residual std `σ` from the backtest, per type and per horizon (error grows with horizon):
```
lower = max(0, ŷ − 1.28σ_h)      // ~80% interval
upper =        ŷ + 1.28σ_h
```
Plot as a shaded band. It's one of the highest visual-payoff things in the whole project.

### Step 5 — Turn numbers into a recommendation
This is the part that makes it a *product* rather than a chart:

```
predictedUnits  = weeklyRentalDays / 7
capacity        = fleetSize × 7                    // rental-days available
utilization     = predictedRentalDays / capacity
gapUnits        = ceil(upperBound / 7) − fleetSize // use the UPPER bound for stocking
```

Then render plain sentences:
- `utilization > 0.85` → **"Excavators: 92% projected utilization, week of Oct 12. Short ~3 units. Consider transferring from the north depot or acquiring."**
- `utilization < 0.35` → **"Graders: 28% projected utilization for 4 weeks. 5 units likely idle — consider a promotional rate."**
- Flag the week where a type first crosses 85%.

Ship a table + a chart of actual-vs-forecast with the interval band, per type, plus this recommendation list. **The sentences are what people remember.**

### Step 6 — Schedule
Run weekly (Sunday 02:00) and on-demand via `POST /api/forecast/run`. Writes `DemandForecast` rows. Keep old generations — comparing "what we predicted 4 weeks ago" to actuals is a great extra panel if you have time.

### Cold start
New equipment type with <60 days of history → fall back to the **type-group average** (e.g. a new compactor borrows the "earthmoving" group profile) and label the result `low confidence` in the UI. Never show a Holt-Winters fit on 12 data points.

---

## 9. Anomaly detection — how to actually do it

Two layers. **Build layer 1 completely before touching layer 2.** Layer 1 covers 100% of the required cases; layer 2 is the "smart" upgrade.

### Layer 1 — Deterministic rules

Every detector is a **pure function**: `(inputs) => AnomalyCandidate[]`. No DB access inside. That makes them unit-testable on day one, before the schema even lands, and lets one person own this whole area independently.

**Daily rules** (run nightly after rollup, over `DailyUsage`):

| Type | Condition | Severity |
|---|---|---|
| `HIGH_IDLE` | `idleRatio > 0.5 && idleHours > 3` | MEDIUM; HIGH if `idleRatio > 0.7` |
| `ZERO_RUNTIME` | booking `CHECKED_OUT` and `engineHours == 0` for ≥2 consecutive days | MEDIUM; HIGH at ≥4 days |
| `MISSING_OPERATOR` | `engineHours > 0 && !hasOperator` (no `operatorId` on booking or ticks) | MEDIUM |
| `UNASSIGNED_SITE` | booking `CHECKED_OUT` && `siteId == null` for >24 h | LOW→MEDIUM after 48 h |
| `LOW_UTILIZATION` | `engineHours < 2` on a weekday for ≥3 of last 5 days | LOW |
| `FUEL_EFFICIENCY_DRIFT` | `fuelPerHour` > 1.4 × trailing-28-day median for that machine | MEDIUM |

**Real-time rules** (run every 10 min over the last ~2 h of `Telemetry`):

| Type | Condition | Severity |
|---|---|---|
| `GEOFENCE_BREACH` | haversine(pos, site) > `site.radiusMeters` for >2 consecutive ticks | HIGH |
| `NIGHT_MOVEMENT` | `speedKph > 3` between 22:00 and 05:00 | HIGH |
| `IMPLAUSIBLE_SPEED` | `speedKph > 25` for a tracked machine (it's on a trailer — authorised transfer or theft) | HIGH |
| `POSITION_JUMP` | >5 km between consecutive 10-min ticks | HIGH |
| `FUEL_DROP` | `fuelPct` falls >20 points in one tick while `engineState == OFF` | HIGH |
| `OVERHEAT` | `engineTempC > 105` for 3 consecutive ticks | HIGH |
| `TELEMETRY_GAP` | no tick for >60 min while `CHECKED_OUT` | MEDIUM |

**Booking rules** (hourly):

| Type | Condition | Severity |
|---|---|---|
| `OVERDUE` | `now > endDate && status == CHECKED_OUT` | MEDIUM; HIGH after 48 h |
| `UPCOMING_RETURN` | `endDate − now` ∈ {3 d, 1 d} | informational (alert, not anomaly) |

### Layer 2 — Statistical, unsupervised

**Robust z-score with MAD.** For each metric (`engineHours`, `idleRatio`, `fuelPerHour`, `distanceKm`, `maxTempC`), compute over a peer group — *same equipment type, last 30 days*:

```ts
const med = median(xs);
const mad = median(xs.map(x => Math.abs(x - med)));
const z   = 0.6745 * (x - med) / (mad || 1e-9);
if (Math.abs(z) > 3.5) flag('STATISTICAL_OUTLIER', { metric, value: x, z });
```

Use **median/MAD, not mean/std**. The outliers you're hunting are exactly the points that would poison a mean and inflate a standard deviation, hiding themselves. MAD is immune to that. This is a one-line change that makes the detector genuinely work, and it's worth saying out loud in a demo.

**EWMA control chart** on each machine's own `fuelPerHour` — catches slow degradation (a developing leak, a clogging filter) that a fixed threshold never sees:
```
ewma_t = λ·x_t + (1−λ)·ewma_{t−1}      λ = 0.2
flag if |ewma_t − baseline| > 3σ_ewma
```

**Skip Isolation Forest for now.** It's the obvious next step (feature vector: `[engineHours, idleRatio, fuelPerHour, distanceKm, maxTempC, nightMoveMin, offSiteMin]`), but for a days-long build it costs you explainability — you cannot tell a client *why* their machine was flagged — and it needs either a Python service or a hand-rolled TS implementation. Rules + robust z-score already produce better demo narration. Note it as future work.

### Severity → action
```
LOW    → dashboard only, no email
MEDIUM → daily digest email
HIGH   → immediate email to client + rental store
```

### De-duplication (the thing everyone gets wrong)
The detector runs every 10 minutes. Without dedupe, one stuck-idle machine emits 144 identical anomalies and 144 emails, and your demo inbox becomes the story.

- `dedupeKey = "{type}:{equipmentId}:{dayBucket}"` with a **unique index**. Insert with `skipDuplicates` / catch P2002. Re-running the detector is then free and idempotent.
- Real-time rules bucket per hour: `"{type}:{equipmentId}:{YYYY-MM-DD-HH}"`.
- Email: **one digest per recipient per hour, maximum**, listing all new anomalies. Only `HIGH` breaks out into its own immediate mail.
- Anomalies are `OPEN` → user can `ACKNOWLEDGE` / `RESOLVE` / mark `FALSE_POSITIVE` in the UI. Acknowledged anomalies stop re-notifying.

Tune thresholds in `src/services/anomaly/config.ts` — a single exported object, not magic numbers sprinkled through the detectors. You *will* be retuning these live the night before the demo.

---

## 10. Alerts & email

**Transport:** `MAIL_MODE=console` in dev writes the full rendered email to stdout and appends to `backend/.mail/*.html` so you can open it in a browser. `MAIL_MODE=resend` for the real thing. Every dev works in console mode; nobody burns the free tier or spams a teammate's inbox.

**Templates** (plain HTML template literals are fine; `@react-email/components` if you want it pretty):

| Type | Trigger | To | Contents |
|---|---|---|---|
| `BOOKING_CONFIRMED` | admin confirms | client | dates, rate, **QR attached as PNG** |
| `CHECKOUT_RECEIPT` | check-out scan | client + store | equipment, meter hours, fuel, expected return |
| `CHECKIN_RECEIPT` | check-in scan | client + store | duration, total engine hours, amount |
| `RETURN_REMINDER` | T−3 d, T−1 d | client + store | return-by date, extend link |
| `OVERDUE` | +1 h, then daily | client + store | days overdue, accruing charge |
| `ANOMALY_ALERT` | any HIGH | client + store | what, when, machine, map link |
| `ANOMALY_DIGEST` | hourly if any MEDIUM | client + store | grouped table |

**Every send writes a `Notification` row first (`PENDING`), then flips to `SENT`/`FAILED`.** Unique `dedupeKey` prevents double-sends across job restarts. It also gives you an in-app "Alerts" page for free — and a page you can show on stage without opening a real mail client.

**Scheduler** (`croner` or `node-cron`, in-process — fine at this scale):
```
*/10 * * * *   realtime anomaly detectors
0    * * * *   booking rules (overdue / upcoming) + digest flush
15   0 * * *   daily rollup → daily anomaly detectors
0    2 * * 0   forecast retrain
```
Guard with a simple in-memory `isRunning` flag so a slow job can't overlap itself.

---

## 11. Frontend pages

### Client
- `/dashboard` — active rentals, next returns, open anomalies on their machines, spend this month.
- `/equipment` — browse available, filter by type/date, book.
- `/bookings` — list + status; QR displayed for `CONFIRMED` bookings (big, scannable from a phone screen).
- `/asset/[assetId]` — see below.
- `/alerts` — notification + anomaly feed.

### Admin
- `/admin` — fleet KPIs: utilization %, machines out, overdue count, revenue, status donut.
- `/admin/equipment` — table + create/edit drawer (type, rates, availability, photo).
- `/admin/bookings` — all bookings, confirm/cancel, assign site & operator.
- `/admin/scanner` — **camera scanner → preview card → confirm.** Big buttons; this gets used on a phone.
- `/admin/anomalies` — severity-sorted table, filters, acknowledge/resolve.
- `/admin/forecast` — per-type forecast chart with interval band, MASE badge, recommendation list.

### `/asset/[assetId]` — the centrepiece, role-aware
Same route for both roles; admin sees rates, cost, and edit controls, client sees only their own rental window. Sections:

1. **Header** — code, type, photo, status pill, current site, current operator, current booking window.
2. **KPI row** — Engine Hours/Day (avg), Idle Hours/Day (avg), Operating Days, Utilization %, Total Engine Hours, Fuel Level now.
3. **Charts** (Recharts, shared date-range picker + `10m / 1h / 1d` bucket toggle):
   - Stacked bar — working vs idle hours per day
   - Line — engine hours per day, with a 7-day moving average
   - Area — fuel % over time, refuel events marked
   - Line — engine temperature, threshold line at 105 °C
   - Scatter/step — engine state timeline (OFF/IDLE/WORKING ribbon) — visually striking, cheap to build
4. **Map** — Leaflet + OSM tiles, GPS breadcrumb polyline, site geofence circle, current position marker.
5. **Timeline** — check-out/check-in events, anomalies, operator changes, interleaved.
6. **Anomalies for this asset** — inline list.

Bucket the time series **server-side** (`date_trunc` in SQL). Sending 45 days × 144 raw points to the browser and downsampling in React is the classic way to make this page feel broken.

---

## 12. Task split for 4 people

Independence comes from three things: (a) the Prisma schema is frozen early, (b) the API contract in §3 is agreed before anyone codes, (c) `shared/src/contracts.ts` holds the zod schemas both sides import. Ship those and the four tracks barely touch.

---

### **Person A — Data & Platform** *(unblocks everyone; front-load hard)*
**Owns:** `docker-compose.yml`, `prisma/`, `shared/`, auth, equipment/site/operator CRUD, deployment.

1. `docker-compose.yml` with Postgres + Adminer.
2. **`schema.prisma` — merged by end of Day 1 morning. This is the critical path.**
3. `shared/src/contracts.ts` — zod schemas for every request/response in §3.
4. Hono bootstrap: CORS, error handler, zod validation middleware, `/health`.
5. Auth: register, login, JWT, `requireAuth`, `requireRole`, `assertCanSeeEquipment`.
6. Equipment CRUD + availability filtering (date-overlap query). Sites & operators CRUD.
7. **`prisma/seed.ts` per §7** — the single most important file. Budget a full day for it.
8. Deploy: backend + Postgres (Railway/Render/Fly), frontend (Vercel), simulator as a worker.

**Deliverable gate:** by end of Day 1, `bun run seed` produces a full database, and B/C/D can all `prisma generate` against a real schema.

---

### **Person B — Bookings, QR & Booking UX**
**Owns:** `routes/bookings.ts`, `routes/scan.ts`, `lib/qr.ts`, all booking-related frontend.

1. Booking creation with **overlap validation** (no double-booking a machine for intersecting dates — write the SQL carefully, this is where bugs hide).
2. Booking state machine + `confirm` → QR issuance.
3. `/api/scan/resolve` and `/api/scan/commit`, transactional, with the status-guard table in §5.
4. `GET /api/bookings/:id/qr.png`.
5. Client UI: browse & filter equipment → booking form → bookings list → QR display page.
6. Admin UI: bookings table, confirm/cancel, assign site + operator.
7. **Admin scanner page** — `qr-scanner`, camera permissions, preview card, condition/meter/fuel form, manual-entry fallback.
8. Test the scanner **on a real phone over HTTPS by Day 3**, not Day 5.

**Day-1 work while waiting on the schema:** spike `qr-scanner` in a throwaway page; build the booking form UI against a mock JSON fixture.

---

### **Person C — Telemetry & Visualisation**
**Owns:** `simulator/`, `routes/telemetry.ts`, `services/rollup.ts`, analytics query endpoints, `/asset/[assetId]`.

1. Simulator per §6, including the `--scenario` anomaly injectors.
2. Idempotent batch ingest endpoint with API-key auth.
3. `services/rollup.ts` — Telemetry → DailyUsage. Handles partial days and re-runs (upsert on `[equipmentId, date]`).
4. Time-series query endpoints with server-side bucketing (`10m / 1h / 1d`) and the GPS track endpoint.
5. `/asset/[assetId]` — all six sections in §11, both roles.
6. Reusable chart components in `frontend/components/charts/` — **B and D will import these**, so agree on their props early.
7. Fleet analytics endpoints for the admin dashboard.

**Day-1 work while waiting on the schema:** write the simulator's physics as a pure function emitting JSON to stdout; build chart components against a checked-in fixture file.

---

### **Person D — Intelligence & Notifications**
**Owns:** `services/forecast/`, `services/anomaly/`, `services/mailer/`, `jobs/scheduler.ts`, anomaly + forecast UI.

1. `lib/stats.ts` — median, MAD, robust z, EWMA, MAE/MASE, haversine. **Pure, unit-tested, zero dependencies.**
2. Forecasting per §8: series builder, seasonal-naive, Holt-Winters + grid search, rolling-origin backtest, prediction intervals, gap/recommendation generator.
3. Anomaly detectors per §9 — **every detector a pure function**, thresholds in one config file.
4. Detector runner: loads windows from DB, calls pure functions, upserts with `dedupeKey`.
5. Mailer: console + Resend transports, all 7 templates, `Notification` rows, hourly digest with rate limiting.
6. Scheduler + the manual `POST /api/*/run` trigger endpoints.
7. UI: `/admin/anomalies`, `/admin/forecast`, `/alerts`.

**Day-1 work while waiting on the schema (best-positioned of anyone):** every algorithm in this track is a pure function over arrays. Write `holtWinters`, `robustZ`, `backtest`, and all detectors against synthetic `number[]` fixtures with real unit tests — **before the database exists at all.** Wiring to Prisma on Day 3 then takes an afternoon.

---

### Coordination rules
- **Day 0, all four together, ~2 hours:** walk §2 and §3 line by line. Argue now, not on Day 4. Nothing else starts until this is signed off.
- Branch per person: `feat/a-platform`, `feat/b-booking`, … Small PRs, same-day review.
- **Only A edits `schema.prisma`.** Need a field? Post in chat, A adds it, everyone re-runs `prisma generate`.
- Chart components are C's. Email templates are D's. Don't fork them.
- Daily 10-minute standup: *what I merged, what I'm blocked on.*
- Anything shared and half-finished gets stubbed and merged rather than held on a branch — a stub that returns fixture data unblocks three people; a perfect unmerged branch unblocks nobody.

---

## 13. Timeline (5 days)

| Day | A — Platform | B — Booking/QR | C — Telemetry/Charts | D — Intelligence |
|---|---|---|---|---|
| **0 pm** | Contract workshop — all four. Schema + API signed off. Repo scaffolded, docker up. |
| **1** | Schema merged AM · auth · equipment CRUD | QR spike · booking UI on fixtures | Simulator physics (stdout) · chart components on fixtures | `stats.ts` + Holt-Winters + all detectors, unit-tested, no DB |
| **2** | Seed script (full day) · sites/operators | Booking API + overlap validation · confirm + QR issue | Ingest API · rollup service · timeseries endpoints | Mailer + templates · forecast runner wired to Prisma |
| **3** | Client-side API layer · deploy staging | Scan resolve/commit · **scanner tested on a phone** | `/asset/[id]` charts + map live | Detector runner + dedupe · scheduler · anomaly UI |
| **4** | **Integration day** — everyone merges to main, end-to-end walkthrough, bug bash | | | Forecast UI + backtest badge |
| **5** | Polish, empty states, loading skeletons, demo rehearsal ×3, threshold tuning | | | |

If you're behind on Day 4, cut in this order: Layer-2 statistical anomalies → the regression forecast model → map breadcrumb → photo upload. **Never cut the seed script or the manual job triggers.**

---

## 14. Demo script (rehearse it three times)

1. **Client books.** Browse available excavators for next week → book → booking appears as `PENDING`.
2. **Admin confirms.** → QR issued. Show the `BOOKING_CONFIRMED` email in the Alerts page with the QR attached.
3. **Check-out.** Open `/admin/scanner` on a phone, scan the QR off the client's laptop screen. Preview card appears → enter meter hours + fuel → confirm. Booking flips to `CHECKED_OUT`, equipment to `CHECKED_OUT`.
4. **Telemetry flows.** Open `/asset/<id>`. Charts and the map breadcrumb are live (simulator at 60× — visible movement within seconds).
5. **Trigger a theft.** Run the simulator with `--scenario theft`. Within one tick: `GEOFENCE_BREACH` + `NIGHT_MOVEMENT` appear on the anomaly board and a HIGH-severity email lands in the Alerts feed. *This is the moment that sells the project.*
6. **Show history.** Switch the asset page to a 45-day range — idle-vs-working stacked bars, fuel sawtooth with refuels, temperature with the threshold line.
7. **Forecast.** `/admin/forecast` — 8-week demand per type with the confidence band, MASE badge showing you beat seasonal-naive, and the recommendation sentences ("short ~3 excavators week of Oct 12").
8. **Check-in.** Scan the same QR again → the state machine routes it to `CHECK_IN` → total computed, equipment back to `AVAILABLE`, receipt email.

Have the seeded database as a **backup snapshot** you can restore in 30 seconds. Live demos break.

---

## 15. Known risks

| Risk | Mitigation |
|---|---|
| Camera blocked on `http://` LAN IP | HTTPS dev server or tunnel; manual code entry fallback — settle this Day 3 |
| Seed script slow / crashes near the deadline | Build it Day 2, keep a `.sql` dump as a snapshot |
| Forecast looks flat and pointless | Seasonality is *baked into the seed*; verify the chart has visible shape by Day 3 |
| Anomaly email flood | `dedupeKey` unique index + hourly digest + rate limit — build dedupe with the detector, not after |
| Everyone blocked on the schema | A ships it Day 1 AM; B/C/D have fixture-based Day-1 work assigned above |
| Cron doesn't fire during the demo | Every job has a manual `POST /api/*/run` trigger |
| Timezone drift in daily rollups | Pick one timezone, store UTC, convert at the edges only. Decide on Day 0. |

---

## 16. Quick start

```bash
docker compose up -d                        # postgres

cd backend
bun install
bun prisma migrate dev --name init
bun run seed                                # ~90s, 14 months of history
bun run dev                                 # :4000

cd ../simulator && bun install && bun run dev
cd ../frontend  && bun install && bun run dev   # :3000
```

Log in as `admin@rental.com / admin123`.
