import { prisma } from "../../db/prisma"
import { withSpan } from "../observability/trace"
import { connectMonitoringSsh } from "./monitoring-ssh"
import { decryptStoredServerCredentials } from "./managed-server-credentials"
import { serverAddress } from "./server.service"
import {
  parseProductionRuntime,
  PRODUCTION_RUNTIME_SCRIPT,
  type ProductionRuntime,
} from "./production-runtime-parse"

/**
 * Read-only production discovery.
 *
 * The staging session needs to know what its source server actually runs before
 * it can plan a staging copy. This opens the existing read-only SSH connection
 * (the same one the monitoring worker uses) and runs one inspection script.
 * Nothing is modified. Credentials never cross Redis, logs, telemetry, or the
 * client — only the parsed runtime is stored.
 */

export type DiscoveryResult =
  | { ok: true; runtime: ProductionRuntime }
  | { ok: false; error: string }

async function readRuntimeFromServer(
  server: {
    id: string
    credentialsStored: boolean
    sshPort: number
    sshUsername: string | null
    elasticIp?: string | null
    publicIp?: string | null
    host?: string | null
    credentials: { authType: string; encryptedPrivateKey: string | null; encryptedPassword: string | null; encryptedPassphrase: string | null } | null
  }
): Promise<DiscoveryResult> {
  if (!server.credentialsStored || !server.credentials) {
    return { ok: false, error: "No stored SSH credentials for this server." }
  }

  const resolved = decryptStoredServerCredentials(server.credentials)
  if (!resolved?.privateKey && !resolved?.password) {
    return { ok: false, error: "No usable SSH credentials." }
  }

  const ssh = await connectMonitoringSsh({
    host: serverAddress(server),
    sshPort: server.sshPort,
    sshUsername: server.sshUsername || "ubuntu",
    authType: resolved.authType,
    privateKey: resolved.privateKey,
    password: resolved.password,
    passphrase: resolved.passphrase,
    serverId: server.id,
  })
  if (!ssh.ok) return { ok: false, error: ssh.message }

  try {
    const exec = await ssh.conn.exec(PRODUCTION_RUNTIME_SCRIPT, ssh.conn.sudo)
    if (!exec.ok) {
      return { ok: false, error: exec.stderr || exec.stdout || "Discovery command failed." }
    }
    return { ok: true, runtime: parseProductionRuntime(exec.stdout) }
  } catch {
    return { ok: false, error: "Production discovery failed." }
  } finally {
    ssh.conn.close()
  }
}

/** Reads the runtime for any server the caller can target (e.g. an existing
 *  server selected for staging). Read-only; does not store anything. */
export async function readServerRuntime(serverId: string): Promise<DiscoveryResult> {
  const server = await prisma.server.findFirst({
    where: { id: serverId },
    include: { credentials: true },
  })
  if (!server) return { ok: false, error: "Server not found." }
  return readRuntimeFromServer(server)
}

/**
 * Runs read-only discovery for one staging session's source server and stores
 * the parsed runtime on the session. Runs in the worker, never in a request.
 */
export async function discoverProductionRuntime(input: {
  userId: string
  stagingSessionId: string
  serverId: string
}): Promise<DiscoveryResult> {
  return withSpan(
    "staging.production.discover",
    {
      serverId: input.serverId,
      userId: input.userId,
      jobType: "DISCOVER_PRODUCTION",
      collectionStatus: "started",
    },
    async () => {
      const session = await prisma.stagingSession.findFirst({
        where: { id: input.stagingSessionId, userId: input.userId },
        include: { sourceServer: { include: { credentials: true } } },
      })
      if (!session) return { ok: false, error: "Staging session not found" }
      if (!session.sourceServer) return { ok: false, error: "Source server not found" }

      const result = await readRuntimeFromServer(session.sourceServer)
      if (!result.ok) {
        await prisma.stagingSession.update({
          where: { id: session.id },
          data: {
            discoveryError: result.error,
            status: "SOURCE_DISCOVERY_FAILED",
          },
        })
        return result
      }

      await prisma.stagingSession.update({
        where: { id: session.id },
        data: {
          runtimeJson: result.runtime as never,
          discoveredAt: new Date(),
          discoveryError: null,
          status: "SOURCE_READY",
        },
      })

      return result
    }
  )
}
