/**
 * AI Console limits.
 *
 * Pure data and decisions: no database, no Redis, no model. Everything that
 * decides whether a request is allowed lives here so the rules are in one
 * place and directly checkable.
 *
 * Enforcement happens server-side before the provider is called. The UI
 * mirrors these numbers, but a client that ignores them changes nothing.
 */

export type LimitProfile = {
  dailyMessages: number
  dailyTokens: number
  perMinute: number
  maxInputChars: number
  /** Turns of history sent to the model, newest first. */
  maxHistory: number
}

export const USER_LIMITS: LimitProfile = {
  dailyMessages: 30,
  dailyTokens: 100_000,
  perMinute: 5,
  maxInputChars: 8_000,
  maxHistory: 12,
}

/**
 * Admins are presented as unlimited but are not literally unbounded.
 *
 * A runaway loop under an admin session would otherwise bill without any stop,
 * so the ceiling is high enough never to be reached by hand and low enough to
 * catch a bug.
 */
export const ADMIN_LIMITS: LimitProfile = {
  dailyMessages: 10_000,
  dailyTokens: 50_000_000,
  perMinute: 120,
  maxInputChars: 32_000,
  maxHistory: 30,
}

export function limitsFor(isAdmin: boolean): LimitProfile {
  return isAdmin ? ADMIN_LIMITS : USER_LIMITS
}

export type LimitReason =
  "daily_messages" | "daily_tokens" | "rate_limit" | "input_too_long"

export const LIMIT_MESSAGES: Record<LimitReason, string> = {
  daily_messages:
    "You have reached today's AI Console limit. Please try again tomorrow.",
  daily_tokens:
    "You have reached today's AI token limit. Please try again tomorrow.",
  rate_limit:
    "You are sending messages too quickly. Please wait a few seconds.",
  input_too_long: "Your message is too long. Please shorten it and try again.",
}

export type LimitDecision =
  { allowed: true } | { allowed: false; reason: LimitReason; message: string }

function deny(reason: LimitReason): LimitDecision {
  return { allowed: false, reason, message: LIMIT_MESSAGES[reason] }
}

export type UsageSnapshot = {
  messageCount: number
  totalTokens: number
}

/**
 * The decision, given what the user has already spent.
 *
 * Order matters: input length is checked first because it is free to check and
 * costs the user nothing, and the rate limit is checked before the daily
 * counts so a burst gets the recoverable message rather than the one that says
 * to come back tomorrow.
 */
export function decide(input: {
  isAdmin: boolean
  message: string
  usage: UsageSnapshot
  minuteCount: number
}): LimitDecision {
  const limits = limitsFor(input.isAdmin)

  if (input.message.length > limits.maxInputChars) return deny("input_too_long")
  if (input.minuteCount >= limits.perMinute) return deny("rate_limit")
  if (input.usage.messageCount >= limits.dailyMessages) {
    return deny("daily_messages")
  }
  if (input.usage.totalTokens >= limits.dailyTokens) return deny("daily_tokens")

  return { allowed: true }
}

/**
 * Fallback when the provider does not report usage.
 *
 * Four characters per token is the usual rough ratio for English. It is an
 * estimate, and it rounds up, because undercounting spends real money.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** UTC day key. The reset is the same moment for everyone. */
export function usageDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Minute bucket for the Redis rate-limit key. */
export function minuteBucket(now = new Date()): string {
  return now.toISOString().slice(0, 16).replace(/[-:T]/g, "")
}
