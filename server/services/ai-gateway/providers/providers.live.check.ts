import assert from "node:assert/strict"

import { GeminiProvider } from "./gemini.provider"
import { OpenAiCompatibleProvider } from "./openai-compatible.provider"
import { AiGatewayError } from "../provider.types"

const messages = [
  { role: "system" as const, content: "Reply with the word ready." },
  { role: "user" as const, content: "Ready?" },
]

async function check(name: string, run: () => Promise<{ content: string }>) {
  try {
    const response = await run()
    assert.ok(response.content.trim(), `${name} returned empty content`)
    console.log(`${name}: ok`)
  } catch (error) {
    console.log(`${name}: failed (${error instanceof AiGatewayError ? error.code : "MODEL_ERROR"})`)
    process.exitCode = 1
  }
}

async function main() {
  if (process.env.MISTRAL_API_KEY) {
    await check("Mistral", () => new OpenAiCompatibleProvider().chat({
      providerModel: process.env.MISTRAL_MODEL ?? "mistral-medium-latest",
      apiKey: process.env.MISTRAL_API_KEY!,
      baseUrl: "https://api.mistral.ai/v1",
      messages,
      maxTokens: 8,
    }))
  } else {
    console.log("Mistral: skipped (MISTRAL_API_KEY is not configured)")
  }

  if (process.env.GEMINI_API_KEY) {
    await check("Gemini", () => new GeminiProvider().chat({
      providerModel: "gemini-3.8-flash",
      apiKey: process.env.GEMINI_API_KEY!,
      messages,
      maxTokens: 8,
    }))
  } else {
    console.log("Gemini: skipped (GEMINI_API_KEY is not configured)")
  }
}

void main()
