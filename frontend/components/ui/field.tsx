import type { InputHTMLAttributes } from "react";

export function Field({
  label,
  error,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={id} className="stamp mb-1.5 block text-stamp-sm text-steel">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`w-full rounded-plate border bg-plate px-3 py-2.5 font-mono text-data text-ink
          placeholder:font-sans placeholder:text-mute/60
          ${error ? "border-alert" : "border-line focus:border-ink"}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-note text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-note text-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
