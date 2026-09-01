/**
 * Seeded PRNG. Deterministic by design: the seed script, the simulator and any
 * test that uses it produce the SAME data on every run. A demo that looks
 * different each time is a demo you cannot rehearse, and a bug you cannot
 * reproduce.
 */
export class Rng {
  private s: number;

  constructor(seed = 0x5eed_1234) {
    this.s = seed >>> 0;
  }

  /** mulberry32 — small, fast, good enough for simulation. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  bool(pTrue = 0.5): boolean {
    return this.next() < pTrue;
  }

  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error("pick() on empty array");
    return xs[this.int(0, xs.length - 1)]!;
  }

  shuffle<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** Box–Muller normal. Used for fuel burn, temperatures, durations. */
  gauss(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Normal, clamped — keeps fuel in [0,100] and temps physical. */
  clampedGauss(mean: number, sd: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, this.gauss(mean, sd)));
  }

  /** Knuth's Poisson. Booking arrivals per day are a count, not a float. */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.gauss(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
}
