import type { CodeProfile } from "../github/analyze"
import type { ProductionRuntime } from "./production-runtime-parse"

/**
 * Pure staging target selection, resource planning, compatibility, and final
 * plan. Phase 6-8. Everything here is deterministic and testable; the Staging
 * Agent only decides — the target server is discovered elsewhere, and nothing
 * here executes.
 */

export type StagingTarget = "NEW_SERVER" | "EXISTING_SERVER" | "SAME_SERVER"

export type StagingTargetOption = {
  target: StagingTarget
  label: string
  description: string
  recommended: boolean
  risk: "low" | "medium" | "high"
}

export const STAGING_TARGET_OPTIONS: StagingTargetOption[] = [
  {
    target: "NEW_SERVER",
    label: "Create New Server",
    description: "Best isolation from production",
    recommended: true,
    risk: "low",
  },
  {
    target: "EXISTING_SERVER",
    label: "Use Existing Server",
    description: "Use another connected server",
    recommended: false,
    risk: "medium",
  },
  {
    target: "SAME_SERVER",
    label: "Same Production Server",
    description: "Lower cost · Advanced",
    recommended: false,
    risk: "high",
  },
]

export function stagingTargetFromText(text: string): StagingTarget | null {
  const t = text.toLowerCase()
  if (/(new|fresh|separate|dedicated|different|create)/.test(t) && /(server|instance|machine|new)/.test(t)) {
    return "NEW_SERVER"
  }
  if (/(existing|another|other|connected|reuse)/.test(t) && /(server|instance|existing)/.test(t)) {
    return "EXISTING_SERVER"
  }
  if (/(same|current|this server|production server)/.test(t)) {
    return "SAME_SERVER"
  }
  return null
}

export type ResourcePlan = { cpu: number; memoryGb: number; diskGb: number }

// ponytail: staging is sized at ~half production (with floors). Replace with a
// real capacity model if staging must match production exactly.
export function recommendResources(
  runtime: ProductionRuntime | null
): ResourcePlan {
  const cpu = Math.max(2, Math.ceil((runtime?.cpuCount ?? 4) / 2))
  const memoryGb = Math.max(4, Math.round(((runtime?.memoryMb ?? 8192) / 1024) / 2))
  const diskGb = Math.max(20, (runtime?.diskGb ?? 40) - 10)
  return { cpu, memoryGb, diskGb }
}

export type CompatibilityCheck = {
  label: string
  required: string
  available: string
  ok: boolean
}

export type CompatibilityResult = {
  compatible: boolean
  checks: CompatibilityCheck[]
  reason: string
}

/** Host ports already mapped by a running container. */
function usedHostPorts(runtime: ProductionRuntime | null): number[] {
  const ports = new Set<number>()
  for (const container of runtime?.containers ?? []) {
    for (const entry of container.ports.split(/[\s,]+/)) {
      const host = entry.match(/^0\.0\.0\.0:(\d+)/)?.[1]
      const plain = entry.match(/^(\d+)(?::\d+)?->/)?.[1]
      const value = host ?? plain
      if (value) ports.add(Number(value))
    }
  }
  return Array.from(ports)
}

/**
 * Recommended default region, matching the existing AWS provisioning modules.
 */
export const STAGING_REGION = "ap-south-1"

/**
 * Checks whether a target can actually host staging.
 *
 * - NEW_SERVER: no compatibility concern; resources are the recommendation.
 * - EXISTING_SERVER: compare required resources against the target's runtime.
 * - SAME_SERVER: stricter — free port must be available and isolation enforced.
 */
export function checkCompatibility(
  resources: ResourcePlan,
  targetRuntime: ProductionRuntime | null,
  target: StagingTarget,
  appPort?: number | null
): CompatibilityResult {
  if (target === "NEW_SERVER") {
    return {
      compatible: true,
      checks: [
        {
          label: "Isolation",
          required: "Dedicated server",
          available: "New server",
          ok: true,
        },
      ],
      reason: "",
    }
  }

  const checks: CompatibilityCheck[] = []

  const memGb = targetRuntime ? Math.round((targetRuntime.memoryMb ?? 0) / 1024) : 0
  checks.push({
    label: "RAM",
    required: `${resources.memoryGb} GB`,
    available: targetRuntime ? `${memGb} GB` : "unknown",
    ok: targetRuntime ? memGb >= resources.memoryGb : false,
  })

  const hasDocker = targetRuntime ? targetRuntime.docker.status === "Running" : false
  checks.push({
    label: "Docker",
    required: "Installed",
    available: targetRuntime ? (hasDocker ? "Installed" : "Not running") : "unknown",
    ok: hasDocker,
  })

  const diskTotal = targetRuntime?.diskGb ?? 0
  checks.push({
    label: "Disk",
    required: `${resources.diskGb} GB`,
    available: targetRuntime ? `${diskTotal} GB` : "unknown",
    ok: targetRuntime ? diskTotal >= resources.diskGb : false,
  })

  if (target === "SAME_SERVER") {
    // Stricter: the staging app port must be free, and isolation is mandatory.
    const used = usedHostPorts(targetRuntime)
    const portFree = appPort != null ? !used.includes(appPort) : false
    checks.push({
      label: "Port availability",
      required: appPort != null ? `Port ${appPort} free` : "Staging app port free",
      available: appPort != null ? (portFree ? "Free" : `In use`) : "unverified",
      ok: portFree,
    })

    checks.push({
      label: "Container-name isolation",
      required: "Separate staging names",
      available: "staging containers",
      ok: true,
    })
    checks.push({
      label: "Volume isolation",
      required: "Separate staging volumes",
      available: "staging volumes",
      ok: true,
    })
    checks.push({
      label: "Network isolation",
      required: "Separate staging network",
      available: "staging network",
      ok: true,
    })
  }

  const compatible = checks.every((check) => check.ok)
  return {
    compatible,
    checks,
    reason: compatible
      ? ""
      : target === "SAME_SERVER"
        ? "Same-server staging is not recommended for this server: free capacity or port availability could not be verified."
        : "The selected target cannot support staging with the required resources.",
  }
}

export type FinalStagingPlan = {
  source: string
  repository: string | null
  owner: string | null
  productionBranch: string | null
  stagingBranch: string
  target: StagingTarget
  provider: "AWS" | null
  region: string
  resources: ResourcePlan
  instanceType: string
  diskGb: number
  runtime: string | null
  deploymentType: string
  requiredEnvVars: string[]
  appPort: number
  services: string[]
  executionSteps: string[]
  isolation: {
    database: boolean
    redis: boolean
    volumes: boolean
    environment: boolean
    network: boolean
  }
  actions: string[]
}

const ALL_ACTIONS = [
  "Provision AWS server",
  "Wait for SSH",
  "Prepare Docker",
  "Clone repository",
  "Checkout staging branch",
  "Resolve staging secrets",
  "Start staging services",
  "Configure HTTP reverse proxy",
  "Verify staging",
]

/** Actions TisiOps can actually perform for a given target. */
function actionsFor(target: StagingTarget): string[] {
  const actions = [...ALL_ACTIONS]
  if (target !== "NEW_SERVER") {
    // An existing/same server is already provisioned.
    const idx = actions.indexOf("Provision AWS server")
    if (idx >= 0) actions.splice(idx, 1)
  }
  return actions
}

function instanceTypeFor(resources: ResourcePlan): string {
  if (resources.memoryGb <= 1) return "t3.micro"
  if (resources.memoryGb <= 2) return "t3.small"
  return "t3.medium"
}

export function buildFinalStagingPlan(input: {
  source: string
  codeProfile: CodeProfile | null
  runtime: ProductionRuntime | null
  target: StagingTarget
}): FinalStagingPlan {
  const { source, codeProfile, runtime, target } = input
  const resources = recommendResources(runtime)
  const appPort = codeProfile?.port ?? 3000

  const services = (codeProfile?.services ?? [])
    .map((name) => name.replace(/-(prod|staging)$/i, "") + "-staging")
    .filter((name) => !/(nginx|caddy|proxy|traefik)/i.test(name))

  const runtimeLabel =
    codeProfile?.runtime === "Node.js" && codeProfile.nodeVersion
      ? `Node.js ${codeProfile.nodeVersion}`
      : codeProfile?.runtime ?? null

  const isolation = {
    database: true,
    redis: services.some((s) => /redis/i.test(s)),
    volumes: true,
    environment: true,
    network: true,
  }

  const actions = actionsFor(target)

  return {
    source,
    repository: codeProfile?.repository ?? null,
    owner: codeProfile?.owner ?? null,
    productionBranch: runtime?.git.branch ?? null,
    stagingBranch: "staging",
    target,
    provider: target === "NEW_SERVER" ? "AWS" : null,
    region: STAGING_REGION,
    resources,
    instanceType: instanceTypeFor(resources),
    diskGb: resources.diskGb,
    runtime: runtimeLabel,
    deploymentType: codeProfile?.deployment ?? "Docker Compose",
    requiredEnvVars: codeProfile?.environment ?? [],
    appPort,
    services,
    executionSteps: actions,
    isolation,
    actions,
  }
}
