"use client";

export type DateRangeDays = 7 | 14 | 21;
export type BucketSize = "10m" | "1h" | "1d";

export interface DateRangeControlsProps {
  days: DateRangeDays;
  bucket: BucketSize;
  onDaysChange: (days: DateRangeDays) => void;
  onBucketChange: (bucket: BucketSize) => void;
}

export function DateRangeControls({
  days,
  bucket,
  onDaysChange,
  onBucketChange,
}: DateRangeControlsProps) {
  const dayOptions: DateRangeDays[] = [7, 14, 21];
  const bucketOptions: BucketSize[] = ["10m", "1h", "1d"];

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase text-zinc-500">Range</span>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200">
          {dayOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                days === d ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase text-zinc-500">Bucket</span>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200">
          {bucketOptions.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onBucketChange(b)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                bucket === b ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <p className="ml-auto text-xs text-zinc-400">Fixture data — API wiring pending A8 seed</p>
    </div>
  );
}
