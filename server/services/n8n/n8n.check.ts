import assert from "node:assert/strict"

import type { Deployment } from "../../db/generated/client"
import {
  buildCloudInit,
  buildFiles,
  buildWriteFiles,
  generateSecret,
  publicUrlFor,
} from "../bootstrap/n8nBootstrap.service"
import { validateN8nConfig, type N8nConfig } from "./plans"
import { buildProgress, N8N_START_STEPS } from "./progress"
import { scrub } from "../terraform/terraformRunner.service"

/**
 * Run with `npm run check:n8n --workspace @tisiops/server`.
 *
 * Covers the parts where a mistake costs money or leaks a secret: the
 * allowlists that gate AWS spend, the scrubber that keeps credentials out of
 * stored logs, and the templating guard on the bootstrap script.
 */

const base = {
  workspaceName: "Ops Automation",
  adminEmail: "ops@example.com",
  timezone: "Asia/Kolkata",
  region: "ap-south-1",
  plan: "STARTER",
  domainMode: "NONE",
  domain: null,
}

// --- Allowlists -------------------------------------------------------------

const ok = validateN8nConfig(base)
assert.equal(ok.ok, true)
assert.equal(ok.ok && ok.config.instanceType, "t3.micro")

// A region outside the allowlist is refused, not quietly replaced with the
// default — an approved plan must match what actually runs.
assert.equal(validateN8nConfig({ ...base, region: "us-west-2" }).ok, false)

// Neither is an unknown plan, which is how a larger instance would sneak in.
assert.equal(validateN8nConfig({ ...base, plan: "ENTERPRISE" }).ok, false)

assert.equal(validateN8nConfig({ ...base, adminEmail: "nope" }).ok, false)

// Every timezone the wizard offers must survive validation, or the dropdown
// hands the user a value the server then rejects.
for (const timezone of [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
]) {
  assert.equal(
    validateN8nConfig({ ...base, timezone }).ok,
    true,
    `${timezone} must validate`
  )
}

assert.equal(validateN8nConfig({ ...base, timezone: "Kolkata" }).ok, false)
assert.equal(validateN8nConfig({ ...base, workspaceName: "x" }).ok, false)

// CUSTOM without a usable hostname must fail: it decides the Caddy site block.
assert.equal(validateN8nConfig({ ...base, domainMode: "CUSTOM" }).ok, false)
assert.equal(
  validateN8nConfig({
    ...base,
    domainMode: "CUSTOM",
    domain: "n8n.example.com",
  }).ok,
  true
)

// --- Secret scrubbing -------------------------------------------------------

const secret = generateSecret()
const noisy = `applying with AWS_SECRET_ACCESS_KEY=abcd1234efgh and key ${secret}`
const scrubbed = scrub(noisy, [secret])

assert.ok(!scrubbed.includes(secret), "generated secret must not survive scrub")
assert.ok(!scrubbed.includes("abcd1234efgh"), "AWS secret must not survive")
assert.ok(scrubbed.includes("«redacted»"))
assert.ok(scrub("AKIAIOSFODNN7EXAMPLE", []).includes("«redacted»"))

// --- Bootstrap templating ---------------------------------------------------

const config: N8nConfig = {
  workspaceName: "Ops",
  adminEmail: "ops@example.com",
  timezone: "Asia/Kolkata",
  region: "ap-south-1",
  plan: "STARTER",
  instanceType: "t3.micro",
  rootVolumeGb: 20,
  domainMode: "CUSTOM",
  domain: "n8n.example.com",
}

const files = buildFiles({
  deploymentId: "abc123",
  config,
  secrets: { encryptionKey: "KEY_VALUE_X", dbPassword: "DB_VALUE_Y" },
})

assert.ok(files.env.includes("N8N_HOST=n8n.example.com"))
assert.ok(files.env.includes("WEBHOOK_URL=https://n8n.example.com/"))
assert.ok(files.env.includes("N8N_PROTOCOL=https"))
// Caddy needs the bare hostname as its site address to request a certificate.
assert.ok(files.caddyfile.includes("n8n.example.com {"))

// n8n must never be published to the host — Caddy is the only way in.
assert.ok(!files.compose.includes('"5678:5678"'))
assert.ok(files.compose.includes("expose:"))

// The compose file must keep ${...} literal for Compose to resolve; expanding
// it on the way in would write the password into the file in clear.
assert.ok(files.compose.includes("${POSTGRES_PASSWORD}"))

// A value carrying shell metacharacters must stop the build, not be templated
// into a script that runs as root.
assert.throws(() =>
  buildFiles({
    deploymentId: "abc123",
    config: { ...config, timezone: "Asia/Kolkata`id`" },
    secrets: { encryptionKey: "a", dbPassword: "b" },
  })
)

// Without a domain there is no certificate authority that will issue, so Caddy
// must fall back to plain HTTP rather than claiming HTTPS.
const plain = buildFiles({
  deploymentId: "abc123",
  config: { ...config, domainMode: "NONE", domain: null },
  secrets: { encryptionKey: "a1b2c3d4", dbPassword: "e5f6g7h8" },
  elasticIp: "13.1.2.3",
})

// Without a domain the address is the Elastic IP. "localhost" would resolve to
// the container itself and every registered webhook would point at nothing.
assert.ok(plain.env.includes("N8N_HOST=13.1.2.3"))
assert.ok(plain.env.includes("WEBHOOK_URL=http://13.1.2.3/"))
assert.ok(!plain.env.includes("localhost"))
assert.ok(plain.env.includes("N8N_PROTOCOL=http\n"))
assert.ok(plain.caddyfile.includes(":80 {"))

// Without HTTPS n8n will not set its session cookie, which makes the sign-in
// page unusable on a bare IP — so the secure cookie is off exactly there.
assert.ok(plain.env.includes("N8N_SECURE_COOKIE=false"))
// With a domain there is a certificate, so it stays on.
assert.ok(files.env.includes("N8N_SECURE_COOKIE=true"))

// Swap must exist before anything memory-hungry runs: a t3.micro has 1 GB and
// Postgres, n8n, and Caddy do not fit in it.
assert.ok(buildCloudInit().includes("mkswap"))

// The stack must be written under the documented per-deployment path.
assert.ok(
  buildWriteFiles({ deploymentId: "abc123", files }).includes(
    "/opt/tisiops/n8n/abc123"
  )
)

assert.equal(
  publicUrlFor({ ...config, domainMode: "NONE", domain: null }, "13.1.2.3"),
  "http://13.1.2.3"
)
assert.equal(publicUrlFor(config, "13.1.2.3"), "https://n8n.example.com")

// --- Progress ---------------------------------------------------------------

const deployment = (status: string, domain: string | null) =>
  ({
    status,
    domain,
    statusDetail: null,
    publicUrl: null,
  }) as unknown as Deployment

// No custom domain: the DNS step is skipped, not left pending forever.
const noDomain = buildProgress(deployment("PROVISIONING_INFRA", null), null)
assert.equal(
  noDomain.steps.find((step) => step.label.includes("DNS"))?.state,
  "skipped"
)
assert.ok(noDomain.percent > 0 && noDomain.percent < 100)

const withDomain = buildProgress(
  deployment("WAITING_FOR_DNS", "n8n.example.com"),
  "1.2.3.4"
)
assert.equal(
  withDomain.steps.find((step) => step.label.includes("DNS"))?.state,
  "current"
)

const finished = buildProgress(deployment("LIVE", null), "1.2.3.4")
assert.equal(finished.percent, 100)
assert.equal(finished.failed, false)

const failed = buildProgress(deployment("FAILED", null), null)
assert.equal(failed.failed, true)
assert.equal(failed.canRetry, true)

// --- Restart -----------------------------------------------------------------

// A stopped server offers one thing: start. It is not "deploying at 0%".
const stopped = buildProgress(deployment("STOPPED", null), "1.2.3.4", "STOPPED")
assert.equal(stopped.phase, "stopped")
assert.equal(stopped.percent, 100)

// Starting is its own phase. Reporting it as "stopped" put the start button
// back on screen while the start job was already running.
const startingUp = buildProgress(
  deployment("STARTING", null),
  "1.2.3.4",
  "STARTING"
)
assert.equal(startingUp.phase, "starting")
assert.equal(startingUp.canRetry, false)
assert.equal(startingUp.steps[0]?.state, "current")
assert.ok(startingUp.percent > 0 && startingUp.percent < 100)

// The restart timeline, never the deploy one — nothing is being provisioned.
assert.ok(!startingUp.steps.some((step) => step.label.includes("AWS")))
assert.deepEqual(
  startingUp.steps.map((step) => step.label),
  N8N_START_STEPS
)

// AWS reports the instance running: stage two, waiting on n8n itself.
const booted = buildProgress(deployment("STARTING", null), "1.2.3.4", "READY")
assert.equal(booted.steps[0]?.state, "done")
assert.equal(booted.steps[1]?.state, "current")
assert.ok(booted.percent > startingUp.percent)

console.log("n8n checks passed")
