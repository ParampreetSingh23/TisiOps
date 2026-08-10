import { Redis } from "ioredis"

/**
 * Redis Cloud connection for BullMQ.
 *
 * Redis is the transport, not the record: it carries a job id to a worker and
 * nothing else. Every deployment, log, status, and config lives in Postgres,
 * so a flushed or expired Redis loses only the notification.
 *
 * Backend and worker only. Nothing here is ever imported from the frontend,
 * and the URL is never logged — it carries the password in its userinfo.
 */

export const MISSING_REDIS_URL =
  "REDIS_URL is not set. Add the Redis Cloud connection string to the backend and worker environments."

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL)
}

/** Host and port only — safe to log. The password lives in the userinfo. */
export function redisTarget(): string {
  const url = process.env.REDIS_URL
  if (!url) return "not configured"

  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || "6379"}`
  } catch {
    return "unparseable"
  }
}

/**
 * Creates a connection.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ: its blocking commands sit
 * open for seconds at a time, and ioredis' default retry cap would abort them.
 *
 * `rediss://` turns TLS on by itself, so no extra option is needed for the
 * Redis Cloud TLS endpoint.
 */
export function createRedis(connectionName = "tisiops"): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error(MISSING_REDIS_URL)

  return new Redis(url, {
    maxRetriesPerRequest: null,
    connectionName,
    // The API must not hang a request waiting for a queue: a Redis that is
    // down should fail fast so the caller can record it in Postgres and move
    // on, rather than holding the socket open.
    enableOfflineQueue: false,
    lazyConnect: true,
  })
}

/**
 * A connected client, shared per name.
 *
 * `enableOfflineQueue: false` makes commands fail rather than buffer while the
 * socket is opening, which is right for a request path — but it means a client
 * must be awaited before its first command. Callers that skipped this saw their
 * first call of the process fail for no visible reason.
 */
const clients = new Map<string, Promise<Redis>>()

export function connectedRedis(name: string): Promise<Redis> {
  const existing = clients.get(name)
  if (existing) return existing

  const opening = (async () => {
    const client = createRedis(name)
    // Without a handler ioredis treats a connection blip as an unhandled
    // error and takes the process down.
    client.on("error", () => {})
    await client.connect()
    return client
  })().catch((error) => {
    // Not cached on failure, so the next call retries rather than inheriting
    // a permanently rejected promise.
    clients.delete(name)
    throw error
  })

  clients.set(name, opening)
  return opening
}

export type PingResult = {
  redisConnected: boolean
  provider: "Redis Cloud"
  /** Present only on failure, and never contains the URL or password. */
  error?: string
}

/** Connection test for the admin health route. Opens and closes its own client. */
export async function pingRedis(): Promise<PingResult> {
  if (!isRedisConfigured()) {
    return {
      redisConnected: false,
      provider: "Redis Cloud",
      error: MISSING_REDIS_URL,
    }
  }

  const client = createRedis("tisiops-ping")

  try {
    await client.connect()
    const reply = await client.ping()
    return { redisConnected: reply === "PONG", provider: "Redis Cloud" }
  } catch (error) {
    // ioredis puts the full connection string in some error messages, so the
    // message is classified rather than passed through.
    return {
      redisConnected: false,
      provider: "Redis Cloud",
      error: describeRedisError(error),
    }
  } finally {
    client.disconnect()
  }
}

/**
 * Turns a Redis failure into a sentence that is safe to store and show.
 *
 * ioredis error text can include the connection string, and Redis Cloud's
 * OOM reply is the one an operator actually has to act on, so it gets its own
 * message rather than being flattened into "queue unavailable".
 */
export function describeRedisError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  if (/OOM|maxmemory/i.test(raw)) {
    return "Redis queue memory limit reached. Please clear old queue jobs or upgrade Redis."
  }
  if (/WRONGPASS|NOAUTH|invalid password/i.test(raw)) {
    return "Redis rejected the credentials in REDIS_URL."
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|closed/i.test(raw)) {
    return "Could not reach Redis Cloud."
  }

  return "Redis returned an unexpected error."
}
