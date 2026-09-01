/**
 * Snapshot the database to prisma/snapshot.sql, and restore it back.
 *
 *   bun run db:dump      # DB  → prisma/snapshot.sql
 *   bun run db:restore   # prisma/snapshot.sql → DB
 *
 * This is the demo-day parachute: if the live demo corrupts its data, restore
 * runs in ~1s and you carry on. Rehearse it at least once.
 *
 * Why a script and not a one-liner in package.json: Bun loads .env for a .ts
 * entrypoint but NOT for the shell that runs a package.json script, so
 * `pg_dump "$DIRECT_URL"` there expands to an empty string. Verified, not assumed.
 *
 * Why Docker: nobody on the team has postgres-client installed, and the client
 * must be >= the server (Neon is on PG 18). `docker run postgres:18-alpine` gives
 * everyone a version-matched pg_dump with zero setup.
 *
 * Uses DIRECT_URL, not DATABASE_URL — pg_dump needs session-level features that
 * the pgbouncer pooler does not support.
 */
const PG_IMAGE = "postgres:18-alpine";
const SNAPSHOT = new URL("../prisma/snapshot.sql", import.meta.url).pathname;

const mode = process.argv[2];
if (mode !== "dump" && mode !== "restore") {
  console.error("usage: bun scripts/db-snapshot.ts <dump|restore>");
  process.exit(1);
}

const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw) {
  console.error("✘ Neither DIRECT_URL nor DATABASE_URL is set. Check backend/.env");
  process.exit(1);
}

/**
 * `--network host` is load-bearing, not incidental. On the default bridge network
 * this container cannot resolve DNS at all — `pg_dump` dies with
 * "could not translate host name ... Try again", and `--dns 1.1.1.1` does not fix
 * it either. Sharing the host network stack gives the container the host's working
 * resolver, and as a bonus makes a local Postgres on localhost:5433 reachable
 * without any host.docker.internal rewriting.
 *
 * If you are on macOS and this fails, run the dump with a local client instead:
 *   pg_dump --clean --if-exists --no-owner --no-acl "$DIRECT_URL" > prisma/snapshot.sql
 */
const parsed = new URL(raw);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);

/**
 * Strip Prisma-only query parameters. libpq does not know them and hard-fails
 * rather than ignoring them: `?schema=public` alone kills psql with
 * "invalid URI query parameter". sslmode and channel_binding are real libpq
 * params and must survive, so this is a blacklist, not a whitelist.
 */
const PRISMA_ONLY = ["schema", "connection_limit", "pool_timeout", "pgbouncer",
                     "socket_timeout", "statement_cache_size", "sslidentity", "sslpassword"];
const schema = parsed.searchParams.get("schema");
if (schema && schema !== "public") {
  console.warn(`⚠  non-default schema "${schema}" — this script only handles public.`);
}
for (const k of PRISMA_ONLY) parsed.searchParams.delete(k);
const url = parsed.toString();
const dockerArgs = ["docker", "run", "--rm", "-i", "--network", "host", PG_IMAGE];

console.log(`${mode === "dump" ? "Dumping" : "Restoring"} ${isLocal ? "local Docker Postgres" : parsed.hostname}`);

if (mode === "dump") {
  const out = Bun.file(SNAPSHOT).writer();
  const proc = Bun.spawn(
    // --no-owner/--no-acl: Neon owns objects as `neondb_owner`, local Postgres as
    // `rental`. Without these the dump only restores into the database it came from,
    // which defeats the entire point of having a parachute.
    [...dockerArgs, "pg_dump", "--clean", "--if-exists", "--no-owner", "--no-acl", url],
    { stdout: "pipe", stderr: "inherit" },
  );
  for await (const chunk of proc.stdout) out.write(chunk);
  out.end();
  const code = await proc.exited;
  if (code !== 0) { console.error("✘ pg_dump failed"); process.exit(code); }
  const kb = (Bun.file(SNAPSHOT).size / 1024 / 1024).toFixed(1);
  console.log(`✔ prisma/snapshot.sql written (${kb} MB)`);
} else {
  const file = Bun.file(SNAPSHOT);
  if (!(await file.exists())) {
    console.error("✘ prisma/snapshot.sql not found. Run `bun run db:dump` first.");
    process.exit(1);
  }
  const proc = Bun.spawn([...dockerArgs, "psql", "--quiet", "-v", "ON_ERROR_STOP=1", url], {
    stdin: file, stdout: "ignore", stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) { console.error("✘ psql restore failed"); process.exit(code); }
  console.log("✔ database restored from prisma/snapshot.sql");
}
