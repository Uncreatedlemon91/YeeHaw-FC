import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle: smaller on disk and in memory on the
  // droplet than running `next start` out of the full node_modules.
  output: "standalone",
  // Article covers go through a server action: allow a phone photo (the
  // action re-checks MAX_IMAGE_BYTES itself).
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
};

export default nextConfig;
