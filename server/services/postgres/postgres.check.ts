import assert from "node:assert/strict"

import { JOB_TYPES } from "../../queues/deployment.types"
import {
  buildFiles,
  databaseUrl,
  generatePostgresPassword,
  maskDatabaseUrl,
} from "./bootstrap"
import { quickStartPlan } from "./console"
import { validatePostgresConfig } from "./plans"

const password = generatePostgresPassword()
assert.ok(password.length >= 32)

const url = databaseUrl({
  user: "tisiops_user",
  password,
  host: "13.1.2.3",
  port: 5432,
  database: "appdb",
})

const masked = maskDatabaseUrl({
  user: "tisiops_user",
  host: "13.1.2.3",
  port: 5432,
  database: "appdb",
})

assert.ok(url.includes(password))
assert.equal(masked, "postgresql://tisiops_user:<hidden>@13.1.2.3:5432/appdb")
assert.ok(!masked.includes(password))

const files = buildFiles({
  databaseName: "appdb",
  databaseUser: "tisiops_user",
  postgresVersion: "16-alpine",
  password,
  databaseUrl: url,
})

assert.ok(files.compose.includes('ports:\n      - "5432:5432"'))
assert.ok(files.env.includes("DATABASE_URL=postgresql://"))
assert.throws(() =>
  buildFiles({
    databaseName: "bad'name",
    databaseUser: "tisiops_user",
    postgresVersion: "16-alpine",
    password,
    databaseUrl: url,
  })
)

const config = validatePostgresConfig({
  databaseName: "appdb",
  databaseUser: "tisiops_user",
})
assert.equal(config.ok, true)

assert.equal(
  JOB_TYPES.POSTGRES_MANAGED_SERVER_DEPLOYMENT,
  "POSTGRES_MANAGED_SERVER_DEPLOYMENT"
)

const plan = quickStartPlan()
assert.equal(plan.find((line) => line.label === "Provider")?.value, "AWS EC2")
assert.equal(
  plan.find((line) => line.label === "Server")?.value,
  "t3.micro — 1 vCPU, 1 GB RAM"
)
assert.equal(
  plan.find((line) => line.label === "Disk")?.value,
  "20 GB encrypted gp3 root volume"
)
assert.equal(plan.find((line) => line.label === "Port")?.value, "5432")
assert.equal(
  plan.find((line) => line.label === "Connection string")?.value,
  "postgresql://tisiops_user:<hidden>@<server-ip>:5432/appdb"
)

console.log("postgres checks passed")
