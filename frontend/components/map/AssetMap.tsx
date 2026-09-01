"use client";

import dynamic from "next/dynamic";
import type { AssetMapProps } from "@/types/asset";

const AssetMapInner = dynamic(
  () => import("./AssetMapInner").then((m) => m.AssetMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-plate border border-line bg-dust">
        <p className="stamp text-[11px] text-mute">Loading map…</p>
      </div>
    ),
  },
);

export function AssetMap(props: AssetMapProps) {
  return <AssetMapInner {...props} />;
}
