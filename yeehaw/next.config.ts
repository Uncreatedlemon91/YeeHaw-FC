import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle: smaller on disk and in memory on the
  // droplet than running `next start` out of the full node_modules.
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
};

export default nextConfig;
