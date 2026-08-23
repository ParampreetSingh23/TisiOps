/**
 * Pure metric parsing/normalization helpers. No Prisma, no SSH, no secrets —
 * kept separate so it can be unit-checked without a database or a server.
 */

export type MetricFreshness = "FRESH" | "STALE" | "UNAVAILABLE"

export const METRICS_FRESH_MS = 2 * 60_000
export const HEARTBEAT_STALE_MS = 3 * 60_000

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return NaN
  return Math.min(max, Math.max(min, value))
}

function valueOf(line: string): number {
  const idx = line.lastIndexOf(" ")
  if (idx === -1) return NaN
  return parseFloat(line.slice(idx + 1))
}

function cpuCounters(raw: string): { total: number; idle: number } {
  let total = 0
  let idle = 0
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("node_cpu_seconds_total{")) continue
    const meta = trimmed.slice(0, trimmed.lastIndexOf(" "))
    const value = valueOf(trimmed)
    if (Number.isNaN(value)) continue
    const mode = /mode="([^"]+)"/.exec(meta)
    total += value
    if (mode && mode[1] === "idle") idle += value
  }
  return { total, idle }
}

function memoryPercent(raw: string): number | null {
  let total = NaN
  let available = NaN
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith("node_memory_MemTotal_bytes")) total = valueOf(trimmed)
    if (trimmed.startsWith("node_memory_MemAvailable_bytes")) available = valueOf(trimmed)
  }
  if (Number.isNaN(total) || Number.isNaN(available) || total <= 0) return null
  return clamp(((total - available) / total) * 100, 0, 100)
}

function diskPercent(raw: string): number | null {
  let size = 0
  let available = 0
  let found = false
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.includes("mountpoint=\"/\"")) continue
    if (trimmed.startsWith("node_filesystem_size_bytes{")) {
      size += valueOf(trimmed)
      found = true
    }
    if (trimmed.startsWith("node_filesystem_avail_bytes{")) {
      available += valueOf(trimmed)
      found = true
    }
  }
  if (!found || size <= 0) return null
  return clamp(((size - available) / size) * 100, 0, 100)
}

/**
 * Parses one or two node-exporter text payloads into the MVP metrics.
 * CPU needs two samples (a delta over time); RAM and Disk are single-value.
 */
export function parseNodeExporterMetrics(samples: string[]): {
  cpuPercent: number | null
  memoryPercent: number | null
  diskPercent: number | null
} {
  const raw = samples[0] ?? ""
  const prev = cpuCounters(raw)
  const next = cpuCounters(samples[1] ?? "")
  const deltaTotal = next.total - prev.total
  const deltaIdle = next.idle - prev.idle
  const cpuPercent =
    deltaTotal > 0 ? clamp(((deltaTotal - deltaIdle) / deltaTotal) * 100, 0, 100) : null

  return {
    cpuPercent,
    memoryPercent: memoryPercent(raw),
    diskPercent: diskPercent(raw),
  }
}

export function parseDockerSummary(output: string): {
  dockerStatus: string
  containerCount: number
  unhealthyContainers: number
} {
  const get = (key: string) => {
    const match = output.match(new RegExp(`^${key}=(.*)$`, "m"))
    return match ? match[1].trim() : null
  }
  return {
    dockerStatus: get("DOCKER_STATUS") ?? "UNKNOWN",
    containerCount: parseInt(get("DOCKER_RUNNING") ?? "0", 10) || 0,
    unhealthyContainers: parseInt(get("DOCKER_UNHEALTHY") ?? "0", 10) || 0,
  }
}

export function parseHeartbeat(output: string): Date | null {
  const match = output.match(/last_heartbeat=([0-9T:\-Z]+)/)
  if (!match) return null
  const parsed = new Date(match[1])
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function calculateMetricFreshness(
  collectedAt: Date | null | undefined
): MetricFreshness {
  if (!collectedAt) return "UNAVAILABLE"
  if (Date.now() - collectedAt.getTime() < METRICS_FRESH_MS) return "FRESH"
  return "STALE"
}
