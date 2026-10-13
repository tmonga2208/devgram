import path from "node:path";
import type { NextConfig } from "next";

// A lockfile in a parent directory would otherwise be picked as the workspace
// root, so the root is pinned to this project.
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        // Browsers must always re-check the service worker, or an update
        // could stay hidden behind the HTTP cache.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
