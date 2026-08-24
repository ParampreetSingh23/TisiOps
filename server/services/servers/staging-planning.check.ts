import assert from "node:assert/strict"

import type { ProductionRuntime } from "./production-runtime-parse"
import type { CodeProfile } from "../github/analyze"
import {
  buildFinalStagingPlan,
  checkCompatibility,
  recommendResources,
  STAGING_TARGET_OPTIONS,
  stagingTargetFromText,
} from "./staging-planning"

const runtime: ProductionRuntime = {
  os: "Ubuntu 24.04",
  cpuCount: 4,
  memoryMb: 8192,
  diskGb: 40,
  docker: { status: "Running", version: "27.0.0" },
  composeProjects: ["api"],
  containers: [
    { name: "api-prod", image: "nginx:latest", status: "Up", ports: "0.0.0.0:443->443/tcp" },
    { name: "postgres-prod", image: "postgres:16", status: "Up", ports: "5432/tcp" },
  ],
  images: ["nginx:latest", "postgres:16"],
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
  environment: ["DATABASE_URL"],
  deployment: "Docker Compose",
}

// Target options.
assert.equal(STAGING_TARGET_OPTIONS.length, 3)
assert.equal(STAGING_TARGET_OPTIONS.find((o) => o.recommended)?.target, "NEW_SERVER")
assert.equal(stagingTargetFromText("create a new server"), "NEW_SERVER")
assert.equal(stagingTargetFromText("use an existing server"), "EXISTING_SERVER")
assert.equal(stagingTargetFromText("same production server"), "SAME_SERVER")
assert.equal(stagingTargetFromText("select a target in the ocean"), null)

// Resources for NEW_SERVER (production 4 vCPU / 8 GB / 40 GB -> 2 / 4 / 30).
assert.deepEqual(recommendResources(runtime), { cpu: 2, memoryGb: 4, diskGb: 30 })

// NEW_SERVER: always compatible.
const newCompat = checkCompatibility(recommendResources(runtime), null, "NEW_SERVER")
assert.equal(newCompat.compatible, true)

// EXISTING_SERVER: sufficient target.
const existing = {
  ...runtime,
  memoryMb: 7168,
  diskGb: 80,
  containers: [],
}
const existingOk = checkCompatibility(recommendResources(runtime), existing, "EXISTING_SERVER")
assert.equal(existingOk.compatible, true)
assert.deepEqual(
  existingOk.checks.map((c) => c.ok),
  [true, true, true]
)

// EXISTING_SERVER: insufficient target.
const small = { ...runtime, memoryMb: 2048, diskGb: 10 }
const existingBad = checkCompatibility(recommendResources(runtime), small, "EXISTING_SERVER")
assert.equal(existingBad.compatible, false)
assert.match(
  existingBad.checks.find((c) => c.label === "RAM")!.available,
  /2 GB/
)

// SAME_SERVER: app port free -> compatible; port in use -> not recommended.
const sameFree = checkCompatibility(recommendResources(runtime), runtime, "SAME_SERVER", 3000)
assert.equal(sameFree.compatible, true)
assert.equal(sameFree.checks.find((c) => c.label === "Port availability")!.ok, true)

const sameBusy = checkCompatibility(
  recommendResources(runtime),
  { ...runtime, containers: [...runtime.containers, { name: "x", image: "x", status: "Up", ports: "0.0.0.0:3000->3000/tcp" }] },
  "SAME_SERVER",
  3000
)
assert.equal(sameBusy.compatible, false)
assert.match(sameBusy.reason, /not recommended/i)

// Final staging plan.
const plan = buildFinalStagingPlan({
  source: "ubuntu-prod-01",
  codeProfile,
  runtime,
  target: "NEW_SERVER",
})
assert.equal(plan.source, "ubuntu-prod-01")
assert.equal(plan.repository, "api")
assert.equal(plan.productionBranch, "main")
assert.equal(plan.stagingBranch, "staging")
assert.equal(plan.target, "NEW_SERVER")
assert.equal(plan.provider, "AWS")
assert.equal(plan.region, "ap-south-1")
assert.deepEqual(plan.resources, { cpu: 2, memoryGb: 4, diskGb: 30 })
assert.equal(plan.instanceType, "t3.medium")
assert.equal(plan.diskGb, 30)
assert.equal(plan.runtime, "Node.js 22")
assert.equal(plan.deploymentType, "Docker Compose")
assert.deepEqual(plan.requiredEnvVars, ["DATABASE_URL"])
assert.equal(plan.appPort, 3000)
assert.deepEqual(plan.services, ["api-staging", "postgres-staging", "redis-staging"])
assert.equal(plan.isolation.database, true)
assert.equal(plan.isolation.volumes, true)
assert.equal(plan.isolation.redis, true)
assert.equal(plan.isolation.network, true)
assert.equal("domain" in plan.isolation, false)
assert.equal(plan.actions.includes("Configure domain"), false)
assert.ok(plan.actions.includes("Provision AWS server"))
assert.ok(plan.actions.includes("Verify staging"))
assert.deepEqual(plan.executionSteps, plan.actions)

// EXISTING/SAME target: no "Provision server" action.
const existingPlan = buildFinalStagingPlan({
  source: "ubuntu-prod-01",
  codeProfile,
  runtime,
  target: "EXISTING_SERVER",
})
assert.equal(existingPlan.provider, null)
assert.equal(existingPlan.actions.includes("Provision AWS server"), false)

console.log("staging-planning checks passed")
