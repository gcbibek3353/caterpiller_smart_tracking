"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // hi-vis means "actionable" — this is the only place the accent is a fill
  primary: "bg-hivis text-ink hover:bg-hivis-deep hover:text-plate border-transparent",
  secondary: "bg-plate text-ink border-line hover:border-ink",
  ghost: "bg-transparent text-steel border-transparent hover:text-ink",
  danger: "bg-alert text-plate border-transparent hover:brightness-90",
};

export function Button({
  variant = "primary",
  className = "",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`stamp rounded-plate border px-4 py-2.5 text-stamp-lg transition-colors
        disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? "Working…" : children}
    </button>
  );
}
