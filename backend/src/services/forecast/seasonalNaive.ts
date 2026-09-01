/**
 * Seasonal-naive benchmark: ŷ(t) = y(t − m). Every other model must justify
 * itself against this (steps.md §8, Step 2A).
 */
export function seasonalNaive(y: number[], m = 7, h = 56): number[] {
  if (y.length < m) {
    throw new Error(`seasonalNaive needs at least ${m} points, got ${y.length}`);
  }
  const lastSeason = y.slice(-m);
  return Array.from({ length: h }, (_, k) => lastSeason[k % m]!);
}
