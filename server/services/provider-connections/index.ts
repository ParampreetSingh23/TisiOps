import type { CloudProviderConnection } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret, last4, maskAccessKeyId } from "../../utils/crypto"
import type { AwsIdentity } from "../aws/sts"

/**
 * Database operations for cloud provider connections. Every query is scoped
 * by userId — a connection is only ever readable by the user who saved it.
 */

/** The only shape allowed out of the API. No ciphertext, no secrets. */
export type SafeConnection = {
  id: string
  provider: CloudProviderConnection["provider"]
  credentialType: CloudProviderConnection["credentialType"]
  name: string
  defaultRegion: string
  awsAccountId: string | null
  awsArn: string | null
  awsUserId: string | null
  maskedAccessKeyId: string | null
  status: CloudProviderConnection["status"]
  lastVerifiedAt: string | null
  failureReason: string | null
  createdAt: string
}

export function toSafeConnection(row: CloudProviderConnection): SafeConnection {
  return {
    id: row.id,
    provider: row.provider,
    credentialType: row.credentialType,
    name: row.name,
    defaultRegion: row.defaultRegion,
    awsAccountId: row.awsAccountId,
    awsArn: row.awsArn,
    awsUserId: row.awsUserId,
    maskedAccessKeyId: maskAccessKeyId(row.accessKeyLast4),
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Saves a verified AWS connection. Called only after verifyAwsCredentials()
 * succeeded, so the row is written as CONNECTED. Re-saving the same
 * connection name replaces the stored credentials.
 */
export async function saveAwsConnection(input: {
  userId: string
  name: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  identity: AwsIdentity
}) {
  const credentials = {
    defaultRegion: input.region,
    awsAccountId: input.identity.accountId,
    awsArn: input.identity.arn,
    awsUserId: input.identity.userId,
    accessKeyLast4: last4(input.accessKeyId),
    encryptedAccessKeyId: encryptSecret(input.accessKeyId),
    encryptedSecretAccessKey: encryptSecret(input.secretAccessKey),
    status: "CONNECTED" as const,
    lastVerifiedAt: new Date(),
    failureReason: null,
  }

  return prisma.cloudProviderConnection.upsert({
    where: {
      userId_provider_name: {
        userId: input.userId,
        provider: "AWS",
        name: input.name,
      },
    },
    create: {
      userId: input.userId,
      provider: "AWS",
      credentialType: "ACCESS_KEY",
      name: input.name,
      ...credentials,
    },
    update: credentials,
  })
}

/** This user's AWS connections, newest first. */
export async function listAwsConnections(userId: string) {
  return prisma.cloudProviderConnection.findMany({
    where: { userId, provider: "AWS" },
    orderBy: { createdAt: "desc" },
  })
}

/** Whether this user has a working AWS connection, and which one. */
export async function getAwsConnectionStatus(userId: string) {
  const connection = await prisma.cloudProviderConnection.findFirst({
    where: { userId, provider: "AWS", status: "CONNECTED" },
    orderBy: { lastVerifiedAt: "desc" },
  })

  return {
    connected: connection !== null,
    connection: connection ? toSafeConnection(connection) : null,
  }
}

export type AwsConnectionCredentials = {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

/**
 * This user's working AWS credentials, decrypted.
 *
 * The only caller is server power control, which has to act inside the user's
 * own account: a bring-your-own EC2 instance is invisible to the TisiOps
 * account's keys. Nothing here is safe to return from an API — the values stay
 * inside the service that makes the AWS call.
 */
export async function readAwsCredentials(
  userId: string
): Promise<AwsConnectionCredentials | null> {
  const connection = await prisma.cloudProviderConnection.findFirst({
    where: { userId, provider: "AWS", status: "CONNECTED" },
    orderBy: { lastVerifiedAt: "desc" },
  })

  if (!connection?.encryptedAccessKeyId || !connection.encryptedSecretAccessKey) {
    return null
  }

  try {
    return {
      accessKeyId: decryptSecret(connection.encryptedAccessKeyId),
      secretAccessKey: decryptSecret(connection.encryptedSecretAccessKey),
      region: connection.defaultRegion,
    }
  } catch {
    // Encryption key rotated or missing: treat it as no usable connection.
    return null
  }
}
