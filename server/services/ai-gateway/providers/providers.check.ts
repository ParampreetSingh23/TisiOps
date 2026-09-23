import assert from "node:assert/strict"

import { GeminiProvider } from "./gemini.provider"
import { OpenAiCompatibleProvider } from "./openai-compatible.provider"

const originalFetch = globalThis.fetch

async function main() {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []

  globalThis.fetch = (async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    requests.push({ url: String(url), body })

    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Gemini reply" }] } }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
      }), { status: 200 })
    }

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Mistral reply" } }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }), { status: 200 })
  }) as typeof fetch

  try {
    const input = {
      providerModel: "gemini-3.8-flash",
      apiKey: "test-key",
      messages: [{ role: "system" as const, content: "System" }, { role: "user" as const, content: "Hello" }],
    }
    const gemini = await new GeminiProvider().chat(input)
    const mistral = await new OpenAiCompatibleProvider().chat({ ...input, baseUrl: "https://example.test/v1" })

    assert.deepEqual(gemini, { content: "Gemini reply", inputTokens: 4, outputTokens: 2, totalTokens: 6 })
    assert.equal((requests[0].body.generationConfig as Record<string, unknown>).thinkingConfig && ((requests[0].body.generationConfig as Record<string, unknown>).thinkingConfig as Record<string, unknown>).thinkingLevel, "medium")
    assert.deepEqual(mistral, { content: "Mistral reply", inputTokens: 3, outputTokens: 2, totalTokens: 5, providerRequestId: undefined })
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main()
