import assert from "node:assert/strict"

import { quickStartPlan } from "../n8n/console"
import { ALLOWED_REGIONS, DEFAULT_REGION, findPlan } from "../n8n/plans"
import { TEMPLATES } from "../terraform/terraformTemplateRegistry"
import { loadTemplateFile, TEMPLATE_ROOT } from "./template-loader"
import {
  ALLOWED_PUBLIC_PORTS,
  NEVER_PUBLIC_PORTS,
  templateManifestSchema,
} from "./template.schema"
import {
  getTemplateById,
  listTemplates,
  summarize,
  UnknownTemplateError,
} from "./template-registry"

/**
 * Run with `npm run check:templates --workspace @tisiops/server`.
 *
 * Two jobs. First, the manifest is valid and safe — the ports and secrets it
 * describes match what TisiOps actually deploys. Second, it agrees with the
 * allowlists that do the real gating, because a manifest that says one region
 * while validateN8nConfig enforces another is a card that lies to the person
 * approving the deployment.
 */

// --- 1. The YAML loads, and 2. it validates ----------------------------------

const manifest = loadTemplateFile("n8n/aws-n8n-server.yaml")

assert.ok(TEMPLATE_ROOT.endsWith("/templates"))
assert.equal(manifest.apiVersion, "tisiops.com/v1")
assert.equal(manifest.kind, "Template")
assert.equal(manifest.metadata.id, "aws-n8n-server")
assert.equal(manifest.metadata.name, "n8n Managed Server")

// --- 3. Required services ----------------------------------------------------

const services = new Map(manifest.spec.services.map((s) => [s.name, s]))

for (const name of ["postgres", "n8n", "caddy"]) {
  assert.ok(services.has(name), `${name} service must exist`)
}

// --- 4. Dependencies ---------------------------------------------------------

for (const service of manifest.spec.services) {
  for (const dependency of service.dependsOn ?? []) {
    assert.ok(
      services.has(dependency),
      `${service.name} depends on missing ${dependency}`
    )
  }
}

assert.deepEqual(services.get("n8n")?.dependsOn, ["postgres"])
assert.deepEqual(services.get("caddy")?.dependsOn, ["n8n"])

// --- 5, 6, 7. Ports ----------------------------------------------------------

assert.deepEqual(manifest.spec.security.publicPorts, [80])
assert.deepEqual(services.get("caddy")?.publicPorts, [80])

for (const port of NEVER_PUBLIC_PORTS) {
  assert.ok(
    manifest.spec.security.internalOnlyPorts.includes(port),
    `${port} must be internal only`
  )

  for (const service of manifest.spec.services) {
    assert.ok(
      !(service.publicPorts ?? []).includes(port),
      `${service.name} must not publish ${port}`
    )
  }
}

// n8n and Postgres are reachable only from inside the Compose network.
assert.equal(services.get("n8n")?.public, false)
assert.equal(services.get("postgres")?.public, false)
assert.equal(services.get("caddy")?.public, true)

// --- 8. Secrets --------------------------------------------------------------

const SECRETS = ["POSTGRES_PASSWORD", "N8N_ENCRYPTION_KEY"]

for (const service of manifest.spec.services) {
  for (const [key, variable] of Object.entries(service.env ?? {})) {
    if (!SECRETS.includes(key) && !variable.fromSecret) continue

    assert.equal(variable.secret, true, `${key} must be marked secret`)
    assert.equal(variable.expose, false, `${key} must not be exposed`)
    assert.equal(
      variable.default,
      undefined,
      `${key} must not carry a value in the manifest`
    )
  }
}

// The manifest is committed, so a real secret in it would be a leak.
const raw = JSON.stringify(manifest)
for (const pattern of [/AKIA[0-9A-Z]{16}/, /redis:\/\//, /rediss:\/\//]) {
  assert.ok(!pattern.test(raw), `manifest must not contain ${pattern}`)
}

// --- 9. Registry -------------------------------------------------------------

assert.equal(getTemplateById("aws-n8n-server").metadata.id, "aws-n8n-server")
assert.deepEqual(
  listTemplates().map((template) => template.metadata.id),
  ["aws-n8n-server"]
)

const summary = summarize(manifest)
assert.equal(summary.accessMode, "ELASTIC_IP_HTTP")
assert.equal(summary.provider, "aws")
assert.deepEqual(summary.services, ["postgres", "n8n", "caddy"])

// --- 10. Unknown ids fail, they do not fall back -----------------------------

assert.throws(() => getTemplateById("nope"), UnknownTemplateError)
assert.throws(() => getTemplateById("../../etc/passwd"), UnknownTemplateError)

// --- Invalid manifests are refused, never repaired ---------------------------

const clone = () => JSON.parse(JSON.stringify(manifest))

const broken: [string, (m: any) => void][] = [
  ["wrong apiVersion", (m) => (m.apiVersion = "v1")],
  ["wrong kind", (m) => (m.kind = "Deployment")],
  ["missing id", (m) => delete m.metadata.id],
  ["no services", (m) => (m.spec.services = [])],
  [
    "duplicate service names",
    (m) => m.spec.services.push({ ...m.spec.services[0] }),
  ],
  ["unknown dependency", (m) => (m.spec.services[1].dependsOn = ["redis"])],
  ["public 5678", (m) => (m.spec.services[2].publicPorts = [80, 5678])],
  ["public 5432", (m) => (m.spec.security.publicPorts = [80, 5432])],
  ["port 8080 published", (m) => (m.spec.services[2].publicPorts = [8080])],
  ["5678 not internal", (m) => (m.spec.security.internalOnlyPorts = [5432])],
  [
    "secret not marked",
    (m) => (m.spec.services[0].env.POSTGRES_PASSWORD.secret = false),
  ],
  [
    "secret exposed",
    (m) => (m.spec.services[0].env.POSTGRES_PASSWORD.expose = true),
  ],
  [
    "secret carries a value",
    (m) => (m.spec.services[0].env.POSTGRES_PASSWORD.default = "hunter2"),
  ],
  ["missing postgres", (m) => m.spec.services.shift()],
  ["no health check", (m) => (m.spec.healthChecks = [])],
  ["no instructions", (m) => (m.spec.instructions = [])],
]

for (const [label, mutate] of broken) {
  const candidate = clone()
  mutate(candidate)
  assert.equal(
    templateManifestSchema.safeParse(candidate).success,
    false,
    `${label} must be refused`
  )
}

// --- The manifest agrees with the allowlists that do the gating --------------

const registry = TEMPLATES["aws-n8n-server"]

assert.equal(manifest.spec.defaults.region, DEFAULT_REGION)
assert.ok(ALLOWED_REGIONS.includes(manifest.spec.defaults.region))
assert.ok(
  registry.allowedInstanceTypes.includes(manifest.spec.defaults.instanceType)
)
assert.equal(manifest.spec.defaults.instanceType, findPlan("STARTER")?.instanceType)
assert.equal(manifest.spec.defaults.volumeSizeGb, findPlan("STARTER")?.rootVolumeGb)
// The port Caddy proxies to has to be the port Terraform opens for the app.
assert.equal(manifest.spec.access.internalAppPort, registry.appPort)
assert.ok(ALLOWED_PUBLIC_PORTS.includes(manifest.spec.access.publicPort))

// --- 11 & 12. The existing n8n flow is unchanged -----------------------------
//
// The deployment path itself is covered by `npm run check:n8n`, which still
// asserts the real Compose file, Caddyfile, and env. What belongs here is the
// one place the manifest reaches the running product: the console plan card.

const lines = quickStartPlan()
const value = (label: string) => lines.find((line) => line.label === label)?.value

assert.equal(value("Template"), "n8n Managed Server")
assert.ok(value("Region")?.startsWith("ap-south-1"))
assert.equal(value("Access"), "Elastic IP over HTTP")
assert.equal(value("Stack"), "Docker + Postgres + n8n + Caddy")
assert.equal(value("Final URL"), "http://<Elastic-IP>")

// The approval reply in index.ts closes with this instruction by title. A
// rename in the manifest would silently drop it from the message.
assert.ok(
  manifest.spec.instructions.some((entry) => entry.title === "First login"),
  "the manifest must keep the First login instruction"
)

console.log("template manifest checks passed")
