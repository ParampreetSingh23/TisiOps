import { connectedRedis, isRedisConfigured } from "../../queues/redis"
import { minuteBucket } from "./limits"

/**
 * Per-minute burst limiting, in Redis.
 *
 * Counters only — never prompt text, never a reply. Each key is a small integer
 * that expires in two minutes, which is what keeps this inside the 30 MB free
 * tier no matter how many users there are.
 *
 * Redis is the burst guard, not the spend guard. The daily limits live in
 * Postgres, so an evicted or expired key costs a little burst tolerance and
 * nothing else.
 */

const redis = () => connectedRedis("tisiops-ratelimit")

export function rateKey(userId: string, now = new Date()): string {
  return `ai:rate:user:${userId}:minute:${minuteBucket(now)}`
}

/**
 * How many messages this user has sent in the current minute.
 *
 * Returns 0 when Redis is unavailable — the request proceeds and the daily
 * Postgres limits still apply. Failing closed would take the console down
 * entirely on a Redis blip, which is a worse trade than losing burst control.
 */
export async function currentMinuteCount(userId: string): Promise<number> {
  if (!isRedisConfigured()) return 0

  try {
    const client = await redis()
    const value = await client.get(rateKey(userId))
    return value ? Number(value) : 0
  } catch {
    return 0
  }
}

/** Records one message against the current minute. Never throws. */
export async function recordMinuteHit(userId: string): Promise<void> {
  if (!isRedisConfigured()) return

  try {
    const key = rateKey(userId)
    const client = await redis()
    // INCR then EXPIRE in one round trip. The TTL is refreshed each time, which
    // is harmless: the key names its own minute, so it cannot outlive it by
    // more than the expiry.
    await client.multi().incr(key).expire(key, 120).exec()
  } catch {
    // Burst control is best-effort; the daily limit is the real guard.
  }
}
