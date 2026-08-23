import assert from "node:assert/strict"

import {
  assertShellSafe,
  DOCKER_INSTALL_SCRIPT,
  HEARTBEAT_SCRIPT,
  MONITORING_COMPOSE,
  MONITORING_ERROR_CODES,
} from "./monitoring-installer"

// The trust boundary: anything spliced into a root bash script must be only
// safe characters. Quotes, backticks, `$`, and whitespace are all an escape.
assert.equal(assertShellSafe("/opt/tisiops/monitoring", "path"), "/opt/tisiops/monitoring")
assert.equal(assertShellSafe("srv_abc123", "id"), "srv_abc123")
for (const [unsafe, label] of [
  ['"/etc/passwd"', "path"],
  ['"; rm -rf /', "id"],
  ["$(whoami)", "id"],
  ["`whoami`", "id"],
  ["x y", "id"],
]) {
  assert.throws(() => assertShellSafe(unsafe, label), /unsafe/)
}

// The fixed compose must declare the three collectors the verify step checks,
// and bind them only to the host loopback — never public.
for (const service of ["node-exporter", "cadvisor", "heartbeat"]) {
  assert.match(MONITORING_COMPOSE, new RegExp(`\\b${service}:`))
}
assert.match(MONITORING_COMPOSE, /"127\.0\.0\.1:9100:9100"/)
assert.match(MONITORING_COMPOSE, /"127\.0\.0\.1:8080:8080"/)
assert.doesNotMatch(MONITORING_COMPOSE, /"0\.0\.0\.0:/)
assert.doesNotMatch(MONITORING_COMPOSE, /privileged:\s*true/i)
assert.doesNotMatch(MONITORING_COMPOSE + HEARTBEAT_SCRIPT, /password|passphrase|private.?key|token|secret|BEGIN [A-Z ]*PRIVATE KEY/i)

// The heartbeat only records a success once both collectors answer.
assert.match(HEARTBEAT_SCRIPT, /node-exporter:9100/)
assert.match(HEARTBEAT_SCRIPT, /cadvisor:8080/)
assert.match(HEARTBEAT_SCRIPT, /last_heartbeat/)

// Docker install must be the approved CE + compose-plugin path, not some
// unrelated installer.
assert.match(DOCKER_INSTALL_SCRIPT, /\bdocker-ce\b/)
assert.match(DOCKER_INSTALL_SCRIPT, /\bdocker-compose-plugin\b/)
assert.match(DOCKER_INSTALL_SCRIPT, /systemctl enable --now docker/)

// The full controlled error surface the worker can emit.
for (const code of [
  "SSH_UNREACHABLE",
  "SSH_AUTH_FAILED",
  "SSH_TIMEOUT",
  "SSH_DNS_FAILED",
  "SSH_CONNECTION_REFUSED",
  "SSH_CONNECTION_TIMEOUT",
  "SSH_HANDSHAKE_TIMEOUT",
  "SSH_HOST_UNREACHABLE",
  "SSH_CONNECTION_RESET",
  "SSH_UNKNOWN_ERROR",
  "SUDO_UNAVAILABLE",
  "DOCKER_INSTALL_FAILED",
  "DOCKER_NOT_AVAILABLE",
  "MONITORING_DIRECTORY_FAILED",
  "MONITORING_CONFIG_FAILED",
  "MONITORING_COMPOSE_FAILED",
  "NODE_EXPORTER_START_FAILED",
  "CADVISOR_START_FAILED",
  "HEARTBEAT_START_FAILED",
  "MONITORING_VERIFY_FAILED",
  "UNKNOWN_MONITORING_INSTALL_ERROR",
]) {
  assert.ok(MONITORING_ERROR_CODES.includes(code as never), `missing error code ${code}`)
}

console.log("monitoring installer checks passed")
