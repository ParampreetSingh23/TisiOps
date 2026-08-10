import { describeFailure, type Diagnosis } from "./terraformDiagnostics"
import {
  findTemplate,
  type TemplateDefinition,
} from "./terraformTemplateRegistry"
import {
  validateTerraformVariables,
  type TerraformVariables,
  type VariableInput,
} from "./terraformVariableValidator"
import type { TerraformInspection } from "./terraformInspection"

/**
 * The Terraform Agent's reasoning, with no database and no side effects.
 *
 * Separated from terraformAgent.ts so it stays pure and directly checkable:
 * every function here turns records into a proposal, a plan, or a sentence, and
 * none of them can run a command or reach infrastructure.
 */

export type TerraformProposal = {
  template: string
  label: string
  riskLevel: TemplateDefinition["risk"]
  requiresApproval: boolean
  summary: string
  resources: string[]
  warnings: string[]
  variables: TerraformVariables
}

export type ProposalResult =
  { ok: true; proposal: TerraformProposal } | { ok: false; error: string }

/**
 * The agent's plan output: a template name, a summary, and validated variables.
 *
 * Structured, never Terraform source. Nothing downstream accepts HCL, so there
 * is no path by which generated infrastructure code could be applied.
 */
export function proposeTerraformDeployment(
  input: VariableInput
): ProposalResult {
  const validated = validateTerraformVariables(input)
  if (!validated.ok) return { ok: false, error: validated.error }

  const { template, variables, warnings } = validated

  return {
    ok: true,
    proposal: {
      template: template.name,
      label: template.label,
      riskLevel: template.risk,
      // Anything that creates billable infrastructure needs a human to say yes.
      requiresApproval:
        template.requiredApprovals.cost || template.risk !== "low",
      summary: summarize(template, variables),
      resources: resourceList(template, variables),
      warnings,
      variables,
    },
  }
}

function summarize(
  template: TemplateDefinition,
  variables: TerraformVariables
): string {
  return `This will create an EC2 instance (${variables.instance_type}), a security group, an Elastic IP, and a ${variables.volume_size} GB encrypted volume in ${variables.aws_region}, using the fixed ${template.name} module.`
}

function resourceList(
  template: TemplateDefinition,
  variables: TerraformVariables
): string[] {
  return [
    `EC2 instance — ${variables.instance_type}, Ubuntu 24.04`,
    `Encrypted gp3 root volume — ${variables.volume_size} GB`,
    `Security group — inbound ${variables.http_port} and ${variables.https_port}, SSH limited to ${variables.allowed_ssh_cidr}`,
    "Elastic IP, allocated and associated",
    `Application listening on port ${variables.app_port}, reachable only through the reverse proxy`,
  ]
}

export type AgentPlan = {
  title: string
  steps: string[]
  warnings: string[]
  requiresApproval: boolean
  /** Set when the action destroys infrastructure. */
  confirmationPhrase?: string
}

/**
 * What a retry will do, in the user's terms.
 *
 * The reassurance that matters is that it reuses state — a user who thinks a
 * retry might double their bill will not press the button.
 */
export function generateRetryPlan(inspection: TerraformInspection): AgentPlan {
  const template = inspection.template
    ? findTemplate(inspection.template)
    : undefined

  const steps = [
    `Reuse the existing Terraform state at ${inspection.state.key ?? "the recorded state key"}`,
    "Run terraform init and plan against that state",
    "Create only the resources that are missing",
    "Run the bootstrap and health check again",
  ]

  const warnings: string[] = []

  if (inspection.diagnosis && !inspection.diagnosis.retryable) {
    warnings.push(
      `Retrying is unlikely to help on its own: ${inspection.diagnosis.nextStep}`
    )
  }

  if (template?.retryStrategy !== "reuse-state") {
    warnings.push(
      "This template does not support automatic retry. An administrator needs to check it."
    )
  }

  if (inspection.state.backend === "local") {
    warnings.push(
      "Terraform state is local to the worker. If the worker was replaced, the state is gone and a retry could create duplicate resources."
    )
  }

  return {
    title: "Retry this deployment",
    steps,
    warnings,
    requiresApproval: true,
  }
}

/**
 * What destroying will remove.
 *
 * Destructive, irreversible, and it deletes the user's workflow data along with
 * the machine — so it carries a typed confirmation rather than a button press.
 */
export function generateCleanupPlan(
  inspection: TerraformInspection
): AgentPlan {
  const steps = [
    "Run terraform destroy against this deployment's own state",
    inspection.server?.instanceId
      ? `Terminate EC2 instance ${inspection.server.instanceId}`
      : "Terminate the EC2 instance",
    inspection.server?.elasticIp
      ? `Release Elastic IP ${inspection.server.elasticIp}`
      : "Release the Elastic IP",
    "Delete the security group and the encrypted volume",
    "Mark the deployment cancelled in TisiOps",
  ]

  return {
    title: "Destroy this deployment",
    steps,
    warnings: [
      "This permanently deletes the server and everything stored on it, including workflow data and credentials saved inside the application.",
      "It cannot be undone.",
    ],
    requiresApproval: true,
    confirmationPhrase: "DELETE",
  }
}

/**
 * Compares what Terraform recorded against what TisiOps has.
 *
 * Detects the case a user actually hits: an apply that finished without
 * producing the address the deployment needs. Real provider-side drift
 * detection needs a `terraform plan` run, which is a worker job — this is the
 * read-only part that needs no AWS call.
 */
export function detectDrift(inspection: TerraformInspection): AgentPlan | null {
  const missing: string[] = []

  if (inspection.status !== "LIVE") return null

  if (!inspection.server?.elasticIp) missing.push("Elastic IP")
  if (!inspection.server?.instanceId) missing.push("EC2 instance id")
  if (!inspection.server?.securityGroupId) missing.push("security group id")

  if (missing.length === 0) return null

  return {
    title: "Infrastructure record is incomplete",
    steps: [
      `TisiOps has no record of: ${missing.join(", ")}`,
      "Re-apply the fixed module against the existing state to reconcile",
      "Terraform adopts what already exists rather than rebuilding it",
    ],
    warnings: [
      "This runs terraform apply again. Existing resources are reused, not replaced.",
    ],
    requiresApproval: true,
  }
}

/**
 * The console answer for a Terraform question about one deployment.
 *
 * Written from records rather than a model, because every sentence here is a
 * claim about someone's infrastructure — a plausible-sounding wrong answer
 * about whether an Elastic IP is attached is worse than no answer.
 */
export function explainInspection(inspection: TerraformInspection): string {
  const lines: string[] = []

  lines.push(
    inspection.template
      ? `This deployment uses the fixed ${inspection.template} Terraform module.`
      : "This deployment has not selected a Terraform template yet."
  )

  lines.push(`Status: ${inspection.status.toLowerCase().replace(/_/g, " ")}.`)

  if (inspection.planSummary) {
    lines.push(`Last plan: ${inspection.planSummary}`)
  }

  if (inspection.server) {
    const { instanceId, elasticIp, securityGroupId, region } = inspection.server
    lines.push(
      `Created in ${region}: instance ${instanceId ?? "not recorded"}, Elastic IP ${elasticIp ?? "not attached"}, security group ${securityGroupId ?? "not recorded"}.`
    )
  } else {
    lines.push("No AWS resources have been recorded for it yet.")
  }

  lines.push(
    `Terraform state: ${inspection.state.backend === "s3" ? "remote S3" : "local to the worker, development only"}${inspection.state.key ? ` at ${inspection.state.key}` : ""}.`
  )

  if (inspection.diagnosis) {
    lines.push(`It failed. ${describeFailure(inspection.diagnosis)}`)
  }

  if (inspection.canRetry) {
    lines.push("You can retry it — the retry reuses the same Terraform state.")
  }

  return lines.join("\n")
}
