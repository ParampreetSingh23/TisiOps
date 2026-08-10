/**
 * The deployment template registry.
 *
 * One entry per template, and adding a template means adding a row here plus
 * its Terraform module and bootstrap service — never new branching in the
 * worker, the validator, or the API.
 *
 * This is what keeps AI-suggested values away from infrastructure. A request
 * names a template; the registry decides which fixed module runs, which
 * regions and instance types are permitted, and which bootstrap script
 * configures the machine. Nothing outside this file can widen any of it.
 */

export type RiskLevel = "low" | "medium" | "high"

export type PortRule = {
  /** Terraform variable the port is passed as. */
  variable: "http_port" | "https_port" | "app_port"
  value: number
}

export type TemplateName =
  | "aws-n8n-server"
  | "aws-app-server"
  | "aws-docker-app-server"
  | "aws-node-server"
  | "aws-ubuntu-server"

export type BootstrapKind = "n8n" | "app-server" | "none"

/**
 * What a retry is allowed to do.
 *
 * `reuse-state` is the only safe answer for anything that creates billable
 * infrastructure: Terraform reconciles against the state it already wrote, so a
 * retry finishes a half-built deployment instead of building a second one.
 */
export type RetryStrategy = "reuse-state" | "manual-only"

/**
 * What removing a deployment does. `terraform-destroy` is the only strategy
 * that actually stops the bill, and it is destructive — see the approval rules
 * on the destroy job.
 */
export type CleanupStrategy = "terraform-destroy" | "manual-only"

export type TemplateDefinition = {
  name: TemplateName
  label: string
  description: string
  /** Directory under infra/terraform/modules. Never computed from input. */
  modulePath: string
  bootstrap: BootstrapKind
  risk: RiskLevel
  /** Regions this template may spend money in. */
  allowedRegions: string[]
  /** The ceiling. A plan naming anything else is refused, not corrected. */
  allowedInstanceTypes: string[]
  defaultInstanceType: string
  volumeSizeGb: { min: number; max: number; default: number }
  /** Port the application listens on behind the reverse proxy. */
  appPort: number
  /** Actions a user must explicitly approve before a job is queued. */
  requiredApprovals: { cost: boolean; destructive: boolean }
  retryStrategy: RetryStrategy
  cleanupStrategy: CleanupStrategy
  /** False until the template has a working handler end to end. */
  available: boolean
}

/**
 * Regions and sizes are per template rather than global: a template that only
 * has an AMI in two regions must not be deployable into a third just because
 * another template supports it.
 */
const MVP_REGIONS = ["ap-south-1", "us-east-1", "eu-central-1"]
const MVP_INSTANCE_TYPES = ["t3.micro", "t3.small", "t3.medium"]

export const TEMPLATES: Record<TemplateName, TemplateDefinition> = {
  "aws-n8n-server": {
    name: "aws-n8n-server",
    label: "n8n automation server",
    description:
      "A private n8n workflow server with PostgreSQL and a Caddy reverse proxy.",
    modulePath: "aws-n8n-server",
    bootstrap: "n8n",
    risk: "medium",
    allowedRegions: MVP_REGIONS,
    allowedInstanceTypes: MVP_INSTANCE_TYPES,
    defaultInstanceType: "t3.micro",
    volumeSizeGb: { min: 20, max: 100, default: 20 },
    appPort: 5678,
    requiredApprovals: { cost: true, destructive: true },
    retryStrategy: "reuse-state",
    cleanupStrategy: "terraform-destroy",
    available: true,
  },
  "aws-app-server": {
    name: "aws-app-server",
    label: "Application server",
    description:
      "A general-purpose Ubuntu server with Docker and a Caddy reverse proxy.",
    modulePath: "aws-app-server",
    bootstrap: "app-server",
    risk: "medium",
    allowedRegions: MVP_REGIONS,
    allowedInstanceTypes: MVP_INSTANCE_TYPES,
    defaultInstanceType: "t3.small",
    volumeSizeGb: { min: 20, max: 100, default: 30 },
    appPort: 3000,
    requiredApprovals: { cost: true, destructive: true },
    retryStrategy: "reuse-state",
    cleanupStrategy: "terraform-destroy",
    available: true,
  },
  // Declared so the registry is the single list of what TisiOps intends to
  // support, and marked unavailable so nothing can deploy one by naming it.
  "aws-docker-app-server": {
    name: "aws-docker-app-server",
    label: "Docker application server",
    description: "Runs an application from an existing Docker setup.",
    modulePath: "aws-app-server",
    bootstrap: "app-server",
    risk: "medium",
    allowedRegions: MVP_REGIONS,
    allowedInstanceTypes: MVP_INSTANCE_TYPES,
    defaultInstanceType: "t3.small",
    volumeSizeGb: { min: 20, max: 100, default: 30 },
    appPort: 3000,
    requiredApprovals: { cost: true, destructive: true },
    retryStrategy: "reuse-state",
    cleanupStrategy: "terraform-destroy",
    available: false,
  },
  "aws-node-server": {
    name: "aws-node-server",
    label: "Node.js server",
    description: "Runs a Node.js service from a GitHub repository.",
    modulePath: "aws-app-server",
    bootstrap: "app-server",
    risk: "medium",
    allowedRegions: MVP_REGIONS,
    allowedInstanceTypes: MVP_INSTANCE_TYPES,
    defaultInstanceType: "t3.small",
    volumeSizeGb: { min: 20, max: 100, default: 30 },
    appPort: 3000,
    requiredApprovals: { cost: true, destructive: true },
    retryStrategy: "reuse-state",
    cleanupStrategy: "terraform-destroy",
    available: false,
  },
  "aws-ubuntu-server": {
    name: "aws-ubuntu-server",
    label: "Ubuntu server",
    description: "A clean Ubuntu server with no application installed.",
    modulePath: "aws-app-server",
    bootstrap: "none",
    risk: "low",
    allowedRegions: MVP_REGIONS,
    allowedInstanceTypes: MVP_INSTANCE_TYPES,
    defaultInstanceType: "t3.micro",
    volumeSizeGb: { min: 20, max: 100, default: 20 },
    appPort: 80,
    requiredApprovals: { cost: true, destructive: true },
    retryStrategy: "reuse-state",
    cleanupStrategy: "terraform-destroy",
    available: false,
  },
}

/** The state key for a deployment. One shape for every template. */
export function stateKey(template: string, deploymentId: string): string {
  return `terraform/${template}/${deploymentId}/terraform.tfstate`
}

export function findTemplate(name: string): TemplateDefinition | undefined {
  return TEMPLATES[name as TemplateName]
}

/** What the UI and the AI planner may offer. */
export function availableTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATES).filter((template) => template.available)
}
