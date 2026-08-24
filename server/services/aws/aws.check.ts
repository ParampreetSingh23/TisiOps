import assert from "node:assert/strict"

import type { Deployment } from "../../db/generated/client"
import { JOB_TYPES } from "../../queues/deployment.types"
import { buildProgress } from "../n8n/progress"
import { TEMPLATES } from "../terraform/terraformTemplateRegistry"
import { buildCloudInit, parseSystemFacts, SYSTEM_FACTS } from "./bootstrap"
import {
  AWS_SERVER_STEPS,
  AWS_SERVER_TEMPLATE,
  awsServerOptions,
  awsServerPlan,
  validateAwsServerConfig,
} from "./plans"

const TEMPLATE = TEMPLATES[AWS_SERVER_TEMPLATE]

// Defaults come from the registry, not from plans.ts.
const defaults = validateAwsServerConfig({ projectName: "my-server" })
assert.equal(defaults.ok, true)
assert.ok(defaults.ok)
assert.equal(defaults.config.region, TEMPLATE.allowedRegions[0])
assert.equal(defaults.config.instanceType, TEMPLATE.defaultInstanceType)
assert.equal(defaults.config.volumeSizeGb, TEMPLATE.volumeSizeGb.default)

// Names are slugged, not rejected for case or spaces.
const slugged = validateAwsServerConfig({ projectName: "My Web Server" })
assert.ok(slugged.ok)
assert.equal(slugged.config.projectName, "my-web-server")

// Too short after slugging.
assert.equal(validateAwsServerConfig({ projectName: "ab" }).ok, false)
assert.equal(validateAwsServerConfig({ projectName: "!!" }).ok, false)
assert.equal(validateAwsServerConfig({}).ok, false)

// Out-of-allowlist values are refused, never corrected.
assert.equal(
  validateAwsServerConfig({ projectName: "my-server", region: "us-west-1" }).ok,
  false
)
assert.equal(
  validateAwsServerConfig({ projectName: "my-server", instanceType: "m5.24xlarge" }).ok,
  false
)

// Disk bounds and integers.
assert.equal(
  validateAwsServerConfig({ projectName: "my-server", volumeSizeGb: TEMPLATE.volumeSizeGb.min - 1 }).ok,
  false
)
assert.equal(
  validateAwsServerConfig({ projectName: "my-server", volumeSizeGb: TEMPLATE.volumeSizeGb.max + 1 }).ok,
  false
)
assert.equal(
  validateAwsServerConfig({ projectName: "my-server", volumeSizeGb: 20.5 }).ok,
  false
)

const custom = validateAwsServerConfig({
  projectName: "my-server",
  region: "us-east-1",
  instanceType: "t3.small",
  volumeSizeGb: 40,
})
assert.ok(custom.ok)
assert.deepEqual(custom.config, {
  projectName: "my-server",
  region: "us-east-1",
  instanceType: "t3.small",
  volumeSizeGb: 40,
})

// The plan states the chosen config, not a hardcoded default.
const plan = awsServerPlan(custom.config)
const line = (label: string) => plan.find((row) => row.label === label)?.value
assert.equal(line("Region"), "us-east-1")
assert.equal(line("Instance"), "t3.small — 2 vCPU, 2 GB RAM")
assert.equal(line("Disk"), "40 GB encrypted gp3 root volume")
assert.equal(line("Server name"), "my-server")
assert.equal(line("Terraform module"), TEMPLATE.modulePath)

// Options never widen the registry.
const options = awsServerOptions()
assert.deepEqual(options.regions, TEMPLATE.allowedRegions)
assert.deepEqual(
  options.instanceTypes.map((entry) => entry.type),
  TEMPLATE.allowedInstanceTypes
)
assert.ok(options.instanceTypes.every((entry) => entry.specs.length > 0))

assert.equal(JOB_TYPES.AWS_APP_DEPLOYMENT, "AWS_APP_DEPLOYMENT")

// The run driver refuses an unavailable template, so the flag must be on.
assert.equal(TEMPLATE.available, true)

// --- Cloud-init -------------------------------------------------------------

const cloudInit = buildCloudInit()
assert.ok(cloudInit.startsWith("#!/bin/bash"))
assert.ok(cloudInit.includes("set -euxo pipefail"))
// Only the ports the plan promises, and the firewall closed by default.
assert.ok(cloudInit.includes("ufw default deny incoming"))
for (const port of ["22/tcp", "80/tcp", "443/tcp"]) {
  assert.ok(cloudInit.includes(`ufw allow ${port}`))
}
assert.equal((cloudInit.match(/ufw allow /g) ?? []).length, 3)
// A clean Ubuntu machine: the template promises nothing is installed on it.
assert.ok(!/apt-get install|docker|curl -fsSL/.test(cloudInit))

// --- System facts -----------------------------------------------------------

// One command, so a single SSH round trip returns every fact.
assert.ok(!SYSTEM_FACTS.includes("\n"))
for (const key of ["OS=", "CPU=", "MEM=", "DISK=", "DOCKER="]) {
  assert.ok(SYSTEM_FACTS.includes(key))
}

const facts = parseSystemFacts(
  [
    "OS=Ubuntu 24.04.1 LTS",
    "CPU=2 vCPU",
    "MEM=964",
    "DISK=20",
    "DOCKER=NOT_INSTALLED",
  ].join("\n")
)
assert.deepEqual(facts, {
  osType: "Ubuntu",
  osVersion: "Ubuntu 24.04.1 LTS",
  cpuInfo: "2 vCPU",
  memoryMb: 964,
  diskGb: 20,
  dockerStatus: "NOT_INSTALLED",
})

// Missing or unreadable numbers become null rather than a false zero.
const empty = parseSystemFacts("")
assert.equal(empty.memoryMb, null)
assert.equal(empty.diskGb, null)
assert.equal(empty.osVersion, null)
assert.equal(empty.dockerStatus, "NOT_INSTALLED")
assert.equal(parseSystemFacts("MEM=0\nDISK=0").diskGb, null)
assert.equal(parseSystemFacts("DOCKER=INSTALLED").dockerStatus, "INSTALLED")

// --- Progress ---------------------------------------------------------------

const deployment = (status: string) =>
  ({ status, domain: null, statusDetail: null, publicUrl: null }) as unknown as Deployment

const steps = (status: string) =>
  buildProgress(deployment(status), null, null, AWS_SERVER_STEPS)

// The AWS timeline is drawn, not the n8n one — no DNS, no SSL, no n8n install.
const queued = steps("QUEUED")
assert.deepEqual(
  queued.steps.map((step) => step.label),
  AWS_SERVER_STEPS.map((step) => step.label)
)
assert.ok(queued.percent > 0 && queued.percent < 100)
assert.equal(queued.steps.filter((step) => step.state === "current").length, 1)

// Every status the driver sets must exist in the timeline, or the screen stalls.
for (const status of ["PROVISIONING_INFRA", "HEALTH_CHECKING"]) {
  assert.equal(
    steps(status).steps.find((step) => step.state === "current")?.label,
    AWS_SERVER_STEPS.find((step) => step.status === status)?.label
  )
}

assert.equal(steps("LIVE").percent, 100)
assert.equal(steps("LIVE").failed, false)
assert.equal(steps("FAILED").failed, true)
assert.equal(steps("FAILED").canRetry, true)

console.log("aws checks passed")
