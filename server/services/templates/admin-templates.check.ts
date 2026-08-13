import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { TEMPLATE_ROOT } from "./template-loader"
import { validateTemplateInput } from "./admin-templates"

/**
 * Run with `npm run check:admin-templates --workspace @tisiops/server`.
 *
 * The admin creator stores templates in Postgres, but the safety decision must
 * be testable without a database: parse YAML, validate schema, review secrets,
 * and refuse publishability when no approved runner is attached.
 */

const yamlContent = readFileSync(
  join(TEMPLATE_ROOT, "postgres/postgres-managed-server.yaml"),
  "utf8"
)

const valid = validateTemplateInput({
  templateId: "postgres-managed-server",
  name: "PostgreSQL Managed Server",
  description:
    "Create a managed PostgreSQL server with generated credentials and persistent storage.",
  category: "database",
  tags: ["postgresql", "database", "aws", "docker"],
  yamlContent,
  runnerType: "database-service-runner",
})

assert.equal(valid.valid, true)
assert.equal(valid.securityPassed, true)
assert.equal(valid.runnerSupported, true)
assert.ok(valid.manifest)
assert.ok(
  valid.warnings.some((warning) => warning.includes("publishes port 5432")),
  "public database ports must be visible to admins"
)

const noRunner = validateTemplateInput({
  templateId: "postgres-managed-server",
  name: "PostgreSQL Managed Server",
  description: "Runnerless template",
  category: "database",
  tags: [],
  yamlContent,
})

assert.equal(noRunner.valid, true)
assert.equal(noRunner.securityPassed, true)
assert.equal(noRunner.runnerSupported, false)

const exposedSecret = validateTemplateInput({
  templateId: "postgres-managed-server",
  name: "PostgreSQL Managed Server",
  description: "Bad template",
  category: "database",
  tags: [],
  yamlContent: yamlContent.replace("expose: false", "expose: true"),
  runnerType: "database-service-runner",
})

assert.equal(exposedSecret.valid, false)
assert.equal(exposedSecret.securityPassed, false)
assert.ok(
  exposedSecret.errors.some((error) => error.includes("must set expose: false"))
)

// The creator edits metadata in form fields, so the form wins over whatever the
// YAML happens to say. Refusing the mismatch instead made every rename a manual
// two-place edit, which is what "the template creator is not working" meant.
const renamed = validateTemplateInput({
  templateId: "postgres-lite",
  name: "PostgreSQL Lite",
  description: "A smaller managed PostgreSQL server.",
  category: "databases",
  tags: ["postgresql", "lite"],
  iconUrl: "postgresql",
  yamlContent,
  runnerType: "database-service-runner",
})

assert.equal(
  renamed.valid,
  true,
  `renaming in the form must not fail validation: ${renamed.errors.join(", ")}`
)
assert.equal(renamed.manifest?.metadata.id, "postgres-lite")
assert.equal(renamed.manifest?.metadata.name, "PostgreSQL Lite")
assert.equal(renamed.manifest?.metadata.description, "A smaller managed PostgreSQL server.")
assert.equal(renamed.manifest?.metadata.category, "databases")
assert.equal(renamed.manifest?.metadata.icon, "postgresql")
assert.deepEqual(renamed.manifest?.metadata.tags, ["postgresql", "lite"])

// An icon given as a URL is still a valid icon, but an id is an identifier and
// has to stay one — it ends up in template lookups and deployment records.
const badId = validateTemplateInput({
  templateId: "Postgres Lite",
  name: "PostgreSQL Lite",
  description: "A smaller managed PostgreSQL server.",
  category: "database",
  tags: [],
  yamlContent,
  runnerType: "database-service-runner",
})

assert.equal(badId.valid, false)
assert.ok(badId.errors.some((error) => error.toLowerCase().includes("template id")))

const missingName = validateTemplateInput({
  templateId: "postgres-lite",
  name: "   ",
  description: "A smaller managed PostgreSQL server.",
  category: "database",
  tags: [],
  yamlContent,
  runnerType: "database-service-runner",
})

assert.equal(missingName.valid, false)
assert.ok(missingName.errors.some((error) => error.toLowerCase().includes("name")))

console.log("admin template creator checks passed")
