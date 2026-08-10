import type { DeploymentJob } from "../../db/generated/client"
import type { jobLogger } from "../../services/deployment-log.service"

/**
 * What every handler receives and returns.
 *
 * A handler never sees the Redis message. It gets the Postgres row, which is
 * the source of truth, and reads everything else — config, credentials,
 * environment variables — from the database itself.
 */

export type HandlerContext = {
  job: DeploymentJob
  deploymentId: string
  /** Writes to DeploymentLog, redacted. The only logging a handler should do. */
  log: ReturnType<typeof jobLogger>
}

/**
 * Failure is a value, not an exception.
 *
 * The message goes to the user and into a permanent log row, so it has to be a
 * sentence written for them. Anything with a path, a token, or a provider
 * stack trace in it belongs on the worker's stdout instead.
 */
export type HandlerResult = { ok: true } | { ok: false; error: string }

export type Handler = (context: HandlerContext) => Promise<HandlerResult>
