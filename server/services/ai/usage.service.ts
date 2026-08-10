import type { AiUsageDaily } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { limitsFor, usageDate, type LimitProfile } from "./limits"

/**
 * AI usage in Postgres — the source of truth for what a user has spent.
 *
 * One row per user, day, and model. Reads and writes are always scoped by
 * userId, so one user's usage can never be read or charged to another.
 */

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Today's totals across every model, for the limit decision. */
export async function todaysUsage(
  userId: string
): Promise<{ messageCount: number; totalTokens: number }> {
  const rows = await prisma.aiUsageDaily.findMany({
    where: { userId, date: usageDate() },
    select: { messageCount: true, totalTokens: true },
  })

  return rows.reduce(
    (total, row) => ({
      messageCount: total.messageCount + row.messageCount,
      totalTokens: total.totalTokens + row.totalTokens,
    }),
    { messageCount: 0, totalTokens: 0 }
  )
}

/**
 * Records one successful call.
 *
 * Upsert on (userId, date, model): the unique constraint makes concurrent
 * requests from the same user add up rather than overwrite each other.
 */
export async function recordUsage(input: {
  userId: string
  model: string
  usage: TokenUsage
}): Promise<AiUsageDaily> {
  const date = usageDate()

  return prisma.aiUsageDaily.upsert({
    where: {
      userId_date_model: { userId: input.userId, date, model: input.model },
    },
    create: {
      userId: input.userId,
      date,
      model: input.model,
      messageCount: 1,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      totalTokens: input.usage.totalTokens,
    },
    update: {
      messageCount: { increment: 1 },
      inputTokens: { increment: input.usage.inputTokens },
      outputTokens: { increment: input.usage.outputTokens },
      totalTokens: { increment: input.usage.totalTokens },
    },
  })
}

/**
 * Records a call that reached the provider and failed.
 *
 * No output tokens are added — the user was not served a reply, and charging
 * them for one would be wrong. The count exists so a broken API key shows up
 * as failures rather than as silence.
 */
export async function recordFailure(input: {
  userId: string
  model: string
}): Promise<void> {
  const date = usageDate()

  await prisma.aiUsageDaily.upsert({
    where: {
      userId_date_model: { userId: input.userId, date, model: input.model },
    },
    create: { userId: input.userId, date, model: input.model, failedCount: 1 },
    update: { failedCount: { increment: 1 } },
  })
}

export type UsageSummary = {
  isAdmin: boolean
  /** True for admins: the UI presents them as unlimited. */
  unlimited: boolean
  messagesUsed: number
  messagesLimit: number
  tokensUsed: number
  tokensLimit: number
  maxInputChars: number
  /** False once either daily limit is spent. */
  canSend: boolean
}

/** What the console shows. Only ever the caller's own numbers. */
export async function usageSummary(
  userId: string,
  isAdmin: boolean
): Promise<UsageSummary> {
  const limits: LimitProfile = limitsFor(isAdmin)
  const usage = await todaysUsage(userId)

  return {
    isAdmin,
    unlimited: isAdmin,
    messagesUsed: usage.messageCount,
    messagesLimit: limits.dailyMessages,
    tokensUsed: usage.totalTokens,
    tokensLimit: limits.dailyTokens,
    maxInputChars: limits.maxInputChars,
    canSend:
      usage.messageCount < limits.dailyMessages &&
      usage.totalTokens < limits.dailyTokens,
  }
}

/** Platform totals for the admin panel. Aggregates only — no prompts. */
export async function platformUsageToday() {
  const date = usageDate()

  const [totals, byUser] = await Promise.all([
    prisma.aiUsageDaily.aggregate({
      where: { date },
      _sum: { messageCount: true, totalTokens: true, failedCount: true },
    }),
    prisma.aiUsageDaily.groupBy({
      by: ["userId"],
      where: { date },
      _sum: { messageCount: true, totalTokens: true },
      orderBy: { _sum: { totalTokens: "desc" } },
      take: 10,
    }),
  ])

  const users = await prisma.user.findMany({
    where: { id: { in: byUser.map((row) => row.userId) } },
    select: { id: true, email: true },
  })
  const emailById = new Map(users.map((user) => [user.id, user.email]))

  return {
    date,
    messages: totals._sum.messageCount ?? 0,
    tokens: totals._sum.totalTokens ?? 0,
    failures: totals._sum.failedCount ?? 0,
    topUsers: byUser.map((row) => ({
      email: emailById.get(row.userId) ?? "unknown",
      messages: row._sum.messageCount ?? 0,
      tokens: row._sum.totalTokens ?? 0,
    })),
  }
}
