import assert from "node:assert/strict"

import {
  buildCodeProfile,
  dependenciesFromCompose,
  dependenciesFromPackage,
  detectNodeVersion,
  exposedPorts,
  healthEndpoint,
  parseCompose,
  type ServiceAnalysis,
} from "./analyze"

// Dependencies from package.json.
assert.deepEqual(
  dependenciesFromPackage({
    dependencies: { express: "^4", pg: "^8", ioredis: "^5" },
  }),
  ["Postgres", "Redis"]
)
assert.deepEqual(
  dependenciesFromPackage({
    dependencies: { mysql2: "^3", mongoose: "^8" },
  }),
  ["MySQL", "MongoDB"]
)
assert.deepEqual(dependenciesFromPackage(null), [])

// Dependencies from docker-compose image names.
assert.deepEqual(
  dependenciesFromCompose("services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7"),
  ["Postgres", "Redis"]
)
assert.deepEqual(dependenciesFromCompose(null), [])

// docker-compose parsing: services, mapped ports, healthcheck.
const compose = [
  "services:",
  "  web:",
  "    build: .",
  "    ports:",
  "      - \"3000:3000\"",
  "    healthcheck:",
  "      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:3000/health\"]",
  "  db:",
  "    image: postgres",
].join("\n")
assert.deepEqual(parseCompose(compose), {
  services: ["web", "db"],
  ports: ["3000:3000"],
  healthcheck: true,
})
assert.deepEqual(parseCompose(null), { services: [], ports: [], healthcheck: false })

// Dockerfile EXPOSE + health endpoint.
assert.deepEqual(exposedPorts("FROM node:22\nEXPOSE 3000 8080\nCMD npm start"), ["3000", "8080"])
assert.deepEqual(exposedPorts(null), [])
assert.equal(healthEndpoint(compose, null), "/health")
assert.equal(healthEndpoint(null, null), null)

// Code profile assembly.
const primary = {
  projectType: "backend",
  runtime: "Node.js",
  nodeVersion: "22",
  packageManager: "npm",
  buildCommand: "npm run build",
  startCommand: "npm start",
  appPort: 3000,
  docker: { services: ["api", "postgres", "redis"] },
  envKeys: ["DATABASE_URL", "REDIS_URL"],
} as unknown as ServiceAnalysis

const profile = buildCodeProfile("my-api", "acme", primary, ["Postgres", "Redis"], true)
assert.deepEqual(profile, {
  repository: "my-api",
  owner: "acme",
  architecture: "backend",
  runtime: "Node.js",
  nodeVersion: "22",
  packageManager: "npm",
  build: "npm run build",
  start: "npm start",
  port: 3000,
  dependencies: ["Postgres", "Redis"],
  services: ["api", "postgres", "redis"],
  environment: ["DATABASE_URL", "REDIS_URL"],
  deployment: "Docker Compose",
})

// Node version detection: .nvmrc wins, then engines.node.
assert.equal(detectNodeVersion({ engines: { node: ">=20 <23" } }, null), "20")
assert.equal(detectNodeVersion(null, "22.12.0"), "22")
assert.equal(detectNodeVersion({ engines: { node: "22" } }, "18"), "18")
assert.equal(detectNodeVersion(null, null), null)

console.log("code-profile checks passed")
