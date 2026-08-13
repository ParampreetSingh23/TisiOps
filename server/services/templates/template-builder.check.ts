import assert from "node:assert/strict"
import { parse } from "yaml"

import { validateTemplateInput } from "./admin-templates"
import {
  emptyManifest,
  manifestToYaml,
  normalizeManifest,
} from "./template-builder"
import { templateManifestSchema } from "./template.schema"

/**
 * Run with `npm run check:template-builder --workspace @tisiops/server`.
 *
 * The admin tab builds templates from form fields, not hand-written YAML. That
 * only works if the starting manifest is already valid and if the fields a
 * builder cannot sensibly ask about — which service is "public", which ports
 * the security group opens, which env keys are secrets — are derived from the
 * fields it does ask about. These checks pin that derivation, because a builder
 * that emits a manifest the validator rejects is a builder nobody can use.
 */

// --- The starting point must be deployable, not a stub ----------------------

const blank = emptyManifest()
assert.equal(
  templateManifestSchema.safeParse(blank).success,
  true,
  "a new template must start valid"
)

const blankReview = validateTemplateInput({
  templateId: blank.metadata.id,
  name: blank.metadata.name,
  description: blank.metadata.description,
  category: blank.metadata.category,
  tags: blank.metadata.tags,
  yamlContent: manifestToYaml(blank),
  runnerType: "docker-compose-server-runner",
})

assert.equal(blankReview.valid, true)
assert.equal(blankReview.securityPassed, true)
assert.equal(blankReview.runnerSupported, true)

// --- YAML is generated, so it has to survive a round trip -------------------

assert.deepEqual(
  templateManifestSchema.parse(parse(manifestToYaml(blank))),
  blank,
  "generated YAML must parse back to the same manifest"
)

// --- Derived fields ---------------------------------------------------------

const drifted = structuredClone(blank)
drifted.spec.services[0].public = false
drifted.spec.services[0].publicPorts = [80, 443]
drifted.spec.services.push({
  name: "worker",
  image: "redis:7",
  type: "PREBUILT",
  internalPort: 6379,
  public: true,
  publicPorts: [],
})
drifted.spec.security.publicPorts = []
drifted.spec.security.internalOnlyPorts = []
drifted.spec.security.secrets = ["POSTGRES_PASSWORD"]
drifted.spec.services[1].env = {
  POSTGRES_PASSWORD: { generated: true, default: "${GENERATED}" },
  REDIS_URL: { fromSecret: "POSTGRES_PASSWORD" },
  LOG_LEVEL: { default: "info" },
}

const fixed = normalizeManifest(drifted)

assert.equal(fixed.spec.services[0].public, true, "publishing ports means public")
assert.equal(
  fixed.spec.services[1].public,
  false,
  "publishing nothing means not public"
)
assert.deepEqual(
  fixed.spec.security.publicPorts,
  [80, 443],
  "the security group opens exactly what services publish"
)
assert.deepEqual(
  fixed.spec.security.internalOnlyPorts,
  [3000, 6379],
  "unpublished internal ports are internal only"
)
assert.deepEqual(
  fixed.spec.security.secrets,
  ["POSTGRES_PASSWORD"],
  "declared secrets are the generated env keys, nothing else"
)

const password = fixed.spec.services[1].env?.POSTGRES_PASSWORD
assert.equal(password?.secret, true, "a generated value is a secret")
assert.equal(password?.expose, false, "a generated value is never exposed")

const redisUrl = fixed.spec.services[1].env?.REDIS_URL
assert.equal(redisUrl?.secret, true, "a value read from a secret is a secret")
assert.equal(redisUrl?.expose, false)

assert.equal(
  fixed.spec.services[1].env?.LOG_LEVEL?.secret,
  undefined,
  "ordinary env vars are left alone"
)

// The whole point: whatever the admin builds in the form passes the validator.
const fixedReview = validateTemplateInput({
  templateId: fixed.metadata.id,
  name: fixed.metadata.name,
  description: fixed.metadata.description,
  category: fixed.metadata.category,
  tags: fixed.metadata.tags,
  yamlContent: manifestToYaml(fixed),
  runnerType: "docker-compose-server-runner",
})

assert.equal(
  fixedReview.valid,
  true,
  `normalized manifests must validate: ${fixedReview.errors.join(", ")}`
)
assert.equal(fixedReview.securityPassed, true)

// Normalizing is a builder convenience, never a way past the validator: the
// strict rules still run on whatever is submitted.
const exposed = structuredClone(blank)
exposed.spec.services[0].env = {
  ADMIN_TOKEN: { generated: true, secret: true, expose: true },
}

const exposedReview = validateTemplateInput({
  templateId: exposed.metadata.id,
  name: exposed.metadata.name,
  description: exposed.metadata.description,
  category: exposed.metadata.category,
  tags: exposed.metadata.tags,
  yamlContent: manifestToYaml(exposed),
  runnerType: "docker-compose-server-runner",
})

assert.equal(exposedReview.valid, false)
assert.ok(
  exposedReview.errors.some((error) => error.includes("expose: false")),
  "the validator still refuses an exposed secret"
)

console.log("template builder checks passed")
