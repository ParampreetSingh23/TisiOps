import path from "node:path"

import type { NextConfig } from "next"

// The backend lives in the sibling ../server workspace as TypeScript source,
// so both Turbopack and file tracing need the workspace root, not frontend/.
const workspaceRoot = path.join(__dirname, "..")

const nextConfig: NextConfig = {
  transpilePackages: ["@tisiops/server"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
}

export default nextConfig
