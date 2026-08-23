/**
 * Pure, deterministic monitoring health evaluation.
 *
 * No Prisma, no SSH, no model calls. Given a normalized monitoring context this
 * produces the health classification, the evidence lines, the likely cause, the
 * recommended next step, and whether a repair handoff is warranted — so the LLM
 * only ever has to phrase an answer that is already grounded in these facts.
 */

export type HealthLevel = "NORMAL" | "WARNING" | "CRITICAL"
export type ServerHealth = "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN"

export type MonitoringIntent =
  | "CHECK_MONITORING_STATUS"
  | "CHECK_SERVER_HEALTH"
  | "CHECK_CPU_USAGE"
  | "CHECK_MEMORY_USAGE"
  | "CHECK_DISK_USAGE"
  | "CHECK_DOCKER_STATUS"
  | "CHECK_CONTAINER_HEALTH"
  | "CHECK_LAST_HEARTBEAT"
  | "DIAGNOSE_SERVER_SLOWNESS"
  | "DIAGNOSE_HIGH_MEMORY"
  | "DIAGNOSE_HIGH_CPU"
  | "DIAGNOSE_DISK_PRESSURE"
  | "DIAGNOSE_CONTAINER_FAILURE"
  | "DIAGNOSE_APP_DOWN"

export type MonitoringContext = {
  serverId: string
  serverName: string
  monitoringStatus: string
  freshness: "FRESH" | "STALE" | "UNAVAILABLE"
  metrics: {
    cpuPercent: number | null
    memoryPercent: number | null
    diskPercent: number | null
  }
  docker: {
    status: string | null
    containerCount: number
    unhealthyContainers: number
  }
  lastHeartbeatAt: string | null
  lastCheckedAt: string | null
  collectedAt: string | null
  healthChecks: unknown[]
  recentLogs: { level: string; message: string; createdAt: string }[]
}

export type IssueType =
  | "NONE"
  | "HIGH_CPU"
  | "HIGH_MEMORY"
  | "DISK_PRESSURE"
  | "DOCKER_STOPPED"
  | "CONTAINER_UNHEALTHY"
  | "CONTAINER_RESTARTING"
  | "HEALTHCHECK_FAILED"
  | "MONITORING_STALE"
  | "SERVER_UNREACHABLE"

export type HealthSummary = {
  health: ServerHealth
  issueType: IssueType
  evidence: string[]
  likelyCause: string
  recommendedNextStep: string
  needsRepairAgent: boolean
  needsLogs: boolean
}

export const MONITORING_THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 75, critical: 90 },
  disk: { warning: 75, critical: 90 },
  heartbeatStaleMs: 3 * 60_000,
} as const

function level(pct: number | null, warning: number, critical: number): HealthLevel {
  if (pct == null) return "NORMAL"
  if (pct >= critical) return "CRITICAL"
  if (pct >= warning) return "WARNING"
  return "NORMAL"
}

export function evaluateCpuHealth(pct: number | null): HealthLevel {
  return level(pct, MONITORING_THRESHOLDS.cpu.warning, MONITORING_THRESHOLDS.cpu.critical)
}

export function evaluateMemoryHealth(pct: number | null): HealthLevel {
  return level(pct, MONITORING_THRESHOLDS.memory.warning, MONITORING_THRESHOLDS.memory.critical)
}

export function evaluateDiskHealth(pct: number | null): HealthLevel {
  return level(pct, MONITORING_THRESHOLDS.disk.warning, MONITORING_THRESHOLDS.disk.critical)
}

export function evaluateDockerHealth(status: string | null): HealthLevel {
  if (status === "RUNNING") return "NORMAL"
  if (status === "STOPPED" || status === "UNAVAILABLE") return "CRITICAL"
  return "NORMAL"
}

export function evaluateContainerHealth(unhealthy: number): HealthLevel {
  if (unhealthy <= 0) return "NORMAL"
  if (unhealthy >= 3) return "CRITICAL"
  return "WARNING"
}

export function evaluateHeartbeatHealth(lastHeartbeatAt: string | null): HealthLevel {
  if (!lastHeartbeatAt) return "WARNING"
  const age = Date.now() - new Date(lastHeartbeatAt).getTime()
  if (age > MONITORING_THRESHOLDS.heartbeatStaleMs) return "WARNING"
  return "NORMAL"
}

export function classifyMonitoringIntent(text: string): MonitoringIntent {
  const t = text.toLowerCase()
  if (/\b(app|service|website|site)\b/.test(t) && /\b(not responding|down|unreachable|offline|crash|crashing)\b/.test(t)) {
    return "DIAGNOSE_APP_DOWN"
  }
  if (/\bdocker\b/.test(t)) return "CHECK_DOCKER_STATUS"
  if (/\b(container|unhealthy)\b/.test(t)) return "CHECK_CONTAINER_HEALTH"
  if (/\b(disk|storage|space|full)\b/.test(t)) {
    return /(why|high|pressure|full|mostly|almost)/.test(t) ? "DIAGNOSE_DISK_PRESSURE" : "CHECK_DISK_USAGE"
  }
  if (/\bcpu\b/.test(t)) {
    return /(why|high|pegged|slow|diagnose)/.test(t) ? "DIAGNOSE_HIGH_CPU" : "CHECK_CPU_USAGE"
  }
  if (/\b(memory|ram)\b/.test(t)) {
    return /(why|high|leak|slow|diagnose)/.test(t) ? "DIAGNOSE_HIGH_MEMORY" : "CHECK_MEMORY_USAGE"
  }
  if (/\b(heartbeat|last monitored|last check|when.*monitor)/.test(t)) return "CHECK_LAST_HEARTBEAT"
  if (/\b(slow|performance|lag|sluggish|unresponsive)\b/.test(t)) return "DIAGNOSE_SERVER_SLOWNESS"
  if (/\b(monitoring?|metrics?)\b/.test(t)) return "CHECK_MONITORING_STATUS"
  return "CHECK_SERVER_HEALTH"
}

function dockerText(status: string | null): string {
  if (status === "RUNNING") return "running"
  if (status === "STOPPED") return "stopped"
  if (status === "UNAVAILABLE") return "unavailable"
  return "unknown"
}

function pctText(label: string, value: number | null): string | null {
  return value == null ? null : `${label} usage is ${Math.round(value)}%`
}

export function buildServerHealthSummary(ctx: MonitoringContext): HealthSummary {
  const cpu = evaluateCpuHealth(ctx.metrics.cpuPercent)
  const memory = evaluateMemoryHealth(ctx.metrics.memoryPercent)
  const disk = evaluateDiskHealth(ctx.metrics.diskPercent)
  const docker = evaluateDockerHealth(ctx.docker.status)
  const container = evaluateContainerHealth(ctx.docker.unhealthyContainers)
  const heartbeat = evaluateHeartbeatHealth(ctx.lastHeartbeatAt)

  const noSnapshot = ctx.freshness === "UNAVAILABLE"
  const levels = { cpu, memory, disk, docker, container }
  const anyCritical = Object.values(levels).some((l) => l === "CRITICAL")
  const anyWarning = Object.values(levels).some((l) => l === "WARNING")
  const health: ServerHealth = noSnapshot
    ? "UNKNOWN"
    : anyCritical
      ? "CRITICAL"
      : anyWarning
        ? "DEGRADED"
        : "HEALTHY"

  const evidence: string[] = []
  const cpuLine = pctText("CPU", ctx.metrics.cpuPercent)
  if (cpuLine) evidence.push(cpuLine)
  const memLine = pctText("Memory", ctx.metrics.memoryPercent)
  if (memLine) evidence.push(memLine)
  const diskLine = pctText("Disk", ctx.metrics.diskPercent)
  if (diskLine) evidence.push(diskLine)
  if (ctx.docker.status) evidence.push(`Docker is ${dockerText(ctx.docker.status)}`)
  evidence.push(
    ctx.docker.unhealthyContainers === 0
      ? "No unhealthy containers"
      : `${ctx.docker.unhealthyContainers} unhealthy container${ctx.docker.unhealthyContainers === 1 ? "" : "s"}`
  )
  evidence.push(
    heartbeat === "NORMAL" ? "Heartbeat is fresh" : "Heartbeat is stale or missing"
  )

  let likelyCause: string
  let recommendedNextStep: string
  if (disk === "CRITICAL") {
    likelyCause = "Disk usage is critically high."
    recommendedNextStep = "Free up disk space on the server."
  } else if (memory === "CRITICAL") {
    likelyCause = "Memory usage is critically high."
    recommendedNextStep = "Inspect memory-heavy containers and their recent logs."
  } else if (cpu === "CRITICAL") {
    likelyCause = "CPU usage is critically high."
    recommendedNextStep = "Inspect CPU-heavy processes or containers."
  } else if (docker === "CRITICAL") {
    likelyCause = "The Docker daemon is not running."
    recommendedNextStep = "Investigate why the Docker daemon is stopped."
  } else if (container !== "NORMAL") {
    likelyCause = "One or more containers are unhealthy."
    recommendedNextStep = "Inspect the unhealthy container(s) and their recent logs."
  } else if (anyWarning) {
    likelyCause = "Resource usage or container health is elevated."
    recommendedNextStep = "Review the affected resource and its recent logs."
  } else {
    likelyCause = "No significant issues detected."
    recommendedNextStep = "No action needed."
  }

  const needsRepairAgent =
    anyCritical ||
    ctx.docker.unhealthyContainers > 0 ||
    (ctx.docker.status != null && ctx.docker.status !== "RUNNING")

  let issueType: IssueType = "NONE"
  if (disk === "CRITICAL") issueType = "DISK_PRESSURE"
  else if (memory === "CRITICAL") issueType = "HIGH_MEMORY"
  else if (cpu === "CRITICAL") issueType = "HIGH_CPU"
  else if (docker === "CRITICAL") issueType = "DOCKER_STOPPED"
  else if (container !== "NORMAL") issueType = "CONTAINER_UNHEALTHY"
  else if (disk === "WARNING") issueType = "DISK_PRESSURE"
  else if (memory === "WARNING") issueType = "HIGH_MEMORY"
  else if (cpu === "WARNING") issueType = "HIGH_CPU"
  else if (ctx.freshness === "STALE") issueType = "MONITORING_STALE"
  else if (noSnapshot) issueType = "SERVER_UNREACHABLE"

  // Logs add signal for container, Docker, and unreachable issues; a pure metric
  // read does not need them.
  const needsLogs =
    issueType === "CONTAINER_UNHEALTHY" ||
    issueType === "DOCKER_STOPPED" ||
    issueType === "SERVER_UNREACHABLE" ||
    ctx.docker.unhealthyContainers > 0

  return {
    health,
    issueType,
    evidence,
    likelyCause,
    recommendedNextStep,
    needsRepairAgent,
    needsLogs,
  }
}
