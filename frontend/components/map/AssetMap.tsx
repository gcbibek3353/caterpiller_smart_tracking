"use client";

import dynamic from "next/dynamic";
import type { AssetMapProps } from "@/types/asset";

/**
 * Leaflet touches `window` at import time, so the map has to stay out of the
 * server render entirely — `ssr: false` here is load-bearing, not a hint.
 */
const AssetMapInner = dynamic(
  () => import("./AssetMapInner").then((m) => m.AssetMapInner),
  {
    ssr: false,
    loading: () => (
      <section className="overflow-hidden rounded-plate border border-line bg-plate shadow-plate">
        <header className="border-b border-line/60 px-4 py-2.5">
          <h3 className="stamp text-stamp text-steel">GPS track</h3>
        </header>
        <div className="grid h-100 place-items-center bg-dust">
          <p className="stamp text-stamp-sm text-mute">Loading map…</p>
        </div>
      </section>
    ),
  },
);

export function AssetMap(props: AssetMapProps) {
  return <AssetMapInner {...props} />;
}
