import type { ReactNode } from "react";

/**
 * The data plate — this app's signature element.
 *
 * Modelled on the stamped identification plate riveted to every machine:
 * a dark header strip in condensed caps, then tight label/value rows with the
 * values set in mono. Reuse it for equipment cards, KPI blocks and identity
 * panels so the whole app reads as one system.
 */
export function Plate({
  title,
  meta,
  children,
  className = "",
  tone = "dark",
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "dark" | "hivis";
}) {
  return (
    <section
      className={`rounded-plate border border-line bg-plate shadow-[0_1px_0_0_rgba(0,0,0,0.06)] ${className}`}
    >
      <header
        className={`flex items-center justify-between gap-3 px-4 py-2 ${
          tone === "hivis" ? "bg-hivis text-ink" : "bg-ink text-dust"
        }`}
      >
        <h2 className="stamp text-[11px] leading-none">{title}</h2>
        {meta ? <div className="stamp text-[11px] leading-none opacity-70">{meta}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** One stamped label/value row. Values are mono because they're machine data. */
export function PlateRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <dt className="stamp shrink-0 text-[10px] text-mute">{label}</dt>
      <dd className={`text-right text-sm text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export function PlateRows({ children }: { children: ReactNode }) {
  return <dl className="-my-2">{children}</dl>;
}
