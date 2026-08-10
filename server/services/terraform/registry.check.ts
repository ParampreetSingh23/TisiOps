import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  availableTemplates,
  findTemplate,
  TEMPLATES,
} from "./terraformTemplateRegistry"
import {
  SSH_OPEN_WARNING,
  validateTerraformVariables,
} from "./terraformVariableValidator"

/**
 * Run with `npm run check:registry --workspace @tisiops/server`.
 *
 * Guards the rule the whole architecture rests on: infrastructure comes from a
 * fixed module the registry names, and every variable reaching Terraform has
 * been checked against that template's allowlists.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODULES = path.resolve(HERE, "../../infra/terraform/modules")

const base = {
  template: "aws-n8n-server",
  deploymentId: "dep_123",
  projectName: "client-n8n",
  region: "ap-south-1",
  instanceType: "t3.micro",
}

// --- Every template points at a module that exists ---------------------------

for (const template of Object.values(TEMPLATES)) {
  const dir = path.join(MODULES, template.modulePath)

  assert.ok(
    existsSync(dir),
    `${template.name} points at a missing module: ${template.modulePath}`
  )

  // A module missing any of these is not a complete, runnable template.
  for (const file of ["main.tf", "variables.tf", "outputs.tf", "versions.tf"]) {
    assert.ok(
      existsSync(path.join(dir, file)),
      `${template.modulePath} is missing ${file}`
    )
  }

  // The module path is a fixed directory name, never a path the caller could
  // steer out of the modules directory.
  assert.ok(
    /^[a-z0-9-]+$/.test(template.modulePath),
    `${template.name} has an unsafe module path`
  )
}

// --- The happy path ----------------------------------------------------------

const ok = validateTerraformVariables(base)
assert.equal(ok.ok, true)

if (ok.ok) {
  assert.equal(ok.template.name, "aws-n8n-server")
  assert.equal(ok.variables.aws_region, "ap-south-1")
  assert.equal(ok.variables.instance_type, "t3.micro")
  // The application port comes from the registry, not the request — it has to
  // match what the bootstrap actually starts.
  assert.equal(ok.variables.app_port, 5678)
  assert.equal(ok.variables.volume_size, 20)
  // Closed by default: the bootstrap runs from cloud-init, so nothing signs in.
  assert.equal(ok.variables.allowed_ssh_cidr, "127.0.0.1/32")
  assert.deepEqual(ok.warnings, [])
  assert.equal(ok.variables.tags.TisiOpsTemplate, "aws-n8n-server")
}

// --- Refusals ----------------------------------------------------------------

// An unknown template cannot select a module.
assert.equal(
  validateTerraformVariables({ ...base, template: "evil" }).ok,
  false
)

// Nor can a path that tries to walk out of the modules directory.
assert.equal(
  validateTerraformVariables({ ...base, template: "../../etc" }).ok,
  false
)

// A template that has no working handler yet must not be deployable.
assert.equal(
  validateTerraformVariables({ ...base, template: "aws-node-server" }).ok,
  false
)

// Region outside the template's allowlist — refused, never corrected.
assert.equal(
  validateTerraformVariables({ ...base, region: "us-west-2" }).ok,
  false
)

// The expensive instance type. This is the assertion that guards the bill.
for (const instanceType of ["m5.24xlarge", "p4d.24xlarge", "t3.2xlarge"]) {
  assert.equal(
    validateTerraformVariables({ ...base, instanceType }).ok,
    false,
    `${instanceType} must be refused`
  )
}

// Volume size outside the template's range, and a non-integer.
assert.equal(validateTerraformVariables({ ...base, volumeSize: 5 }).ok, false)
assert.equal(
  validateTerraformVariables({ ...base, volumeSize: 5000 }).ok,
  false
)
assert.equal(
  validateTerraformVariables({ ...base, volumeSize: 20.5 }).ok,
  false
)

assert.equal(
  validateTerraformVariables({ ...base, projectName: "x" }).ok,
  false
)
assert.equal(
  validateTerraformVariables({ ...base, environment: "prod" }).ok,
  false
)

// A CIDR is the only thing that can become a security group rule.
assert.equal(
  validateTerraformVariables({ ...base, allowedSshCidr: "everyone" }).ok,
  false
)

// --- SSH warning -------------------------------------------------------------

const open = validateTerraformVariables({
  ...base,
  allowedSshCidr: "0.0.0.0/0",
})
assert.equal(open.ok, true)
assert.ok(
  open.ok && open.warnings.includes(SSH_OPEN_WARNING),
  "opening SSH to the world must warn"
)

// --- Project name and tags ---------------------------------------------------

const messy = validateTerraformVariables({
  ...base,
  projectName: "Client N8N!! Prod",
  tags: { "Bad Key!": "value; rm -rf /", Team: "ops" },
})

assert.equal(messy.ok, true)
if (messy.ok) {
  assert.equal(messy.variables.project_name, "client-n8n-prod")
  // Tag text is the one place free input reaches the provider, so both sides
  // are filtered rather than passed through.
  assert.ok(!JSON.stringify(messy.variables.tags).includes("!"))
  assert.equal(messy.variables.tags.Team, "ops")
}

// --- Availability ------------------------------------------------------------

assert.ok(availableTemplates().length >= 1)
assert.ok(availableTemplates().every((template) => template.available))
assert.equal(findTemplate("aws-n8n-server")?.bootstrap, "n8n")

console.log("registry checks passed")
