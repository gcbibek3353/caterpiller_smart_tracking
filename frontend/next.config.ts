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
};

export default nextConfig;
