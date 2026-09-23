import { createHash, randomBytes } from "node:crypto"
import { trace } from "@opentelemetry/api"
import { z } from "zod"

import { prisma } from "../../db/prisma"
import { appLog } from "../observability/app-logger"
import { estimateTokens, limitsFor, usageDate } from "../ai/limits"
import { currentMinuteCount, recordMinuteHit } from "../ai/rateLimit"
import { GeminiProvider } from "./providers/gemini.provider"
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider"
import { AiGatewayError, type AiMessage, type AiProviderAdapter } from "./provider.types"

const tracer = trace.getTracer("tisiops-ai-gateway")

export const chatSchema = z.object({
  model: z.string().min(1).max(80),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().trim().min(1).max(12_000),
      })
    )
    .min(1)
    .max(20),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4_000).optional(),
})

export const apiKeyNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export const providerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  providerId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  type: z.string().trim().min(1).max(40).optional(),
  baseUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  apiKeyEnvName: z.string().trim().regex(/^[A-Z0-9_]+$/).nullable().optional().or(z.literal("")),
  isEnabled: z.boolean().optional(),
  isSystem: z.boolean().optional(),
})

export const modelSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  modelCode: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  providerId: z.string().trim().min(1).max(80).optional(),
  providerModel: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  inputPricePer1M: z.coerce.number().min(0).nullable().optional(),
  outputPricePer1M: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  isEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  supportsStreaming: z.boolean().optional(),
  supportsJson: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
})

export const DEFAULT_CONSOLE_MODEL = "mistral-default"
export const CONSOLE_MODEL_IDS = [DEFAULT_CONSOLE_MODEL, "gemini-3.8-flash"] as const
export const consoleModelSchema = z.enum(CONSOLE_MODEL_IDS)

export function resolveConsoleModel(modelCode: string | null | undefined) {
  if (!modelCode) return DEFAULT_CONSOLE_MODEL
  const parsed = consoleModelSchema.safeParse(modelCode)
  if (!parsed.success) throw new AiGatewayError("INVALID_MODEL", "Invalid model", 400)
  return parsed.data
}

const providers = [
  { providerId: "google-gemini", name: "Gemini", type: "gemini", baseUrl: null, apiKeyEnvName: "GEMINI_API_KEY" },
  { providerId: "xai-grok", name: "Grok", type: "openai-compatible", baseUrl: "https://api.x.ai/v1", apiKeyEnvName: "GROK_API_KEY" },
  { providerId: "mistral", name: "Mistral", type: "openai-compatible", baseUrl: "https://api.mistral.ai/v1", apiKeyEnvName: "MISTRAL_API_KEY" },
  { providerId: "opencode", name: "OpenCode", type: "openai-compatible", baseUrl: process.env.OPENCODE_BASE_URL ?? null, apiKeyEnvName: "OPENCODE_API_KEY" },
]

const models = [
  { modelCode: "mistral-default", displayName: "Mistral", providerId: "mistral", providerModel: process.env.MISTRAL_MODEL ?? "mistral-medium-latest", description: "Existing TisiOps model.", tags: ["console"] },
  { modelCode: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash", providerId: "google-gemini", providerModel: "gemini-3.8-flash", description: "Google model for TisiOps AI Console.", contextWindow: 1_000_000, tags: ["console", "recommended"] },
  { modelCode: "gemini-flash", displayName: "Gemini Flash", providerId: "google-gemini", providerModel: "gemini-2.5-flash", description: "Fast model for general DevOps assistance.", contextWindow: 1_000_000, tags: ["fast", "devops"] },
  { modelCode: "gemini-pro", displayName: "Gemini Pro", providerId: "google-gemini", providerModel: "gemini-2.5-pro", description: "Deeper reasoning for repair planning.", contextWindow: 1_000_000, tags: ["reasoning"] },
  { modelCode: "grok", displayName: "Grok", providerId: "xai-grok", providerModel: "grok-4", description: "Conversational reasoning model.", tags: ["reasoning"] },
  { modelCode: "grok-fast", displayName: "Grok Fast", providerId: "xai-grok", providerModel: "grok-4-fast", description: "Lower-latency Grok route.", tags: ["fast"] },
  { modelCode: "mistral-small", displayName: "Mistral Small", providerId: "mistral", providerModel: "mistral-small-latest", description: "Compact open model option.", tags: ["fast"] },
  { modelCode: "mistral-medium", displayName: "Mistral Medium", providerId: "mistral", providerModel: "mistral-medium-latest", description: "Balanced open model option.", isDefault: true, tags: ["balanced"] },
  { modelCode: "mistral-large", displayName: "Mistral Large", providerId: "mistral", providerModel: "mistral-large-latest", description: "Strong open model option.", tags: ["reasoning"] },
  { modelCode: "opencode-default", displayName: "OpenCode Default", providerId: "opencode", providerModel: "default", description: "Custom OpenAI-compatible model endpoint.", tags: ["custom"] },
]

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

function rawKey() {
  return `tisiops_sk_live_${randomBytes(32).toString("base64url")}`
}

function clean<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "")
  )
}

function startOfToday() {
  return new Date(`${usageDate()}T00:00:00.000Z`)
}

export async function seedAiGatewayDefaults() {
  for (const provider of providers) {
    await prisma.aiProvider.upsert({
      where: { providerId: provider.providerId },
      create: { ...provider, isSystem: true },
      update: { name: provider.name, type: provider.type, apiKeyEnvName: provider.apiKeyEnvName, baseUrl: provider.baseUrl ?? undefined },
    })
  }

  for (const model of models) {
    await prisma.aiModel.upsert({
      where: { modelCode: model.modelCode },
      create: { ...model, tags: model.tags ?? [] },
      update: { displayName: model.displayName, providerId: model.providerId, providerModel: model.providerModel, description: model.description, contextWindow: model.contextWindow, tags: model.tags ?? [] },
    })
  }
}

export async function listGatewayModels(admin = false) {
  return prisma.aiModel.findMany({
    where: admin ? {} : { isEnabled: true, isPublic: true, provider: { isEnabled: true } },
    include: { provider: true },
    orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
  })
}

export async function gatewaySummary(userId: string, isAdmin: boolean) {
  const [apiKeys, usage, enabledModels] = await Promise.all([
    prisma.userApiKey.count({ where: { userId, status: "ACTIVE" } }),
    prisma.aiUsage.aggregate({
      where: { userId, createdAt: { gte: startOfToday() }, status: "SUCCESS" },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
    }),
    prisma.aiModel.count({ where: { isEnabled: true, isPublic: true, provider: { isEnabled: true } } }),
  ])
  const limits = limitsFor(isAdmin)

  return {
    plan: isAdmin ? "Admin" : "Free",
    dailyMessagesUsed: usage._count.id,
    dailyMessagesLimit: limits.dailyMessages,
    dailyTokensUsed: usage._sum.totalTokens ?? 0,
    dailyTokensLimit: limits.dailyTokens,
    estimatedCostToday: usage._sum.estimatedCost?.toString() ?? "0",
    activeApiKeys: apiKeys,
    availableModels: enabledModels,
  }
}

export async function listApiKeys(userId: string) {
  return prisma.userApiKey.findMany({
    where: { userId },
    select: { id: true, name: true, keyPrefix: true, status: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function createApiKey(userId: string, name: string) {
  const key = rawKey()
  const keyPrefix = key.slice(0, 24)
  const row = await prisma.userApiKey.create({
    data: { userId, name, keyPrefix, keyHash: hashKey(key) },
    select: { id: true, name: true, keyPrefix: true, status: true, createdAt: true },
  })
  return { ...row, key }
}

export async function revokeApiKey(userId: string, id: string) {
  await prisma.userApiKey.updateMany({ where: { id, userId }, data: { status: "REVOKED" } })
}

function adapterFor(provider: { type: string; providerId: string }): AiProviderAdapter {
  if (provider.type === "gemini" || provider.providerId === "google-gemini") return new GeminiProvider()
  return new OpenAiCompatibleProvider()
}

function estimateMessageTokens(messages: AiMessage[]) {
  return estimateTokens(messages.map((message) => message.content).join(" "))
}

function estimateCost(model: { inputPricePer1M: unknown; outputPricePer1M: unknown }, inputTokens: number, outputTokens: number) {
  const inputPrice = model.inputPricePer1M == null ? null : Number(model.inputPricePer1M)
  const outputPrice = model.outputPricePer1M == null ? null : Number(model.outputPricePer1M)
  if (inputPrice == null || outputPrice == null) return null
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice
}

async function checkLimits(userId: string, isAdmin: boolean) {
  if (isAdmin) return
  const limits = limitsFor(false)
  const [daily, minuteCount] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { userId, createdAt: { gte: startOfToday() }, status: "SUCCESS" },
      _count: { id: true },
      _sum: { totalTokens: true },
    }),
    currentMinuteCount(userId),
  ])

  if (minuteCount >= Number(process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE ?? 10)) {
    throw new AiGatewayError("RATE_LIMIT_EXCEEDED", "Rate limit exceeded", 429)
  }
  if (daily._count.id >= Number(process.env.AI_GATEWAY_FREE_DAILY_MESSAGES ?? limits.dailyMessages)) {
    throw new AiGatewayError("USER_LIMIT_EXCEEDED", "Daily message limit exceeded", 429)
  }
  if ((daily._sum.totalTokens ?? 0) >= Number(process.env.AI_GATEWAY_FREE_DAILY_TOKENS ?? limits.dailyTokens)) {
    throw new AiGatewayError("USER_LIMIT_EXCEEDED", "Daily token limit exceeded", 429)
  }
}

async function routeChat(input: {
  userId?: string
  apiKeyId?: string | null
  isAdmin: boolean
  source: string
  agentName?: string
  modelCode: string
  messages: AiMessage[]
  temperature?: number
  maxTokens?: number
  deploymentId?: string
  sessionId?: string
}) {
  if (process.env.AI_GATEWAY_ENABLED === "false") {
    throw new AiGatewayError("AI_GATEWAY_DISABLED", "AI Gateway is disabled", 503)
  }

  const requestId = `req_${randomBytes(12).toString("hex")}`
  const started = performance.now()

  return tracer.startActiveSpan("ai_gateway.request.received", async (span) => {
    span.setAttributes({ requestId, userId: input.userId ?? "anonymous", source: input.source, modelCode: input.modelCode })
    try {
      if (input.userId) {
        await checkLimits(input.userId, input.isAdmin)
        await recordMinuteHit(input.userId)
      }

      const model = await prisma.aiModel.findUnique({ where: { modelCode: input.modelCode }, include: { provider: true } })
      if (!model) throw new AiGatewayError("MODEL_NOT_FOUND", "Model not found", 404)
      if (!model.isEnabled) throw new AiGatewayError("MODEL_DISABLED", "Model is disabled", 403)
      if (!model.provider?.isEnabled) throw new AiGatewayError("PROVIDER_DISABLED", "Provider is disabled", 403)

      const apiKey = model.provider.apiKeyEnvName ? process.env[model.provider.apiKeyEnvName] : null
      if (!apiKey) {
        const code = model.providerId === "mistral" ? "MISTRAL_NOT_CONFIGURED" : model.providerId === "google-gemini" ? "GEMINI_NOT_CONFIGURED" : "PROVIDER_KEY_MISSING"
        throw new AiGatewayError(code, "Provider is not configured", 503)
      }

      const output = await adapterFor(model.provider).chat({
        providerModel: model.providerModel,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        apiKey,
        baseUrl: model.provider.baseUrl,
      })
      const inputTokens = output.inputTokens ?? estimateMessageTokens(input.messages)
      const outputTokens = output.outputTokens ?? estimateTokens(output.content)
      const totalTokens = output.totalTokens ?? inputTokens + outputTokens
      const estimatedCost = estimateCost(model, inputTokens, outputTokens)

      await prisma.$transaction([
        prisma.aiUsage.create({
          data: {
            userId: input.userId,
            apiKeyId: input.apiKeyId,
            source: input.source,
            agentName: input.agentName,
            modelCode: model.modelCode,
            providerId: model.providerId,
            providerModel: model.providerModel,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCost,
            currency: model.currency,
            status: "SUCCESS",
            requestId,
            deploymentId: input.deploymentId,
            sessionId: input.sessionId,
          },
        }),
        prisma.aiGatewayRequestLog.create({
          data: {
            userId: input.userId,
            apiKeyId: input.apiKeyId,
            requestId,
            modelCode: model.modelCode,
            providerId: model.providerId,
            status: "SUCCESS",
            latencyMs: Math.round(performance.now() - started),
            metadataJson: { source: input.source, agentName: input.agentName ?? null },
          },
        }),
      ])

      return {
        id: requestId,
        model: model.modelCode,
        provider: model.providerId,
        content: output.content,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCost: estimatedCost?.toString() ?? null,
        },
      }
    } catch (error) {
      const code = error instanceof AiGatewayError ? error.code : "UNKNOWN_AI_GATEWAY_ERROR"
      appLog("warn", "ai_gateway.request.failed", { requestId, userId: input.userId, modelCode: input.modelCode, errorCode: code })
      await prisma.aiUsage.create({
        data: {
          userId: input.userId,
          apiKeyId: input.apiKeyId,
          source: input.source,
          agentName: input.agentName,
          modelCode: input.modelCode,
          providerId: "unknown",
          providerModel: "unknown",
          status: code.startsWith("API_KEY") ? "BLOCKED_AUTH" : code.includes("LIMIT") ? "BLOCKED_LIMIT" : "FAILED",
          errorCode: code,
          requestId,
          deploymentId: input.deploymentId,
          sessionId: input.sessionId,
        },
      }).catch(() => undefined)
      span.recordException(error as Error)
      throw error
    } finally {
      span.end()
    }
  })
}

export async function chatWithUserKey(raw: string, body: unknown) {
  if (!raw.startsWith("tisiops_sk_live_")) throw new AiGatewayError("API_KEY_INVALID", "Invalid API key", 401)
  const apiKey = await prisma.userApiKey.findUnique({ where: { keyHash: hashKey(raw) }, include: { user: true } })
  if (!apiKey) throw new AiGatewayError("API_KEY_INVALID", "Invalid API key", 401)
  if (apiKey.status !== "ACTIVE") throw new AiGatewayError("API_KEY_REVOKED", "API key revoked", 401)
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) throw new AiGatewayError("API_KEY_REVOKED", "API key expired", 401)

  const parsed = chatSchema.parse(body)
  await prisma.userApiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })

  return routeChat({
    userId: apiKey.userId,
    apiKeyId: apiKey.id,
    isAdmin: apiKey.user.role === "ADMIN",
    source: "PUBLIC_API",
    modelCode: parsed.model,
    messages: parsed.messages,
    temperature: parsed.temperature,
    maxTokens: parsed.maxTokens,
  })
}

export async function aiGatewayChat(input: {
  userId?: string
  isAdmin: boolean
  source: "AI_CONSOLE" | "AGENT" | "ADMIN_TEST" | "DEMO"
  agentName?: string
  modelCode?: string
  messages: AiMessage[]
  deploymentId?: string
  sessionId?: string
  temperature?: number
  maxTokens?: number
}) {
  return routeChat({
    ...input,
    modelCode: input.source === "AI_CONSOLE"
      ? resolveConsoleModel(input.modelCode)
      : input.modelCode ?? process.env.AI_GATEWAY_DEFAULT_MODEL ?? "gemini-flash",
  })
}

export async function userUsage(userId: string) {
  const [rows, totals] = await Promise.all([
    prisma.aiUsage.groupBy({
      by: ["modelCode", "source"],
      where: { userId, createdAt: { gte: startOfToday() } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
    gatewaySummary(userId, false),
  ])
  return { totals, rows }
}

export async function adminUsage() {
  const [totals, byModel, byProvider, errors] = await Promise.all([
    prisma.aiUsage.aggregate({ _count: { id: true }, _sum: { totalTokens: true, estimatedCost: true } }),
    prisma.aiUsage.groupBy({ by: ["modelCode"], _count: { id: true }, _sum: { totalTokens: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.aiUsage.groupBy({ by: ["providerId"], _count: { id: true }, _sum: { totalTokens: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.aiUsage.groupBy({ by: ["errorCode"], where: { errorCode: { not: null } }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
  ])
  return { totals, byModel, byProvider, errors }
}

export async function listProviders() {
  return prisma.aiProvider.findMany({ orderBy: { name: "asc" } })
}

export async function createProvider(body: unknown) {
  const data = providerSchema.required({ name: true, providerId: true, type: true }).parse(body)
  return prisma.aiProvider.create({
    data: {
      providerId: data.providerId,
      name: data.name,
      type: data.type,
      baseUrl: data.baseUrl || null,
      apiKeyEnvName: data.apiKeyEnvName || null,
      isEnabled: data.isEnabled ?? true,
      isSystem: data.isSystem ?? false,
    },
  })
}

export async function updateProvider(id: string, body: unknown) {
  const data = providerSchema.parse(body)
  return prisma.aiProvider.update({ where: { id }, data: clean(data) })
}

export async function createModel(body: unknown) {
  const data = modelSchema.required({ displayName: true, modelCode: true, providerId: true, providerModel: true }).parse(body)
  return prisma.aiModel.create({
    data: {
      modelCode: data.modelCode,
      displayName: data.displayName,
      providerModel: data.providerModel,
      provider: { connect: { providerId: data.providerId } },
      description: data.description,
      contextWindow: data.contextWindow,
      inputPricePer1M: data.inputPricePer1M,
      outputPricePer1M: data.outputPricePer1M,
      currency: data.currency ?? "USD",
      isEnabled: data.isEnabled ?? true,
      isPublic: data.isPublic ?? true,
      isDefault: data.isDefault ?? false,
      supportsStreaming: data.supportsStreaming ?? false,
      supportsJson: data.supportsJson ?? false,
      supportsTools: data.supportsTools ?? false,
      tags: data.tags ?? [],
    },
  })
}

export async function updateModel(id: string, body: unknown) {
  const data = modelSchema.parse(body)
  if (data.isDefault) {
    await prisma.aiModel.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
  }
  return prisma.aiModel.update({ where: { id }, data: clean({ ...data, tags: data.tags }) })
}
