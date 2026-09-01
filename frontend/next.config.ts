import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * bun installs into a shared store at the REPO root
   * (`../node_modules/.bun/...`) and symlinks `frontend/node_modules/*` into it.
   * Turbopack infers its root from the nearest lockfile, lands on `frontend/`,
   * and then refuses to follow those symlinks out of the project — every
   * third-party import (recharts, leaflet, react-leaflet, better-auth) fails
   * with "Module not found" even though node and bun resolve them fine.
   *
   * Pointing `root` at the repo root covers both the app and the store, which
   * is what the Turbopack docs prescribe for linked dependencies.
   */
  turbopack: {
    root: path.join(__dirname, ".."),
  },

  // The default bottom-left dev badge sits exactly on top of the sidebar's
  // sign-out control. Move it rather than disable it — the build indicator is
  // genuinely useful during a fast build.
  devIndicators: { position: "bottom-right" },

  /**
   * Same-origin `/api` proxy — OFF unless `API_PROXY_TARGET` is set.
   *
   * `bun run dev:https` sets it, because a phone on the LAN cannot use the
   * normal cross-origin setup at all:
   *   · `NEXT_PUBLIC_API_URL=http://localhost:4000` is the PHONE's localhost;
   *   · pointed at the LAN IP instead, an https page fetching http:// is
   *     blocked as active mixed content;
   *   · and that origin is not in the backend's CORS_ORIGIN either.
   * Proxying through Next collapses all three: the page only ever talks to its
   * own origin, so there is no mixed content, no CORS preflight, and the
   * session cookie is same-site rather than cross-site.
   *
   * `lib/auth-client.ts` calls that last part "the trap A11 budgets two hours
   * for" — so this is also the deploy's escape hatch, not just the phone's.
   * Left off by default so `bun run dev` keeps talking to :4000 directly and
   * nobody's existing setup moves under them.
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
