import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express"
import cors from "cors"
import express from "express"

// Env comes from --env-file=.env in the npm script: ESM hoists imports above
// any dotenv call here, so the database module would load before it ran.
import { syncCurrentUserById } from "./auth/express"
import { checkDatabaseConnection } from "./db/prisma"
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
import { askMistral } from "./services/chat-service"
import { getGithubStatus } from "./services/github/status"
import {
  getAwsConnectionStatus,
  listAwsConnections,
  saveAwsConnection,
  toSafeConnection,
} from "./services/provider-connections/index"
import {
  getAttempts,
  getDeployment,
  getDeploymentLogs,
  listDeployments,
} from "./services/deployments/index"
import {
  approveAndDeploy,
  DEPLOYMENT_PLAN,
  reconcileDeployment,
  retryDeployment,
  startVercelFlow,
} from "./services/vercel/agent"
import { analyzeRepository } from "./services/github/analyze"
import { runGithubAgent } from "./services/github/agent"
import { detectIntent, isGithubIntent } from "./services/github/intent"
import { chatMessageSchema, chatSessionCreateSchema } from "./validations/chat"
import {
  awsConnectionSchema,
  awsTestSchema,
  firstIssue,
} from "./validations/provider-connection"
import {
  analyzeRepositorySchema,
  approveDeploymentSchema,
} from "./validations/deployment"

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
    const opensFlow =
      message.role === "assistant" &&
      previous?.role === "user" &&
      detectIntent(previous.content) === "vercel_deployment"

    return opensFlow ? { ...message, opensVercelFlow: true } : message
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
              message: await askMistral([
                ...(await recentHistory(user.id, sessionId)),
                { role: "user" as const, content },
              ]),
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
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("chat failed:", message)
    res.status(502).json({ success: false, error: message })
  }
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
    const deployment = await approveAndDeploy({
      userId: user.id,
      // Identity comes from the session, never from the request body.
      clerkUserId: user.clerkId,
      users: clerkClient.users,
      ...parsed.data,
    })

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
    const result = await retryDeployment({
      userId: user.id,
      clerkUserId: user.clerkId,
      users: clerkClient.users,
      deploymentId: req.params.id,
    })

    if (!result.ok) {
      res
        .status(result.reason === "not_found" ? 404 : 409)
        .json({ success: false, error: result.message })
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

app.listen(PORT, () => {
  console.log(`TisiOps API on http://localhost:${PORT} (CORS: ${FRONTEND_URL})`)
})
