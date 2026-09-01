/**
 * `next dev` over HTTPS on the LAN — the only way to open the scanner on a
 * real phone (B2 / B9 / B10).
 *
 *     bun run dev:https
 *
 * Why this exists rather than a line in the README:
 *
 * `next dev --experimental-https` alone generates a certificate valid for
 * `localhost, 127.0.0.1, ::1` ONLY — see `createSelfSignedCertificate` in
 * next/dist/lib/mkcert.js. A phone hitting https://<LAN-IP>:3000 is then
 * rejected outright by a cert that does not name the host it reached, which
 * reads as a mysterious browser error rather than as a missing flag. `-H` is
 * therefore not optional, and remembering it at 2am is not a plan — so this
 * script finds the LAN address itself and passes it.
 *
 * Plain http://<LAN-IP>:3000 will NEVER work: `navigator.mediaDevices` is
 * undefined outside a secure context, so the camera cannot even be requested.
 * The banner on the scanner page reports which side of that line you are on.
 *
 * The second reason this is a script: `--experimental-https` shells out to
 * `mkcert -install`, which needs sudo to write the CA into the system trust
 * store. With no TTY to take a password it fails — and Next then prints
 * "Falling back to http" and SERVES THE APP ANYWAY on a plain-http URL. The
 * server looks healthy, the phone connects, and the camera is silently dead.
 * That is the worst possible failure to discover on stage, so this script
 * generates the certificate itself and never lets the fallback happen.
 *
 * `-install` is not actually needed. It only makes the CA trusted on THIS
 * machine; the phone has never seen that CA either way and will warn
 * regardless. Tapping through the warning still yields a secure context, which
 * is all the camera requires. Run `sudo mkcert -install` in a real terminal if
 * you also want the laptop to stop warning.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** First non-internal IPv4. Docker/bridge interfaces are skipped — a phone cannot route to them. */
function lanAddress(): string | null {
  const skip = /^(docker|br-|veth|virbr|tun|tap)/;
  const candidates: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) candidates.push({ name, address: a.address });
    }
  }
  // Prefer wireless: the phone is almost certainly on the same Wi-Fi, not on ethernet.
  const wifi = candidates.find((c) => /^(wl|wlan|en0)/.test(c.name));
  return (wifi ?? candidates[0])?.address ?? null;
}

const host = process.env.HTTPS_HOST ?? lanAddress();
if (!host) {
  console.error("✘ No non-internal IPv4 address found — are you on a network?");
  console.error("  Override with: HTTPS_HOST=<your-ip> bun run dev:https");
  process.exit(1);
}

const port = process.env.PORT ?? "3000";

// ── certificate ───────────────────────────────────────────────────────
const here = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.join(here, "..", "certificates");
const keyFile = path.join(certDir, "localhost-key.pem");
const certFile = path.join(certDir, "localhost.pem");

/** Next downloads mkcert here on its first `--experimental-https` run. */
function findMkcert(): string | null {
  const cache = path.join(os.homedir(), ".cache", "mkcert");
  if (!existsSync(cache)) return null;
  const bin = readdirSync(cache).find((f) => f.startsWith("mkcert-"));
  return bin ? path.join(cache, bin) : null;
}

if (!existsSync(certFile) || !existsSync(keyFile)) {
  const mkcert = findMkcert();
  if (!mkcert) {
    console.error(`✘ No certificate yet and mkcert is not in ~/.cache/mkcert.

  Next downloads it on its first HTTPS run, so prime it once with:
      bunx next dev --experimental-https
  then Ctrl-C and re-run this script. (That run will complain it cannot
  install the CA — ignore it, the download is the part we need.)
`);
    process.exit(1);
  }

  console.log(`↪ issuing a certificate for localhost + ${host} …`);
  mkdirSync(certDir, { recursive: true });
  // No `-install`: see the header. Generating the leaf needs no privileges.
  const gen = spawnSync(
    mkcert,
    ["-key-file", keyFile, "-cert-file", certFile, "localhost", "127.0.0.1", "::1", host],
    { stdio: "inherit" },
  );
  if (gen.status !== 0 || !existsSync(certFile)) {
    console.error("✘ mkcert could not issue a certificate. Not starting on plain http.");
    process.exit(1);
  }
}

/**
 * A cert already on disk names whatever address it was issued for. Move to a
 * different network and that is no longer this machine's address, so the phone
 * gets the same opaque rejection as the no-`-H` case. Check rather than assume.
 */
const names = spawnSync("openssl", ["x509", "-in", certFile, "-noout", "-text"], {
  encoding: "utf8",
});
if (names.status === 0 && names.stdout && !names.stdout.includes(host)) {
  console.error(`✘ certificates/localhost.pem does not cover ${host} — it was issued for a
  different network. Delete the certificates/ directory and re-run.
`);
  process.exit(1);
}

console.log(`
┌─ scanner over LAN HTTPS ─────────────────────────────────────────
│  On this machine   https://localhost:${port}/admin/scanner
│  On the phone      https://${host}:${port}/admin/scanner
│
│  The phone WILL show a certificate warning — the mkcert CA is
│  trusted on this machine only. Tap through it; bypassing still
│  yields a secure context, so the camera works.
│
│  If iOS Safari refuses to bypass:
│      cloudflared tunnel --url https://localhost:${port}
│  gives a genuinely trusted certificate.
│
│  API calls are proxied through this server, so the phone never
│  talks to the backend directly — no mixed content, no cross-site
│  cookie. Just have the backend running as usual.
│
│  ONE manual step. better-auth checks the Origin header, and it
│  reads its trusted list from CORS_ORIGIN. Without this line,
│  sign-in fails with INVALID_ORIGIN and nothing else does:
│
│      CORS_ORIGIN="http://localhost:3000,http://localhost:3001,https://${host}:${port}"
│
│  in backend/.env, then restart the backend.
└──────────────────────────────────────────────────────────────────
`);

/**
 * Backend origin as reached FROM THIS MACHINE. Next proxies to it, so the
 * phone never needs to reach the backend itself — which is the point.
 */
const backend = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

const proc = spawn("bunx", [
  "next", "dev",
  "--experimental-https",
  // Explicit paths, so Next never reaches for `mkcert -install` and never
  // reaches the "falling back to http" branch.
  "--experimental-https-key", keyFile,
  "--experimental-https-cert", certFile,
  "-H", host,
  "-p", port,
], {
  env: {
    ...process.env,
    API_PROXY_TARGET: backend,
    /**
     * Empty on purpose — it selects the same-origin path in lib/api.ts, so the
     * phone's requests go to https://<LAN-IP>:3000/api/… and Next forwards
     * them. Set in the child's environment, which Next's .env loader does not
     * override, so `.env.local`'s http://localhost:4000 does not win here.
     */
    NEXT_PUBLIC_API_URL: "",
  },
  stdio: "inherit",
});
proc.on("exit", (code) => process.exit(code ?? 0));
