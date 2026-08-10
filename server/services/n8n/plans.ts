import { TEMPLATES } from "../terraform/terraformTemplateRegistry"

/**
 * The allowlists that stand between a request and real AWS spend.
 *
 * Everything Terraform receives passes through `validateN8nConfig` first. The
 * AI planner writes prose and suggests values; it cannot widen a region, pick
 * an instance type that is not listed here, or reach Terraform at all except
 * through a config this file has approved.
 */

export type PlanKey = "STARTER" | "GROWTH" | "PRO"

export type ServerPlan = {
  key: PlanKey
  name: string
  instanceType: string
  vcpu: string
  memory: string
  bestFor: string
  rootVolumeGb: number
}

export const SERVER_PLANS: ServerPlan[] = [
  {
    key: "STARTER",
    name: "Starter",
    instanceType: "t3.micro",
    vcpu: "1 vCPU",
    memory: "1 GB RAM",
    bestFor: "Testing and personal automation",
    rootVolumeGb: 20,
  },
  {
    key: "GROWTH",
    name: "Growth",
    instanceType: "t3.small",
    vcpu: "1–2 vCPU",
    memory: "2 GB RAM",
    bestFor: "Small business workflows",
    rootVolumeGb: 30,
  },
  {
    key: "PRO",
    name: "Pro",
    instanceType: "t3.medium",
    vcpu: "2 vCPU",
    memory: "4 GB RAM",
    bestFor: "Heavier workflow usage",
    rootVolumeGb: 40,
  },
]

/**
 * Regions TisiOps will spend money in.
 *
 * Mirrors the aws-n8n-server entry in the Terraform template registry, which
 * is the authority — validateTerraformVariables checks against that, so a
 * value that slipped past here is still refused before Terraform runs.
 */
export const ALLOWED_REGIONS = TEMPLATES["aws-n8n-server"]
  .allowedRegions as readonly string[]

export const DEFAULT_REGION = "ap-south-1"
export const DEFAULT_TIMEZONE = "Asia/Kolkata"

/**
 * The ceiling, independent of the plan table. A plan row with a larger type
 * would still be refused here, so widening the catalogue cannot quietly
 * widen the bill.
 */
export const ALLOWED_INSTANCE_TYPES =
  TEMPLATES["aws-n8n-server"].allowedInstanceTypes

export type DomainMode = "TISIOPS_SUBDOMAIN" | "CUSTOM" | "NONE"

export type N8nConfigInput = {
  workspaceName: string
  adminEmail: string
  timezone: string
  region: string
  plan: string
  domainMode: string
  domain?: string | null
}

export type N8nConfig = {
  workspaceName: string
  adminEmail: string
  timezone: string
  region: string
  plan: PlanKey
  instanceType: string
  rootVolumeGb: number
  domainMode: DomainMode
  /** Null unless a real hostname was supplied and passed validation. */
  domain: string | null
}

export type Validated =
  { ok: true; config: N8nConfig } | { ok: false; error: string }

/** Lowercase, digits and dashes — it becomes a hostname label. */
export function workspaceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

const HOSTNAME =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function findPlan(key: string): ServerPlan | undefined {
  return SERVER_PLANS.find((plan) => plan.key === key)
}

/**
 * The single gate. Returns a config Terraform can be handed, or the reason it
 * refused — never a partially-corrected value, because silently substituting a
 * region or instance type is how an approved plan stops matching what runs.
 */
export function validateN8nConfig(input: N8nConfigInput): Validated {
  const workspaceName = input.workspaceName?.trim() ?? ""
  const slug = workspaceSlug(workspaceName)

  if (slug.length < 3) {
    return {
      ok: false,
      error: "Workspace name needs at least 3 letters or digits.",
    }
  }

  if (!EMAIL.test(input.adminEmail?.trim() ?? "")) {
    return { ok: false, error: "Enter a valid admin email address." }
  }

  if (
    !ALLOWED_REGIONS.includes(input.region as (typeof ALLOWED_REGIONS)[number])
  ) {
    return {
      ok: false,
      error: `Region must be one of: ${ALLOWED_REGIONS.join(", ")}.`,
    }
  }

  const plan = findPlan(input.plan)
  if (!plan) {
    return {
      ok: false,
      error: `Plan must be one of: ${SERVER_PLANS.map((entry) => entry.key).join(", ")}.`,
    }
  }

  if (!ALLOWED_INSTANCE_TYPES.includes(plan.instanceType)) {
    return { ok: false, error: "That plan maps to a disallowed instance type." }
  }

  // UTC is the one valid zone with no Area/City form, and it is the obvious
  // choice for a server, so it is allowed explicitly.
  if (
    !input.timezone ||
    !/^([A-Za-z]+\/[A-Za-z_+-]+|UTC)$/.test(input.timezone)
  ) {
    return { ok: false, error: "Timezone must look like Asia/Kolkata, or UTC." }
  }

  const domainMode = input.domainMode as DomainMode
  if (!["TISIOPS_SUBDOMAIN", "CUSTOM", "NONE"].includes(domainMode)) {
    return { ok: false, error: "Pick a domain option." }
  }

  let domain: string | null = null

  if (domainMode === "CUSTOM") {
    const candidate = (input.domain ?? "").trim().toLowerCase()
    if (!HOSTNAME.test(candidate)) {
      return {
        ok: false,
        error: "Enter a domain like n8n.yourdomain.com.",
      }
    }
    domain = candidate
  }

  if (domainMode === "TISIOPS_SUBDOMAIN") {
    domain = `${slug}.tisiops.app`
  }

  return {
    ok: true,
    config: {
      workspaceName,
      adminEmail: input.adminEmail.trim(),
      timezone: input.timezone,
      region: input.region,
      plan: plan.key,
      instanceType: plan.instanceType,
      rootVolumeGb: plan.rootVolumeGb,
      domainMode,
      domain,
    },
  }
}

/** True while TisiOps cannot create the A record for its own subdomain. */
export function subdomainAutomationEnabled(): boolean {
  return Boolean(process.env.TISIOPS_DNS_ZONE_ID)
}

export const SUBDOMAIN_UNAVAILABLE =
  "TisiOps subdomain automation is not enabled yet."
