import assert from "node:assert/strict"

import type { Deployment } from "../../db/generated/client"
import { availableActions } from "./lifecycle.rules"

/**
 * Run with `npm run check:lifecycle --workspace @tisiops/server`.
 *
 * Guards the rules that stop a user losing track of something that costs money:
 * a record can never be removed while its infrastructure is still running, and
 * an action is never offered where it cannot work.
 */

const make = (over: Partial<Deployment>) =>
  ({
    type: "N8N",
    status: "LIVE",
    vercelProjectId: null,
    ...over,
  }) as unknown as Deployment

// --- Managed server, live -----------------------------------------------------

const live = availableActions(make({}), true)
assert.equal(live.canStop, true)
assert.equal(live.canStart, false)
assert.equal(live.canDelete, true)
// The server still exists, so removing the record would orphan it.
assert.equal(live.canRemove, false)

// --- Stopped ------------------------------------------------------------------

const stopped = availableActions(make({ status: "STOPPED" }), true)
assert.equal(stopped.canStart, true)
assert.equal(stopped.canStop, false)
// Still deletable: a stopped server is still billing for its volume and address.
assert.equal(stopped.canDelete, true)
assert.equal(stopped.canRemove, false)

// --- A job actually running ---------------------------------------------------

for (const status of [
  "RUNNING",
  "PROVISIONING_INFRA",
  "BOOTSTRAPPING_SERVER",
  "STOPPING",
  "STARTING",
  "QUEUED",
]) {
  const busy = availableActions(make({ status: status as never }), true, true)
  assert.equal(busy.canStop, false, `${status} must not offer stop`)
  assert.equal(busy.canStart, false, `${status} must not offer start`)
  // Destroying mid-apply is how state and reality stop matching.
  assert.equal(busy.canDelete, false, `${status} must not offer delete`)
  assert.ok(busy.note)
}

// --- Stalled: mid-flight status, but no job running ---------------------------
//
// A worker killed part-way leaves the status reading HEALTH_CHECKING forever.
// The server is still billing, so delete must stay available — blocking on a
// stale status once made a deployment impossible to remove.

for (const status of [
  "HEALTH_CHECKING",
  "BOOTSTRAPPING_SERVER",
  "PROVISIONING_INFRA",
  "CONFIGURING_N8N",
  "WAITING_FOR_DNS",
]) {
  const stalled = availableActions(
    make({ status: status as never }),
    true,
    false
  )
  assert.equal(stalled.canDelete, true, `${status} must stay deletable`)
}

// Powering off a half-configured server is still refused: the machine is not
// finished being set up.
for (const status of [
  "BOOTSTRAPPING_SERVER",
  "PROVISIONING_INFRA",
  "CONFIGURING_N8N",
]) {
  const stalled = availableActions(
    make({ status: status as never }),
    true,
    false
  )
  assert.equal(stalled.canStop, false, `${status} must not offer stop`)
  assert.ok(stalled.note?.includes("stalled"), `${status} should explain`)
}

// A server waiting on a health check or on DNS is already running, so stopping
// it is a legitimate way to stop paying for it.
const waiting = availableActions(
  make({ status: "HEALTH_CHECKING" }),
  true,
  false
)
assert.equal(waiting.canStop, true)

// --- Vercel -------------------------------------------------------------------

const vercel = availableActions(
  make({ type: "VERCEL", vercelProjectId: "prj_1" }),
  false
)
// There is no machine to power off, so neither button is offered.
assert.equal(vercel.canStop, false)
assert.equal(vercel.canStart, false)
assert.equal(vercel.canDelete, true)
assert.ok(vercel.note?.includes("no server"))

// A Vercel deployment that never created a project has nothing to delete.
const neverDeployed = availableActions(
  make({ type: "VERCEL", status: "FAILED" }),
  false
)
assert.equal(neverDeployed.canDelete, false)
// But its record can be cleared away.
assert.equal(neverDeployed.canRemove, true)

// --- Removal ------------------------------------------------------------------

for (const status of ["CANCELLED", "FAILED", "PLACEHOLDER"]) {
  const done = availableActions(
    make({ type: "VERCEL", status: status as never }),
    false
  )
  assert.equal(done.canRemove, true, `${status} should be removable`)
}

// The one that matters: destroyed infrastructure, record can go.
const destroyed = availableActions(make({ status: "CANCELLED" }), false)
assert.equal(destroyed.canRemove, true)
assert.equal(destroyed.canDelete, false)

console.log("lifecycle checks passed")
