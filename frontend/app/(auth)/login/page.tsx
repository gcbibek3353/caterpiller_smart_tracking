"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { homeFor } from "@/components/nav-config";
import type { Role } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: authError } = await signIn.email({ email, password });

    if (authError) {
      // The interface's voice: what went wrong, and what to do about it.
      setError(
        authError.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "That email and password don't match an account."
          : (authError.message ?? "Sign-in failed. Try again."),
      );
      setBusy(false);
      return;
    }

    const role = (data?.user as { role?: Role } | undefined)?.role ?? "CLIENT";
    router.replace(next || homeFor(role));
  }

  return (
    <div className="rounded-plate border border-line bg-plate">
      <div className="hazard h-1.5 rounded-t-plate" />

      <div className="px-7 pb-7 pt-6">
        <p className="stamp text-stamp-sm text-hivis">Smart Rental Tracking</p>
        <h1 className="font-display mt-1 text-title font-bold uppercase leading-none tracking-tight">
          Sign in to the yard
        </h1>
        <p className="mt-2 text-body text-steel">
          Book machines, scan them out, and watch them work.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? (
            <p role="alert" className="border-l-2 border-alert bg-alert/6 px-3 py-2 text-note text-alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-note text-steel">
          Renting for the first time?{" "}
          <Link href="/register" className="text-ink underline decoration-hivis decoration-2 underline-offset-4">
            Create a client account
          </Link>
        </p>
      </div>

      {/* Demo credentials — remove before this is a real product. */}
      <div className="border-t border-line bg-dust/60 px-7 py-3">
        <p className="stamp text-stamp-xs text-mute">Demo logins</p>
        <p className="mt-1 font-mono text-stamp text-steel">admin@rental.com · admin123</p>
        <p className="font-mono text-stamp text-steel">client@build.com · client123</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="stamp text-stamp text-mute">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
