"use client";

import { useEffect, type ReactNode } from "react";
import { Plate } from "./plate";

/**
 * Modal built on the plate, so a dialog looks like the rest of the app rather
 * than a bootstrapped overlay. Closes on backdrop click and on Escape — the
 * scanner and the assign dialog both get used one-handed, and a modal you can
 * only dismiss by hitting a 40px target is the wrong shape for that.
 */
export function Dialog({
  title,
  meta,
  tone = "dark",
  width = "max-w-md",
  onClose,
  children,
}: {
  title: string;
  meta?: ReactNode;
  tone?: "dark" | "hivis";
  width?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className={`w-full ${width} my-auto`} onClick={(e) => e.stopPropagation()}>
        <Plate title={title} meta={meta} tone={tone}>
          {children}
        </Plate>
      </div>
    </div>
  );
}

/**
 * Right-hand drawer for forms too tall to sit in a centred modal — the
 * equipment editor is fourteen fields and a modal would scroll the page behind
 * it on a laptop.
 */
export function Drawer({
  title,
  meta,
  onClose,
  children,
}: {
  title: string;
  meta?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/45"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-line bg-plate shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 bg-ink px-5 py-3 text-dust">
          <h2 className="stamp text-stamp leading-none">{title}</h2>
          <div className="flex items-center gap-3">
            {meta ? <span className="stamp text-stamp-sm leading-none opacity-70">{meta}</span> : null}
            <button
              onClick={onClose}
              aria-label="Close"
              className="stamp text-stamp-lg leading-none text-dust/60 hover:text-hivis"
            >
              Esc ✕
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
