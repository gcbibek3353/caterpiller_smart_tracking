import type { BookingStatus, EquipmentStatus, Severity } from "@/lib/types";

/**
 * One colour, one meaning. Machine state never borrows the hi-vis accent,
 * which is reserved for things you can click.
 */
const EQUIPMENT: Record<EquipmentStatus, string> = {
  AVAILABLE: "bg-ok/12 text-ok border-ok/35",
  RESERVED: "bg-busy/12 text-busy border-busy/35",
  CHECKED_OUT: "bg-ink/8 text-ink border-ink/25",
  MAINTENANCE: "bg-warn/15 text-warn border-warn/40",
  RETIRED: "bg-mute/12 text-mute border-mute/30",
};

const BOOKING: Record<BookingStatus, string> = {
  PENDING: "bg-warn/15 text-warn border-warn/40",
  CONFIRMED: "bg-busy/12 text-busy border-busy/35",
  CHECKED_OUT: "bg-ink/8 text-ink border-ink/25",
  RETURNED: "bg-ok/12 text-ok border-ok/35",
  CANCELLED: "bg-mute/12 text-mute border-mute/30",
};

const SEVERITY: Record<Severity, string> = {
  LOW: "bg-mute/12 text-mute border-mute/30",
  MEDIUM: "bg-warn/15 text-warn border-warn/40",
  HIGH: "bg-alert/12 text-alert border-alert/40",
};

const BASE =
  "stamp inline-flex items-center rounded-plate border px-2 py-1 text-stamp-sm leading-none";

export const StatusPill = ({
  status,
  kind = "equipment",
}: {
  status: string;
  kind?: "equipment" | "booking" | "severity";
}) => {
  const map =
    kind === "booking" ? BOOKING : kind === "severity" ? SEVERITY : EQUIPMENT;
  const tone = (map as Record<string, string>)[status] ?? EQUIPMENT.RETIRED;
  return <span className={`${BASE} ${tone}`}>{status.replace(/_/g, " ")}</span>;
};
