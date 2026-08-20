import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express"
import { SpanStatusCode, trace } from "@opentelemetry/api"
import cors from "cors"
import express from "express"
import { appLog } from "./services/observability/app-logger"
import { initOpenTelemetry, shutdownOpenTelemetry } from "./services/observability/otel"

initOpenTelemetry()

// Env comes from --env-file=.env in the npm script: ESM hoists imports above
// any dotenv call here, so the database module would load before it ran.
import { syncCurrentUserById } from "./auth/express"
import { checkDatabaseConnection, prisma } from "./db/prisma"
import { verifyAwsCredentials } from "./services/aws/sts"
import {
  appendTurn,
  createSession,
  getSessionContext,
  setSessionContext,
  deleteSession,
  getSession,
  listSessions,
  ownsSession,
  recentHistory,
} from "./services/chat-session-service"
import { AiLimitError, askMistral } from "./services/chat-service"
import { getGithubStatus } from "./services/github/status"
import {
  getAwsConnectionStatus,
  listAwsConnections,
  saveAwsConnection,
  toSafeConnection,
} from "./services/provider-connections/index"
import {
  checkServerHealth,
  createBYOSServer,
  disconnectServer,
  getUserServerById,
  listUserServers,
  pauseServer,
  restartServer,
} from "./services/servers/server.service"
import { attachTerminalGateway } from "./services/servers/terminal-gateway"
import { createTerminalSession } from "./services/servers/terminal.service"
import { testSshConnection } from "./services/servers/ssh-diagnostic"
import {
  getAttempts,
  getDeployment,
  getDeploymentLogs,
  getDeploymentTimeline,
  listDeployments,
} from "./services/deployments/index"
import {
  DEPLOYMENT_PLAN,
  prepareVercelDeployment,
  prepareVercelRetry,
  reconcileDeployment,
  startVercelFlow,
} from "./services/vercel/agent"
import {
  createAndQueueJob,
  listJobsForDeployment,
  QUEUE_UNAVAILABLE,
} from "./services/deployment-job.service"
import {
  actionsFor,
  runAction,
  type Action,
} from "./services/deployments/lifecycle.service"
import { queueCounts } from "./queues/deployment.queue"
import { platformUsageToday, usageSummary } from "./services/ai/usage.service"
import { demoUsageToday, runDemoPrompt } from "./services/ai/demo.service"
import { startDeploymentWorker } from "./workers/deployment.worker"
import {
  detectDrift,
  explainInspection,
  generateCleanupPlan,
  generateRetryPlan,
  inspectDeployment,
  proposeTerraformDeployment,
} from "./services/terraform/terraformAgent"
import { availableTemplates } from "./services/terraform/terraformTemplateRegistry"
import { pingRedis, redisTarget } from "./queues/redis"
import { analyzeRepository } from "./services/github/analyze"
import { runGithubAgent } from "./services/github/agent"
import { detectIntent, isGithubIntent } from "./services/github/intent"
import {
  approveRepair,
  classifyIntent,
  diagnoseRepair,
  isAccountMemoryQuestion,
  repairTargetMessageWhenMissing,
  TISIOPS_SCOPE_MESSAGE,
} from "./services/agents/agent-router"
import type { AgentIntent } from "./services/agents/agent.types"
import { pendingRepairForSession } from "./services/agents/agent-memory"
import { resolveAgentContext } from "./services/agents/agent-context"
import { getDeploymentTelemetrySummary } from "./services/observability/deployment-spans"
import { signozStatus } from "./services/observability/signoz"
import { chatMessageSchema, chatSessionCreateSchema } from "./validations/chat"
import {
  awsConnectionSchema,
  awsTestSchema,
  firstIssue,
} from "./validations/provider-connection"
import {
  analyzeRepositorySchema,
  approveDeploymentSchema,
  n8nDeploymentSchema,
  postgresDeploymentSchema,
  terraformPlanSchema,
} from "./validations/deployment"
import { isAdminEmail } from "./constants/index"
import {
  ACTIVE_LIMIT_MESSAGE,
  countActiveN8n,
  COST_WARNING,
  createManagedN8nDeployment,
  getN8nProgress,
  getServerFor,
  retryManagedN8nDeployment,
} from "./services/n8n/index"
import { buildDeploymentPlan } from "./services/n8n/planner"
import {
  APPROVE_LABEL,
  QUICK_START_MESSAGE,
  QUICK_START_NEXT_STEP,
  QUICK_START_WARNING,
  n8nTemplateSummary,
  quickStartConfig,
  quickStartPlan,
} from "./services/n8n/console"
import {
  APPROVE_LABEL as POSTGRES_APPROVE_LABEL,
  QUICK_START_MESSAGE as POSTGRES_QUICK_START_MESSAGE,
  QUICK_START_NEXT_STEP as POSTGRES_QUICK_START_NEXT_STEP,
  QUICK_START_WARNING as POSTGRES_QUICK_START_WARNING,
  postgresTemplateSummary,
  quickStartConfig as postgresQuickStartConfig,
  quickStartPlan as postgresQuickStartPlan,
} from "./services/postgres/console"
import {
  countActivePostgres,
  createManagedPostgresDeployment,
  getPostgresConnection,
  retryManagedPostgresDeployment,
} from "./services/postgres/index"
import { getTemplateById } from "./services/templates/template-registry"
import {
  ALLOWED_REGIONS,
  DEFAULT_REGION,
  DEFAULT_TIMEZONE,
  SERVER_PLANS,
  subdomainAutomationEnabled,
  SUBDOMAIN_UNAVAILABLE,
  validateN8nConfig,
} from "./services/n8n/plans"

const PORT = Number(process.env.PORT ?? 5001)
// Trailing slash stripped: browsers compare Access-Control-Allow-Origin against
// the slashless Origin header, so "https://app.vercel.app/" fails preflight.
const FRONTEND_URL = (
  process.env.FRONTEND_URL ?? "http://localhost:3000"
).replace(/\/+$/, "")

const app = express()

// Only the frontend may call this API, and it must send credentials so the
// Clerk session cookie arrives with the request.
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
)

app.use(express.json())
app.use(clerkMiddleware())
app.use((req, res, next) => {
  const startedAt = performance.now()
  const tracer = trace.getTracer("tisiops-http")

  tracer.startActiveSpan(`HTTP ${req.method} ${req.path}`, (span) => {
    span.setAttribute("http.request.method", req.method)
    span.setAttribute("url.path", req.path)
    span.setAttribute("url.full", req.originalUrl)

    res.on("finish", () => {
      const durationMs = Math.round(performance.now() - startedAt)
      const statusCode = res.statusCode
      const spanContext = span.spanContext()

      span.setAttribute("http.response.status_code", statusCode)
      span.setAttribute("durationMs", durationMs)
      span.setStatus({
        code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      })

      appLog(statusCode >= 500 ? "error" : "info", "http.request", {
        event: "http.request",
        method: req.method,
        path: req.path,
        route: req.route?.path ?? null,
        statusCode,
        durationMs,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        userAgent: req.get("user-agent") ?? null,
      })

      span.end()
    })

    res.on("close", () => {
      if (!res.writableEnded) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "connection closed" })
        span.end()
      }
    })

    next()
  })
})

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } })
})

app.get("/health/db", async (_req, res) => {
  try {
    await checkDatabaseConnection()
    res.json({ success: true, data: { database: "connected" } })
  } catch (error) {
    // Message only — connection strings must never reach the response body.
    const message = error instanceof Error ? error.message : "Unknown error"
    res.status(503).json({
      success: false,
      error: `Database unreachable: ${message}`,
    })
  }
})

/**
 * Resolves the caller to a database user, creating it on first sight.
 * Writes the error response and returns null when the request is not usable,
 * so route handlers can `if (!user) return` and move on.
 */
async function requireDbUser(req: express.Request, res: express.Response) {
  const { userId } = getAuth(req)
  if (!userId) {
    res.status(401).json({ success: false, error: "Unauthorized" })
    return null
  }

  const user = await syncCurrentUserById(userId)
  if (!user) {
    res
      .status(422)
      .json({ success: false, error: "No email on the Clerk profile" })
    return null
  }

  return user
}

/**
 * Records that the work could not be handed to the queue.
 *
 * The Deployment row is deliberately left in place: Postgres is the source of
 * truth, so a queue outage costs the user a retry, never their deployment.
 */
/** Role from the database row plus the allowlist — never from the request. */
function callerIsAdmin(user: { role: string; email: string }): boolean {
  return user.role === "ADMIN" || isAdminEmail(user.email)
}

function isDeploymentServerLookupIntent(intent: AgentIntent): boolean {
  return [
    "GET_LAST_DEPLOYMENT",
    "GET_LAST_SERVER",
    "LIST_DEPLOYMENTS",
    "LIST_SERVERS",
    "GET_DEPLOYMENT_STATUS",
    "GET_SERVER_STATUS",
  ].includes(intent)
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function serverAddress(server: {
  publicIp: string | null
  elasticIp: string | null
  host: string | null
}): string | null {
  return server.publicIp ?? server.elasticIp ?? server.host ?? null
}

function deploymentName(deployment: {
  appName: string
  template: string | null
  type: string
}): string {
  return deployment.appName || deployment.template || deployment.type
}

function serverLine(server: {
  name: string
  provider: string
  status: string
  region: string | null
  publicIp: string | null
  elasticIp: string | null
  host: string | null
  createdAt: Date
}): string {
  return [
    `${server.name} — ${server.status}`,
    server.provider,
    server.region,
    serverAddress(server),
    `created ${formatWhen(server.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ")
}

function deploymentLine(deployment: {
  appName: string
  template: string | null
  type: string
  provider: string
  status: string
  publicUrl: string | null
  previewUrl: string | null
  createdAt: Date
}): string {
  return [
    `${deploymentName(deployment)} — ${deployment.status}`,
    deployment.template ?? deployment.type,
    deployment.provider,
    deployment.publicUrl ?? deployment.previewUrl,
    `created ${formatWhen(deployment.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ")
}

async function answerDeploymentServerLookup(
  userId: string,
  intent: AgentIntent,
  text: string
) {
  if (intent === "LIST_SERVERS") {
    const servers = await prisma.server.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    return {
      type: "answer" as const,
      intent,
      message: servers.length
        ? ["Your servers:", ...servers.map((server) => `- ${serverLine(server)}`)].join("\n")
        : "I do not see any servers in your TisiOps account yet.",
    }
  }

  if (intent === "LIST_DEPLOYMENTS") {
    const deployments = await prisma.deployment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    return {
      type: "answer" as const,
      intent,
      message: deployments.length
        ? [
            "Your latest deployments:",
            ...deployments.map((deployment) => `- ${deploymentLine(deployment)}`),
          ].join("\n")
        : "I do not see any deployments in your TisiOps account yet.",
    }
  }

  if (intent === "GET_SERVER_STATUS" && /\bstopped\b/i.test(text)) {
    const stopped = await prisma.server.findMany({
      where: { userId, status: { in: ["STOPPED", "STOPPING"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    })

    return {
      type: "answer" as const,
      intent,
      message: stopped.length
        ? ["Stopped servers:", ...stopped.map((server) => `- ${serverLine(server)}`)].join("\n")
        : "I do not see any stopped servers in your TisiOps account.",
    }
  }

  if (intent === "GET_LAST_SERVER" || intent === "GET_SERVER_STATUS") {
    const [server, deployment] = await Promise.all([
      prisma.server.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { deployment: true },
      }),
      prisma.deployment.findFirst({
        where: {
          userId,
          OR: [{ template: { not: null } }, { type: { in: ["N8N", "POSTGRES"] } }],
        },
        orderBy: { createdAt: "desc" },
        include: { servers: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    ])

    if (!server && !deployment) {
      return {
        type: "answer" as const,
        intent,
        message: "I do not see any server-based deployments in your TisiOps account yet.",
      }
    }

    if (server && (!deployment || server.createdAt >= deployment.createdAt)) {
      const detail = server.deployment
        ? `\nDeployment: ${deploymentName(server.deployment)} — ${server.deployment.status}.`
        : ""
      return {
        type: "answer" as const,
        intent,
        message: `${intent === "GET_LAST_SERVER" ? "Your latest server" : "Server status"}:\n${serverLine(server)}${detail}`,
      }
    }

    const attachedServer = deployment?.servers[0]
    return {
      type: "answer" as const,
      intent,
      message: [
        `${intent === "GET_LAST_SERVER" ? "Your latest server-based deployment" : "Deployment server status"}:`,
        deployment ? deploymentLine(deployment) : null,
        attachedServer ? `Server: ${serverLine(attachedServer)}` : "No server row is attached yet.",
      ]
        .filter(Boolean)
        .join("\n"),
    }
  }

  const deployment = await prisma.deployment.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  return {
    type: "answer" as const,
    intent,
    message: deployment
      ? `${intent === "GET_LAST_DEPLOYMENT" ? "Your latest deployment" : "Deployment status"}:\n${deploymentLine(deployment)}`
      : "I do not see any deployments in your TisiOps account yet.",
  }
}

async function markDeploymentUnqueued(deploymentId: string): Promise<void> {
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "FAILED", statusDetail: QUEUE_UNAVAILABLE },
  })
}

/**
 * The landing page's free prompt. The only unauthenticated model route.
 *
 * Everything that bounds it lives in demo.service: input length, output
 * tokens, a per-address allowance, and a global daily ceiling. This handler
 * only resolves the caller's address and hands it over.
 */
app.post("/api/public/ai/demo", async (req, res) => {
  // Behind Render and Vercel the socket address is the proxy, so the
  // forwarded address is used when present. It is only ever a rate-limit key,
  // never an identity or a permission — a spoofed value costs its owner their
  // own allowance and nothing else.
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim()

  const result = await runDemoPrompt({
    address: forwarded || req.socket.remoteAddress || "unknown",
    message: String(req.body?.message ?? ""),
  })

  if (!result.ok) {
    res.status(result.status).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: { answer: result.answer } })
})

app.get("/api/me", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  // Safe summary only — never return raw database rows to the client.
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      role: user.role,
    },
  })
})

/**
 * Server routes for BYOS and managed server management.
 */
app.get("/api/servers", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const servers = await listUserServers(user.id)
  res.json({ success: true, data: servers })
})

app.get("/api/servers/:id", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const server = await getUserServerById(user.id, String(req.params.id))
  if (!server) {
    res.status(404).json({ success: false, error: "Server not found" })
    return
  }

  res.json({ success: true, data: server })
})

app.post("/api/servers/test-connection", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const result = await testSshConnection(req.body)
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: result.details })
})

app.post("/api/servers", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  try {
    const server = await createBYOSServer(user.id, req.body)
    res.json({ success: true, data: server })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to connect server"
    res.status(400).json({ success: false, error: msg })
  }
})

app.post("/api/servers/:id/check", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const updated = await checkServerHealth(user.id, String(req.params.id))
  if (!updated) {
    res.status(404).json({ success: false, error: "Server not found" })
    return
  }

  res.json({ success: true, data: updated })
})

app.delete("/api/servers/:id", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const success = await disconnectServer(user.id, String(req.params.id))
  if (!success) {
    res.status(404).json({ success: false, error: "Server not found" })
    return
  }

  res.json({ success: true, data: { status: "disconnected" } })
})

app.post("/api/servers/:id/pause", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const result = await pauseServer(user.id, String(req.params.id))
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: result.server })
})

app.post("/api/servers/:id/restart", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const result = await restartServer(user.id, String(req.params.id))
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: result.server })
})

app.post("/api/servers/:id/terminal/session", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  try {
    const result = await createTerminalSession(user.id, String(req.params.id), req)
    if (!result.ok) {
      res.status(result.status).json({ success: false, error: result.error })
      return
    }

    res.status(201).json({
      success: true,
      data: {
        sessionId: result.sessionId,
        websocketUrl: result.websocketUrl,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create terminal session"
    console.error("terminal session failed:", message)
    const needsMigration =
      message.includes("TerminalSession") ||
      message.includes("terminalSession") ||
      message.includes("does not exist")

    res.status(500).json({
      success: false,
      error: needsMigration
        ? "Terminal session storage is not ready. Run database migrations and restart the API."
        : "Could not create terminal session",
    })
  }
})

/**
 * AWS provider connection routes.
 *
 * Credentials arrive in the request body over HTTPS, are used for one
 * read-only STS call, and are either discarded (test) or encrypted before
 * they touch the database (save). They are never logged and never returned.
 */

app.post("/api/providers/aws/test", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = awsTestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  const result = await verifyAwsCredentials(parsed.data)
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: result.identity })
})

app.post("/api/providers/aws", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = awsConnectionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  // Verified again here: the test call and this one are separate requests,
  // and only this one decides what gets stored.
  const result = await verifyAwsCredentials(parsed.data)
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error })
    return
  }

  try {
    const connection = await saveAwsConnection({
      userId: user.id,
      name: parsed.data.name,
      region: parsed.data.region,
      accessKeyId: parsed.data.accessKeyId,
      secretAccessKey: parsed.data.secretAccessKey,
      identity: result.identity,
    })

    res.status(201).json({ success: true, data: toSafeConnection(connection) })
  } catch (error) {
    // Encryption key problems land here — surface the reason, never the input.
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("saving AWS connection failed:", message)
    res
      .status(500)
      .json({ success: false, error: "Could not save the connection" })
  }
})

app.get("/api/providers/aws", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const connections = await listAwsConnections(user.id)
  res.json({ success: true, data: connections.map(toSafeConnection) })
})

app.get("/api/providers/aws/status", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  res.json({ success: true, data: await getAwsConnectionStatus(user.id) })
})

/**
 * GitHub connection status. Signing in with GitHub is not the same as
 * granting repository access, so this is resolved server-side from the token
 * Clerk holds — the token itself never reaches the response.
 */
app.get("/api/integrations/github/status", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  try {
    res.json({
      success: true,
      data: await getGithubStatus(user.clerkId, clerkClient.users),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("github status failed:", message)
    res.json({
      success: true,
      data: {
        state: "connection_error",
        username: null,
        grantedScopes: [],
        error: "Could not check the GitHub connection. Try again.",
      },
    })
  }
})

/**
 * AI Console chat sessions.
 *
 * Chats are private per user. The session id travels in the URL, but it is
 * only ever used together with the Clerk-derived user id, so guessing or
 * pasting someone else's id returns the same 404 as an id that never existed.
 * No route accepts a userId from the client.
 */

app.get("/api/chat/sessions", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  res.json({ success: true, data: await listSessions(user.id) })
})

app.post("/api/chat/sessions", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = chatSessionCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request" })
    return
  }

  const session = await createSession(user.id, parsed.data.title)
  res.status(201).json({ success: true, data: session })
})

app.get("/api/chat/sessions/:id", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const session = await getSession(user.id, req.params.id)
  if (!session) {
    res.status(404).json({ success: false, error: "Chat not found" })
    return
  }

  // Deployment flow cards are re-derived rather than stored: the assistant
  // message keeps only its text, and the intent of the user turn before it
  // says whether that text opened a guided flow.
  const messages = session.messages.map((message, index) => {
    const previous = session.messages[index - 1]

    if (message.role !== "assistant" || previous?.role !== "user") {
      return message
    }

    const intent = detectIntent(previous.content)

    if (intent === "vercel_deployment") {
      return { ...message, opensVercelFlow: true }
    }

    // The n8n card reads its own defaults from /api/deployments/n8n/quick-start,
    // so reopening a chat needs nothing more than this flag.
    if (intent === "n8n_managed_server_deployment") {
      return { ...message, opensN8nFlow: true }
    }

    if (intent === "postgres_managed_server_deployment") {
      return { ...message, opensPostgresFlow: true }
    }

    return message
  })

  res.json({ success: true, data: { ...session, messages } })
})

app.delete("/api/chat/sessions/:id", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const deleted = await deleteSession(user.id, req.params.id)
  if (!deleted) {
    res.status(404).json({ success: false, error: "Chat not found" })
    return
  }

  res.json({ success: true, data: { id: req.params.id } })
})

/**
 * Sends one message. The history handed to the model is read from the
 * database for this user's session — the client sends only the new message,
 * so it cannot forge a conversation or replay someone else's.
 *
 * The response is structured: `type: "answer"` is an ordinary reply,
 * `type: "vercel_deployment_flow"` tells the console to render the guided
 * deployment cards instead of a wall of chat text.
 */
app.post("/api/chat/sessions/:id/messages", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const sessionId = req.params.id
  if (!(await ownsSession(user.id, sessionId))) {
    res.status(404).json({ success: false, error: "Chat not found" })
    return
  }

  const parsed = chatMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request" })
    return
  }

  const { content } = parsed.data
  const intent = detectIntent(content)
  const agentIntent = classifyIntent(content)

  if (agentIntent === "OUT_OF_SCOPE") {
    await appendTurn({
      userId: user.id,
      sessionId,
      userContent: content,
      assistantContent: TISIOPS_SCOPE_MESSAGE,
    })

    res.json({
      success: true,
      data: {
        type: "answer",
        intent: agentIntent,
        message: TISIOPS_SCOPE_MESSAGE,
      },
    })
    return
  }

  if (isAccountMemoryQuestion(content)) {
    const replyMessage = user.name
      ? `Your name is ${user.name}.`
      : "I do not have a name saved for your account yet."

    await appendTurn({
      userId: user.id,
      sessionId,
      userContent: content,
      assistantContent: replyMessage,
    })

    res.json({
      success: true,
      data: { type: "answer", intent: agentIntent, message: replyMessage },
    })
    return
  }

  const isApprovalPhrase = /^\s*(yes|yep|yeah|sure|approve|approved|proceed|go ahead|start it|deploy it|start|do it|ok|okay)\s*$/i.test(
    content.trim()
  )

  const missingRepairTargetMessage = repairTargetMessageWhenMissing(content)
  const wantsPendingRepair = isApprovalPhrase || Boolean(missingRepairTargetMessage)

  if (wantsPendingRepair) {
    const pending = await pendingRepairForSession(user.id, sessionId)
    if (pending) {
      const result = await approveRepair({
        userId: user.id,
        repairPlanId: pending.repairPlanId,
        repairActionId: pending.repairActionId,
      })

      const replyMessage = result.ok
        ? `Approved. I queued the repair job.\n\nTrack progress:\n${result.progressUrl}`
        : `Could not queue repair: ${result.error}`

      await appendTurn({
        userId: user.id,
        sessionId,
        userContent: content,
        assistantContent: replyMessage,
      })

      res.json({
        success: true,
        data: {
          type: "answer",
          intent: "REPAIR_DEPLOYMENT",
          message: replyMessage,
        },
      })
      return
    }

    if (missingRepairTargetMessage) {
      const replyMessage = missingRepairTargetMessage

      await appendTurn({
        userId: user.id,
        sessionId,
        userContent: content,
        assistantContent: replyMessage,
      })

      res.json({
        success: true,
        data: {
          type: "answer",
          intent: "REPAIR_DEPLOYMENT",
          message: replyMessage,
        },
      })
      return
    }
  }

  if (isApprovalPhrase) {
    const history = await recentHistory(user.id, sessionId)
    const hasN8nProposal = history.some((msg) =>
      /n8n|aws-n8n-server|n8n_deployment_flow/i.test(msg.content)
    )
    const hasPostgresProposal = history.some((msg) =>
      /postgres|postgresql|postgres-managed-server/i.test(msg.content)
    )

    if (hasPostgresProposal) {
      const config = postgresQuickStartConfig({
        email: user.email,
        name: user.name,
      })
      const result = await createManagedPostgresDeployment({
        userId: user.id,
        config,
      })

      const replyMessage = result.ok
        ? `Approved. I’ve queued the PostgreSQL deployment.\n\nStatus:\nQUEUED\n\nTrack details:\n/dashboard/deployments/${result.deploymentId}\n\nCurrent step:\nWaiting for worker\n\nYou will receive the masked DATABASE_URL once provisioning completes.`
        : `Could not queue PostgreSQL deployment: ${result.error}`

      await appendTurn({
        userId: user.id,
        sessionId,
        userContent: content,
        assistantContent: replyMessage,
      })

      res.json({
        success: true,
        data: result.ok
          ? {
              type: "postgres_deployment_flow",
              intent: "postgres_managed_server_deployment",
              message: replyMessage,
              nextStep: "Track deployment progress",
              deploymentId: result.deploymentId,
              opensPostgresFlow: true,
            }
          : {
              type: "answer",
              intent: "postgres_managed_server_deployment",
              message: replyMessage,
            },
      })
      return
    }

    if (hasN8nProposal) {
      const n8nConfig = quickStartConfig({ email: user.email, name: user.name })
      const result = await createManagedN8nDeployment({
        userId: user.id,
        isAdmin: callerIsAdmin(user),
        config: n8nConfig,
      })

      if (result.ok) {
        // The closing note is the template's own instruction rather than a
        // second copy of it, so the manifest and the chat cannot disagree.
        const firstLogin = getTemplateById("aws-n8n-server").spec.instructions
          .find((entry) => entry.title === "First login")?.content

        const replyMessage = `Approved. I’ve queued the n8n deployment.\n\nDeployment:\n${n8nConfig.workspaceName}\n\nStatus:\nQUEUED\n\nTrack progress:\n/dashboard/deployments/${result.deploymentId}\n\nCurrent step:\nWaiting for worker\n\nYou will receive the n8n URL once provisioning completes. ${firstLogin ?? ""}`.trimEnd()

        await appendTurn({
          userId: user.id,
          sessionId,
          userContent: content,
          assistantContent: replyMessage,
        })

        res.json({
          success: true,
          data: {
            type: "n8n_deployment_flow",
            intent: "n8n_managed_server_deployment",
            message: replyMessage,
            nextStep: "Track deployment progress",
            deploymentId: result.deploymentId,
            opensN8nFlow: true,
          },
        })
        return
      } else {
        const replyMessage = `Could not queue n8n deployment: ${result.error}`
        await appendTurn({
          userId: user.id,
          sessionId,
          userContent: content,
          assistantContent: replyMessage,
        })

        res.json({
          success: true,
          data: {
            type: "answer",
            intent: "n8n_managed_server_deployment",
            message: replyMessage,
          },
        })
        return
      }
    }
  }

  try {
    // A deployment request is answered by the flow, not the model: the console
    // must plan and ask for approval, never deploy straight from a message.
    // The console renders the guided flow itself and fetches its own state
    // from /api/deployments/vercel/start — the same call the template page
    // makes, so both entry points run one flow rather than two.
    const response =
      intent === "vercel_deployment"
        ? {
            type: "vercel_deployment_flow" as const,
            intent,
            message:
              "Starting a TisiOps Managed Vercel Preview. Pick the repository and branch, add environment variables, then approve the plan — nothing deploys before that.",
            nextStep: "Open the guided deployment steps below",
          }
        : // The n8n template is one fixed deployment, so the console proposes it
          // rather than interviewing the user about regions, instance types,
          // domains, SSL, or ports. The card below carries the defaults and the
          // approval button; nothing is created before that button is pressed.
          intent === "n8n_managed_server_deployment"
          ? managedN8nAvailable()
            ? {
                type: "n8n_deployment_flow" as const,
                intent,
                message: QUICK_START_MESSAGE,
                nextStep: QUICK_START_NEXT_STEP,
              }
            : {
                type: "answer" as const,
                intent,
                message:
                  "Managed n8n deployments are not enabled on this TisiOps instance yet.",
              }
        : intent === "postgres_managed_server_deployment"
          ? {
              type: "postgres_deployment_flow" as const,
              intent,
              message: POSTGRES_QUICK_START_MESSAGE,
              nextStep: POSTGRES_QUICK_START_NEXT_STEP,
            }
        : intent === "server_connection"
          ? {
              type: "answer" as const,
              intent,
              message:
                "I can help you connect your own server (BYOS). Open the Connect Server wizard to add your server IP and SSH details securely:\n\n[Open Connect Server](/dashboard/servers?connect=true)",
            }
        : isDeploymentServerLookupIntent(agentIntent)
          ? await answerDeploymentServerLookup(user.id, agentIntent, content)
        : agentIntent === "REPAIR_DEPLOYMENT" ||
            agentIntent === "DIAGNOSE_DEPLOYMENT"
          ? await (async () => {
              const diagnosis = await diagnoseRepair({
                userId: user.id,
                sessionId,
              })

              if (!diagnosis) {
                return {
                  type: "answer" as const,
                  intent: agentIntent,
                  message:
                    "Select a deployment first. I need a deployment record before I can diagnose or repair it.",
                }
              }

              return {
                type: "answer" as const,
                intent: agentIntent,
                message: [
                  diagnosis.userExplanation,
                  "",
                  "Evidence:",
                  ...diagnosis.evidence.map((item) => `- ${item}`),
                  "",
                  agentIntent === "REPAIR_DEPLOYMENT" &&
                  diagnosis.approvalRequired
                    ? "Approval required. Reply yes to queue the recommended repair."
                    : "No execution approval needed.",
                ].join("\n"),
              }
            })()
        : agentIntent === "CHECK_SERVER_HEALTH"
          ? await (async () => {
              const context = await resolveAgentContext({
                userId: user.id,
                sessionId,
                allowLatestFallback: true,
              })

              return {
                type: "answer" as const,
                intent: agentIntent,
                message: context.activeDeploymentId
                  ? [
                      `Deployment status: ${context.latestDeploymentStatus ?? "unknown"}.`,
                      context.activeTemplateId
                        ? `Template: ${context.activeTemplateId}.`
                        : null,
                      context.latestTelemetrySummary
                        ? `Details: ${context.latestTelemetrySummary}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : "Select a deployment first and I can show its server or deployment status.",
              }
            })()
        : // Terraform questions are answered from the deployment's own records
          // — template, outputs, state, job history — because a plausible but
          // wrong claim about someone's infrastructure is worse than none.
          intent === "terraform_agent"
          ? await answerTerraformQuestion(user.id, content)
          : // GitHub questions are answered from the user's real repositories,
            // not by the model guessing at what they might contain.
            isGithubIntent(intent)
            ? await runGithubAgent({
                clerkUserId: user.clerkId,
                users: clerkClient.users,
                intent,
                text: content,
                // Lets "this repo" and "deploy the frontend" resolve without
                // the user naming the repository again. Scoped to this user's
                // own session, so it can never point at someone else's repo.
                context: await getSessionContext(user.id, sessionId),
              })
            : {
                type: "answer" as const,
                intent,
                message: await askMistral(
                  [
                    ...(await recentHistory(user.id, sessionId)),
                    { role: "user" as const, content },
                  ],
                  { userId: user.id, isAdmin: callerIsAdmin(user) }
                ),
              }

    // Remember which repository the conversation moved to.
    if ("context" in response && response.context) {
      await setSessionContext(user.id, sessionId, response.context)
    }

    const stored = await appendTurn({
      userId: user.id,
      sessionId,
      userContent: content,
      assistantContent: response.message,
    })

    if (!stored) {
      res.status(404).json({ success: false, error: "Chat not found" })
      return
    }

    res.json({ success: true, data: response })
  } catch (error) {
    // A spent limit is the user's answer, not a server fault: 429 with the
    // written message, and nothing was sent to the provider.
    if (error instanceof AiLimitError) {
      res
        .status(429)
        .json({ success: false, error: error.message, reason: error.reason })
      return
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("chat failed:", message)
    res.status(502).json({ success: false, error: message })
  }
})

/**
 * The caller's own AI usage. Scoped to the session's user, so one account can
 * never read another's numbers.
 */
app.get("/api/ai/usage", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  res.json({
    success: true,
    data: await usageSummary(user.id, callerIsAdmin(user)),
  })
})

/** Platform AI usage, for admins. Aggregates only — never prompts or replies. */
app.get("/api/admin/ai/usage", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  if (!callerIsAdmin(user)) {
    res.status(403).json({ success: false, error: "Admins only" })
    return
  }

  res.json({
    success: true,
    data: {
      ...(await platformUsageToday()),
      publicDemoMessages: await demoUsageToday(),
    },
  })
})

/**
 * vercel_deployment_agent routes.
 *
 * Both entry points — the AI Console and the "Vercel Frontend" template —
 * call these, so there is one flow rather than two. Every route derives the
 * owner from Clerk, and no route returns a Vercel token, a GitHub token, or
 * a stored environment variable value.
 */

app.get("/api/deployments/vercel/start", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  res.json({
    success: true,
    data: await startVercelFlow(user.clerkId, clerkClient.users),
  })
})

app.post("/api/deployments/vercel/analyze", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = analyzeRepositorySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  // Real inspection of the repository's files, not a guess from its GitHub
  // language — that guess is what configured Next.js apps as create-react-app.
  const analysis = await analyzeRepository(user.clerkId, clerkClient.users, {
    owner: parsed.data.repositoryOwner,
    repo: parsed.data.repositoryName,
    branch: parsed.data.branch,
    pathHints: parsed.data.servicePath ? [parsed.data.servicePath] : [],
  })

  if (!analysis) {
    res
      .status(400)
      .json({ success: false, error: "Could not read this repository." })
    return
  }

  res.json({ success: true, data: { analysis, plan: DEPLOYMENT_PLAN } })
})

app.post("/api/deployments/vercel/approve", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = approveDeploymentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  try {
    // Records the approval and opens the attempt, then hands the work to the
    // queue. The build takes minutes and must not run inside this request.
    const { deployment } = await prepareVercelDeployment({
      userId: user.id,
      // Identity comes from the session, never from the request body.
      clerkUserId: user.clerkId,
      users: clerkClient.users,
      ...parsed.data,
    })

    const queued = await createAndQueueJob({
      deploymentId: deployment.id,
      type: "VERCEL_DEPLOYMENT",
      payload: {},
    })

    if (!queued.ok) {
      await markDeploymentUnqueued(deployment.id)
      res.status(503).json({ success: false, error: QUEUE_UNAVAILABLE })
      return
    }

    res.status(201).json({ success: true, data: deployment })
  } catch (error) {
    // Never echo the request body here — it carries environment values.
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("vercel deployment failed:", message)
    res
      .status(500)
      .json({ success: false, error: "Could not create the deployment" })
  }
})

app.get("/api/deployments", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  // Only in-flight rows are reconciled — usually none or one — so the list
  // stops showing "Building" for a build that finished hours ago.
  const listed = await listDeployments(user.id)
  const inFlight = listed.filter((deployment) =>
    ["BUILDING", "RETRYING", "PREPARING"].includes(deployment.status)
  )

  if (inFlight.length === 0) {
    res.json({ success: true, data: listed })
    return
  }

  await Promise.all(
    inFlight
      .slice(0, 5)
      .map((deployment) => reconcileDeployment(user.id, deployment.id))
  )

  res.json({ success: true, data: await listDeployments(user.id) })
})

app.get("/api/deployments/:id", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  // Reconcile first: a build that finished after the request that started it
  // was orphaned would otherwise stay BUILDING forever.
  const reconciled = await reconcileDeployment(user.id, req.params.id)
  if (!reconciled) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  // Re-read so the response carries the environment-variable summary.
  const deployment = await getDeployment(user.id, req.params.id)
  res.json({ success: true, data: deployment ?? reconciled })
})

/**
 * Retries a failed deployment with the configuration it already has.
 * Ownership is enforced inside the service, so an id belonging to someone
 * else answers 404 — the same as an id that never existed.
 */
app.post("/api/deployments/:id/retry", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  try {
    // Opens the next attempt and reuses the saved configuration, then queues
    // the run — the retry follows exactly the same path as the first deploy.
    const result = await prepareVercelRetry({
      userId: user.id,
      deploymentId: req.params.id,
    })

    if (!result.ok) {
      res
        .status(result.reason === "not_found" ? 404 : 409)
        .json({ success: false, error: result.message })
      return
    }

    const queued = await createAndQueueJob({
      deploymentId: result.deployment.id,
      type: "RETRY_DEPLOYMENT",
      payload: {},
    })

    if (!queued.ok) {
      await markDeploymentUnqueued(result.deployment.id)
      res.status(503).json({ success: false, error: QUEUE_UNAVAILABLE })
      return
    }

    res.json({ success: true, data: result.deployment })
  } catch (error) {
    // Never echo the deployment payload — it carries decrypted env values.
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("retry failed:", message)
    res
      .status(500)
      .json({ success: false, error: "Could not retry the deployment" })
  }
})

app.get("/api/deployments/:id/attempts", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const attempts = await getAttempts(user.id, req.params.id)
  if (!attempts) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({ success: true, data: attempts })
})

app.get("/api/deployments/:id/logs", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const logs = await getDeploymentLogs(user.id, req.params.id)
  if (!logs) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({ success: true, data: logs })
})

app.get("/api/deployments/:id/timeline", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const timeline = await getDeploymentTimeline(user.id, req.params.id)
  if (!timeline) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({
    success: true,
    data: {
      events: timeline,
      diagnosis: await getDeploymentTelemetrySummary(req.params.id),
    },
  })
})

app.post("/api/ai/repair/diagnose", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const deploymentId =
    typeof req.body?.deploymentId === "string" ? req.body.deploymentId : null

  const diagnosis = await diagnoseRepair({ userId: user.id, deploymentId })
  if (!diagnosis) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.status(201).json({ success: true, data: diagnosis })
})

app.post("/api/ai/repair/approve", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const repairPlanId =
    typeof req.body?.repairPlanId === "string" ? req.body.repairPlanId : null
  const repairActionId =
    typeof req.body?.repairActionId === "string" ? req.body.repairActionId : null

  if (!repairPlanId) {
    res.status(422).json({ success: false, error: "repairPlanId is required" })
    return
  }

  const result = await approveRepair({
    userId: user.id,
    repairPlanId,
    repairActionId,
  })

  if (!result.ok) {
    res.status(result.status).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: result })
})

app.get("/api/deployments/:id/repair-summary", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const plan = await prisma.repairPlan.findFirst({
    where: { userId: user.id, deploymentId: req.params.id },
    orderBy: { createdAt: "desc" },
  })

  if (!plan) {
    res.json({ success: true, data: null })
    return
  }

  res.json({
    success: true,
    data: {
      repairPlanId: plan.id,
      deploymentId: plan.deploymentId,
      status: plan.status,
      failurePoint: plan.failurePoint,
      lastSuccessfulStep: plan.lastSuccessfulStep,
      likelyCause: plan.likelyCause,
      recommendedFix: plan.recommendedFix,
      riskLevel: plan.riskLevel,
      approvalRequired: plan.approvalRequired,
      repairActions: plan.actionsJson,
      evidence: plan.evidenceJson,
      createdAt: plan.createdAt.toISOString(),
    },
  })
})

/**
 * Managed n8n. Every route below derives the owner from the Clerk session and
 * scopes its query to that user, and none of them runs Terraform — the deploy
 * route writes a job row and returns.
 *
 * Open to every signed-in user, gated only by MANAGED_N8N_ENABLED. The AWS
 * bill still lands on TisiOps, so the spend controls that remain are the
 * region and instance-type allowlists in services/n8n/plans.ts and the
 * one-active-deployment limit per non-admin account. Neither stops the same
 * person signing up twice — an AWS Budget alert on the account is the backstop.
 */
function managedN8nAvailable(): boolean {
  return process.env.MANAGED_N8N_ENABLED === "true"
}

async function requireN8nAccess(req: express.Request, res: express.Response) {
  const user = await requireDbUser(req, res)
  if (!user) return null

  if (!managedN8nAvailable()) {
    res.status(403).json({
      success: false,
      error:
        "Managed n8n deployments are not enabled on this TisiOps instance.",
    })
    return null
  }

  return user
}

app.get("/api/deployments/n8n/options", async (req, res) => {
  const user = await requireN8nAccess(req, res)
  if (!user) return

  res.json({
    success: true,
    data: {
      plans: SERVER_PLANS,
      regions: ALLOWED_REGIONS,
      defaultRegion: DEFAULT_REGION,
      defaultTimezone: DEFAULT_TIMEZONE,
      costWarning: COST_WARNING,
      subdomainAutomation: subdomainAutomationEnabled(),
      subdomainNotice: SUBDOMAIN_UNAVAILABLE,
      activeDeployments: await countActiveN8n(user.id),
    },
  })
})

/**
 * The AI Console's one-click n8n deployment.
 *
 * Returns what TisiOps intends to build and the request that would build it.
 * Reading it creates nothing — the config still has to come back to
 * /api/deployments/n8n/deploy, which revalidates it, so this is a proposal
 * rather than a decision.
 */
app.get("/api/deployments/n8n/quick-start", async (req, res) => {
  const user = await requireN8nAccess(req, res)
  if (!user) return

  res.json({
    success: true,
    data: {
      config: quickStartConfig({ email: user.email, name: user.name }),
      plan: quickStartPlan(),
      // Description only, straight from the YAML manifest. Carries no secret:
      // the manifest names secrets, it never holds one.
      template: n8nTemplateSummary(),
      warning: QUICK_START_WARNING,
      approveLabel: APPROVE_LABEL,
      activeDeployments: await countActiveN8n(user.id),
      activeLimitMessage: ACTIVE_LIMIT_MESSAGE,
    },
  })
})

app.post("/api/deployments/n8n/plan", async (req, res) => {
  const user = await requireN8nAccess(req, res)
  if (!user) return

  const parsed = n8nDeploymentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  const validated = validateN8nConfig(parsed.data)
  if (!validated.ok) {
    res.status(422).json({ success: false, error: validated.error })
    return
  }

  // Planning has no side effects: no rows, no AWS calls, nothing to undo.
  res.json({
    success: true,
    data: {
      config: validated.config,
      plan: await buildDeploymentPlan(validated.config, {
        userId: user.id,
        isAdmin: callerIsAdmin(user),
      }),
    },
  })
})

app.post("/api/deployments/n8n/deploy", async (req, res) => {
  const user = await requireN8nAccess(req, res)
  if (!user) return

  const parsed = n8nDeploymentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  const result = await createManagedN8nDeployment({
    userId: user.id,
    isAdmin: user.role === "ADMIN" || isAdminEmail(user.email),
    config: parsed.data,
  })

  if (!result.ok) {
    res.status(422).json({ success: false, error: result.error })
    return
  }

  res.status(201).json({ success: true, data: { id: result.deploymentId } })
})

app.get("/api/deployments/:id/progress", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const progress = await getN8nProgress(user.id, req.params.id)
  if (!progress) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({
    success: true,
    data: { ...progress, server: await getServerFor(user.id, req.params.id) },
  })
})

app.post("/api/deployments/:id/n8n/retry", async (req, res) => {
  const user = await requireN8nAccess(req, res)
  if (!user) return

  const result = await retryManagedN8nDeployment({
    userId: user.id,
    deploymentId: req.params.id,
  })

  if (!result.ok) {
    res.status(422).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: { id: result.deploymentId } })
})

app.get("/api/deployments/postgres/quick-start", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  res.json({
    success: true,
    data: {
      config: postgresQuickStartConfig({ email: user.email, name: user.name }),
      plan: postgresQuickStartPlan(),
      template: postgresTemplateSummary(),
      warning: POSTGRES_QUICK_START_WARNING,
      approveLabel: POSTGRES_APPROVE_LABEL,
      activeDeployments: await countActivePostgres(user.id),
    },
  })
})

app.post("/api/deployments/postgres/deploy", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = postgresDeploymentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  const result = await createManagedPostgresDeployment({
    userId: user.id,
    config: parsed.data,
  })

  if (!result.ok) {
    res.status(422).json({ success: false, error: result.error })
    return
  }

  res.status(201).json({ success: true, data: { id: result.deploymentId } })
})

app.get("/api/deployments/:id/postgres/connection", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const reveal = req.query.reveal === "true"
  const connection = await getPostgresConnection(user.id, req.params.id, reveal)
  if (!connection) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({ success: true, data: connection })
})

app.post("/api/deployments/:id/postgres/retry", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const result = await retryManagedPostgresDeployment({
    userId: user.id,
    deploymentId: req.params.id,
  })

  if (!result.ok) {
    res.status(422).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: { id: result.deploymentId } })
})

app.get("/api/deployments/:id/jobs", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  // Scoped through the deployment, so another user's job history is a 404.
  const jobs = await listJobsForDeployment(user.id, req.params.id)
  if (!jobs) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({ success: true, data: jobs })
})

/**
 * Queue health, for admins.
 *
 * Counts and a boolean only. The Redis URL carries the password in its
 * userinfo, so neither it nor the host is ever returned — `redisTarget()` is
 * used for the worker's own stdout, not for this response.
 */
/**
 * terraform_agent routes.
 *
 * Read and plan only. None of them runs Terraform: the destroy route writes a
 * job row after a typed confirmation, and the worker does the work.
 */

/**
 * The console's Terraform answer.
 *
 * Uses the user's most recent deployment when they do not name one, and asks
 * them to pick when there is nothing to talk about. Never invents Terraform.
 */
async function answerTerraformQuestion(userId: string, text: string) {
  const latest = await prisma.deployment.findFirst({
    where: { userId, template: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  if (!latest) {
    return {
      type: "answer" as const,
      intent: "terraform_agent" as const,
      message:
        "You have no infrastructure deployments yet. TisiOps provisions servers with fixed Terraform modules — start one from New Deployment and I can explain what it creates, why it failed, or how to retry it.",
    }
  }

  const inspection = await inspectDeployment(userId, latest.id)
  if (!inspection) {
    return {
      type: "answer" as const,
      intent: "terraform_agent" as const,
      message: "Select a deployment and I can explain its infrastructure.",
    }
  }

  const wantsDestroy = /\b(destroy|tear\s?down|delete|clean\s?up)\b/i.test(text)
  const plan = wantsDestroy
    ? generateCleanupPlan(inspection)
    : inspection.canRetry
      ? generateRetryPlan(inspection)
      : null

  const parts = [explainInspection(inspection)]

  if (plan) {
    parts.push(
      "",
      `${plan.title}:`,
      ...plan.steps.map((step) => `- ${step}`),
      ...plan.warnings.map((warning) => `Warning: ${warning}`)
    )

    if (plan.confirmationPhrase) {
      parts.push(
        `This is destructive. Type ${plan.confirmationPhrase} on the deployment page to confirm — I will not run it from here.`
      )
    }
  }

  return {
    type: "answer" as const,
    intent: "terraform_agent" as const,
    message: parts.join("\n"),
  }
}

app.get("/api/terraform/templates", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  // The registry itself, minus nothing sensitive — it is a catalogue.
  res.json({ success: true, data: availableTemplates() })
})

app.post("/api/terraform/plan", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const parsed = terraformPlanSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ success: false, error: firstIssue(parsed.error) })
    return
  }

  // Ownership first: a plan for someone else's deployment is a 404, the same
  // answer as an id that never existed.
  const owned = await prisma.deployment.findFirst({
    where: { id: parsed.data.deploymentId, userId: user.id },
    select: { id: true },
  })

  if (!owned) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  const proposal = proposeTerraformDeployment({
    template: parsed.data.template,
    deploymentId: parsed.data.deploymentId,
    projectName: parsed.data.projectName,
    region: parsed.data.region,
    instanceType: parsed.data.instanceType,
    volumeSize: parsed.data.volumeSize ?? undefined,
    allowedSshCidr: parsed.data.allowedSshCidr ?? undefined,
    environment: parsed.data.environment,
  })

  if (!proposal.ok) {
    res.status(422).json({ success: false, error: proposal.error })
    return
  }

  res.json({ success: true, data: proposal.proposal })
})

app.get("/api/deployments/:id/terraform", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const inspection = await inspectDeployment(user.id, req.params.id)
  if (!inspection) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({
    success: true,
    data: {
      ...inspection,
      explanation: explainInspection(inspection),
      retryPlan: inspection.canRetry ? generateRetryPlan(inspection) : null,
      cleanupPlan: inspection.canDestroy
        ? generateCleanupPlan(inspection)
        : null,
      drift: detectDrift(inspection),
    },
  })
})

/**
 * Destroy. The one route that removes infrastructure.
 *
 * Requires the exact confirmation phrase in the body. The phrase is checked
 * here, recorded on the deployment, and checked again by the handler — a queue
 * message alone is never treated as consent.
 */
app.post("/api/deployments/:id/terraform/destroy", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const deployment = await prisma.deployment.findFirst({
    where: { id: req.params.id, userId: user.id },
  })

  if (!deployment) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  if (req.body?.confirm !== "DELETE") {
    res.status(422).json({
      success: false,
      error: "Type DELETE to confirm destroying this deployment.",
    })
    return
  }

  if (!deployment.template) {
    res.status(422).json({
      success: false,
      error: "This deployment has no infrastructure to destroy.",
    })
    return
  }

  const approved = await prisma.deployment.update({
    where: { id: deployment.id },
    data: { destroyApprovedAt: new Date() },
  })

  const queued = await createAndQueueJob({
    deploymentId: approved.id,
    type: "TERRAFORM_DESTROY",
    payload: {},
  })

  if (!queued.ok) {
    res.status(503).json({ success: false, error: QUEUE_UNAVAILABLE })
    return
  }

  res.json({ success: true, data: { id: approved.id } })
})

/**
 * Deployment lifecycle: stop, start, delete, remove.
 *
 * One route for every deployment type — the service decides what each action
 * means from the deployment's own record. Nothing here touches a provider: the
 * work is queued and the worker does it.
 */
app.get("/api/deployments/:id/actions", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const actions = await actionsFor(user.id, req.params.id)
  if (!actions) {
    res.status(404).json({ success: false, error: "Deployment not found" })
    return
  }

  res.json({ success: true, data: actions })
})

app.post("/api/deployments/:id/actions/:action", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  const action = req.params.action as Action
  if (!["stop", "start", "delete", "remove"].includes(action)) {
    res.status(422).json({ success: false, error: "Unknown action." })
    return
  }

  const result = await runAction({
    userId: user.id,
    deploymentId: req.params.id,
    action,
    confirm: req.body?.confirm,
  })

  if (!result.ok) {
    res.status(result.status).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true, data: { queued: result.queued } })
})

app.get("/api/admin/queue/health", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  if (user.role !== "ADMIN" && !isAdminEmail(user.email)) {
    res.status(403).json({ success: false, error: "Admins only" })
    return
  }

  const ping = await pingRedis()
  const counts = await queueCounts()

  const [running, queued] = await Promise.all([
    prisma.deploymentJob.count({ where: { status: "RUNNING" } }),
    prisma.deploymentJob.count({
      where: { status: { in: ["PENDING", "QUEUED"] } },
    }),
  ])

  res.json({
    success: true,
    data: {
      redisConnected: ping.redisConnected,
      provider: ping.provider,
      error: ping.error ?? null,
      queue: counts,
      // From Postgres, so this stays true even when Redis is unreachable.
      postgres: { runningJobs: running, waitingJobs: queued },
      workerSeen: running > 0,
    },
  })
})

app.get("/api/admin/observability", async (req, res) => {
  const user = await requireDbUser(req, res)
  if (!user) return

  if (!callerIsAdmin(user)) {
    res.status(403).json({ success: false, error: "Admins only" })
    return
  }

  const last = await prisma.deploymentLog.findFirst({
    where: { traceId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, step: true, message: true, traceId: true },
  })

  res.json({
    success: true,
    data: {
      ...(await signozStatus()),
      lastTelemetryEvent: last
        ? {
            createdAt: last.createdAt.toISOString(),
            step: last.step,
            message: last.message,
            traceId: last.traceId,
          }
        : null,
      workerServiceName: "tisiops-worker",
    },
  })
})

/**
 * The deployment worker runs in this process unless told otherwise.
 *
 * One service is enough at this volume, and it means starting the backend is
 * all it takes for queued deployments to run. Terraform is spawned as a child
 * process, so a job is I/O-bound here and does not block the HTTP server — and
 * it is still never run inside a request, because the queue sits between them.
 *
 * Set RUN_WORKER_IN_API=false when the worker is deployed as its own service,
 * so the two do not both consume from the queue.
 */
const runWorkerInApi = process.env.RUN_WORKER_IN_API !== "false"

const server = app.listen(PORT, async () => {
  console.log(`TisiOps API on http://localhost:${PORT} (CORS: ${FRONTEND_URL})`)

  if (!runWorkerInApi) {
    console.log("Deployment worker disabled here — run `npm run worker`.")
    return
  }

  const worker = await startDeploymentWorker()

  if (!worker) {
    // Not fatal: everything that does not need the queue still works, and the
    // reason was already printed.
    console.log("Deployment worker not started — deployments will stay queued.")
    return
  }

  console.log("Deployment worker running in this process.")

  // The in-flight job finishes before the process exits. Killing a Terraform
  // apply midway is what leaves an EC2 instance nobody has a record of.
  const stop = async (signal: string) => {
    console.log(`${signal} received — finishing the current deployment job`)
    server.close()
    await worker.stop()
    await shutdownOpenTelemetry()
    process.exit(0)
  }

  process.on("SIGINT", () => void stop("SIGINT"))
  process.on("SIGTERM", () => void stop("SIGTERM"))
})

attachTerminalGateway(server)
