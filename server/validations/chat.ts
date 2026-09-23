import { z } from "zod"

/**
 * AI Console request shapes.
 *
 * Note what is absent: no userId and no sessionId in any body. Ownership is
 * derived from the Clerk session server-side, and the session id comes from
 * the URL where it is checked against that user.
 */

export const chatSessionCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  selectedModelId: z.enum(["mistral-default", "gemini-3.8-flash"]).optional(),
})

export const chatSessionModelSchema = z.object({
  selectedModelId: z.enum(["mistral-default", "gemini-3.8-flash"]),
})

export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
})

/** Shape the model service consumes. Not a request body. */
export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type ChatSessionCreateInput = z.infer<typeof chatSessionCreateSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
