import assert from "node:assert/strict"

import {
  mapAwsInstanceState,
  pauseBlockedReason,
  reconcileSshServerStatus,
  restartBlockedReason,
  serverAddress,
  statusAfterFailedSshCheck,
  usesPlatformAwsAccount,
} from "./server-status"

const cases: Array<[string | null, string | null]> = [
  ["pending", "STARTING"],
  ["running", "CONNECTED"],
  ["stopping", "STOPPING"],
  ["stopped", "STOPPED"],
  ["shutting-down", "STOPPING"],
  ["terminated", "TERMINATED"],
  [null, null],
  ["unknown", null],
]

for (const [awsState, expected] of cases) {
  assert.equal(mapAwsInstanceState(awsState), expected)
}

// A server TisiOps only reaches over SSH has no provider API to poll, so a
// pause used to pin it at STOPPING for good. Whether the machine still answers
// on its SSH port is the only signal available, and it is enough.
assert.equal(
  reconcileSshServerStatus("STOPPING", false),
  "STOPPED",
  "a machine that stopped answering finished stopping"
)
assert.equal(
  reconcileSshServerStatus("STOPPING", true),
  null,
  "a machine still answering is still shutting down"
)
assert.equal(reconcileSshServerStatus("STARTING", true), "CONNECTED")
assert.equal(reconcileSshServerStatus("STARTING", false), null)

// Anything settled is left alone: a reachability probe must never overrule a
// real status.
for (const settled of ["CONNECTED", "STOPPED", "NEEDS_ATTENTION", "TERMINATED"]) {
  assert.equal(reconcileSshServerStatus(settled, true), null)
  assert.equal(reconcileSshServerStatus(settled, false), null)
}

// A machine the user asked to stop is off, not broken. Reporting UNREACHABLE
// there loses the reason it is off and offers the user the wrong next action.
assert.equal(statusAfterFailedSshCheck("STOPPING"), "STOPPED")
assert.equal(statusAfterFailedSshCheck("STOPPED"), "STOPPED")
assert.equal(statusAfterFailedSshCheck("CONNECTED"), "UNREACHABLE")
assert.equal(statusAfterFailedSshCheck("VERIFYING"), "UNREACHABLE")

// --- Why a power button is unavailable ---------------------------------------
//
// The reason has to come from the same place as the decision. When the page
// re-derived it, a stopped bring-your-own server was told "must be connected
// with stored SSH credentials" — which it already was. The real answer is that
// TisiOps has no way to power it on.

const overSsh = {
  hasProviderControl: false,
  canUseSudoOverSsh: true,
  hasAddress: true,
}
const overProvider = {
  hasProviderControl: true,
  canUseSudoOverSsh: false,
  hasAddress: true,
}

// A stopped bring-your-own server keeps its Start button: TisiOps can look the
// instance up by its address through the user's own AWS connection. Whether
// that connection exists is a question for the action, which can say exactly
// what is missing — not for a button that would just disappear.
assert.equal(restartBlockedReason({ status: "STOPPED", ...overSsh }), null)
assert.match(
  restartBlockedReason({ ...overSsh, status: "STOPPED", hasAddress: false }) ?? "",
  /address/,
  "with no address there is nothing to look the instance up by"
)
assert.equal(restartBlockedReason({ status: "STOPPED", ...overProvider }), null)
assert.equal(restartBlockedReason({ status: "CONNECTED", ...overSsh }), null)
assert.match(
  restartBlockedReason({
    status: "CONNECTED",
    hasProviderControl: false,
    canUseSudoOverSsh: false,
    hasAddress: true,
  }) ?? "",
  /passwordless sudo/
)
assert.match(
  restartBlockedReason({ status: "UNREACHABLE", ...overSsh }) ?? "",
  /connected/
)

assert.match(
  pauseBlockedReason({ status: "STOPPED", ...overProvider }) ?? "",
  /already stopped/
)
assert.match(
  pauseBlockedReason({ status: "STOPPING", ...overProvider }) ?? "",
  /already stopped/
)
assert.equal(pauseBlockedReason({ status: "CONNECTED", ...overSsh }), null)
assert.equal(pauseBlockedReason({ status: "PROVISIONING", ...overProvider }), null)
assert.match(
  pauseBlockedReason({
    status: "CONNECTED",
    hasProviderControl: false,
    canUseSudoOverSsh: false,
    hasAddress: true,
  }) ?? "",
  /passwordless sudo/
)

// The reasons decide the buttons, so the two can never disagree. These pin the
// permissions that were in place before the reasons existed.
const permissions = [
  { status: "STOPPED", ...overProvider, pause: false, restart: true },
  { status: "STOPPED", ...overSsh, pause: false, restart: true },
  {
    ...overSsh,
    status: "STOPPED",
    hasAddress: false,
    pause: false,
    restart: false,
  },
  { status: "STOPPING", ...overProvider, pause: false, restart: false },
  { status: "CONNECTED", ...overSsh, pause: true, restart: true },
  { status: "CONNECTED", ...overProvider, pause: true, restart: false },
  { status: "PROVISIONING", ...overProvider, pause: true, restart: false },
  { status: "UNREACHABLE", ...overSsh, pause: false, restart: false },
]

for (const { pause, restart, ...input } of permissions) {
  assert.equal(pauseBlockedReason(input) === null, pause, `pause ${input.status}`)
  assert.equal(
    restartBlockedReason(input) === null,
    restart,
    `restart ${input.status}`
  )
}

// The Elastic IP wins over a stale publicIp. This is the one that regressed
// before, so it is the one worth pinning.
assert.equal(
  serverAddress({ elasticIp: "13.1.1.1", publicIp: "3.9.9.9", host: "old.host" }),
  "13.1.1.1"
)
assert.equal(serverAddress({ publicIp: "3.9.9.9", host: "old.host" }), "3.9.9.9")
assert.equal(serverAddress({ host: "old.host" }), "old.host")
// Empty rather than null: callers join it into strings and filter falsy.
assert.equal(serverAddress({}), "")
assert.equal(serverAddress({ elasticIp: "", publicIp: "3.9.9.9" }), "3.9.9.9")

// The account an AWS call goes to. A user-account server that TisiOps
// provisioned still has a deploymentId, so only the provider may decide this.
assert.equal(usesPlatformAwsAccount("TISIOPS_MANAGED_AWS"), true)
assert.equal(usesPlatformAwsAccount("USER_AWS_ACCOUNT"), false)
assert.equal(usesPlatformAwsAccount("CUSTOM_VPS"), false)
assert.equal(usesPlatformAwsAccount(null), false)
assert.equal(usesPlatformAwsAccount(undefined), false)

console.log("server status checks passed")
