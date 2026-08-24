import assert from "node:assert/strict"

import {
  buildStagingDeployScript,
  classifyStagingSecrets,
  missingUserSecrets,
  stagingPayloadFromPlan,
} from "./staging-execution"
import type { FinalStagingPlan } from "./staging-planning"

const plan: FinalStagingPlan = {
  source: "prod",
  repository: "api",
  owner: "company",
  productionBranch: "main",
  stagingBranch: "staging",
  target: "NEW_SERVER",
  provider: "AWS",
  region: "ap-south-1",
  resources: { cpu: 2, memoryGb: 4, diskGb: 30 },
  instanceType: "t3.medium",
  diskGb: 30,
  runtime: "Node.js 22",
  deploymentType: "Docker Compose",
  requiredEnvVars: ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "STRIPE_SECRET_KEY"],
  appPort: 3000,
  services: ["api-staging", "postgres-staging", "redis-staging"],
  executionSteps: ["Provision AWS server", "Verify staging"],
  isolation: {
    database: true,
    redis: true,
    volumes: true,
    environment: true,
    network: true,
  },
  actions: ["Provision AWS server", "Verify staging"],
}

const payload = stagingPayloadFromPlan("stg_1", plan)
assert.ok(payload)
assert.equal(payload.repositoryUrl, "https://github.com/company/api.git")
assert.equal(payload.stagingBranch, "staging")
assert.equal(payload.appPort, 3000)

assert.deepEqual(
  classifyStagingSecrets(plan.requiredEnvVars).map((secret) => secret.class),
  [
    "DERIVED_FROM_STAGING_SERVICE",
    "DERIVED_FROM_STAGING_SERVICE",
    "GENERATED",
    "USER_REQUIRED",
  ]
)
assert.deepEqual(missingUserSecrets(plan.requiredEnvVars), ["STRIPE_SECRET_KEY"])

const script = buildStagingDeployScript({
  deploymentId: "dep_123",
  payload: { ...payload, requiredEnvVars: [] },
})
assert.match(script, /git clone --depth 1 --branch 'staging'/)
assert.match(script, /docker compose -p 'tisiops_staging_dep123'/)
assert.match(script, /reverse_proxy 127\.0\.0\.1:3000/)
assert.doesNotMatch(script, /letsencrypt|route53|cloudflare|certbot/i)

console.log("staging-execution checks passed")
