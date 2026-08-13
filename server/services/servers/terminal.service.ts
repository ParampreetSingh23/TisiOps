import { createHash, randomBytes } from "node:crypto"

import { prisma } from "../../db/prisma"
import { decryptSecret } from "../../utils/crypto"

const TOKEN_BYTES = 32
const TOKEN_TTL_MS = 5 * 60_000

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function wsBaseUrl(req: {
  protocol: string
  get(name: string): string | undefined
}): string {
  const configured = process.env.TERMINAL_WS_URL?.replace(/\/+$/, "")
  if (configured) return configured

  const host = req.get("host") ?? `localhost:${process.env.PORT ?? 5001}`
  const proto = req.protocol === "https" ? "wss" : "ws"
  return `${proto}://${host}`
}

export async function createTerminalSession(
  userId: string,
  serverId: string,
  req: { protocol: string; get(name: string): string | undefined }
) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: {
      id: true,
      status: true,
      credentialsStored: true,
      credentials: { select: { id: true } },
    },
  })

  if (!server) return { ok: false as const, status: 404, error: "Server not found" }
  if (server.status !== "CONNECTED") {
    return {
      ok: false as const,
      status: 409,
      error: "Server must be connected before opening terminal.",
    }
  }
  if (!server.credentialsStored || !server.credentials) {
    return {
      ok: false as const,
      status: 409,
      error: "SSH credentials are not stored. Reconnect server with credentials before opening terminal.",
    }
  }

  const token = randomBytes(TOKEN_BYTES).toString("base64url")
  const session = await prisma.terminalSession.create({
    data: {
      userId,
      serverId,
      sessionTokenHash: hashToken(token),
      tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      lastActivityAt: new Date(),
    },
    select: { id: true },
  })

  return {
    ok: true as const,
    sessionId: session.id,
    websocketUrl: `${wsBaseUrl(req)}/ws/terminal/${session.id}?token=${encodeURIComponent(token)}`,
  }
}

export async function consumeTerminalSession(sessionId: string, token: string) {
  const session = await prisma.terminalSession.findFirst({
    where: {
      id: sessionId,
      sessionTokenHash: hashToken(token),
      tokenExpiresAt: { gt: new Date() },
      status: { in: ["CONNECTING", "DISCONNECTED", "FAILED"] },
    },
    include: {
      server: { include: { credentials: true } },
    },
  })

  if (!session) return null
  if (session.server.userId !== session.userId) return null
  if (session.server.status !== "CONNECTED") return null
  if (!session.server.credentialsStored || !session.server.credentials) return null

  const credential = session.server.credentials
  const privateKey = credential.encryptedPrivateKey
    ? decryptSecret(credential.encryptedPrivateKey)
    : undefined
  const password = credential.encryptedPassword
    ? decryptSecret(credential.encryptedPassword)
    : undefined
  const passphrase = credential.encryptedPassphrase
    ? decryptSecret(credential.encryptedPassphrase)
    : undefined

  if (!privateKey && !password) return null

  await prisma.terminalSession.update({
    where: { id: session.id },
    data: {
      status: "CONNECTING",
      startedAt: new Date(),
      lastActivityAt: new Date(),
      tokenExpiresAt: new Date(),
    },
  })

  return {
    sessionId: session.id,
    userId: session.userId,
    server: {
      host: session.server.host || session.server.publicIp || "",
      port: session.server.sshPort,
      username: session.server.sshUsername || "ubuntu",
      privateKey,
      password,
      passphrase,
    },
  }
}

export async function markTerminalConnected(sessionId: string): Promise<void> {
  await prisma.terminalSession.update({
    where: { id: sessionId },
    data: { status: "CONNECTED", lastActivityAt: new Date() },
  })
}

export async function touchTerminalSession(sessionId: string): Promise<void> {
  await prisma.terminalSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  })
}

export async function closeTerminalSession(
  sessionId: string,
  status: "DISCONNECTED" | "FAILED" = "DISCONNECTED"
): Promise<void> {
  await prisma.terminalSession.update({
    where: { id: sessionId },
    data: { status, endedAt: new Date(), lastActivityAt: new Date() },
  })
}
