import assert from "node:assert/strict"

import {
  buildServerHealthSummary,
  classifyMonitoringIntent,
  evaluateContainerHealth,
  evaluateCpuHealth,
  evaluateDiskHealth,
  evaluateDockerHealth,
  evaluateHeartbeatHealth,
  evaluateMemoryHealth,
  type MonitoringContext,
} from "./monitoring-health"

// Thresholds.
assert.equal(evaluateCpuHealth(45), "NORMAL")
assert.equal(evaluateCpuHealth(80), "WARNING")
assert.equal(evaluateCpuHealth(95), "CRITICAL")
assert.equal(evaluateCpuHealth(null), "NORMAL")
assert.equal(evaluateMemoryHealth(60), "NORMAL")
assert.equal(evaluateMemoryHealth(88), "WARNING")
assert.equal(evaluateMemoryHealth(91), "CRITICAL")
assert.equal(evaluateDiskHealth(50), "NORMAL")
assert.equal(evaluateDiskHealth(78), "WARNING")
assert.equal(evaluateDiskHealth(96), "CRITICAL")
assert.equal(evaluateDockerHealth("RUNNING"), "NORMAL")
assert.equal(evaluateDockerHealth("STOPPED"), "CRITICAL")
assert.equal(evaluateDockerHealth("UNAVAILABLE"), "CRITICAL")
assert.equal(evaluateContainerHealth(0), "NORMAL")
assert.equal(evaluateContainerHealth(2), "WARNING")
assert.equal(evaluateContainerHealth(3), "CRITICAL")
assert.equal(evaluateHeartbeatHealth(null), "WARNING")

// Intent classification.
assert.equal(classifyMonitoringIntent("Is my server healthy?"), "CHECK_SERVER_HEALTH")
assert.equal(classifyMonitoringIntent("Is Docker running?"), "CHECK_DOCKER_STATUS")
assert.equal(classifyMonitoringIntent("Why is memory usage high?"), "DIAGNOSE_HIGH_MEMORY")
assert.equal(classifyMonitoringIntent("How much disk is used?"), "CHECK_DISK_USAGE")
assert.equal(classifyMonitoringIntent("Which container is unhealthy?"), "CHECK_CONTAINER_HEALTH")
assert.equal(classifyMonitoringIntent("Why is my server slow?"), "DIAGNOSE_SERVER_SLOWNESS")
assert.equal(classifyMonitoringIntent("When was this monitored?"), "CHECK_LAST_HEARTBEAT")
assert.equal(classifyMonitoringIntent("Why is my app not responding?"), "DIAGNOSE_APP_DOWN")

const base: MonitoringContext = {
  serverId: "srv_1",
  serverName: "prod",
  monitoringStatus: "ACTIVE",
  freshness: "FRESH",
  metrics: { cpuPercent: 34, memoryPercent: 61, diskPercent: 48 },
  docker: { status: "RUNNING", containerCount: 5, unhealthyContainers: 0 },
  lastHeartbeatAt: new Date().toISOString(),
  lastCheckedAt: null,
  collectedAt: new Date().toISOString(),
  healthChecks: [],
  recentLogs: [],
}

// Healthy.
assert.equal(buildServerHealthSummary(base).health, "HEALTHY")
assert.equal(buildServerHealthSummary(base).needsRepairAgent, false)
assert.equal(buildServerHealthSummary(base).issueType, "NONE")
assert.equal(buildServerHealthSummary(base).needsLogs, false)

// High memory → DEGRADED, no repair needed (below critical + no unhealthy).
const mem = buildServerHealthSummary({ ...base, metrics: { ...base.metrics, memoryPercent: 88 } })
assert.equal(mem.health, "DEGRADED")
assert.equal(mem.needsRepairAgent, false)
assert.equal(mem.issueType, "HIGH_MEMORY")

// Disk 96% → CRITICAL + repair handoff.
const disk = buildServerHealthSummary({ ...base, metrics: { ...base.metrics, diskPercent: 96 } })
assert.equal(disk.health, "CRITICAL")
assert.equal(disk.needsRepairAgent, true)
assert.equal(disk.issueType, "DISK_PRESSURE")

// Docker stopped → CRITICAL + repair handoff + logs enrichment.
const dockerStopped = buildServerHealthSummary({ ...base, docker: { ...base.docker, status: "STOPPED" } })
assert.equal(dockerStopped.health, "CRITICAL")
assert.equal(dockerStopped.needsRepairAgent, true)
assert.equal(dockerStopped.issueType, "DOCKER_STOPPED")
assert.equal(dockerStopped.needsLogs, true)

// Two unhealthy containers → DEGRADED + repair handoff + logs (never invents names).
const containers = buildServerHealthSummary({ ...base, docker: { ...base.docker, unhealthyContainers: 2 } })
assert.equal(containers.health, "DEGRADED")
assert.equal(containers.needsRepairAgent, true)
assert.equal(containers.issueType, "CONTAINER_UNHEALTHY")
assert.equal(containers.needsLogs, true)
assert.ok(containers.evidence.some((line) => line.includes("2 unhealthy containers")))
assert.ok(!containers.evidence.some((line) => /[a-z0-9-]+-[0-9a-f]{6,}/.test(line)), "container names must not be invented")

// No snapshot → UNKNOWN despite normal-looking numbers.
const unknown = buildServerHealthSummary({ ...base, freshness: "UNAVAILABLE" })
assert.equal(unknown.health, "UNKNOWN")
assert.equal(unknown.issueType, "SERVER_UNREACHABLE")

console.log("monitoring health checks passed")
