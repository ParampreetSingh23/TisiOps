import assert from "node:assert/strict"

import {
  calculateMetricFreshness,
  parseDockerSummary,
  parseHeartbeat,
  parseNodeExporterMetrics,
} from "./metrics-parse"

// Two samples 1s apart where non-idle CPU grows. total delta = 1.0s, idle
// delta = 0.5s → (1 - 0.5/1.0) * 100 = 50%.
const sample1 = `
node_cpu_seconds_total{cpu="0",mode="idle"} 100
node_cpu_seconds_total{cpu="0",mode="user"} 20
node_memory_MemTotal_bytes 1000000
node_memory_MemAvailable_bytes 400000
node_filesystem_size_bytes{device="/dev/sda1",fstype="ext4",mountpoint="/"} 1000
node_filesystem_avail_bytes{device="/dev/sda1",fstype="ext4",mountpoint="/"} 600
node_filesystem_size_bytes{device="shm",fstype="tmpfs",mountpoint="/run"} 100
node_filesystem_avail_bytes{device="shm",fstype="tmpfs",mountpoint="/run"} 10
`
const sample2 = `
node_cpu_seconds_total{cpu="0",mode="idle"} 100.5
node_cpu_seconds_total{cpu="0",mode="user"} 20.5
`

const parsed = parseNodeExporterMetrics([sample1, sample2])
assert.ok(parsed.cpuPercent !== null)
assert.ok(parsed.memoryPercent !== null)
assert.ok(parsed.diskPercent !== null)
assert.ok(Math.abs(parsed.cpuPercent - 50) < 0.01, `cpu got ${parsed.cpuPercent}`)
assert.ok(Math.abs(parsed.memoryPercent! - 60) < 0.01, `ram got ${parsed.memoryPercent}`)
assert.ok(Math.abs(parsed.diskPercent! - 40) < 0.01, `disk got ${parsed.diskPercent}`)

// The tmpfs mount must not leak into the root `/` disk calculation.
assert.ok(parsed.diskPercent! > 0)
assert.ok(parsed.diskPercent! < 50, "tmpfs must be ignored")

// Values are clamped 0–100.
const clamped = parseNodeExporterMetrics(["node_memory_MemTotal_bytes 0\nt2 1"])
assert.ok(clamped.memoryPercent === null || (clamped.memoryPercent >= 0 && clamped.memoryPercent <= 100))

// Docker summary normalization.
const docker = parseDockerSummary([
  "DOCKER_STATUS=RUNNING",
  "DOCKER_RUNNING=5",
  "DOCKER_UNHEALTHY=1",
].join("\n"))
assert.deepEqual(docker, { dockerStatus: "RUNNING", containerCount: 5, unhealthyContainers: 1 })

assert.deepEqual(parseDockerSummary("DOCKER_STATUS=STOPPED\nDOCKER_RUNNING=bad\n"), {
  dockerStatus: "STOPPED",
  containerCount: 0,
  unhealthyContainers: 0,
})

// Heartbeat parsing.
assert.ok(parseHeartbeat("last_heartbeat=2026-08-22T18:00:00Z node-exporter=ok") instanceof Date)
assert.equal(parseHeartbeat("missing"), null)

// Freshness: no snapshot → UNAVAILABLE, recent → FRESH, old → STALE.
assert.equal(calculateMetricFreshness(null), "UNAVAILABLE")
assert.equal(calculateMetricFreshness(new Date(Date.now() - 60_000)), "FRESH")
assert.equal(calculateMetricFreshness(new Date(Date.now() - 3 * 60_000)), "STALE")

console.log("metrics collector checks passed")
