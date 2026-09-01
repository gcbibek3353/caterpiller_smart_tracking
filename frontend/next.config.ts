import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default bottom-left dev badge sits exactly on top of the sidebar's
  // sign-out control. Move it rather than disable it — the build indicator is
  // genuinely useful during a fast build.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
