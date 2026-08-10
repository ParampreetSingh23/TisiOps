import assert from "node:assert/strict"

import { DEFAULT_JOB_OPTIONS } from "./deployment.queue"
import { JOB_TYPES, type DeploymentJobPayload } from "./deployment.types"
import { describeRedisError, redisTarget } from "./redis"
import { redact } from "../services/redaction"

/**
 * Run with `npm run check:queue --workspace @tisiops/server`.
 *
 * Guards the two properties the free tier and the log table depend on: the
 * Redis payload stays tiny and secret-free, and nothing sensitive survives the
 * log redactor.
 */

// --- Payload size ------------------------------------------------------------

const payload: DeploymentJobPayload = {
  deploymentJobId: "clx0000000000000000000000",
  deploymentId: "clx1111111111111111111111",
  type: JOB_TYPES.N8N_MANAGED_SERVER_DEPLOYMENT,
}

const encoded = JSON.stringify(payload)

// 30 MB free tier. A payload that stays under ~256 bytes keeps thousands of
// queued jobs well inside it, so this is the line that must not creep.
assert.ok(
  Buffer.byteLength(encoded) < 256,
  `redis payload must stay tiny, got ${Buffer.byteLength(encoded)} bytes`
)

// Only the three id/type fields may travel. Anything else means config or
// secrets started leaking into Redis.
assert.deepEqual(Object.keys(payload).sort(), [
  "deploymentId",
  "deploymentJobId",
  "type",
])

// --- Cleanup settings --------------------------------------------------------

const onComplete = DEFAULT_JOB_OPTIONS.removeOnComplete as {
  count: number
  age: number
}
const onFail = DEFAULT_JOB_OPTIONS.removeOnFail as {
  count: number
  age: number
}

assert.ok(onComplete.count <= 50, "completed jobs must be capped")
assert.ok(onComplete.age <= 3_600, "completed jobs must expire within an hour")
assert.ok(onFail.count <= 50, "failed jobs must be capped")
assert.ok(onFail.age <= 86_400, "failed jobs must expire within a day")
assert.equal(DEFAULT_JOB_OPTIONS.attempts, 2)

// --- Redis error classification ----------------------------------------------

// The out-of-memory reply is the one an operator must act on, so it keeps its
// own message instead of being flattened into a generic failure.
assert.equal(
  describeRedisError(
    new Error("OOM command not allowed when used memory > 'maxmemory'")
  ),
  "Redis queue memory limit reached. Please clear old queue jobs or upgrade Redis."
)
assert.equal(
  describeRedisError(new Error("WRONGPASS invalid username-password pair")),
  "Redis rejected the credentials in REDIS_URL."
)

// A raw ioredis message can embed the connection string; the classifier must
// never pass one through.
const leaky = new Error(
  "connect ECONNREFUSED redis://default:hunter2@redis.example.com:6379"
)
assert.ok(!describeRedisError(leaky).includes("hunter2"))

// --- Log redaction -----------------------------------------------------------

assert.ok(
  !redact("connecting to rediss://default:hunter2@host:6379").includes(
    "hunter2"
  )
)
assert.ok(
  !redact("key AKIAIOSFODNN7EXAMPLE used").includes("AKIAIOSFODNN7EXAMPLE")
)
assert.ok(
  !redact("token ghp_abcdefghijklmnopqrstuvwxyz0123456789").includes("ghp_abc")
)
assert.ok(!redact("DB_POSTGRESDB_PASSWORD=s3cr3tvalue").includes("s3cr3tvalue"))
assert.ok(
  !redact("postgres://user:pw@db.neon.tech/neondb").includes("pw@db.neon.tech")
)

// Ordinary lines must survive untouched, or the log becomes unreadable.
assert.equal(
  redact("EC2 instance created: i-0abc123"),
  "EC2 instance created: i-0abc123"
)

// --- Target formatting -------------------------------------------------------

process.env.REDIS_URL = "rediss://default:hunter2@example.redis.io:10419"
const target = redisTarget()
assert.equal(target, "example.redis.io:10419")
assert.ok(!target.includes("hunter2"), "target must never carry the password")

console.log("queue checks passed")
