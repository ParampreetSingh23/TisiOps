import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret } from "../../utils/crypto"

type StoredCredential = {
  authType: string
  encryptedPrivateKey: string | null
  encryptedPassword: string | null
  encryptedPassphrase: string | null
} | null

type DeploymentKeySource = {
  id: string
  userId: string
  deployment?: { encryptedSshPrivateKey: string | null } | null
}

export type ResolvedSshCredentials = {
  authType: "key" | "password"
  privateKey?: string
  password?: string
  passphrase?: string
}

export function decryptStoredServerCredentials(
  credentials: StoredCredential
): ResolvedSshCredentials | null {
  if (!credentials) return null

  const privateKey = credentials.encryptedPrivateKey
    ? decryptSecret(credentials.encryptedPrivateKey)
    : undefined
  const password = credentials.encryptedPassword
    ? decryptSecret(credentials.encryptedPassword)
    : undefined
  const passphrase = credentials.encryptedPassphrase
    ? decryptSecret(credentials.encryptedPassphrase)
    : undefined

  if (!privateKey && !password) return null

  return {
    authType: credentials.authType === "password" ? "password" : "key",
    privateKey,
    password,
    passphrase,
  }
}

export async function syncDeploymentSshKeyToServerCredential(
  server: DeploymentKeySource
): Promise<ResolvedSshCredentials | null> {
  if (!server.deployment?.encryptedSshPrivateKey) return null

  const privateKey = decryptSecret(server.deployment.encryptedSshPrivateKey)
  const encryptedPrivateKey = encryptSecret(privateKey)

  await prisma.serverCredential.upsert({
    where: { serverId: server.id },
    create: {
      serverId: server.id,
      userId: server.userId,
      authType: "key",
      encryptedPrivateKey,
      encryptedPassword: null,
      encryptedPassphrase: null,
    },
    update: {
      authType: "key",
      encryptedPrivateKey,
      encryptedPassword: null,
      encryptedPassphrase: null,
    },
  })

  await prisma.server.update({
    where: { id: server.id },
    data: { credentialsStored: true },
  })

  return { authType: "key", privateKey }
}

