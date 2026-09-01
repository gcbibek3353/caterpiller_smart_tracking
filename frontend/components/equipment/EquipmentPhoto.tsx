"use client";

import Image from "next/image";
import { useState } from "react";
import type { EquipmentType } from "@/lib/types";

/**
 * A machine's photograph, with the two failure modes handled in one place:
 * a machine with no `imageUrl` at all, and a URL that 404s at render time.
 *
 * Both fall back to a stamped type plate rather than a broken-image icon or a
 * grey void — the type is the single most useful thing to show when there is
 * no picture, and it keeps the grid from collapsing.
 *
 * Photos are remote (Wikimedia Commons), so `next/image` needs the host in
 * `next.config.ts` → `images.remotePatterns`.
 */
export function EquipmentPhoto({
  src,
  alt,
  type,
  className = "",
  sizes = "(max-width: 640px) 100vw, 33vw",
  priority = false,
  rounded = true,
}: {
  src: string | null | undefined;
  alt: string;
  type?: EquipmentType | string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  rounded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const shape = `${rounded ? "rounded-plate " : ""}overflow-hidden bg-dust`;

  if (!src || failed) {
    return (
      <div
        className={`${shape} grid place-items-center border border-line ${className}`}
        role="img"
        aria-label={`${alt} — no photograph on file`}
      >
        <span className="stamp px-2 text-center text-stamp-sm text-mute">
          {(type ?? "No photo").toString().replace(/_/g, " ")}
        </span>
      </div>
    );
  }

  return (
    <div className={`${shape} relative ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        onError={() => setFailed(true)}
        className="object-cover"
      />
    </div>
  );
}
