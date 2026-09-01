/**
 * Run a command with DATABASE_URL swapped for TEST_DATABASE_URL.
 *
 *   bun scripts/with-test-db.ts bun --watch src/index.ts
 *
 * The shared Neon database is four people's live working data, and `test:api`
 * TRUNCATEs users, sessions, equipment, sites, operators and bookings. Running
 * it against Neon logs the whole team out and deletes their fixtures. So the
 * destructive suites talk to local Docker Postgres instead, via this wrapper.
 *
 * Needed because `bun run` does not expand .env vars in a package.json script's
 * shell — only a .ts entrypoint gets .env loaded.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("✘ TEST_DATABASE_URL is not set. Copy it from backend/.env.example");
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: bun scripts/with-test-db.ts <command...>");
  process.exit(1);
}

/**
 * Different port from `bun run dev` on purpose. Both servers bind 4000 otherwise,
 * the second dies with EADDRINUSE, and `test:api` then silently talks to the
 * Neon-backed server while asserting against local Postgres — which fails as a
 * baffling P2025 "record not found" rather than as a port error. Cost an hour once.
 */
const port = process.env.TEST_PORT ?? "4001";
const api = `http://localhost:${port}`;

console.log(`↪ DATABASE_URL → ${new URL(url).host} · port ${port} (test stack)`);

const proc = Bun.spawn(argv, {
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PORT: port, API_URL: api },
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});
process.exit(await proc.exited);
