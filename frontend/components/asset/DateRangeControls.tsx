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
    <div className="flex flex-wrap items-center gap-4 rounded-plate border border-line bg-plate px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="stamp text-[10px] text-mute">Range</span>
        <div className="flex overflow-hidden rounded-plate border border-line">
          {dayOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={`stamp px-3 py-1.5 text-[11px] transition-colors ${
                days === d ? "bg-ink text-plate" : "bg-plate text-steel hover:text-ink"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="stamp text-[10px] text-mute">Bucket</span>
        <div className="flex overflow-hidden rounded-plate border border-line">
          {bucketOptions.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onBucketChange(b)}
              className={`stamp px-3 py-1.5 text-[11px] transition-colors ${
                bucket === b ? "bg-ink text-plate" : "bg-plate text-steel hover:text-ink"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
