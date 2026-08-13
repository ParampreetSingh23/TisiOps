import { prisma } from "../../db/prisma"
import {
  findInstanceByPublicIp,
  instanceState,
  startInstance,
  stopInstance,
  type AwsCredentials,
} from "../aws/ec2"
import { readAwsCredentials } from "../provider-connections"
import { decryptSecret, encryptSecret } from "../../utils/crypto"
import { rebootServerOverSsh, shutdownServerOverSsh } from "./server-power"
import { isPortOpen } from "./server-reachable"
import {
  mapAwsInstanceState,
  pauseBlockedReason,
  reconcileSshServerStatus,
  restartBlockedReason,
  statusAfterFailedSshCheck,
} from "./server-status"
import { testSshConnection } from "./ssh-diagnostic"

export type CreateBYOSServerInput = {
  name?: string
  provider: string
  host: string
  sshPort?: number
  sshUsername?: string
  osType?: string
  osVersion?: string
  dockerStatus?: string
  sudoStatus?: string
  cpuInfo?: string
  memoryMb?: number
  diskGb?: number
  authType: "key" | "password"
  privateKey?: string
  passphrase?: string
  password?: string
}

export async function listUserServers(userId: string) {
  const servers = await prisma.server.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      deploymentId: true,
      name: true,
      provider: true,
      region: true,
      awsInstanceId: true,
      host: true,
      publicIp: true,
      elasticIp: true,
      sshPort: true,
      sshUsername: true,
      osType: true,
      osVersion: true,
      dockerStatus: true,
      sudoStatus: true,
      cpuInfo: true,
      memoryMb: true,
      diskGb: true,
      status: true,
      credentialsStored: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const synced = await Promise.all(servers.map(syncChangingServerState))
  return synced.map(toSafeServer)
}

export async function getUserServerById(userId: string, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: {
      id: true,
      userId: true,
      deploymentId: true,
      name: true,
      provider: true,
      region: true,
      awsInstanceId: true,
      host: true,
      publicIp: true,
      elasticIp: true,
      sshPort: true,
      sshUsername: true,
      osType: true,
      osVersion: true,
      dockerStatus: true,
      sudoStatus: true,
      cpuInfo: true,
      memoryMb: true,
      diskGb: true,
      status: true,
      credentialsStored: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return server ? toSafeServer(await syncServerState(server)) : null
}

export async function createBYOSServer(userId: string, input: CreateBYOSServerInput) {
  const host = input.host.trim()
  const port = input.sshPort ?? 22
  const username = input.sshUsername?.trim() || "ubuntu"
  const defaultName = `ubuntu-server-${Math.random().toString(36).substring(2, 7)}`
  const serverName = input.name?.trim() || defaultName

  let credentialsStored = false
  let encPrivateKey: string | null = null
  let encPassword: string | null = null
  let encPassphrase: string | null = null

  try {
    if (input.authType === "key" && input.privateKey) {
      encPrivateKey = encryptSecret(input.privateKey.trim())
      credentialsStored = true
    } else if (input.authType === "password" && input.password) {
      encPassword = encryptSecret(input.password)
      credentialsStored = true
    }
    if (input.passphrase) {
      encPassphrase = encryptSecret(input.passphrase)
    }
  } catch {
    // If encryption key is not set, we proceed with credentialsStored = false
    credentialsStored = false
  }

  const server = await prisma.server.create({
    data: {
      userId,
      name: serverName,
      provider: input.provider || "CUSTOM_VPS",
      host,
      publicIp: host,
      sshPort: port,
      sshUsername: username,
      osType: input.osType || "Ubuntu",
      osVersion: input.osVersion || "Ubuntu 22.04 LTS",
      dockerStatus: input.dockerStatus || "NOT_INSTALLED",
      sudoStatus: input.sudoStatus || "PASSWORDLESS",
      cpuInfo: input.cpuInfo || null,
      memoryMb: input.memoryMb || null,
      diskGb: input.diskGb || null,
      status: "CONNECTED",
      credentialsStored,
      lastCheckedAt: new Date(),
      ...(credentialsStored
        ? {
            credentials: {
              create: {
                userId,
                authType: input.authType,
                encryptedPrivateKey: encPrivateKey,
                encryptedPassword: encPassword,
                encryptedPassphrase: encPassphrase,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      deploymentId: true,
      name: true,
      provider: true,
      region: true,
      awsInstanceId: true,
      host: true,
      publicIp: true,
      sshPort: true,
      sshUsername: true,
      osType: true,
      osVersion: true,
      dockerStatus: true,
      sudoStatus: true,
      cpuInfo: true,
      memoryMb: true,
      diskGb: true,
      status: true,
      credentialsStored: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return toSafeServer(server)
}

export async function checkServerHealth(userId: string, serverId: string) {
  let server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    include: { credentials: true },
  })

  if (!server) return null

  server = await syncChangingServerState(server)

  if (server.awsInstanceId && server.region && server.status !== "CONNECTED") {
    return toSafeServer(server)
  }

  let updatedStatus: "CONNECTED" | "NEEDS_ATTENTION" | "UNREACHABLE" | "STOPPED" =
    "CONNECTED"
  let dockerStatus = server.dockerStatus
  let sudoStatus = server.sudoStatus
  let cpuInfo = server.cpuInfo
  let memoryMb = server.memoryMb
  let diskGb = server.diskGb
  let osVersion = server.osVersion

  if (server.credentialsStored && server.credentials) {
    let privateKey: string | undefined
    let password: string | undefined
    let passphrase: string | undefined

    try {
      const { decryptSecret } = await import("../../utils/crypto")
      if (server.credentials.encryptedPrivateKey) {
        privateKey = decryptSecret(server.credentials.encryptedPrivateKey)
      }
      if (server.credentials.encryptedPassword) {
        password = decryptSecret(server.credentials.encryptedPassword)
      }
      if (server.credentials.encryptedPassphrase) {
        passphrase = decryptSecret(server.credentials.encryptedPassphrase)
      }
    } catch {
      // Key mismatch or missing
    }

    if (privateKey || password) {
      const diagRes = await testSshConnection({
        host: server.host || server.publicIp || "",
        sshPort: server.sshPort,
        sshUsername: server.sshUsername || "ubuntu",
        authType: server.credentials.authType as "key" | "password",
        privateKey,
        password,
        passphrase,
      })

      if (diagRes.ok && diagRes.details) {
        updatedStatus = "CONNECTED"
        if (diagRes.details.os) osVersion = diagRes.details.os
        if (diagRes.details.dockerStatus) dockerStatus = diagRes.details.dockerStatus
        if (diagRes.details.sudoStatus) sudoStatus = diagRes.details.sudoStatus
        if (diagRes.details.cpuInfo) cpuInfo = diagRes.details.cpuInfo
        if (diagRes.details.memoryMb) memoryMb = diagRes.details.memoryMb
        if (diagRes.details.diskGb) diskGb = diagRes.details.diskGb
      } else {
        updatedStatus = statusAfterFailedSshCheck(server.status)
      }
    }
  }

  const updated = await prisma.server.update({
    where: { id: serverId },
    data: {
      status: updatedStatus,
      dockerStatus,
      sudoStatus,
      cpuInfo,
      memoryMb,
      diskGb,
      osVersion,
      lastCheckedAt: new Date(),
    },
    select: {
      id: true,
      userId: true,
      deploymentId: true,
      name: true,
      provider: true,
      region: true,
      awsInstanceId: true,
      host: true,
      publicIp: true,
      sshPort: true,
      sshUsername: true,
      osType: true,
      osVersion: true,
      dockerStatus: true,
      sudoStatus: true,
      cpuInfo: true,
      memoryMb: true,
      diskGb: true,
      status: true,
      credentialsStored: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return toSafeServer(updated)
}

export async function disconnectServer(userId: string, serverId: string) {
  const existing = await prisma.server.findFirst({
    where: { id: serverId, userId },
  })

  if (!existing) return false

  await prisma.server.delete({
    where: { id: serverId },
  })

  return true
}

type SafeServerSource = {
  awsInstanceId?: string | null
  credentials?: unknown
  region?: string | null
  status: string
  credentialsStored: boolean
  sshUsername?: string | null
  sudoStatus?: string | null
  host?: string | null
  publicIp?: string | null
  elasticIp?: string | null
}

type ServerWithProviderState = {
  id: string
  userId?: string
  deploymentId?: string | null
  awsInstanceId?: string | null
  region?: string | null
  status: string
  host?: string | null
  publicIp?: string | null
  elasticIp?: string | null
  sshPort?: number | null
}

/** The address an instance can be found by when TisiOps has no instance id. */
function serverAddress(server: {
  elasticIp?: string | null
  publicIp?: string | null
  host?: string | null
}): string {
  return server.elasticIp || server.publicIp || server.host || ""
}

/**
 * Which AWS account this server lives in.
 *
 * A server TisiOps provisioned belongs to a deployment and sits in the TisiOps
 * account, whose keys are in the worker's environment. Anything else is the
 * user's own machine in the user's own account, and only their connection can
 * touch it — so returning undefined here is not a fallback, it is the answer
 * for TisiOps-managed servers.
 */
async function awsCredentialsFor(server: {
  userId?: string
  deploymentId?: string | null
}): Promise<AwsCredentials | undefined> {
  if (server.deploymentId || !server.userId) return undefined
  return (await readAwsCredentials(server.userId)) ?? undefined
}

/**
 * Move a server out of STARTING or STOPPING once the machine has actually
 * settled.
 *
 * Both are transient states written the moment TisiOps issues the command, and
 * nothing else ever clears them — so without this a paused server reads
 * "Stopping" forever. EC2 can be asked directly; a server reached only over SSH
 * is judged by whether it still answers.
 *
 * Reconciling is best-effort by design: this runs inside the servers list, and
 * one unreadable instance must not take the whole page down with it.
 */
async function syncServerState<T extends ServerWithProviderState>(
  server: T
): Promise<T> {
  try {
    return server.awsInstanceId && server.region
      ? await syncAwsServerState(server)
      : await syncSshServerState(server)
  } catch {
    return server
  }
}

async function syncChangingServerState<T extends ServerWithProviderState>(
  server: T
): Promise<T> {
  if (server.status !== "STARTING" && server.status !== "STOPPING") return server
  return syncServerState(server)
}

async function syncSshServerState<T extends ServerWithProviderState>(
  server: T
): Promise<T> {
  // Only a server caught mid-transition is worth a probe; anything else already
  // knows what it is, and this would cost a network round trip per page load.
  if (server.status !== "STARTING" && server.status !== "STOPPING") return server

  const host = server.host || server.publicIp || server.elasticIp || ""
  const mappedStatus = reconcileSshServerStatus(
    server.status,
    await isPortOpen(host, server.sshPort ?? 22)
  )

  if (!mappedStatus) return server

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { status: mappedStatus, lastCheckedAt: new Date() },
  })

  return { ...server, status: updated.status, lastCheckedAt: updated.lastCheckedAt }
}

async function syncAwsServerState<T extends ServerWithProviderState>(server: T): Promise<T> {
  if (!server.awsInstanceId || !server.region) return server

  const mappedStatus = mapAwsInstanceState(
    await instanceState(
      server.region,
      server.awsInstanceId,
      await awsCredentialsFor(server)
    )
  )

  if (!mappedStatus || mappedStatus === server.status) return server

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { status: mappedStatus, lastCheckedAt: new Date() },
  })

  return { ...server, status: updated.status, lastCheckedAt: updated.lastCheckedAt }
}

function toSafeServer<T extends SafeServerSource>(server: T) {
  const { awsInstanceId: _awsInstanceId, credentials: _credentials, ...safe } = server
  const power = {
    status: server.status,
    hasProviderControl: Boolean(server.awsInstanceId && server.region),
    canUseSudoOverSsh:
      server.credentialsStored &&
      (server.sudoStatus === "PASSWORDLESS" || server.sshUsername === "root"),
    hasAddress: serverAddress(server) !== "",
  }

  // The flag and the explanation come from one call each, so the button and
  // its tooltip cannot disagree about why it is unavailable.
  const pauseBlocked = pauseBlockedReason(power)
  const restartBlocked = restartBlockedReason(power)

  return {
    ...safe,
    canPause: pauseBlocked === null,
    canRestart: restartBlocked === null,
    pauseBlockedReason: pauseBlocked,
    restartBlockedReason: restartBlocked,
    /** Stopping is one-way without a provider handle: say so before it happens. */
    pauseIsOneWay: !power.hasProviderControl,
  }
}

export async function pauseServer(userId: string, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    include: { credentials: true },
  })

  if (!server) return { ok: false as const, status: 404, error: "Server not found" }
  if (server.status === "STOPPED" || server.status === "STOPPING") {
    return { ok: true as const, server: toSafeServer(server) }
  }

  if (server.awsInstanceId && server.region) {
    const result = await stopInstance(
      server.region,
      server.awsInstanceId,
      await awsCredentialsFor(server)
    )
    if (!result.ok) return { ok: false as const, status: 502, error: result.error }
  } else {
    if (server.status !== "CONNECTED") {
      return {
        ok: false as const,
        status: 409,
        error: "Server must be connected before it can be paused over SSH.",
      }
    }

    const credentials = readServerCredentials(server)
    if (!credentials.ok) return credentials

    const result = await shutdownServerOverSsh({
      host: server.host || server.publicIp || "",
      port: server.sshPort,
      username: server.sshUsername || "ubuntu",
      ...credentials.value,
    })

    if (!result.ok) return { ok: false as const, status: 502, error: result.error }
  }

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { status: "STOPPING", lastCheckedAt: new Date() },
  })

  return { ok: true as const, server: toSafeServer(updated) }
}

type AdoptedInstance =
  | {
      ok: true
      instanceId: string
      region: string
      credentials: AwsCredentials | undefined
    }
  | { ok: false; status: number; error: string }

/**
 * The instance id and region to power this server with, recording them if they
 * were missing.
 *
 * A server the user connected over SSH has no instance id: TisiOps was given an
 * address and a key, nothing else. Once it is stopped, SSH is gone and that
 * address is the only thing left to go on — so it is looked up in the user's
 * own AWS account and written back, which makes every later start, stop, and
 * status read a direct API call.
 */
async function adoptInstance(server: {
  id: string
  userId: string
  deploymentId: string | null
  awsInstanceId: string | null
  region: string | null
  elasticIp: string | null
  publicIp: string | null
  host: string | null
}): Promise<AdoptedInstance> {
  const credentials = await awsCredentialsFor(server)

  if (server.awsInstanceId && server.region) {
    return {
      ok: true,
      instanceId: server.awsInstanceId,
      region: server.region,
      credentials,
    }
  }

  const connection = await readAwsCredentials(server.userId)
  if (!connection) {
    return {
      ok: false,
      status: 409,
      error:
        "TisiOps needs your AWS account to start this server. Connect it under Settings → Providers, then try again.",
    }
  }

  const region = server.region || connection.region
  const address = serverAddress(server)
  const instanceId = await findInstanceByPublicIp(region, address, connection)

  if (!instanceId) {
    return {
      ok: false,
      status: 409,
      error: `No EC2 instance in ${region} answers on ${address || "this server's address"}. If the server is in another region, or its public IP was released when it stopped, start it from the AWS console and then run Check Health.`,
    }
  }

  // Recorded so this lookup happens once, and so Pause, status, and Start all
  // go through the provider from now on.
  await prisma.server.update({
    where: { id: server.id },
    data: { awsInstanceId: instanceId, region },
  })

  return { ok: true, instanceId, region, credentials: connection }
}

export async function restartServer(userId: string, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    include: { credentials: true },
  })

  if (!server) return { ok: false as const, status: 404, error: "Server not found" }

  if (server.status === "STOPPED") {
    // A stopped machine cannot be reached over SSH, so the only way back is the
    // provider API. TisiOps may not have recorded an instance id for a server
    // the user connected themselves — so find it by the address they gave.
    const adopted = await adoptInstance(server)
    if (!adopted.ok) return adopted

    const result = await startInstance(
      adopted.region,
      adopted.instanceId,
      adopted.credentials
    )
    if (!result.ok) return { ok: false as const, status: 502, error: result.error }

    const updated = await prisma.server.update({
      where: { id: server.id },
      data: { status: "STARTING", lastCheckedAt: new Date() },
    })
    return { ok: true as const, server: toSafeServer(updated) }
  }

  if (server.status !== "CONNECTED" || !server.credentialsStored || !server.credentials) {
    return {
      ok: false as const,
      status: 409,
      error: "Server must be connected with stored SSH credentials before restart.",
    }
  }

  const credentials = readServerCredentials(server)
  if (!credentials.ok) return credentials

  const result = await rebootServerOverSsh({
    host: server.host || server.publicIp || "",
    port: server.sshPort,
    username: server.sshUsername || "ubuntu",
    ...credentials.value,
  })

  if (!result.ok) return { ok: false as const, status: 502, error: result.error }

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { status: "STARTING", lastCheckedAt: new Date() },
  })

  return { ok: true as const, server: toSafeServer(updated) }
}

function readServerCredentials(server: {
  credentialsStored: boolean
  credentials: {
    encryptedPrivateKey: string | null
    encryptedPassword: string | null
    encryptedPassphrase: string | null
  } | null
}) {
  if (!server.credentialsStored || !server.credentials) {
    return {
      ok: false as const,
      status: 409,
      error: "Server must have stored SSH credentials.",
    }
  }

  try {
    const privateKey = server.credentials.encryptedPrivateKey
      ? decryptSecret(server.credentials.encryptedPrivateKey)
      : undefined
    const password = server.credentials.encryptedPassword
      ? decryptSecret(server.credentials.encryptedPassword)
      : undefined
    const passphrase = server.credentials.encryptedPassphrase
      ? decryptSecret(server.credentials.encryptedPassphrase)
      : undefined

    return { ok: true as const, value: { privateKey, password, passphrase } }
  } catch {
    return { ok: false as const, status: 500, error: "Could not read SSH credentials." }
  }
}
