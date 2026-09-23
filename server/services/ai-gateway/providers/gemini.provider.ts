import { AiGatewayError, type AiProviderAdapter, type ProviderChatInput } from "../provider.types"

type GeminiBody = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

function roleForGemini(role: string) {
  return role === "assistant" ? "model" : "user"
}

export class GeminiProvider implements AiProviderAdapter {
  async chat(input: ProviderChatInput) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.providerModel)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          contents: input.messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: roleForGemini(message.role),
              parts: [{ text: message.content }],
            })),
          systemInstruction: {
            parts: input.messages
              .filter((message) => message.role === "system")
              .map((message) => ({ text: message.content })),
          },
          generationConfig: {
            temperature: input.temperature,
            maxOutputTokens: input.maxTokens,
            ...(input.providerModel === "gemini-3.8-flash"
              ? { thinkingConfig: { thinkingLevel: "medium" } }
              : {}),
          },
        }),
      }
    )

    if (response.status === 401 || response.status === 403) {
      throw new AiGatewayError("PROVIDER_AUTH_FAILED", "Provider rejected credentials", 502)
    }
    if (response.status === 429) {
      throw new AiGatewayError("PROVIDER_RATE_LIMITED", "Provider rate limited the request", 502)
    }
    if (!response.ok) throw new AiGatewayError("PROVIDER_ERROR", `Provider returned ${response.status}`, 502)

    const body = (await response.json()) as GeminiBody
    const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim()
    if (!content) throw new AiGatewayError("PROVIDER_ERROR", "Provider returned empty content", 502)

    return {
      content,
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
      totalTokens: body.usageMetadata?.totalTokenCount,
    }
  }
}
