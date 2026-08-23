import assert from "node:assert/strict"

import { serverMetricsJobId, type MonitoringJobPayload } from "./monitoring.queue"

const serverId = "cmsr4bngv00354g6oriejg00k"
const payload: MonitoringJobPayload = {
  serverId,
  jobType: "COLLECT_SERVER_METRICS",
}

assert.equal(serverMetricsJobId(serverId), `server-metrics-${serverId}`)
assert.ok(!serverMetricsJobId(serverId).includes(":"))
assert.deepEqual(Object.keys(payload).sort(), ["jobType", "serverId"])
assert.ok(!JSON.stringify(payload).includes("PRIVATE KEY"))

console.log("monitoring queue checks passed")

