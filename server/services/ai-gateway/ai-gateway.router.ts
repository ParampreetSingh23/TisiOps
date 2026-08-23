import type express from "express"
import { ZodError } from "zod"

import {
  AiGatewayError,
} from "./provider.types"
import {
  apiKeyNameSchema,
  chatWithUserKey,
  createApiKey,
  createModel,
  createProvider,
  gatewaySummary,
  adminUsage,
  listApiKeys,
  listGatewayModels,
  listProviders,
  revokeApiKey,
  updateModel,
  updateProvider,
  userUsage,
} from "./ai-gateway.service"

type User = {
  id: string
  email: string
  role: string
}

type Helpers = {
  requireDbUser: (req: express.Request, res: express.Response) => Promise<User | null>
  callerIsAdmin: (user: User) => boolean
}

function sendError(res: express.Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: "Invalid request", details: error.issues })
    return
  }
  if (error instanceof AiGatewayError) {
    res.status(error.status).json({ success: false, error: error.code })
    return
  }
  res.status(500).json({ success: false, error: "UNKNOWN_AI_GATEWAY_ERROR" })
}

function bearer(req: express.Request) {
  const value = req.get("authorization") ?? ""
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

export function attachAiGatewayRoutes(app: express.Express, helpers: Helpers) {
  app.get("/api/ai-gateway/models", async (_req, res) => {
    try {
      res.json({ success: true, data: await listGatewayModels(false) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/ai-gateway/usage", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    try {
      res.json({ success: true, data: await userUsage(user.id) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/ai-gateway/summary", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    try {
      res.json({ success: true, data: await gatewaySummary(user.id, helpers.callerIsAdmin(user)) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/ai-gateway/api-keys", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    try {
      res.json({ success: true, data: await listApiKeys(user.id) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post("/api/ai-gateway/api-keys", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    try {
      const { name } = apiKeyNameSchema.parse(req.body)
      res.json({ success: true, data: await createApiKey(user.id, name) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.delete("/api/ai-gateway/api-keys/:id", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    try {
      await revokeApiKey(user.id, req.params.id)
      res.json({ success: true, data: { revoked: true } })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post("/api/v1/ai/chat", async (req, res) => {
    try {
      const token = bearer(req)
      if (!token) throw new AiGatewayError("API_KEY_MISSING", "Missing API key", 401)
      res.json(await chatWithUserKey(token, req.body))
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/admin/ai-gateway/providers", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await listProviders() })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post("/api/admin/ai-gateway/providers", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await createProvider(req.body) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.patch("/api/admin/ai-gateway/providers/:id", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await updateProvider(req.params.id, req.body) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/admin/ai-gateway/models", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await listGatewayModels(true) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post("/api/admin/ai-gateway/models", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await createModel(req.body) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.patch("/api/admin/ai-gateway/models/:id", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await updateModel(req.params.id, req.body) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/admin/ai-gateway/usage", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    try {
      res.json({ success: true, data: await adminUsage() })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/api/admin/ai-gateway/health", async (req, res) => {
    const user = await helpers.requireDbUser(req, res)
    if (!user) return
    if (!helpers.callerIsAdmin(user)) return res.status(403).json({ success: false, error: "Forbidden" })
    res.json({ success: true, data: { enabled: process.env.AI_GATEWAY_ENABLED !== "false" } })
  })
}
