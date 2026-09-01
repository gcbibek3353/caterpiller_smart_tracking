/**
 * Give every machine already in the database a photo.
 *
 *     bun run images:backfill          # fill in machines with no image
 *     bun run images:backfill --force  # also replace existing ones
 *
 * `bun run seed` now assigns these too, but reseeding wipes and rebuilds the
 * SHARED Neon database — 80 seconds that deletes whatever the rest of the team
 * currently has in flight. This does the same job as a ~1s idempotent UPDATE,
 * so nobody has to reseed just to get pictures.
 *
 * Safe to re-run: `photoFor()` is a pure function of (type, code), so a second
 * run computes the same URL and changes nothing.
 */
import { prisma } from "../src/db";
import { photoFor } from "../prisma/equipment-images";

const force = process.argv.includes("--force");

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "unknown"; }
})();
console.log(`↪ database ${host}${force ? " · --force (replacing existing images)" : ""}`);

const machines = await prisma.equipment.findMany({
  where: force ? {} : { imageUrl: null },
  select: { id: true, code: true, type: true, imageUrl: true },
  orderBy: { code: "asc" },
});

if (machines.length === 0) {
  console.log("✓ every machine already has a photo — nothing to do (use --force to replace).");
} else {
  let set = 0, skipped = 0;
  for (const m of machines) {
    const photo = photoFor(m.type, m.code);
    if (!photo) { skipped++; continue; }
    if (photo.url === m.imageUrl) { skipped++; continue; }
    await prisma.equipment.update({ where: { id: m.id }, data: { imageUrl: photo.url } });
    set++;
  }
  console.log(`✓ ${set} updated · ${skipped} already correct or unmapped`);
}

const remaining = await prisma.equipment.count({ where: { imageUrl: null } });
const total = await prisma.equipment.count();
console.log(`  ${total - remaining}/${total} machines have a photo`);

await prisma.$disconnect();
