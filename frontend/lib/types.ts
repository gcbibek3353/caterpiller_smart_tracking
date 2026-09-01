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
