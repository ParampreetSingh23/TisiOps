import { connectedRedis, isRedisConfigured } from "../../queues/redis"
import { estimateTokens, minuteBucket, usageDate } from "./limits"
import { sanitizeReply } from "./reply"
import { aiGatewayChat } from "../ai-gateway/ai-gateway.service"

/**
 * The one free prompt on the landing page.
 *
 * This is the only path to the model that does not require a signed-in user,
 * which makes it the only path an anonymous visitor can spend money through.
 * Everything here exists to bound that: a short input, a short answer, a
 * per-address allowance, and a hard global ceiling for the day.
 *
 * Deliberately separate from the console's accounting: the demo has stricter
 * public limits, then uses the shared provider-neutral gateway.
 */

/** Small enough to answer a question, too small to be useful as free ChatGPT. */
export const DEMO_LIMITS = {
  maxInputChars: 400,
  maxOutputTokens: 220,
  /** Prompts one address may send per day. */
  perAddressPerDay: 3,
  perAddressPerMinute: 1,
  /** The ceiling for everyone, so a bad day has a known maximum cost. */
  globalPerDay: 300,
}

/**
 * Narrower than the console's prompt.
 *
 * A public endpoint that will answer anything is a free general-purpose model
 * with someone else's key, so this one refuses to be that and says why.
 */
const DEMO_PROMPT = `You are the TisiOps agent answering a single question on the TisiOps marketing site, for a visitor who is not signed in.

TisiOps is an AI DevOps platform. It deploys applications from GitHub to Vercel, and provisions AWS servers with fixed Terraform modules for templates like n8n. Every deployment produces a plan the user approves before anything runs; background workers then execute it and write logs.

Answer in at most 4 short sentences, plain text, no markdown, no lists, no code blocks. Be concrete and practical.

Never quote prices or estimate what a server or deployment costs. Never use emoji.

If the question is not about deployment, infrastructure, DevOps, or TisiOps itself, reply only: "I can only help with deployment and infrastructure questions here. Sign up to use the full TisiOps console."

Never claim to have deployed anything. You are describing what TisiOps would do.`

export type DemoResult =
  { ok: true; answer: string } | { ok: false; error: string; status: number }

const redis = () => connectedRedis("tisiops-demo")

/**
 * Counts one hit and returns the new total.
 *
 * Returns null when Redis is unavailable — the caller then refuses, because
 * an uncounted public model call is the thing this file exists to prevent.
 */
async function bump(key: string, ttlSeconds: number): Promise<number | null> {
  if (!isRedisConfigured()) return null

  try {
    const client = await redis()
    const result = await client.multi().incr(key).expire(key, ttlSeconds).exec()
    const value = result?.[0]?.[1]
    return typeof value === "number" ? value : null
  } catch {
    return null
  }
}

async function peek(key: string): Promise<number> {
  if (!isRedisConfigured()) return 0

  try {
    const client = await redis()
    const value = await client.get(key)
    return value ? Number(value) : 0
  } catch {
    return 0
  }
}

/**
 * Hashes the caller's address before it is used as a key.
 *
 * An IP is personal data and this is a marketing page: the counter only needs
 * to tell two visitors apart, not to identify either of them.
 */
function addressKey(address: string): string {
  let hash = 0

  for (let index = 0; index < address.length; index += 1) {
    hash = (hash * 31 + address.charCodeAt(index)) | 0
  }

  return Math.abs(hash).toString(36)
}

export async function runDemoPrompt(input: {
  address: string
  message: string
}): Promise<DemoResult> {
  const message = input.message?.trim() ?? ""

  if (message.length < 3) {
    return { ok: false, error: "Type a question first.", status: 422 }
  }

  if (message.length > DEMO_LIMITS.maxInputChars) {
    return {
      ok: false,
      error: `Keep it under ${DEMO_LIMITS.maxInputChars} characters here. Sign up for the full console.`,
      status: 422,
    }
  }

  // No counter, no call. Failing open here would leave the endpoint unlimited
  // exactly when the limiter is broken.
  if (!isRedisConfigured()) {
    return {
      ok: false,
      error: "The demo is not available right now.",
      status: 503,
    }
  }

  const day = usageDate()
  const id = addressKey(input.address)

  const globalKey = `ai:demo:global:${day}`
  if ((await peek(globalKey)) >= DEMO_LIMITS.globalPerDay) {
    return {
      ok: false,
      error:
        "The public demo has reached today's limit. Sign up to use the full TisiOps console.",
      status: 429,
    }
  }

  const minute = await bump(`ai:demo:min:${id}:${minuteBucket()}`, 120)
  if (minute === null || minute > DEMO_LIMITS.perAddressPerMinute) {
    return {
      ok: false,
      error: "One question at a time — give it a few seconds.",
      status: 429,
    }
  }

  const daily = await bump(`ai:demo:day:${id}:${day}`, 86_400)
  if (daily === null || daily > DEMO_LIMITS.perAddressPerDay) {
    return {
      ok: false,
      error:
        "You have used the free questions for today. Sign up to keep going in the TisiOps console.",
      status: 429,
    }
  }

  // Counted before the call, so a failure still costs the visitor their turn —
  // otherwise a forced error is an unlimited retry loop.
  await bump(globalKey, 86_400)

  try {
    const response = await aiGatewayChat({
      isAdmin: false,
      source: "DEMO",
      modelCode: "mistral-default",
      messages: [
        { role: "system", content: DEMO_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      maxTokens: DEMO_LIMITS.maxOutputTokens,
    })

    return { ok: true, answer: sanitizeReply(response.content) }
  } catch {
    // Upstream text can echo the request, so only a written message is used.
    return {
      ok: false,
      error: "The demo could not answer just now. Try again shortly.",
      status: 502,
    }
  }
}

/** Rough cost signal for the admin usage card. */
export async function demoUsageToday(): Promise<number> {
  return peek(`ai:demo:global:${usageDate()}`)
}

export { estimateTokens }
