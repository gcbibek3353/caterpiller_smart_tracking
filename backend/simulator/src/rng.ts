/** Seeded PRNG (mulberry32) for reproducible simulation */
export function createRng(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Gaussian via Box-Muller */
    gaussian(mean = 0, std = 1): number {
      const u1 = this.next() || 1e-10;
      const u2 = this.next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * std;
    },
    /** Uniform in [min, max) */
    range(min: number, max: number): number {
      return min + this.next() * (max - min);
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
