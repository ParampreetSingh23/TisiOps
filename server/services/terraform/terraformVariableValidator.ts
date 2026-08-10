import {
  findTemplate,
  type TemplateDefinition,
} from "./terraformTemplateRegistry"

/**
 * The gate between a proposed deployment and real infrastructure.
 *
 * Everything Terraform receives passes through here first. The AI planner
 * suggests values; this decides whether they are allowed, using the registry
 * entry for the named template rather than any rule the caller supplied.
 *
 * It rejects rather than corrects. Silently substituting a region or instance
 * type would mean the plan the user approved is not the plan that runs.
 */

/** The exact shape written to terraform.tfvars.json. Nothing else is passed. */
export type TerraformVariables = {
  deployment_id: string
  project_name: string
  aws_region: string
  instance_type: string
  volume_size: number
  allowed_ssh_cidr: string
  http_port: number
  https_port: number
  app_port: number
  environment: string
  tags: Record<string, string>
}

export type VariableInput = {
  template: string
  deploymentId: string
  projectName: string
  region: string
  instanceType: string
  volumeSize?: number
  /** Defaults to closed. Opening it to the world is an explicit choice. */
  allowedSshCidr?: string
  environment?: string
  tags?: Record<string, string>
}

export type ValidationResult =
  | {
      ok: true
      template: TemplateDefinition
      variables: TerraformVariables
      /** Shown to the user and written to the log, never silently swallowed. */
      warnings: string[]
    }
  | { ok: false; error: string }

export const SSH_OPEN_WARNING =
  "SSH is open for provisioning. Restrict SSH access before production use."

const ENVIRONMENTS = ["preview", "staging", "production"]

/** IPv4 CIDR. Anything else cannot become a security group rule. */
const CIDR = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/

/** Lowercase, digits, dashes — it becomes a resource name and a tag value. */
export function safeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

export function validateTerraformVariables(
  input: VariableInput
): ValidationResult {
  const template = findTemplate(input.template)

  if (!template) {
    return {
      ok: false,
      error: `Unknown deployment template: ${input.template}`,
    }
  }

  if (!template.available) {
    return {
      ok: false,
      error: `The ${template.label} template is not available yet.`,
    }
  }

  const projectName = safeProjectName(input.projectName ?? "")
  if (projectName.length < 3) {
    return {
      ok: false,
      error: "Project name needs at least 3 letters or digits.",
    }
  }

  if (!input.deploymentId) {
    return { ok: false, error: "Deployment id is required." }
  }

  if (!template.allowedRegions.includes(input.region)) {
    return {
      ok: false,
      error: `Region must be one of: ${template.allowedRegions.join(", ")}.`,
    }
  }

  // Checked against the registry, not against whatever the caller believes the
  // plan mapped to — this is the line that stops an expensive instance type.
  if (!template.allowedInstanceTypes.includes(input.instanceType)) {
    return {
      ok: false,
      error: `Instance type must be one of: ${template.allowedInstanceTypes.join(", ")}.`,
    }
  }

  const volumeSize = input.volumeSize ?? template.volumeSizeGb.default
  if (
    !Number.isInteger(volumeSize) ||
    volumeSize < template.volumeSizeGb.min ||
    volumeSize > template.volumeSizeGb.max
  ) {
    return {
      ok: false,
      error: `Volume size must be a whole number between ${template.volumeSizeGb.min} and ${template.volumeSizeGb.max} GB.`,
    }
  }

  const environment = input.environment ?? "preview"
  if (!ENVIRONMENTS.includes(environment)) {
    return {
      ok: false,
      error: `Environment must be one of: ${ENVIRONMENTS.join(", ")}.`,
    }
  }

  // Closed unless asked for. The bootstrap runs from cloud-init, so nothing
  // needs to sign in and the port stays shut by default.
  const allowedSshCidr = input.allowedSshCidr ?? "127.0.0.1/32"
  if (!CIDR.test(allowedSshCidr)) {
    return {
      ok: false,
      error: "SSH access must be a CIDR range like 203.0.113.4/32.",
    }
  }

  const warnings: string[] = []
  if (allowedSshCidr === "0.0.0.0/0") warnings.push(SSH_OPEN_WARNING)

  return {
    ok: true,
    template,
    warnings,
    variables: {
      deployment_id: input.deploymentId,
      project_name: projectName,
      aws_region: input.region,
      instance_type: input.instanceType,
      volume_size: volumeSize,
      allowed_ssh_cidr: allowedSshCidr,
      http_port: 80,
      https_port: 443,
      // From the registry, never from the request: the port has to match what
      // the bootstrap actually starts.
      app_port: template.appPort,
      environment,
      tags: {
        ManagedBy: "tisiops",
        TisiOpsDeployment: input.deploymentId,
        TisiOpsTemplate: template.name,
        Environment: environment,
        ...sanitizeTags(input.tags),
      },
    },
  }
}

/**
 * AWS tag values reject most punctuation, and a tag is the one place free text
 * from a caller reaches the provider — so keys and values are both filtered.
 */
function sanitizeTags(tags?: Record<string, string>): Record<string, string> {
  if (!tags) return {}

  const safe: Record<string, string> = {}

  for (const [key, value] of Object.entries(tags).slice(0, 10)) {
    const cleanKey = key.replace(/[^A-Za-z0-9_.:/=+-]/g, "").slice(0, 60)
    const cleanValue = String(value)
      .replace(/[^A-Za-z0-9_.:/=+\- ]/g, "")
      .slice(0, 120)

    if (cleanKey) safe[cleanKey] = cleanValue
  }

  return safe
}
