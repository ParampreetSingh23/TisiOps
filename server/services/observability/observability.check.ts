import assert from "node:assert/strict"

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/tisiops"

const { ERROR_CODES, inferErrorCode } = await import("./deployment-spans")
const { sanitizeLogMetadata } = await import("./logs")

assert.equal(
  inferErrorCode("SSH_TIMEOUT: server did not become reachable over SSH"),
  ERROR_CODES.SSH_TIMEOUT
)
assert.equal(
  inferErrorCode("Docker could not be installed on the server."),
  ERROR_CODES.DOCKER_INSTALL_FAILED
)
assert.equal(
  inferErrorCode("health check did not pass in time"),
  ERROR_CODES.HEALTHCHECK_FAILED
)
assert.deepEqual(sanitizeLogMetadata({ DATABASE_URL: "postgres://u:p@h/db" }), {
  DATABASE_URL: "postgres://«redacted»",
})

console.log("observability checks passed")
