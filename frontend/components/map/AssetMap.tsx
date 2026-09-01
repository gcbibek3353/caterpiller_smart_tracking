"use client";

import dynamic from "next/dynamic";
import type { AssetMapProps } from "@/types/asset";

const AssetMapInner = dynamic(
  () => import("./AssetMapInner").then((m) => m.AssetMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading map…</p>
      </div>
    ),
  },
);

export function AssetMap(props: AssetMapProps) {
  return <AssetMapInner {...props} />;
}
