import type { ReactNode, SelectHTMLAttributes } from "react";

/**
 * The `Field` shape for a `<select>`. Exists because the same eight-class
 * string was being retyped at every filter bar, and the stamped label above a
 * mono control is the pattern the plate rows already set.
 */
export function Select({
  label,
  error,
  hint,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = props.id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={id} className="stamp mb-1.5 block text-stamp-sm text-steel">
        {label}
      </label>
      <select
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-plate border bg-plate px-3 py-2.5 font-mono text-data text-ink
          ${error ? "border-alert" : "border-line focus:border-ink"}`}
      >
        {children}
      </select>
      {error ? (
        <p className="mt-1.5 text-note text-alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-note text-mute">{hint}</p>
      ) : null}
    </div>
  );
}
