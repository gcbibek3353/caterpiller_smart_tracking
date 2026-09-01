"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { homeFor } from "@/components/nav-config";
import type { Role } from "@/lib/types";

/** Entry point: send people where they belong, based on role. */
export default function Home() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    const role = (session?.user as { role?: Role } | undefined)?.role;
    router.replace(role ? homeFor(role) : "/login");
  }, [isPending, session, router]);

  return (
    <div className="grid min-h-screen place-items-center">
      <p className="stamp text-stamp text-mute">Loading…</p>
    </div>
  );
}
