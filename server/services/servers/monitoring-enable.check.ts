import assert from "node:assert/strict"

import { monitoringEnableBlockedReason } from "./server-monitoring.service"

assert.equal(
  monitoringEnableBlockedReason({
    serverStatus: "CONNECTED",
    credentialsStored: true,
    portOpen: false,
  }),
  "The server is unreachable from the worker."
)

assert.equal(
  monitoringEnableBlockedReason({
    serverStatus: "CONNECTED",
    credentialsStored: true,
  }),
  null
)

console.log("monitoring enable checks passed")
