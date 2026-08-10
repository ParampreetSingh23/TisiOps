import { prisma } from "../../db/prisma"
import { encryptSecret } from "../../utils/crypto"
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
  return prisma.server.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      name: true,
      provider: true,
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
}

export async function getUserServerById(userId: string, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: {
      id: true,
      userId: true,
      name: true,
      provider: true,
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

  return server
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
      name: true,
      provider: true,
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

  return server
}

export async function checkServerHealth(userId: string, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    include: { credentials: true },
  })

  if (!server) return null

  let updatedStatus: "CONNECTED" | "NEEDS_ATTENTION" | "UNREACHABLE" = "CONNECTED"
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
        updatedStatus = "UNREACHABLE"
      }
    }
  }

  return prisma.server.update({
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
      name: true,
      provider: true,
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
