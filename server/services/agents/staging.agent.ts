import { prisma } from "../../db/prisma"
import { enqueueProductionDiscovery } from "../../queues/monitoring.queue"
import { createStagingAwsDeployment } from "../aws"
import { analyzeRepository, type CodeProfile } from "../github/analyze"
import { matchRepository } from "../github/agent"
import { listRepositories, type Repository } from "../github/repos"
import type { ClerkUsersApi } from "../github/status"
import { buildBlueprint } from "../servers/production-blueprint"
import {
  buildStagingRecommendation,
  type StagingRecommendation,
} from "../servers/staging-recommendation"
import {
  buildFinalStagingPlan,
  checkCompatibility,
  recommendResources,
  STAGING_TARGET_OPTIONS,
  stagingTargetFromText,
  type StagingTarget,
} from "../servers/staging-planning"
import {
  gitRepoFromRemote,
  type ProductionRuntime,
} from "../servers/production-runtime-parse"
import { readServerRuntime } from "../servers/production-runtime"
import type { AgentIntent } from "./agent.types"

const CREATE_STAGING =
  /\b(deploy|create|make|prepare|build|set\s?up|setup|spin|clone)\b[\s\S]{0,60}\bstaging\b|\bstaging\s+environment\b|\bstaging\s+server\b|\bcan\s+i\b[\s\S]{0,30}\bdeploy\b[\s\S]{0,30}\bstaging\b|\bstaging\b[\s\S]{0,30}\bfrom\s+(production|prod)\b|\bclone\b[\s\S]{0,30}\b(production|prod)\b[\s\S]{0,30}\bstaging\b/i
const ANALYSE_PRODUCTION =
  /\b(analys|analyz)\w*\b[\s\S]{0,40}\b(production|prod)\b|\b(production|prod)\b[\s\S]{0,30}\b(analys|analyz)\w*\b|\bstaging\b[\s\S]{0,20}\b(analysis|analyse|analyze)\b/i
const GET_PLAN =
  /\b(get|show|what|view|see|explain)\b[^.!?]{0,40}\bstaging\s*(plan|scheme)\b|\bwhat(?:'s| is)?\s+(the\s+)?staging\s*(plan|scheme)\b/i
const SELECT_TARGET =
  /\b(where should staging run|staging target|choose (a )?target|pick (a )?target|which target)\b|\b(use|create|pick|select)\b[\s\S]{0,20}\b(new|existing|same)\b[\s\S]{0,10}\bserver\b/i
const GET_STATUS =
  /\b(get|show|what(?:'s| is)?|status)\b[\s\S]{0,40}\bstaging\s*status\b|\bstaging\s*status\b/i
const GET_BLUEPRINT =
  /\b(production\s*blueprint|blueprint|build\s*blueprint)\b|\b(what|show|build)\b[\s\S]{0,30}\b(production\s+as\s+a\s+system|blueprint)\b/i
const GENERATE_STAGING =
  /\b(generate|create|build|recommend|plan|make|prepare)\b[\s\S]{0,30}\bstaging\s*(blueprint|plan|recommendation|config|setup)\b|\bstaging\s*(blueprint|recommendation)\b|\bwhat\s+does\s+staging\s+need\b/i
const APPROVE_STAGING =
  /\b(approve|confirm)\b[\s\S]{0,25}\bstaging\b|\bapprove\b[\s\S]{0,20}\b(plan|it)\b/i

/**
 * Maps a message to a staging intent. Order matters: "target" and "status" and
 * "plan" are more specific than the general "create ... staging" verb, so they
 * are checked first.
 */
export function stagingIntentFromText(text: string): AgentIntent | null {
  const t = text.toLowerCase()
  if (APPROVE_STAGING.test(t)) return "APPROVE_STAGING"
  if (GENERATE_STAGING.test(t)) return "GENERATE_STAGING_BLUEPRINT"
  if (GET_BLUEPRINT.test(t)) return "GET_PRODUCTION_BLUEPRINT"
  if (SELECT_TARGET.test(t)) return "SELECT_STAGING_TARGET"
  if (GET_STATUS.test(t)) return "GET_STAGING_STATUS"
  if (GET_PLAN.test(t)) return "GET_STAGING_PLAN"
  if (ANALYSE_PRODUCTION.test(t)) return "ANALYSE_PRODUCTION_FOR_STAGING"
  if (CREATE_STAGING.test(t)) return "CREATE_STAGING"
  return null
}

const STAGING_INTENTS = new Set<AgentIntent>([
  "CREATE_STAGING",
  "ANALYSE_PRODUCTION_FOR_STAGING",
  "GET_STAGING_PLAN",
  "SELECT_STAGING_TARGET",
  "GET_STAGING_STATUS",
  "GET_PRODUCTION_BLUEPRINT",
  "GENERATE_STAGING_BLUEPRINT",
  "APPROVE_STAGING",
])

export function isStagingIntent(intent: AgentIntent): boolean {
  return STAGING_INTENTS.has(intent)
}

/** The status a staging intent drives a session to. Read-only intents return null. */
export function stagingStatusForIntent(intent: AgentIntent): string | null {
  switch (intent) {
    case "CREATE_STAGING":
      return "CREATED"
    case "ANALYSE_PRODUCTION_FOR_STAGING":
      return "ANALYSING"
    case "SELECT_STAGING_TARGET":
      return "READY"
    case "APPROVE_STAGING":
      return "READY"
    default:
      return null
  }
}

const MISSING_SERVER_MESSAGE =
  "Yes. Which production server would you like to create staging from?"

const SOURCE_TYPE_MESSAGE =
  "What do you want to create staging from?"

const TARGET_CHOICES =
  "Target choices:\n- New dedicated server — Recommended\n- Existing connected server\n- Same production server\n\nPlanning is read-only until you approve the final staging plan."

const SOURCE_CHOICES =
  "Source choices:\n- Existing Server\n- GitHub Repository"

export const PENDING_STAGING_SOURCE_STEP = "STAGING_SELECT_SOURCE_SERVER"
export const PENDING_STAGING_SOURCE_TYPE_STEP = "STAGING_SELECT_SOURCE_TYPE"
export const PENDING_STAGING_SOURCE_REPOSITORY_STEP = "STAGING_SELECT_SOURCE_REPOSITORY"

export type StagingSourceType = "STAGING_SOURCE_SERVER" | "STAGING_SOURCE_REPOSITORY"

export const STAGING_SOURCE_OPTIONS = [
  {
    sourceType: "STAGING_SOURCE_SERVER" as const,
    label: "Existing Server",
    description: "Analyse a connected production server first",
  },
  {
    sourceType: "STAGING_SOURCE_REPOSITORY" as const,
    label: "GitHub Repository",
    description: "Analyse repository files without server discovery",
  },
]

type SourceServerCandidate = {
  id: string
  name: string
  host?: string | null
  deploymentId?: string | null
  status?: string | null
}

type ServerResolution =
  | { status: "selected"; server: SourceServerCandidate; reason: "name" | "only" | "active" | "first" }
  | { status: "ambiguous"; servers: SourceServerCandidate[] }
  | { status: "none" }
  | { status: "not_server" }

export function stagingSourceTypeFromText(text: string): StagingSourceType | null {
  if (/\b(github|repo|repository)\b/i.test(text)) return "STAGING_SOURCE_REPOSITORY"
  if (/\b(existing server|server|production server|ubuntu server|vps|machine)\b/i.test(text)) return "STAGING_SOURCE_SERVER"
  return null
}

function explicitlyNamedServerSource(text: string): boolean {
  return /\b(use my only server|use this server|use that server|this server|existing server|ubuntu server|production server)\b/i.test(text)
}

function askSourceType(intent: AgentIntent): StagingResult {
  return {
    ok: false,
    flow: {
      type: "staging_flow",
      intent,
      message: `${SOURCE_TYPE_MESSAGE}\n\n${SOURCE_CHOICES}`,
      status: "SELECT_SOURCE_TYPE",
      sourceOptions: STAGING_SOURCE_OPTIONS,
    },
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/^(the|my)\s+/, "").trim()
}

export function resolveStagingSourceServer(
  text: string,
  servers: SourceServerCandidate[],
  activeServerId?: string | null
): ServerResolution {
  const t = text.toLowerCase().trim()
  if (servers.length === 0) return { status: "none" }

  const active = activeServerId
    ? servers.find((server) => server.id === activeServerId)
    : null

  if (/\b(use that|that server|this server|current server)\b/i.test(text)) {
    if (active) return { status: "selected", server: active, reason: "active" }
    if (servers.length === 1) return { status: "selected", server: servers[0]!, reason: "only" }
    return { status: "ambiguous", servers }
  }

  if (/\b(only server|only one server|the only server i have|my only server)\b/i.test(text)) {
    return servers.length === 1
      ? { status: "selected", server: servers[0]!, reason: "only" }
      : { status: "ambiguous", servers }
  }

  if (/\bfirst server\b/i.test(text)) return { status: "selected", server: servers[0]!, reason: "first" }

  const exact = servers.filter((server) => normalizeName(server.name) === normalizeName(t))
  if (exact.length === 1) return { status: "selected", server: exact[0]!, reason: "name" }
  if (exact.length > 1) return { status: "ambiguous", servers: exact }

  const named = servers.filter((server) => {
    const name = normalizeName(server.name)
    if (!name) return false
    return t.includes(name) || name.includes(normalizeName(t))
  })
  if (named.length === 1) return { status: "selected", server: named[0]!, reason: "name" }
  if (named.length > 1) return { status: "ambiguous", servers: named }

  if (/^\s*(my|the)?\s*server\s*$/i.test(text)) {
    return servers.length === 1
      ? { status: "selected", server: servers[0]!, reason: "only" }
      : { status: "ambiguous", servers }
  }

  return { status: "not_server" }
}

async function userServers(userId: string): Promise<SourceServerCandidate[]> {
  const servers = await prisma.server.findMany({
    where: { userId },
    select: { id: true, name: true, host: true, deploymentId: true, status: true },
    orderBy: { updatedAt: "desc" },
  })
  return servers
}

async function listServers(userId: string): Promise<string[]> {
  return (await userServers(userId)).slice(0, 8).map((server) => server.name)
}

type StagingFlow = {
  type: "staging_flow"
  intent: AgentIntent
  message: string
  stagingSessionId?: string
  status?: string
  sourceServerName?: string
  target?: string | null
  targetOptions?: typeof STAGING_TARGET_OPTIONS
  compatibility?: unknown
  plan?: unknown
  blueprint?: unknown
  stagingRecommendation?: unknown
  finalPlan?: unknown
  nextStep?: string
  needsServer?: boolean
  sourceOptions?: typeof STAGING_SOURCE_OPTIONS
  repositories?: Repository[]
}

export type StagingResult = { ok: boolean; flow: StagingFlow }

async function latestStagingSession(userId: string, sessionId?: string | null) {
  return prisma.stagingSession.findFirst({
    where: { userId, sessionId: sessionId ?? undefined },
    orderBy: { updatedAt: "desc" },
    include: { sourceServer: true },
  })
}

async function activeSourceServer(userId: string, sessionId?: string | null) {
  const session = sessionId
    ? await prisma.aiChatSession.findFirst({ where: { id: sessionId, userId } })
    : null

  if (session?.activeServerId) {
    return prisma.server.findFirst({ where: { id: session.activeServerId, userId } })
  }

  if (session?.activeDeploymentId) {
    const server = await prisma.server.findFirst({
      where: {
        userId,
        deploymentId: session.activeDeploymentId,
        status: { in: ["READY", "CONNECTED"] },
      },
      orderBy: { updatedAt: "desc" },
    })
    if (server) return server
  }

  return null
}

async function activeServerId(userId: string, sessionId?: string | null): Promise<string | null> {
  if (!sessionId) return null
  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { activeServerId: true },
  })
  return session?.activeServerId ?? null
}

async function markPendingSourceSelection(userId: string, sessionId?: string | null): Promise<void> {
  if (!sessionId) return
  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId },
    data: { latestRecommendedAction: PENDING_STAGING_SOURCE_STEP },
  })
}

async function markPendingSourceType(userId: string, sessionId?: string | null): Promise<void> {
  if (!sessionId) return
  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId },
    data: { latestRecommendedAction: PENDING_STAGING_SOURCE_TYPE_STEP },
  })
}

async function markPendingRepositorySelection(userId: string, sessionId?: string | null): Promise<void> {
  if (!sessionId) return
  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId },
    data: { latestRecommendedAction: PENDING_STAGING_SOURCE_REPOSITORY_STEP },
  })
}

async function clearPendingSourceSelection(
  userId: string,
  sessionId: string | null | undefined,
  serverId?: string | null
): Promise<void> {
  if (!sessionId) return
  await prisma.aiChatSession.updateMany({
    where: { id: sessionId, userId },
    data: {
      ...(serverId ? { activeServerId: serverId } : {}),
      latestRecommendedAction: null,
    },
  })
}

async function pendingStep(userId: string, sessionId?: string | null): Promise<string | null> {
  if (!sessionId) return null
  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { latestRecommendedAction: true },
  })
  return session?.latestRecommendedAction ?? null
}

function chooseSourceMessage(source: { name: string }, reason: "name" | "only" | "active" | "first"): string {
  return reason === "only"
    ? `Yes. You currently have one server, ${source.name}, so I'll use it as the production source and analyse it for staging.`
    : `Selected ${source.name} as the production source. I will analyse it for staging.`
}

async function startStagingFromSource(input: {
  userId: string
  sessionId?: string | null
  source: SourceServerCandidate
  reason: "name" | "only" | "active" | "first"
  intent: AgentIntent
}): Promise<StagingResult> {
  await clearPendingSourceSelection(input.userId, input.sessionId, input.source.id)

  const existing = await prisma.stagingSession.findFirst({
    where: {
      userId: input.userId,
      sourceServerId: input.source.id,
      sessionId: input.sessionId ?? undefined,
      status: { notIn: ["FAILED", "CANCELLED"] },
    },
    orderBy: { updatedAt: "desc" },
  })

  const session = existing ?? await prisma.stagingSession.create({
    data: {
      userId: input.userId,
      sourceServerId: input.source.id,
      sourceType: "STAGING_SOURCE_SERVER",
      sessionId: input.sessionId ?? null,
      title: `Staging from ${input.source.name}`,
      status: "CREATED",
    },
  })

  await prisma.stagingSession.update({
    where: { id: session.id },
    data: { status: "ANALYSING" },
  })

  const queued = await enqueueProductionDiscovery(input.userId, input.source.id, session.id)

  if (!queued.ok) {
    await prisma.stagingSession.update({
      where: { id: session.id },
      data: {
        status: "SOURCE_DISCOVERY_FAILED",
        discoveryError: queued.error,
      },
    })

    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: "Production analysis could not start.",
        stagingSessionId: session.id,
        status: "SOURCE_DISCOVERY_FAILED",
        sourceServerName: input.source.name,
        nextStep: "Retry Analysis or Choose Another Source.",
      },
    }
  }

  return {
    ok: true,
    flow: {
      type: "staging_flow",
      intent: input.intent,
      message: `${chooseSourceMessage(input.source, input.reason)} Production analysis started. I will ask where staging should run after source analysis succeeds.`,
      stagingSessionId: session.id,
      status: "ANALYSING",
      sourceServerName: input.source.name,
      nextStep: "Ask for staging status or staging plan after discovery completes.",
    },
  }
}

async function listRepositorySources(input: {
  userId: string
  sessionId?: string | null
  intent: AgentIntent
  clerkUserId?: string | null
  users?: ClerkUsersApi
}): Promise<StagingResult> {
  await markPendingRepositorySelection(input.userId, input.sessionId)
  if (!input.clerkUserId || !input.users) {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: "Connect GitHub so TisiOps can inspect your repositories.",
        status: "SELECT_SOURCE",
      },
    }
  }

  const list = await listRepositories(input.clerkUserId, input.users)
  if (list.source !== "github") {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: list.source === "error" ? list.error : "Could not read your repositories from GitHub.",
        status: "SELECT_SOURCE",
      },
    }
  }

  return {
    ok: true,
    flow: {
      type: "staging_flow",
      intent: input.intent,
      message: "Which GitHub repository should I use as the staging source?",
      status: "SELECT_SOURCE",
      repositories: list.repositories,
      nextStep: "Pick a repository.",
    },
  }
}

async function startStagingFromRepository(input: {
  userId: string
  sessionId?: string | null
  intent: AgentIntent
  content: string
  clerkUserId?: string | null
  users?: ClerkUsersApi
}): Promise<StagingResult> {
  if (!input.clerkUserId || !input.users) {
    return listRepositorySources(input)
  }

  const list = await listRepositories(input.clerkUserId, input.users)
  if (list.source !== "github") return listRepositorySources(input)

  const repository = matchRepository(input.content, list.repositories)
  if (!repository) return listRepositorySources(input)

  const branch = repository.defaultBranch
  const analysis = await analyzeRepository(input.clerkUserId, input.users, {
    owner: repository.owner,
    repo: repository.name,
    branch,
  })

  if (!analysis) {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: "Could not analyse this repository.",
        status: "SELECT_SOURCE",
      },
    }
  }

  await clearPendingSourceSelection(input.userId, input.sessionId)
  const existing = await prisma.stagingSession.findFirst({
    where: {
      userId: input.userId,
      sourceType: "STAGING_SOURCE_REPOSITORY",
      sourceRepositoryId: repository.fullName,
      sessionId: input.sessionId ?? undefined,
      status: { notIn: ["FAILED", "CANCELLED"] },
    },
    orderBy: { updatedAt: "desc" },
  })

  const recommendation = buildStagingRecommendation(null, analysis.codeProfile)
  const session = existing ?? await prisma.stagingSession.create({
    data: {
      userId: input.userId,
      sourceType: "STAGING_SOURCE_REPOSITORY",
      sourceRepositoryId: repository.fullName,
      sourceBranch: branch,
      sessionId: input.sessionId ?? null,
      title: `Staging from ${repository.fullName}`,
      status: "SOURCE_READY",
      codeProfileJson: analysis.codeProfile as never,
      stagingJson: recommendation as never,
    },
  })

  await prisma.stagingSession.update({
    where: { id: session.id },
    data: {
      sourceBranch: branch,
      status: "SOURCE_READY",
      codeProfileJson: analysis.codeProfile as never,
      stagingJson: recommendation as never,
    },
  })

  return {
    ok: true,
    flow: {
      type: "staging_flow",
      intent: input.intent,
      message: `Analysed ${repository.fullName} on ${branch}. Source is ready.\n\n${TARGET_CHOICES}`,
      stagingSessionId: session.id,
      status: "SOURCE_READY",
      stagingRecommendation: recommendation,
      targetOptions: STAGING_TARGET_OPTIONS,
      nextStep: "Where should staging run?",
    },
  }
}

async function attachRepositoryToServerSource(input: {
  userId: string
  sessionId?: string | null
  intent: AgentIntent
  content: string
  clerkUserId?: string | null
  users?: ClerkUsersApi
}): Promise<StagingResult | null> {
  const session = await latestStagingSession(input.userId, input.sessionId)
  if (!session || session.sourceType !== "STAGING_SOURCE_SERVER" || !session.runtimeJson) return null
  if (!input.clerkUserId || !input.users) return listRepositorySources(input)

  const list = await listRepositories(input.clerkUserId, input.users)
  if (list.source !== "github") return listRepositorySources(input)

  const repository = matchRepository(input.content, list.repositories)
  if (!repository) return listRepositorySources(input)

  const runtime = session.runtimeJson as ProductionRuntime
  const branch = runtime.git.branch ?? repository.defaultBranch
  const analysis = await analyzeRepository(input.clerkUserId, input.users, {
    owner: repository.owner,
    repo: repository.name,
    branch,
  })
  if (!analysis) {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: "Could not analyse this repository.",
        stagingSessionId: session.id,
        status: "PLAN_NOT_READY",
      },
    }
  }

  const recommendation = buildStagingRecommendation(runtime, analysis.codeProfile)
  await clearPendingSourceSelection(input.userId, input.sessionId, session.sourceServerId)
  await prisma.stagingSession.update({
    where: { id: session.id },
    data: {
      sourceRepositoryId: repository.fullName,
      sourceBranch: branch,
      codeProfileJson: analysis.codeProfile as never,
      stagingJson: recommendation as never,
      status: "SOURCE_READY",
    },
  })

  return {
    ok: true,
    flow: {
      type: "staging_flow",
      intent: input.intent,
      message: `Analysed ${repository.fullName} for ${sourceName(session)}. Source is ready.\n\n${TARGET_CHOICES}`,
      stagingSessionId: session.id,
      status: "SOURCE_READY",
      stagingRecommendation: recommendation,
      targetOptions: STAGING_TARGET_OPTIONS,
      nextStep: "Where should staging run?",
    },
  }
}

type StagingSessionForPlan = {
  sourceType: StagingSourceType | null
  sourceServerId: string | null
  sourceRepositoryId: string | null
  sourceBranch: string | null
  runtimeJson: unknown
  codeProfileJson: unknown
  stagingJson: unknown
  target: string | null
  discoveryError: string | null
}

export function validateFinalStagingPlanReadiness(session: StagingSessionForPlan): string | null {
  const codeProfile = session.codeProfileJson as CodeProfile | null
  const runtime = session.runtimeJson as ProductionRuntime | null

  if (session.sourceType === "STAGING_SOURCE_SERVER") {
    if (!session.sourceServerId) return "PLAN_NOT_READY: source server missing."
    if (session.discoveryError) return "PLAN_NOT_READY: production discovery failed."
    if (!runtime) return "PLAN_NOT_READY: production discovery has not completed."
    if (!session.stagingJson) return "PLAN_NOT_READY: staging blueprint missing."
    if (!codeProfile?.repository) return "PLAN_NOT_READY: repository not resolved."
    if (!codeProfile.runtime && runtime.runtimes.length === 0) return "PLAN_NOT_READY: runtime not resolved."
    if (!codeProfile.deployment) return "PLAN_NOT_READY: deployment type not resolved."
    if ((codeProfile.services ?? []).length === 0) return "PLAN_NOT_READY: services not resolved."
  } else if (session.sourceType === "STAGING_SOURCE_REPOSITORY") {
    if (!session.sourceRepositoryId) return "PLAN_NOT_READY: repository missing."
    if (!session.sourceBranch) return "PLAN_NOT_READY: branch missing."
    if (!codeProfile?.repository) return "PLAN_NOT_READY: code deployment profile missing."
    if (!session.stagingJson) return "PLAN_NOT_READY: staging blueprint missing."
    if (!codeProfile.runtime) return "PLAN_NOT_READY: runtime not resolved."
    if (!codeProfile.deployment) return "PLAN_NOT_READY: deployment type not resolved."
    if ((codeProfile.services ?? []).length === 0) return "PLAN_NOT_READY: services not resolved."
  } else {
    return "PLAN_NOT_READY: staging source missing."
  }

  if (!session.target) return "PLAN_NOT_READY: target not selected."
  return null
}

function sourceName(session: {
  sourceServer?: { name: string } | null
  sourceRepositoryId?: string | null
}): string {
  return session.sourceRepositoryId ?? session.sourceServer?.name ?? "Staging source"
}

function sourceReady(session: {
  sourceType: StagingSourceType | null
  runtimeJson: unknown
  codeProfileJson: unknown
  stagingJson: unknown
  discoveryError: string | null
}): boolean {
  if (session.discoveryError) return false
  if (session.sourceType === "STAGING_SOURCE_REPOSITORY") {
    return Boolean(session.codeProfileJson && session.stagingJson)
  }
  return Boolean(session.runtimeJson && session.stagingJson)
}

export async function handlePendingStagingSource(input: {
  userId: string
  sessionId: string
  content: string
  intent: AgentIntent
  clerkUserId?: string | null
  users?: ClerkUsersApi
}): Promise<StagingResult | null> {
  const step = await pendingStep(input.userId, input.sessionId)
  if (
    ![
      PENDING_STAGING_SOURCE_TYPE_STEP,
      PENDING_STAGING_SOURCE_STEP,
      PENDING_STAGING_SOURCE_REPOSITORY_STEP,
    ].includes(step ?? "")
  ) {
    return null
  }

  if (step === PENDING_STAGING_SOURCE_TYPE_STEP) {
    const sourceType = stagingSourceTypeFromText(input.content)
    if (sourceType === "STAGING_SOURCE_REPOSITORY") {
      return listRepositorySources(input)
    }
    if (sourceType === "STAGING_SOURCE_SERVER") {
      await markPendingSourceSelection(input.userId, input.sessionId)
      const names = await listServers(input.userId)
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent: input.intent,
          message:
            names.length > 0
              ? `Which server should I use as the production source? Connected servers: ${names.join(", ")}.`
              : "You don't have a connected server yet.",
          status: "SELECT_SOURCE",
          needsServer: names.length === 0,
          nextStep: names.length > 0 ? "Name the production server." : undefined,
        },
      }
    }
    return askSourceType(input.intent)
  }

  if (step === PENDING_STAGING_SOURCE_REPOSITORY_STEP) {
    const attached = await attachRepositoryToServerSource(input)
    return attached ?? startStagingFromRepository(input)
  }

  const servers = await userServers(input.userId)
  const resolution = resolveStagingSourceServer(
    input.content,
    servers,
    await activeServerId(input.userId, input.sessionId)
  )

  if (resolution.status === "not_server") return null
  if (resolution.status === "none") {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: "You don't have a connected server yet.",
        needsServer: true,
      },
    }
  }
  if (resolution.status === "ambiguous") {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: input.intent,
        message: `Which server should I use? Connected servers: ${resolution.servers.map((server) => server.name).join(", ")}.`,
        needsServer: true,
      },
    }
  }

  return startStagingFromSource({
    userId: input.userId,
    sessionId: input.sessionId,
    source: resolution.server,
    reason: resolution.reason,
    intent: "CREATE_STAGING",
  })
}

export async function handleStagingIntent(input: {
  userId: string
  sessionId?: string | null
  intent: AgentIntent
  content: string
  /** Needed only for GET_PRODUCTION_BLUEPRINT, to fetch the code profile. */
  clerkUserId?: string | null
  users?: ClerkUsersApi
}): Promise<StagingResult> {
  const { userId, sessionId, intent, content } = input

  if (intent === "CREATE_STAGING") {
    const sourceType = stagingSourceTypeFromText(content)

    if (sourceType === "STAGING_SOURCE_REPOSITORY") {
      return startStagingFromRepository({
        userId,
        sessionId,
        intent,
        content,
        clerkUserId: input.clerkUserId ?? null,
        users: input.users,
      })
    }

    const servers = await userServers(userId)
    if (sourceType !== "STAGING_SOURCE_SERVER" && !explicitlyNamedServerSource(content)) {
      await markPendingSourceType(userId, sessionId)
      return askSourceType(intent)
    }

    const resolved = resolveStagingSourceServer(
      content,
      servers,
      await activeServerId(userId, sessionId)
    )

    if (resolved.status === "selected") {
      return startStagingFromSource({
        userId,
        sessionId,
        source: resolved.server,
        reason: resolved.reason,
        intent,
      })
    }

    if (resolved.status === "ambiguous") {
      await markPendingSourceSelection(userId, sessionId)
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message: `Which production server should I use? Connected servers: ${resolved.servers.map((server) => server.name).join(", ")}.`,
          needsServer: true,
        },
      }
    }

    await markPendingSourceSelection(userId, sessionId)
    if (servers.length === 0) {
      return { ok: false, flow: { type: "staging_flow", intent, message: "You don't have a connected server yet.", needsServer: true } }
    }

    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent,
        message: `Which server should I use as the production source? Connected servers: ${servers.map((server) => server.name).join(", ")}.`,
        status: "SELECT_SOURCE",
        needsServer: true,
      },
    }
  }

  const session = await latestStagingSession(userId, sessionId)
  if (!session) {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent,
        message: "No staging session found yet. Say 'create staging for this server' first.",
        needsServer: true,
      },
    }
  }

  if (intent === "ANALYSE_PRODUCTION_FOR_STAGING") {
    if (!session.sourceServerId) {
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message: "Choose an existing server source before running production analysis.",
          stagingSessionId: session.id,
          status: "SELECT_SOURCE",
          nextStep: "Choose Existing Server as the source.",
        },
      }
    }

    await prisma.stagingSession.update({
      where: { id: session.id },
      data: { status: "ANALYSING" },
    })

    const queued = await enqueueProductionDiscovery(
      userId,
      session.sourceServerId,
      session.id
    )
    if (!queued.ok) {
      await prisma.stagingSession.update({
        where: { id: session.id },
        data: {
          status: "SOURCE_DISCOVERY_FAILED",
          discoveryError: queued.error,
        },
      })
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message: "Production analysis could not start.",
          stagingSessionId: session.id,
          status: "SOURCE_DISCOVERY_FAILED",
          nextStep: "Retry Analysis or Choose Another Source.",
        },
      }
    }

    return {
      ok: true,
      flow: {
        type: "staging_flow",
        intent,
        message:
          "Production discovery started — I am reading what runs on the production server over read-only SSH. Nothing is modified. Say 'get staging status' to see progress.",
        stagingSessionId: session.id,
        status: "ANALYSING",
        nextStep: "Say 'get staging status' or 'get staging plan' once discovery completes.",
      },
    }
  }

  if (intent === "GET_STAGING_PLAN") {
    if (session.status === "SOURCE_DISCOVERY_FAILED") {
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message: "Production analysis could not start.",
          stagingSessionId: session.id,
          status: session.status,
          nextStep: "Retry Analysis or Choose Another Source.",
        },
      }
    }
    if (session.sourceType === "STAGING_SOURCE_REPOSITORY" && session.stagingJson) {
      return {
        ok: true,
        flow: {
          type: "staging_flow",
          intent,
          message: `Source is ready for ${session.sourceRepositoryId}. ${TARGET_CHOICES}`,
          stagingSessionId: session.id,
          status: session.status,
          stagingRecommendation: session.stagingJson,
          targetOptions: STAGING_TARGET_OPTIONS,
          nextStep: "Where should staging run?",
        },
      }
    }
    if (session.runtimeJson) {
      return buildProductionBlueprintFlow({
        userId,
        sessionId,
        session,
        clerkUserId: input.clerkUserId ?? null,
        users: input.users ?? undefined,
      })
    }
    if (session.status === "ANALYSING") {
      return {
        ok: true,
        flow: {
          type: "staging_flow",
          intent,
          message: "Production discovery is still running. Check back in a moment.",
          stagingSessionId: session.id,
          status: session.status,
        },
      }
    }
    return {
      ok: true,
      flow: {
        type: "staging_flow",
        intent,
        message:
          "Production has not been discovered yet. Say 'analyse production for staging' to run read-only discovery.",
        stagingSessionId: session.id,
        status: session.status,
      },
    }
  }

  if (intent === "SELECT_STAGING_TARGET") {
    if (!sourceReady(session)) {
      await prisma.stagingSession.update({
        where: { id: session.id },
        data: { status: session.status === "SOURCE_DISCOVERY_FAILED" ? "SOURCE_DISCOVERY_FAILED" : "PLAN_NOT_READY" },
      })
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message:
            session.status === "SOURCE_DISCOVERY_FAILED"
              ? "Production analysis could not start."
              : "Source analysis is not complete yet. I need a completed staging blueprint before target selection.",
          stagingSessionId: session.id,
          status: session.status === "SOURCE_DISCOVERY_FAILED" ? "SOURCE_DISCOVERY_FAILED" : "PLAN_NOT_READY",
          nextStep:
            session.status === "SOURCE_DISCOVERY_FAILED"
              ? "Retry Analysis or Choose Another Source."
              : "Ask for staging plan after source analysis completes.",
        },
      }
    }

    const target = stagingTargetFromText(content)
    if (!target) {
      const recommended =
        STAGING_TARGET_OPTIONS.find((option) => option.recommended)?.label ??
        STAGING_TARGET_OPTIONS[0]!.label
      return {
        ok: true,
        flow: {
          type: "staging_flow",
          intent,
          message: `Where should staging run? Pick one — I recommend ${recommended}.`,
          stagingSessionId: session.id,
          status: session.status,
          targetOptions: STAGING_TARGET_OPTIONS,
          nextStep: "Say the target: 'create a new server', 'use an existing server', or 'same production server'.",
        },
      }
    }

    const runtime = session.runtimeJson as ProductionRuntime | null
    const codeProfile = (session.codeProfileJson as CodeProfile | null) ?? null
    const resources = recommendResources(runtime)

    // For EXISTING_SERVER, resolve the named target server and read its runtime
    // so compatibility is checked against the real target, not a guess.
    let targetServerId: string | null = null
    let targetRuntime: ProductionRuntime | null =
      target === "SAME_SERVER" ? runtime : null

    if (target === "EXISTING_SERVER") {
      const resolved = resolveStagingSourceServer(
        content,
        await userServers(userId),
        await activeServerId(userId, sessionId)
      )
      if (resolved.status !== "selected") {
        const names = await listServers(userId)
        return {
          ok: false,
          flow: {
            type: "staging_flow",
            intent,
            message:
              names.length > 0
                ? `Which existing server should staging use? Connected servers: ${names.join(", ")}.`
                : "You have no connected servers. Create a new server, or connect one first.",
            stagingSessionId: session.id,
            status: session.status,
            targetOptions: STAGING_TARGET_OPTIONS,
            nextStep: "Name the server you want to use for staging.",
          },
        }
      }
      targetServerId = resolved.server.id
      const read = await readServerRuntime(targetServerId)
      if (read.ok) targetRuntime = read.runtime
    }

    const compatibility = checkCompatibility(
      resources,
      targetRuntime,
      target,
      codeProfile?.port ?? null
    )

    const notReady = validateFinalStagingPlanReadiness({
      sourceType: session.sourceType as StagingSourceType | null,
      sourceServerId: session.sourceServerId,
      sourceRepositoryId: session.sourceRepositoryId,
      sourceBranch: session.sourceBranch,
      runtimeJson: session.runtimeJson,
      codeProfileJson: session.codeProfileJson,
      stagingJson: session.stagingJson,
      target,
      discoveryError: session.discoveryError,
    })
    if (notReady) {
      await prisma.stagingSession.update({
        where: { id: session.id },
        data: { status: "PLAN_NOT_READY", target },
      })
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message: notReady,
          stagingSessionId: session.id,
          status: "PLAN_NOT_READY",
          target,
          compatibility,
          nextStep: notReady.includes("repository")
            ? "Select a GitHub repository before creating the final plan."
            : "Complete source analysis before creating the final plan.",
        },
      }
    }

    const builtPlan = buildFinalStagingPlan({
      source: sourceName(session),
      codeProfile,
      runtime,
      target,
    })
    const finalPlan = {
      ...builtPlan,
      productionBranch: builtPlan.productionBranch ?? session.sourceBranch,
    }

    await prisma.stagingSession.update({
      where: { id: session.id },
      data: {
        status: "READY",
        target,
        targetLabel: STAGING_TARGET_OPTIONS.find((o) => o.target === target)?.label ?? target,
        targetServerId,
        finalPlanJson: finalPlan as never,
      },
    })

    return {
      ok: true,
      flow: {
        type: "staging_flow",
        intent,
        message: compatibility.compatible
          ? `Staging target set to "${STAGING_TARGET_OPTIONS.find((o) => o.target === target)?.label ?? target}". The target can support staging. Here is the plan to review.`
          : `Staging target "${STAGING_TARGET_OPTIONS.find((o) => o.target === target)?.label ?? target}" does not currently support staging. ${compatibility.reason}`,
        stagingSessionId: session.id,
        status: "READY",
        target,
        targetOptions: STAGING_TARGET_OPTIONS,
        compatibility,
        finalPlan,
        nextStep: compatibility.compatible
          ? "Say 'approve staging' to queue the build."
          : "Pick a different target, or discover the target server first.",
      },
    }
  }

  if (intent === "APPROVE_STAGING") {
    if (!session.finalPlanJson) {
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message:
            "There is no staging plan to approve yet. Select a target first, then I can build the plan.",
          stagingSessionId: session.id,
          status: session.status,
        },
      }
    }

    const queued = await createStagingAwsDeployment({
      userId: session.userId,
      sourceServerId: session.sourceServerId ?? null,
      stagingSessionId: session.id,
      finalPlan: session.finalPlanJson,
    })

    return {
      ok: queued.ok,
      flow: {
        type: "staging_flow",
        intent,
        message: queued.ok
          ? "Approved. I have queued staging provisioning. The worker will create one AWS server, deploy the staging branch, and expose HTTP on the Elastic IP."
          : `Could not queue staging provisioning: ${queued.error}`,
        stagingSessionId: session.id,
        status: queued.ok ? "READY" : session.status,
        finalPlan: queued.ok ? queued.finalPlan : session.finalPlanJson,
        nextStep: queued.ok ? "Track the staging deployment progress." : undefined,
      },
    }
  }

  if (intent === "GENERATE_STAGING_BLUEPRINT") {
    const runtime = session.runtimeJson as ProductionRuntime | null
    if (!runtime) {
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message:
            "I need to discover the production server first. Say 'analyse production for staging', then generate the staging blueprint.",
          stagingSessionId: session.id,
          status: session.status,
        },
      }
    }

    const recommendation = buildStagingRecommendation(
      runtime,
      (session.codeProfileJson as CodeProfile | null) ?? null
    )

    await prisma.stagingSession.update({
      where: { id: session.id },
      data: {
        stagingJson: recommendation as never,
        status: "READY",
      },
    })

    return {
      ok: true,
      flow: {
        type: "staging_flow",
        intent,
        message: `I understand your production environment, and here is the safe staging version I recommend: ${recommendation.services.map((s) => s.name).join(", ")} on ${recommendation.domain}. Isolation is enforced — staging never shares the production database or its writable volumes.`,
        stagingSessionId: session.id,
        status: "READY",
        stagingRecommendation: recommendation,
        nextStep: "Review the staging blueprint, then approve execution in a later phase.",
      },
    }
  }

  if (intent === "GET_PRODUCTION_BLUEPRINT") {
    return await buildProductionBlueprintFlow({
      userId,
      sessionId,
      session,
      clerkUserId: input.clerkUserId ?? null,
      users: input.users ?? undefined,
    })
  }

  if (intent === "GET_STAGING_STATUS") {
    if (session.status === "SOURCE_DISCOVERY_FAILED") {
      return {
        ok: false,
        flow: {
          type: "staging_flow",
          intent,
          message: "Production analysis could not start.",
          stagingSessionId: session.id,
          status: session.status,
          sourceServerName: session.sourceServer?.name,
          nextStep: "Retry Analysis or Choose Another Source.",
        },
      }
    }

    return {
      ok: true,
      flow: {
        type: "staging_flow",
        intent,
        message: `Staging status: ${session.status}.`,
        stagingSessionId: session.id,
        status: session.status,
        target: session.target,
        sourceServerName: session.sourceServer?.name,
        nextStep:
          session.status === "SOURCE_READY"
            ? "Next: choose where staging should run."
            : session.status === "CREATED"
              ? "Next: choose source."
              : undefined,
      },
    }
  }

  return {
    ok: false,
    flow: { type: "staging_flow", intent, message: "Staging request not understood." },
  }
}

async function buildProductionBlueprintFlow(input: {
  userId: string
  sessionId?: string | null
  session: {
    id: string
    sourceType: StagingSourceType | null
    sourceServerId: string | null
    sourceServer: { name: string } | null
    sourceRepositoryId: string | null
    sourceBranch: string | null
    runtimeJson: unknown
    codeProfileJson: unknown
    stagingJson: unknown
    discoveryError: string | null
    status: string
  }
  clerkUserId: string | null
  users?: ClerkUsersApi
}): Promise<StagingResult> {
  const runtime = input.session.runtimeJson as ProductionRuntime | null
  if (!runtime) {
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: "GET_PRODUCTION_BLUEPRINT",
        message:
          "I need to discover the production server first. Say 'analyse production for staging', then ask for the blueprint.",
        stagingSessionId: input.session.id,
        status: input.session.status,
      },
    }
  }

  let codeProfile = input.session.codeProfileJson as CodeProfile | null

  // Resolve the repository from the git remote on the server, then fetch the
  // code profile from GitHub when a token is available.
  if (!codeProfile && input.clerkUserId && input.users) {
    const repo = gitRepoFromRemote(runtime.git.remote ?? null)
    if (repo) {
      const analysis = await analyzeRepository(input.clerkUserId, input.users, {
        owner: repo.owner,
        repo: repo.name,
        branch: runtime.git.branch ?? "main",
      })
      if (analysis) {
        codeProfile = analysis.codeProfile
        await prisma.stagingSession.update({
          where: { id: input.session.id },
          data: {
            codeProfileJson: codeProfile as never,
            sourceRepositoryId: `${repo.owner}/${repo.name}`,
            sourceBranch: runtime.git.branch ?? "main",
          },
        })
      }
    }
  }

  if (!codeProfile?.repository) {
    await markPendingRepositorySelection(input.userId, input.sessionId)
    return {
      ok: false,
      flow: {
        type: "staging_flow",
        intent: "GET_PRODUCTION_BLUEPRINT",
        message: "I found the server runtime, but could not resolve the application repository. Which GitHub repository should I use?",
        stagingSessionId: input.session.id,
        status: "PLAN_NOT_READY",
        nextStep: "Select a GitHub repository.",
      },
    }
  }

  const deployments = await prisma.deployment.findMany({
    where: { userId: input.userId },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { template: true, provider: true, type: true },
  })

  const monitoring = input.session.sourceServerId
    ? await prisma.serverMetricSnapshot.findFirst({
        where: { userId: input.userId, serverId: input.session.sourceServerId },
      })
    : null

  const blueprint = buildBlueprint({
    codeProfile,
    runtime,
    deployments: deployments.map((d) => ({
      template: d.template,
      provider: d.provider,
      type: d.type,
    })),
    monitoring: monitoring
      ? {
          cpuPercent: monitoring.cpuPercent,
          memoryPercent: monitoring.memoryPercent,
          diskPercent: monitoring.diskPercent,
          collectedAt: monitoring.collectedAt?.toISOString() ?? null,
        }
      : null,
  })

  await prisma.stagingSession.update({
    where: { id: input.session.id },
    data: {
      blueprintJson: blueprint as never,
      stagingJson: buildStagingRecommendation(runtime, codeProfile) as never,
      status: "SOURCE_READY",
    },
  })

  const driftLine =
    blueprint.drift.length > 0
      ? `\n\n${blueprint.drift.length} deployment drift item${blueprint.drift.length === 1 ? "" : "s"} detected — see below.`
      : "\n\nNo deployment drift detected."

  return {
    ok: true,
    flow: {
      type: "staging_flow",
      intent: "GET_PRODUCTION_BLUEPRINT",
      message: `Production blueprint for ${blueprint.repository ?? sourceName(input.session)} (${blueprint.runtime ?? "unknown runtime"}).${driftLine}\n\n${TARGET_CHOICES}`,
      stagingSessionId: input.session.id,
      status: "SOURCE_READY",
      blueprint,
      stagingRecommendation: buildStagingRecommendation(runtime, codeProfile),
      targetOptions: STAGING_TARGET_OPTIONS,
      nextStep: "Where should staging run?",
    },
  }
}
