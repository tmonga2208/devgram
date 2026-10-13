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
};

export default nextConfig;
