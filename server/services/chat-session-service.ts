import { prisma } from "../db/prisma"
import type { ChatMessage } from "../validations/chat"

/**
 * AI Console persistence. Chats are private: every function here takes the
 * database userId as its first argument and puts it in the WHERE clause, so
 * ownership is enforced by the query rather than by a check the caller might
 * forget. There is deliberately no "get session by id" without a userId.
 *
 * A session belonging to someone else and a session that does not exist both
 * return null, so the API cannot be used to probe for other users' sessions.
 */

const HISTORY_LIMIT = 20

export type SessionSummary = {
  id: string
  title: string
  updatedAt: string
}

export type StoredMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

function toClientRole(role: "USER" | "ASSISTANT"): "user" | "assistant" {
  return role === "USER" ? "user" : "assistant"
}

/** This user's sessions, newest activity first. Never returns messages. */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const sessions = await prisma.aiChatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
    take: 100,
  })

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt.toISOString(),
  }))
}

/**
 * The repository this conversation is about, so a follow-up like "deploy the
 * frontend" resolves without the user naming the repo again.
 *
 * Only the pointer is stored, never the analysis: re-reading GitHub costs a
 * couple of calls and is always current, where a cached analysis silently
 * goes stale as the repository changes.
 */
export type SessionRepoContext = {
  owner: string
  name: string
  branch: string
  servicePath: string | null
}

export async function getSessionContext(
  userId: string,
  sessionId: string
): Promise<SessionRepoContext | null> {
  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId },
    select: {
      activeRepoOwner: true,
      activeRepoName: true,
      activeBranch: true,
      activeServicePath: true,
    },
  })

  if (!session?.activeRepoOwner || !session.activeRepoName) return null

  return {
    owner: session.activeRepoOwner,
    name: session.activeRepoName,
    branch: session.activeBranch ?? "main",
    servicePath: session.activeServicePath,
  }
}

/** Scoped by userId, so one user cannot steer another user's conversation. */
export async function setSessionContext(
  userId: string,
  sessionId: string,
  context: SessionRepoContext
): Promise<void> {
  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId },
    data: {
      activeRepoOwner: context.owner,
      activeRepoName: context.name,
      activeBranch: context.branch,
      activeServicePath: context.servicePath,
    },
  })
}

export async function createSession(
  userId: string,
  title: string
): Promise<SessionSummary> {
  const session = await prisma.aiChatSession.create({
    data: { userId, title },
    select: { id: true, title: true, updatedAt: true },
  })

  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt.toISOString(),
  }
}

/** One session with its messages, or null when it is not this user's. */
export async function getSession(userId: string, sessionId: string) {
  const session = await prisma.aiChatSession.findFirst({
    // userId here is the whole access check.
    where: { id: sessionId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  })

  if (!session) return null

  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages.map((message): StoredMessage => ({
      id: message.id,
      role: toClientRole(message.role),
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  }
}

/** True when the session exists and belongs to this user. */
export async function ownsSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const found = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  })

  return found !== null
}

/**
 * Recent history for the model, oldest first. Capped because every message
 * sent is a token paid for.
 */
export async function recentHistory(
  userId: string,
  sessionId: string
): Promise<ChatMessage[]> {
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId, session: { userId } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  })

  return messages.reverse().map((message) => ({
    role: toClientRole(message.role),
    content: message.content,
  }))
}

/**
 * Appends a turn and bumps the session's updatedAt. Ownership is checked
 * before the write, inside the same transaction as the write.
 */
export async function appendTurn(input: {
  userId: string
  sessionId: string
  userContent: string
  assistantContent: string
}): Promise<StoredMessage[] | null> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.aiChatSession.findFirst({
      where: { id: input.sessionId, userId: input.userId },
      select: { id: true },
    })

    if (!session) return null

    const user = await tx.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content: input.userContent,
      },
    })

    const assistant = await tx.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: input.assistantContent,
      },
    })

    await tx.aiChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    })

    return [user, assistant].map((message): StoredMessage => ({
      id: message.id,
      role: toClientRole(message.role),
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }))
  })
}

/**
 * Deletes one of this user's sessions. Returns false when the id is not
 * theirs — same answer as a session that never existed.
 */
export async function deleteSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const { count } = await prisma.aiChatSession.deleteMany({
    where: { id: sessionId, userId },
  })

  return count > 0
}
