import type { CodeProfile } from "../github/analyze"
import {
  gitRepoFromRemote,
  majorVersion,
  type ProductionRuntime,
} from "./production-runtime-parse"

/**
 * Pure production-blueprint assembly and deployment-drift detection.
 *
 * Phase 4 combines the code profile (what the repository expects), the
 * production runtime (what the server actually runs), the TisiOps deployment
 * records, and monitoring into one view of production as a system. Drift is
 * the mismatch between what the code declares and what is actually running.
 *
 * No Prisma, no SSH, no secrets — kept pure so it can be unit-checked.
 */

export type DeploymentDrift = {
  field: string
  expected: string
  actual: string
  severity: "warning" | "critical"
  detail: string
}

export type BlueprintDeployment = {
  template: string | null
  provider: string
  type: string
}

export type BlueprintMonitoring = {
  cpuPercent: number | null
  memoryPercent: number | null
  diskPercent: number | null
  collectedAt: string | null
}

export type ProductionBlueprint = {
  repository: string | null
  owner: string | null
  branch: string | null
  commit: string | null
  runtime: string | null
  deployment: string | null
  services: string[]
  proxy: string | null
  networking: string[]
  persistentData: string[]
  environment: string[]
  deployments: BlueprintDeployment[]
  monitoring: BlueprintMonitoring | null
  drift: DeploymentDrift[]
}

const DEP_STATUS: Record<string, (r: ProductionRuntime) => string> = {
  Postgres: (r) => r.postgres,
  Redis: (r) => r.redis,
}

function depRunning(dep: string, runtime: ProductionRuntime): boolean {
  const status = DEP_STATUS[dep]
  if (status) return status(runtime) === "running"
  // MySQL/Mongo have no dedicated status; fall back to a running container.
  const needle = dep.toLowerCase()
  return runtime.containers.some((c) => c.image.toLowerCase().includes(needle))
}

export function detectDrift(
  codeProfile: CodeProfile | null,
  runtime: ProductionRuntime | null
): DeploymentDrift[] {
  const drift: DeploymentDrift[] = []
  if (!codeProfile || !runtime) return drift

  // Runtime version mismatch: repo expects Node 22, prod runs Node 20.
  if (
    codeProfile.runtime === "Node.js" &&
    codeProfile.nodeVersion
  ) {
    const node = runtime.runtimes.find((r) => r.name === "node")
    const runningMajor = majorVersion(node?.version ?? null)
    if (node && runningMajor && runningMajor !== codeProfile.nodeVersion) {
      drift.push({
        field: "runtime",
        expected: `Node ${codeProfile.nodeVersion}`,
        actual: `Node ${runningMajor}`,
        severity: "warning",
        detail: `Repository expects Node ${codeProfile.nodeVersion} but production runs Node ${runningMajor}.`,
      })
    }
  }

  // Declared dependency not running.
  for (const dep of codeProfile.dependencies) {
    if (!depRunning(dep, runtime)) {
      drift.push({
        field: dep.toLowerCase(),
        expected: "running",
        actual: depRunning(dep, runtime) ? "running" : "not running",
        severity: "critical",
        detail: `The repository depends on ${dep}, but ${dep} is not currently running.`,
      })
    }
  }

  // Docker Compose declared but Docker not running.
  if (
    codeProfile.deployment === "Docker Compose" &&
    runtime.docker.status !== "Running"
  ) {
    drift.push({
      field: "docker",
      expected: "Running",
      actual: runtime.docker.status,
      severity: "critical",
      detail: "The repository is deployed with Docker Compose but Docker is not running.",
    })
  }

  return drift
}

function runtimeLabel(runtime: ProductionRuntime | null): string | null {
  if (!runtime) return null
  const node = runtime.runtimes.find((r) => r.name === "node")
  const major = majorVersion(node?.version ?? null)
  return major ? `Node.js ${major}` : null
}

function proxyOf(runtime: ProductionRuntime | null): string | null {
  if (!runtime) return null
  if (runtime.caddy === "active" || runtime.caddy === "installed") return "Caddy"
  if (runtime.nginx === "active") return "Nginx"
  return null
}

function servicesOf(
  codeProfile: CodeProfile | null,
  runtime: ProductionRuntime | null
): string[] {
  // Logical services come from the compose file; fall back to running container
  // names with the instance suffix (+ "-prod", "-staging") stripped.
  if (codeProfile?.services && codeProfile.services.length > 0) {
    return codeProfile.services
  }
  const names = (runtime?.containers ?? []).map((c) =>
    c.name.replace(/-(prod|staging|stage|production)$/i, "")
  )
  return Array.from(new Set(names.filter(Boolean)))
}

function networkingOf(
  codeProfile: CodeProfile | null,
  runtime: ProductionRuntime | null
): string[] {
  const lines: string[] = []

  const proxy = proxyOf(runtime)
  if (proxy && codeProfile?.port) {
    lines.push(`443 -> ${proxy} -> app:${codeProfile.port}`)
  }

  for (const container of runtime?.containers ?? []) {
    if (container.ports) lines.push(`${container.ports}`)
  }

  return Array.from(new Set(lines))
}

function persistentDataOf(
  codeProfile: CodeProfile | null,
  runtime: ProductionRuntime | null
): string[] {
  const volumes = runtime?.volumes ?? []
  const deps = codeProfile?.dependencies ?? []

  const lines = volumes.map((name) => `Persistent volume: ${name}`)
  if (deps.includes("Postgres")) lines.push("Postgres volume")
  if (deps.includes("Redis")) lines.push("Redis volume")

  return Array.from(new Set(lines))
}

export function buildBlueprint(input: {
  codeProfile: CodeProfile | null
  runtime: ProductionRuntime | null
  deployments: BlueprintDeployment[]
  monitoring: BlueprintMonitoring | null
}): ProductionBlueprint {
  const { codeProfile, runtime, deployments, monitoring } = input

  const repo =
    codeProfile !== null
      ? { repository: codeProfile.repository, owner: codeProfile.owner }
      : (() => {
          const found = gitRepoFromRemote(runtime?.git.remote ?? null)
          return found
            ? { repository: found.name, owner: found.owner }
            : { repository: null, owner: null }
        })()

  const runtimeWithVersion =
    codeProfile?.runtime === "Node.js" && codeProfile.nodeVersion
      ? `Node.js ${codeProfile.nodeVersion}`
      : codeProfile?.runtime ?? runtimeLabel(runtime)

  return {
    repository: repo.repository ?? null,
    owner: repo.owner ?? null,
    branch: runtime?.git.branch ?? null,
    commit: runtime?.git.commit ?? null,
    runtime: runtimeWithVersion,
    deployment: codeProfile?.deployment ?? null,
    services: servicesOf(codeProfile, runtime),
    proxy: proxyOf(runtime),
    networking: networkingOf(codeProfile, runtime),
    persistentData: persistentDataOf(codeProfile, runtime),
    environment: codeProfile?.environment ?? [],
    deployments,
    monitoring,
    drift: detectDrift(codeProfile, runtime),
  }
}
