"use client";

export type DateRangeDays = 1 | 7 | 14 | 21;
export type BucketSize = "10m" | "1h" | "1d";

export interface DateRangeControlsProps {
  days: DateRangeDays;
  bucket: BucketSize;
  onDaysChange: (days: DateRangeDays) => void;
  onBucketChange: (bucket: BucketSize) => void;
  /** Rendered on the right — usually the live row count behind the charts. */
  meta?: string;
  busy?: boolean;
}

const DAY_OPTIONS: DateRangeDays[] = [1, 7, 14, 21];
const BUCKET_OPTIONS: BucketSize[] = ["10m", "1h", "1d"];

/**
 * The shared range + bucket control. Filters sit in one row above the charts
 * they govern, and both values are sent to the API — bucketing happens in
 * Postgres, never by downsampling 21 days of ticks in the browser.
 */
export function DateRangeControls({
  days,
  bucket,
  onDaysChange,
  onBucketChange,
  meta,
  busy,
}: DateRangeControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-plate border border-line bg-plate px-4 py-3 shadow-plate">
      <Segmented
        legend="Range"
        options={DAY_OPTIONS.map((d) => ({ value: d, label: d === 1 ? "24h" : `${d}d` }))}
        selected={days}
        onSelect={onDaysChange}
      />
      <Segmented
        legend="Bucket"
        options={BUCKET_OPTIONS.map((b) => ({ value: b, label: b }))}
        selected={bucket}
        onSelect={onBucketChange}
      />
      <p className="stamp ml-auto text-stamp-xs text-mute">
        {busy ? "Loading…" : (meta ?? "")}
      </p>
    </div>
  );
}

function Segmented<T extends string | number>({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="stamp text-stamp-xs text-mute">{legend}</span>
      <div className="flex overflow-hidden rounded-plate border border-line">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected === o.value}
            onClick={() => onSelect(o.value)}
            className={`stamp border-r border-line px-2.5 py-1.5 text-stamp-sm transition-colors last:border-r-0 ${
              selected === o.value
                ? "bg-ink text-plate"
                : "bg-plate text-steel hover:bg-dust"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
