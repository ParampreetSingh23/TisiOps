import type { CodeProfile } from "../github/analyze"
import type { ProductionRuntime } from "./production-runtime-parse"

/**
 * Pure staging recommendation.
 *
 * Phase 5 converts the discovered production architecture into an isolated
 * staging blueprint. The Staging Agent decides what staging needs — it does
 * not execute anything here. Isolation is the rule: staging never points at
 * the production database or production writable volumes.
 *
 * No Prisma, no SSH, no secrets — kept pure so it can be unit-checked.
 */

export type StagingService = {
  name: string
  sourceType: "api" | "database" | "cache" | "other"
  image: string | null
  ports: number[]
}

export type StagingRecommendation = {
  branch: string
  services: StagingService[]
  domain: string
  volumes: string[]
  secrets: string[]
  databaseUrl: string
  resources: { cpu: string; memory: string; disk: string }
  isolation: { database: boolean; volumes: boolean }
}

const STAGING_BRANCH = "staging"
const STAGING_DOMAIN_SUFFIX = ".tisiops.com"

/** "postgres-prod" -> "postgres-staging"; "api" -> "api-staging". */
function stagingName(name: string): string {
  return name.replace(/-(prod|production)$/i, "") + "-staging"
}

function sourceType(name: string): StagingService["sourceType"] {
  const n = name.toLowerCase()
  if (/(postgres|postgresql|mysql|mariadb|database|db)/.test(n)) return "database"
  if (/(redis|cache|memcached)/.test(n)) return "cache"
  if (/(nginx|caddy|proxy|traefik)/.test(n)) return "other"
  return "api"
}

/** "api.company.com" -> "api-staging.tisiops.com". */
export function stagingDomain(domain: string | null): string {
  const first = domain?.split(".")[0] || "app"
  return `${first}-staging${STAGING_DOMAIN_SUFFIX}`
}

function portsOf(ports: string): number[] {
  return Array.from(
    new Set(
      ports
        .split(/[\s,]+/)
        .map((entry) => entry.match(/(\d+)(?:->\d+)?\/tcp/)?.[1])
        .filter((p): p is string => Boolean(p))
        .map(Number)
    )
  )
}

function containerFor(
  serviceBase: string,
  runtime: ProductionRuntime | null
): { image: string | null; ports: number[] } | null {
  if (!runtime) return null
  const container = runtime.containers.find(
    (c) => c.name.replace(/-(prod|production)$/i, "") === serviceBase
  )
  if (!container) return null
  return { image: container.image || null, ports: portsOf(container.ports) }
}

function serviceBases(codeProfile: CodeProfile | null, runtime: ProductionRuntime | null): string[] {
  if (codeProfile?.services && codeProfile.services.length > 0) {
    return codeProfile.services.filter((s) => sourceType(s) !== "other")
  }
  const fromRuntime = (runtime?.containers ?? [])
    .map((c) => c.name.replace(/-(prod|staging|stage|production)$/i, ""))
    .filter((n) => sourceType(n) !== "other")
  return Array.from(new Set(fromRuntime))
}

export function resourceRequirements(runtime: ProductionRuntime | null): {
  cpu: string
  memory: string
  disk: string
} {
  return {
    cpu: `${runtime?.cpuCount ?? 1} vCPU`,
    memory: `${runtime?.memoryMb ?? 2048} MB`,
    disk: `${runtime?.diskGb ?? 20} GB`,
  }
}

/**
 * Builds the isolated staging recommendation from the production runtime and
 * code profile. Never references the production database or production
 * volumes: the database URL is a staging placeholder and every volume is
 * suffixed `-staging`.
 */
export function buildStagingRecommendation(
  runtime: ProductionRuntime | null,
  codeProfile: CodeProfile | null
): StagingRecommendation {
  const bases = serviceBases(codeProfile, runtime)

  const services = bases.map((base): StagingService => {
    const container = containerFor(base, runtime)
    const type = sourceType(base)
    const defaultPort = type === "api" ? [codeProfile?.port ?? 3000] : []
    return {
      name: stagingName(base),
      sourceType: type,
      image: container?.image ?? null,
      ports: container && container.ports.length > 0 ? container.ports : defaultPort,
    }
  })

  const volumes = (runtime?.volumes ?? []).map((v) => `${v}-staging`)

  const domain = stagingDomain(runtime?.domains[0] ?? null)

  return {
    branch: STAGING_BRANCH,
    services,
    domain,
    volumes,
    secrets: codeProfile?.environment ?? [],
    databaseUrl:
      "postgres://<user>:<password>@<staging-host>:5432/<database> — staging only, never the production database",
    resources: resourceRequirements(runtime),
    isolation: { database: true, volumes: true },
  }
}
