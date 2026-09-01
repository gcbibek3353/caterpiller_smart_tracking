import type { Role } from "@/lib/types";

export type NavItem = { href: string; label: string; owner?: string };

/**
 * Role-aware navigation. Routes that don't exist yet are listed anyway so the
 * shell shows the whole shape of the app from day one — each owner drops their
 * page in and the link lights up. `owner` is the task code from checklist.md.
 */
export const NAV: Record<Role, NavItem[]> = {
  CLIENT: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/equipment", label: "Browse equipment", owner: "B7" },
    { href: "/bookings", label: "My bookings", owner: "B7" },
    { href: "/alerts", label: "Alerts", owner: "D10" },
  ],
  ADMIN: [
    { href: "/admin", label: "Fleet overview", owner: "C11" },
    { href: "/admin/equipment", label: "Equipment", owner: "A7" },
    { href: "/admin/bookings", label: "Bookings", owner: "B8" },
    { href: "/admin/scanner", label: "Scanner", owner: "B9" },
    { href: "/admin/anomalies", label: "Anomalies", owner: "D8" },
    { href: "/admin/forecast", label: "Forecast", owner: "D9" },
  ],
};

export const homeFor = (role: Role) => (role === "ADMIN" ? "/admin" : "/dashboard");
