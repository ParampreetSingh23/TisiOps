import assert from "node:assert/strict"

import type { CodeProfile } from "../github/analyze"
import type { ProductionRuntime } from "./production-runtime-parse"
import {
  buildStagingRecommendation,
  resourceRequirements,
  stagingDomain,
} from "./staging-recommendation"

const codeProfile: CodeProfile = {
  repository: "api",
  owner: "company",
  architecture: "backend",
  runtime: "Node.js",
  nodeVersion: "22",
  packageManager: "npm",
  build: "npm run build",
  start: "npm start",
  port: 3000,
  dependencies: ["Postgres", "Redis"],
  services: ["api", "postgres", "redis"],
  environment: ["DATABASE_URL", "REDIS_URL", "JWT_SECRET"],
  deployment: "Docker Compose",
}

const runtime: ProductionRuntime = {
  os: "Ubuntu 24.04",
  cpuCount: 4,
  memoryMb: 8192,
  diskGb: 40,
  docker: { status: "Running", version: "27.0.0" },
  composeProjects: ["api"],
  containers: [
    { name: "api-prod", image: "nginx:latest", status: "Up", ports: "0.0.0.0:3000->3000/tcp" },
    { name: "postgres-prod", image: "postgres:16", status: "Up", ports: "5432/tcp" },
    { name: "redis-prod", image: "redis:7", status: "Up", ports: "6379/tcp" },
  ],
  images: ["nginx:latest", "postgres:16", "redis:7"],
  volumes: ["pg_data"],
  networks: ["api_net"],
  runtimes: [{ name: "node", version: "22.12.0" }],
  systemdServices: [{ unit: "caddy.service", state: "active" }],
  postgres: "running",
  redis: "running",
  nginx: "unavailable",
  caddy: "active",
  domains: ["api.company.com"],
  git: { repoPath: "/var/www/api", branch: "main", commit: "abc1234", remote: "git@github.com:company/api.git" },
}

const staging = buildStagingRecommendation(runtime, codeProfile)

assert.equal(staging.branch, "staging")
assert.equal(staging.domain, "api-staging.tisiops.com")
assert.deepEqual(
  staging.services.map((s) => s.name),
  ["api-staging", "postgres-staging", "redis-staging"]
)
assert.equal(staging.services[0]!.sourceType, "api")
assert.equal(staging.services[1]!.sourceType, "database")
assert.equal(staging.services[2]!.sourceType, "cache")
assert.deepEqual(staging.services[0]!.ports, [3000])
assert.deepEqual(staging.services[1]!.ports, [5432])
assert.deepEqual(staging.services[2]!.ports, [6379])
assert.deepEqual(staging.volumes, ["pg_data-staging"])
assert.deepEqual(staging.secrets, ["DATABASE_URL", "REDIS_URL", "JWT_SECRET"])
assert.deepEqual(staging.resources, { cpu: "4 vCPU", memory: "8192 MB", disk: "40 GB" })
assert.deepEqual(staging.isolation, { database: true, volumes: true })
// Staging must never reference the production database/domain.
assert.ok(!staging.databaseUrl.includes("company.com"))

// Pure helpers.
assert.equal(stagingDomain("api.company.com"), "api-staging.tisiops.com")
assert.equal(stagingDomain(null), "app-staging.tisiops.com")
assert.deepEqual(resourceRequirements(runtime), { cpu: "4 vCPU", memory: "8192 MB", disk: "40 GB" })
assert.deepEqual(resourceRequirements(null), { cpu: "1 vCPU", memory: "2048 MB", disk: "20 GB" })

// No code profile: services derive from running containers, secrets empty.
const runtimeOnly = buildStagingRecommendation(runtime, null)
assert.deepEqual(
  runtimeOnly.services.map((s) => s.name),
  ["api-staging", "postgres-staging", "redis-staging"]
)
assert.deepEqual(runtimeOnly.secrets, [])

// A proxy container is never a staging service.
const withProxy = buildStagingRecommendation(
  { ...runtime, containers: [...runtime.containers, { name: "caddy-prod", image: "caddy:2", status: "Up", ports: "0.0.0.0:443->443/tcp" }] },
  null
)
assert.equal(withProxy.services.some((s) => s.sourceType === "other"), false)

console.log("staging-recommendation checks passed")
