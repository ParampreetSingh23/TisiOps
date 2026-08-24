import assert from "node:assert/strict"

import type { CodeProfile } from "../github/analyze"
import type { ProductionRuntime } from "./production-runtime-parse"
import { buildBlueprint, detectDrift } from "./production-blueprint"

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
  environment: ["DATABASE_URL", "REDIS_URL"],
  deployment: "Docker Compose",
}

function runtime(partial: Partial<ProductionRuntime>): ProductionRuntime {
  return {
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
    ...partial,
  }
}

// Healthy system: no drift.
const healthy = runtime({})
assert.deepEqual(detectDrift(codeProfile, healthy), [])

// Node version + declared-but-down Redis.
const drifting = runtime({
  runtimes: [{ name: "node", version: "20.11.1" }],
  redis: "down",
})
assert.deepEqual(detectDrift(codeProfile, drifting), [
  {
    field: "runtime",
    expected: "Node 22",
    actual: "Node 20",
    severity: "warning",
    detail: "Repository expects Node 22 but production runs Node 20.",
  },
  {
    field: "redis",
    expected: "running",
    actual: "not running",
    severity: "critical",
    detail: "The repository depends on Redis, but Redis is not currently running.",
  },
])

// Blueprint assembly from code + runtime.
const blueprint = buildBlueprint({
  codeProfile,
  runtime: healthy,
  deployments: [{ template: "aws-app-server", provider: "TISIOPS_MANAGED_AWS", type: "AWS_SERVER" }],
  monitoring: { cpuPercent: 62, memoryPercent: 48, diskPercent: 33, collectedAt: "2026-01-01T00:00:00Z" },
})

assert.equal(blueprint.repository, "api")
assert.equal(blueprint.owner, "company")
assert.equal(blueprint.branch, "main")
assert.equal(blueprint.commit, "abc1234")
assert.equal(blueprint.runtime, "Node.js 22")
assert.equal(blueprint.deployment, "Docker Compose")
assert.deepEqual(blueprint.services, ["api", "postgres", "redis"])
assert.equal(blueprint.proxy, "Caddy")
assert.ok(blueprint.networking.includes("443 -> Caddy -> app:3000"))
assert.ok(blueprint.persistentData.includes("Postgres volume"))
assert.deepEqual(blueprint.environment, ["DATABASE_URL", "REDIS_URL"])
assert.equal(blueprint.deployments.length, 1)
assert.equal(blueprint.monitoring?.cpuPercent, 62)
assert.deepEqual(blueprint.drift, [])

// Blueprint without a code profile falls back to the git remote.
const codeOnly = buildBlueprint({
  codeProfile: null,
  runtime: healthy,
  deployments: [],
  monitoring: null,
})
assert.equal(codeOnly.repository, "api")
assert.equal(codeOnly.owner, "company")

console.log("production-blueprint checks passed")
