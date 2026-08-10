import assert from "node:assert/strict"

import {
  ADMIN_LIMITS,
  decide,
  estimateTokens,
  LIMIT_MESSAGES,
  limitsFor,
  minuteBucket,
  USER_LIMITS,
  usageDate,
} from "./limits"
import { rateKey } from "./rateLimit"

/**
 * Run with `npm run check:limits --workspace @tisiops/server`.
 *
 * Guards the rules that keep AI spend bounded: a normal user is stopped at the
 * documented numbers, an admin is not, and every refusal happens before the
 * provider is called.
 */

const fresh = { messageCount: 0, totalTokens: 0 }

// --- The documented MVP numbers ---------------------------------------------

assert.equal(USER_LIMITS.dailyMessages, 30)
assert.equal(USER_LIMITS.dailyTokens, 100_000)
assert.equal(USER_LIMITS.perMinute, 5)
assert.equal(USER_LIMITS.maxInputChars, 8_000)
assert.ok(USER_LIMITS.maxHistory >= 10 && USER_LIMITS.maxHistory <= 15)

// --- A normal user within limits ---------------------------------------------

assert.equal(
  decide({ isAdmin: false, message: "hello", usage: fresh, minuteCount: 0 })
    .allowed,
  true
)

// --- Each limit stops the call ----------------------------------------------

const overMessages = decide({
  isAdmin: false,
  message: "hi",
  usage: { messageCount: 30, totalTokens: 0 },
  minuteCount: 0,
})
assert.equal(overMessages.allowed, false)
assert.equal(
  !overMessages.allowed && overMessages.message,
  LIMIT_MESSAGES.daily_messages
)

const overTokens = decide({
  isAdmin: false,
  message: "hi",
  usage: { messageCount: 1, totalTokens: 100_000 },
  minuteCount: 0,
})
assert.equal(!overTokens.allowed && overTokens.reason, "daily_tokens")

const burst = decide({
  isAdmin: false,
  message: "hi",
  usage: fresh,
  minuteCount: 5,
})
assert.equal(!burst.allowed && burst.reason, "rate_limit")

const long = decide({
  isAdmin: false,
  message: "x".repeat(8_001),
  usage: fresh,
  minuteCount: 0,
})
assert.equal(!long.allowed && long.reason, "input_too_long")

// Exactly at the boundary is still allowed — the limit is "30 sent", not 29.
assert.equal(
  decide({
    isAdmin: false,
    message: "x".repeat(8_000),
    usage: { messageCount: 29, totalTokens: 99_999 },
    minuteCount: 4,
  }).allowed,
  true
)

// A burst gets the recoverable message, not "come back tomorrow".
const both = decide({
  isAdmin: false,
  message: "hi",
  usage: { messageCount: 30, totalTokens: 0 },
  minuteCount: 5,
})
assert.equal(!both.allowed && both.reason, "rate_limit")

// --- Admin bypass -------------------------------------------------------------

assert.equal(
  decide({
    isAdmin: true,
    message: "hi",
    usage: { messageCount: 500, totalTokens: 5_000_000 },
    minuteCount: 100,
  }).allowed,
  true
)

// Presented as unlimited, but not literally unbounded — a runaway loop under
// an admin session must still hit a ceiling rather than bill forever.
assert.ok(Number.isFinite(ADMIN_LIMITS.dailyMessages))
assert.ok(ADMIN_LIMITS.dailyMessages > USER_LIMITS.dailyMessages * 100)
assert.equal(
  decide({
    isAdmin: true,
    message: "hi",
    usage: { messageCount: ADMIN_LIMITS.dailyMessages, totalTokens: 0 },
    minuteCount: 0,
  }).allowed,
  false
)

assert.equal(limitsFor(true), ADMIN_LIMITS)
assert.equal(limitsFor(false), USER_LIMITS)

// --- Token estimation ---------------------------------------------------------

// Rounds up: undercounting spends real money unnoticed.
assert.equal(estimateTokens("abcd"), 1)
assert.equal(estimateTokens("abcde"), 2)
assert.equal(estimateTokens(""), 0)

// --- Keys ---------------------------------------------------------------------

const when = new Date("2026-08-09T21:34:56.000Z")
assert.equal(usageDate(when), "2026-08-09")
assert.equal(minuteBucket(when), "202608092134")
assert.equal(rateKey("user_1", when), "ai:rate:user:user_1:minute:202608092134")

// The key must carry no prompt text — it lives in a 30 MB Redis.
assert.ok(rateKey("user_1", when).length < 60)

console.log("ai limit checks passed")
