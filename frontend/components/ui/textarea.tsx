import type { TextareaHTMLAttributes } from "react";

/** `Field` for multi-line prose — condition notes are the only use so far. */
export function TextArea({
  label,
  error,
  hint,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = props.id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={id} className="stamp mb-1.5 block text-stamp-sm text-steel">
        {label}
      </label>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-plate border bg-plate px-3 py-2.5 text-body text-ink
          placeholder:text-mute/60
          ${error ? "border-alert" : "border-line focus:border-ink"}`}
      />
      {error ? (
        <p className="mt-1.5 text-note text-alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-note text-mute">{hint}</p>
      ) : null}
    </div>
  );
}
