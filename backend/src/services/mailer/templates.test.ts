import { describe, test, expect } from "bun:test";
import { renderBookingConfirmed } from "./templates/bookingConfirmed";
import { renderCheckoutReceipt } from "./templates/checkoutReceipt";
import { renderCheckinReceipt } from "./templates/checkinReceipt";
import { renderReturnReminder } from "./templates/returnReminder";
import { renderOverdue } from "./templates/overdue";
import { renderAnomalyAlert } from "./templates/anomalyAlert";
import { renderAnomalyDigest } from "./templates/anomalyDigest";
import { escapeHtml } from "./templates/layout";

describe("escapeHtml", () => {
  test("escapes the five HTML-sensitive characters", () => {
    expect(escapeHtml(`<script>&"'</script>`)).toBe("&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;");
  });
});

describe("renderBookingConfirmed", () => {
  test("includes booking and equipment details in the subject/body", () => {
    const out = renderBookingConfirmed({
      clientName: "Ada",
      bookingCode: "BK-2026-000418",
      equipmentCode: "EXC-0007",
      equipmentName: "Excavator",
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-08"),
      dailyRate: 250,
    });
    expect(out.subject).toContain("EXC-0007");
    expect(out.html).toContain("BK-2026-000418");
    expect(out.html).toContain("Ada");
    expect(out.html).toContain("250.00");
  });

  test("escapes a client name containing HTML", () => {
    const out = renderBookingConfirmed({
      clientName: "<b>Ada</b>",
      bookingCode: "BK-1",
      equipmentCode: "EXC-0007",
      equipmentName: "Excavator",
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-08"),
      dailyRate: 250,
    });
    expect(out.html).not.toContain("<b>Ada</b>");
  });
});

describe("renderCheckoutReceipt", () => {
  test("shows meter hours and fuel", () => {
    const out = renderCheckoutReceipt({
      clientName: "Ada",
      equipmentCode: "EXC-0007",
      equipmentName: "Excavator",
      meterHours: 1234.5,
      fuelPct: 87,
      expectedReturn: new Date("2026-10-08"),
    });
    expect(out.html).toContain("1234.5");
    expect(out.html).toContain("87%");
  });
});

describe("renderCheckinReceipt", () => {
  test("shows duration, hours, amount", () => {
    const out = renderCheckinReceipt({
      clientName: "Ada",
      equipmentCode: "EXC-0007",
      equipmentName: "Excavator",
      durationDays: 7,
      totalEngineHours: 42,
      totalAmount: 1750,
    });
    expect(out.html).toContain("7 day");
    expect(out.html).toContain("1750.00");
  });
});

describe("renderReturnReminder", () => {
  test("pluralizes correctly at 1 day left", () => {
    const out = renderReturnReminder({
      clientName: "Ada",
      equipmentCode: "EXC-0007",
      returnBy: new Date("2026-10-08"),
      daysLeft: 1,
    });
    expect(out.subject).toContain("due in 1 day");
    expect(out.subject).not.toContain("1 days");
  });

  test("includes the extend link only when provided", () => {
    const withLink = renderReturnReminder({
      clientName: "Ada",
      equipmentCode: "EXC-0007",
      returnBy: new Date("2026-10-08"),
      daysLeft: 3,
      extendUrl: "https://example.com/extend",
    });
    expect(withLink.html).toContain("https://example.com/extend");

    const withoutLink = renderReturnReminder({
      clientName: "Ada",
      equipmentCode: "EXC-0007",
      returnBy: new Date("2026-10-08"),
      daysLeft: 3,
    });
    expect(withoutLink.html).not.toContain("Extend");
  });
});

describe("renderOverdue", () => {
  test("computes accrued charge from days overdue", () => {
    const out = renderOverdue({
      clientName: "Ada",
      equipmentCode: "EXC-0007",
      daysOverdue: 3,
      accruingChargePerDay: 50,
    });
    expect(out.html).toContain("150.00");
    expect(out.subject).toContain("OVERDUE");
  });
});

describe("renderAnomalyAlert", () => {
  test("subject carries severity and type", () => {
    const out = renderAnomalyAlert({
      equipmentCode: "EXC-0007",
      equipmentName: "Excavator",
      anomalyType: "GEOFENCE_BREACH",
      severity: "HIGH",
      message: "1200m outside the 500m geofence",
      detectedAt: new Date("2026-09-01T02:10:00Z"),
    });
    expect(out.subject).toBe("[HIGH] GEOFENCE_BREACH — EXC-0007");
    expect(out.html).toContain("1200m outside");
  });
});

describe("renderAnomalyDigest", () => {
  test("lists every item and counts them in the subject", () => {
    const out = renderAnomalyDigest({
      recipientName: "Ops",
      windowLabel: "2026-09-01 14:00–15:00",
      items: [
        { equipmentCode: "EXC-0007", type: "HIGH_IDLE", severity: "MEDIUM", message: "idle 62%" },
        { equipmentCode: "LOA-0002", type: "FUEL_EFFICIENCY_DRIFT", severity: "MEDIUM", message: "1.6x median" },
      ],
    });
    expect(out.subject).toContain("2 notice(s)");
    expect(out.html).toContain("EXC-0007");
    expect(out.html).toContain("LOA-0002");
  });
});
