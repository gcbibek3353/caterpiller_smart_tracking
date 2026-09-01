import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 px-6">
      <div className="max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
          Smart Rental Tracking
        </p>
        <h1 className="mt-3 text-4xl font-bold text-zinc-900">
          Equipment Monitoring Dashboard
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Asset visualization, fleet overview, and operational insights. Currently powered by
          fixture data until the seed script (A8) and telemetry APIs are wired.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/asset/EXC-1007"
            className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            View Asset — EXC-1007
          </Link>
          <Link
            href="/admin"
            className="rounded-xl border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
          >
            Admin Fleet Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
