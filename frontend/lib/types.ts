/**
 * Wire types, hand-written to mirror `backend/src/contracts/`.
 *
 * The team decided against a shared package, so these are DUPLICATED on purpose.
 * The backend is the source of truth: if `backend/src/contracts/` and this file
 * disagree, this file is wrong. A field rename here is a runtime bug, not a
 * compile error — so say so in chat the same minute you change a contract.
 */

export type Role = "ADMIN" | "CLIENT";

export type EquipmentType =
  | "EXCAVATOR" | "CRANE" | "BULLDOZER" | "GRADER"
  | "LOADER" | "BACKHOE" | "DUMP_TRUCK" | "COMPACTOR" | "FORKLIFT";

export type EquipmentStatus =
  | "AVAILABLE" | "RESERVED" | "CHECKED_OUT" | "MAINTENANCE" | "RETIRED";

export type BookingStatus =
  | "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";

export type EngineState = "OFF" | "IDLE" | "WORKING";
export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type AnomalyStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyName: string | null;
  phone: string | null;
  image: string | null;
};

export type Equipment = {
  id: string;
  code: string;
  name: string;
  type: EquipmentType;
  make: string | null;
  model: string | null;
  year: number | null;
  status: EquipmentStatus;
  /** number, not string — the backend converts Prisma Decimal for us. */
  dailyRate: number;
  hourlyRate: number | null;
  meterHours: number;
  fuelCapacityL: number;
  homeLat: number;
  homeLng: number;
  imageUrl: string | null;
  notes: string | null;
};

export type Booking = {
  id: string;
  code: string;
  equipmentId: string;
  clientId: string;
  siteId: string | null;
  operatorId: string | null;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  checkoutAt: string | null;
  checkinAt: string | null;
  dailyRate: number;
  totalAmount: number | null;
};

export type Site = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radiusMeters: number;
  clientId: string;
};

export type Operator = {
  id: string;
  name: string;
  licenseNo: string | null;
  phone: string | null;
  clientId: string;
};

/** Every list endpoint returns this inside `{ data }`. */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

/** Catalogue from backend/src/contracts/anomaly.ts's ANOMALY_TYPES. */
export type AnomalyType =
  | "HIGH_IDLE" | "ZERO_RUNTIME" | "MISSING_OPERATOR" | "UNASSIGNED_SITE"
  | "LOW_UTILIZATION" | "FUEL_EFFICIENCY_DRIFT"
  | "GEOFENCE_BREACH" | "NIGHT_MOVEMENT" | "IMPLAUSIBLE_SPEED" | "POSITION_JUMP"
  | "FUEL_DROP" | "OVERHEAT" | "TELEMETRY_GAP"
  | "OVERDUE"
  | "STATISTICAL_OUTLIER";

export type Anomaly = {
  id: string;
  type: AnomalyType;
  severity: Severity;
  equipmentId: string;
  bookingId: string | null;
  detectedAt: string;
  windowStart: string;
  windowEnd: string;
  metric: string | null;
  value: number | null;
  threshold: number | null;
  message: string;
  status: AnomalyStatus;
  dedupeKey: string;
  notifiedAt: string | null;
};

export type ForecastModel = "holt-winters" | "seasonal-naive" | "ridge";

export type DemandForecast = {
  id: string;
  equipmentType: EquipmentType;
  /** ISO date (Monday of the forecast week), e.g. "2026-09-07". */
  periodStart: string;
  horizonWeek: number;
  predicted: number;
  lower: number;
  upper: number;
  fleetSize: number;
  capacity: number;
  utilization: number;
  gapUnits: number;
  model: ForecastModel;
  mase: number | null;
  generatedAt: string;
  /** Rebuilt server-side from the row's own columns — see routes/forecast.ts. */
  recommendation: string;
};

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export type Notification = {
  id: string;
  userId: string;
  type: string;
  subject: string;
  body: string;
  channel: string;
  status: NotificationStatus;
  dedupeKey: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};
