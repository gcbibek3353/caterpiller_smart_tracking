"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import type { Role } from "@/lib/types";
import { NAV, homeFor } from "./nav-config";

/**
 * Protected shell. Auth lives in a better-auth session cookie on the API
 * origin, so the check has to happen client-side — Next middleware on :3000
 * can't read a cookie the browser scopes to the API.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const user = session?.user as { name: string; email: string; role: Role } | undefined;

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    // A client who lands on an admin route goes home rather than seeing a 403.
    if (user.role !== "ADMIN" && pathname.startsWith("/admin")) {
      router.replace("/dashboard");
    }
  }, [isPending, user, pathname, router]);

  if (isPending || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="stamp text-stamp text-mute">Checking credentials…</p>
      </div>
    );
  }

  const items = NAV[user.role] ?? NAV.CLIENT;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      {/* ── rail ─────────────────────────────────────────── */}
      <aside className="flex flex-col border-line bg-ink text-dust md:border-r">
        <Link href={homeFor(user.role)} className="flex items-baseline gap-2 px-5 py-4">
          <span className="font-display text-title-sm font-bold uppercase leading-none tracking-tight text-plate">
            Yard
          </span>
          <span className="stamp text-stamp-xs text-hivis">Rental Ops</span>
        </Link>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`stamp shrink-0 border-l-2 px-3 py-2.5 text-stamp transition-colors ${
                  active
                    ? "border-hivis bg-plate/10 text-plate"
                    : "border-transparent text-dust/55 hover:text-plate"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* identity, stamped like a plate */}
        <div className="mt-auto hidden border-t border-plate/15 px-4 pb-10 pt-4 md:block">
          <p className="stamp text-stamp-xs text-hivis">{user.role}</p>
          <p className="mt-1 truncate text-body text-plate">{user.name}</p>
          <p className="truncate font-mono text-data-xs text-dust/50">{user.email}</p>
          <button
            onClick={() => signOut().then(() => router.replace("/login"))}
            className="stamp mt-3 text-stamp-sm text-dust/55 underline-offset-4 hover:text-hivis hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 p-5 md:p-8">{children}</main>
    </div>
  );
}
