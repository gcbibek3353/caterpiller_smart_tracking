"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // New accounts are always CLIENT — the backend declares `role` as
    // input:false, so it cannot be set from here. Admins are made by the seed.
    const { error: authError } = await signUp.email({
      email: form.email,
      password: form.password,
      name: form.name,
      companyName: form.companyName || undefined,
      phone: form.phone || undefined,
    });

    if (authError) {
      setError(
        authError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "An account already uses that email. Sign in instead."
          : (authError.message ?? "Couldn't create the account. Try again."),
      );
      setBusy(false);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div className="rounded-plate border border-line bg-plate">
      <div className="hazard h-1.5 rounded-t-plate" />
      <div className="px-7 pb-7 pt-6">
        <p className="stamp text-stamp-sm text-hivis">Smart Rental Tracking</p>
        <h1 className="font-display mt-1 text-title font-bold uppercase leading-none tracking-tight">
          Open a client account
        </h1>
        <p className="mt-2 text-body text-steel">
          Then browse the fleet and reserve what your site needs.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <Field label="Your name" name="name" required value={form.name} onChange={set("name")} placeholder="Ramesh Shrestha" />
          <Field label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} placeholder="you@company.com" />
          <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} hint="At least 8 characters." />
          <Field label="Company" name="companyName" value={form.companyName} onChange={set("companyName")} placeholder="BuildWell Constructions" />
          <Field label="Phone" name="phone" value={form.phone} onChange={set("phone")} placeholder="+977-9801000001" />

          {error ? (
            <p role="alert" className="border-l-2 border-alert bg-alert/6 px-3 py-2 text-note text-alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={busy} className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-note text-steel">
          Already have one?{" "}
          <Link href="/login" className="text-ink underline decoration-hivis decoration-2 underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
