import assert from "node:assert/strict"

import { detectIntent, isTerraformIntent } from "../github/intent"
import {
  generateCleanupPlan,
  generateRetryPlan,
  proposeTerraformDeployment,
  detectDrift,
  explainInspection,
} from "./terraformAgentPlans"
import type { TerraformInspection } from "./terraformInspection"
import { diagnoseTerraformFailure } from "./terraformDiagnostics"
import { stateKey, TEMPLATES } from "./terraformTemplateRegistry"

/**
 * Run with `npm run check:agent --workspace @tisiops/server`.
 *
 * Guards what the Terraform Agent is allowed to be: it emits variables and
 * prose, never Terraform; it refuses unsafe values; destroying always demands
 * a typed confirmation; and failures come back as advice rather than provider
 * output.
 */

const base = {
  template: "aws-n8n-server",
  deploymentId: "dep_123",
  projectName: "client-n8n",
  region: "ap-south-1",
  instanceType: "t3.micro",
}

// --- The proposal is structured data, never Terraform ------------------------

const proposal = proposeTerraformDeployment(base)
assert.equal(proposal.ok, true)

if (proposal.ok) {
  const { proposal: p } = proposal
  assert.equal(p.template, "aws-n8n-server")
  assert.equal(p.riskLevel, "medium")
  // Anything that creates billable infrastructure must stop for a human.
  assert.equal(p.requiresApproval, true)
  assert.equal(p.variables.instance_type, "t3.micro")

  // The whole point: no HCL anywhere in what the agent hands downstream.
  const serialized = JSON.stringify(p)
  for (const hcl of ['resource "', 'provider "', "terraform {", 'module "']) {
    assert.ok(
      !serialized.includes(hcl),
      `agent output must never contain Terraform source: ${hcl}`
    )
  }
}

// --- It refuses what the validator refuses -----------------------------------

assert.equal(
  proposeTerraformDeployment({ ...base, region: "us-west-2" }).ok,
  false
)
assert.equal(
  proposeTerraformDeployment({ ...base, instanceType: "m5.24xlarge" }).ok,
  false
)
assert.equal(
  proposeTerraformDeployment({ ...base, template: "aws-node-server" }).ok,
  false
)

// --- Failure diagnosis -------------------------------------------------------

const cases: [string, string][] = [
  [
    "InvalidClientTokenId: The security token included is invalid",
    "AWS_CREDENTIALS_INVALID",
  ],
  [
    "UnauthorizedOperation: You are not authorized to perform this operation",
    "AWS_PERMISSION_DENIED",
  ],
  ["Error: creating EC2 Instance: InstanceLimitExceeded", "EC2_QUOTA_EXCEEDED"],
  [
    "AddressLimitExceeded: The maximum number of addresses has been reached",
    "EIP_QUOTA_EXCEEDED",
  ],
  [
    "Unsupported: The requested instance type is not supported",
    "INSTANCE_TYPE_UNSUPPORTED",
  ],
  ["InvalidAMIID.NotFound: The image id does not exist", "AMI_NOT_FOUND"],
  [
    "Error acquiring the state lock: ConditionalCheckFailedException",
    "STATE_LOCKED",
  ],
  ["Error: Failed to load state: NoSuchBucket", "STATE_MISSING"],
  ["Throttling: Rate exceeded", "AWS_THROTTLED"],
  [
    "Failed to install provider from registry.terraform.io: connection reset",
    "PROVIDER_DOWNLOAD_FAILED",
  ],
  ["terraform could not start: spawn terraform ENOENT", "TERRAFORM_MISSING"],
  [
    "InvalidGroup.Duplicate: the security group already exists",
    "SECURITY_GROUP_CONFLICT",
  ],
]

for (const [output, expected] of cases) {
  const diagnosis = diagnoseTerraformFailure(output)
  assert.equal(diagnosis.code, expected, `"${output}" should be ${expected}`)
  assert.ok(diagnosis.message.length > 0)
  // Every message must be a sentence for a person, not echoed provider text.
  assert.ok(!diagnosis.message.includes(output))
}

// A quota failure cannot be fixed by pressing retry, and must not claim it can.
assert.equal(diagnoseTerraformFailure("AddressLimitExceeded").retryable, false)
assert.equal(
  diagnoseTerraformFailure("Throttling: Rate exceeded").retryable,
  true
)

// Empty output still produces advice rather than a blank error.
assert.equal(diagnoseTerraformFailure("").code, "UNKNOWN")
assert.ok(diagnoseTerraformFailure("").nextStep.length > 0)

// --- Plans -------------------------------------------------------------------

const inspection: TerraformInspection = {
  deploymentId: "dep_123",
  template: "aws-n8n-server",
  region: "ap-south-1",
  status: "LIVE",
  statusDetail: null,
  planSummary: "Plan: 5 to add, 0 to change, 0 to destroy.",
  outputs: { instanceId: "i-0abc" },
  state: {
    key: stateKey("aws-n8n-server", "dep_123"),
    backend: "local",
    hasRecordedOutputs: true,
    workingDirectory: "/tmp/x",
  },
  server: {
    instanceId: "i-0abc",
    elasticIp: "13.1.2.3",
    publicIp: "13.1.2.3",
    securityGroupId: "sg-1",
    instanceType: "t3.micro",
    region: "ap-south-1",
    status: "READY",
  },
  lastJob: null,
  diagnosis: null,
  canRetry: true,
  canDestroy: true,
}

assert.equal(
  inspection.state.key,
  "terraform/aws-n8n-server/dep_123/terraform.tfstate"
)

const retry = generateRetryPlan(inspection)
assert.equal(retry.requiresApproval, true)
// A user who fears a retry will double their bill will not press it, so the
// state reuse has to be stated.
assert.ok(retry.steps.some((step) => step.includes("Reuse the existing")))
// Local state is the case where a retry genuinely can duplicate resources.
assert.ok(retry.warnings.some((warning) => warning.includes("local")))

const cleanup = generateCleanupPlan(inspection)
assert.equal(cleanup.confirmationPhrase, "DELETE")
assert.equal(cleanup.requiresApproval, true)
assert.ok(
  cleanup.warnings.some((warning) => warning.includes("cannot be undone"))
)

// Drift: live, but TisiOps never recorded the address.
assert.equal(detectDrift(inspection), null)
const missing = detectDrift({
  ...inspection,
  server: { ...inspection.server!, elasticIp: null },
})
assert.ok(missing && missing.steps.some((step) => step.includes("Elastic IP")))

// A deployment still building has nothing to reconcile yet.
assert.equal(detectDrift({ ...inspection, status: "RUNNING" }), null)

// --- Explanation -------------------------------------------------------------

const explanation = explainInspection(inspection)
assert.ok(explanation.includes("aws-n8n-server"))
assert.ok(explanation.includes("13.1.2.3"))
assert.ok(explanation.includes("development only"))

// --- Console routing ---------------------------------------------------------

for (const text of [
  "What will Terraform create?",
  "Why did Terraform fail?",
  "Show my Terraform plan",
  "Did Terraform attach Elastic IP?",
  "Why is my AWS server missing public IP?",
  "Check Terraform state",
  "Can I retry this Terraform deployment?",
  "Destroy this deployment",
  "Clean up failed resources",
]) {
  assert.equal(isTerraformIntent(text), true, `should route: ${text}`)
  assert.equal(detectIntent(text), "terraform_agent", `intent for: ${text}`)
}

// Repository questions must keep going to the GitHub agent.
for (const text of [
  "list my repositories",
  "analyse my repo for deployability",
  "which repos can I deploy",
]) {
  assert.notEqual(
    detectIntent(text),
    "terraform_agent",
    `must not route: ${text}`
  )
}

// --- Registry completeness ---------------------------------------------------

for (const template of Object.values(TEMPLATES)) {
  // Anything that can create infrastructure must be destroyable and must
  // reuse state on retry, or a failure leaves an unmanaged, billable server.
  assert.equal(template.retryStrategy, "reuse-state", template.name)
  assert.equal(template.cleanupStrategy, "terraform-destroy", template.name)
  assert.equal(template.requiredApprovals.destructive, true, template.name)
}

console.log("terraform agent checks passed")
