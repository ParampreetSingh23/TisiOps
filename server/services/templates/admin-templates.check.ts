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

console.log("admin template creator checks passed")
