import { AiGatewayError, type AiProviderAdapter, type ProviderChatInput } from "../provider.types"

type ChatBody = {
  id?: string
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

function mapProviderStatus(status: number): AiGatewayError {
  if (status === 401 || status === 403) return new AiGatewayError("PROVIDER_AUTH_FAILED", "Provider rejected credentials", 502)
  if (status === 429) return new AiGatewayError("PROVIDER_RATE_LIMITED", "Provider rate limited the request", 502)
  if (status === 408 || status === 504) return new AiGatewayError("PROVIDER_TIMEOUT", "Provider timed out", 502)
  return new AiGatewayError("PROVIDER_ERROR", `Provider returned ${status}`, 502)
}

export class OpenAiCompatibleProvider implements AiProviderAdapter {
  async chat(input: ProviderChatInput) {
    const baseUrl = (input.baseUrl ?? "").replace(/\/+$/, "")
    if (!baseUrl) throw new AiGatewayError("PROVIDER_NOT_FOUND", "Provider base URL missing", 500)

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.providerModel,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
    })

    if (!response.ok) throw mapProviderStatus(response.status)

    const body = (await response.json()) as ChatBody
    const content = body.choices?.[0]?.message?.content
    if (!content?.trim()) throw new AiGatewayError("PROVIDER_ERROR", "Provider returned empty content", 502)

    return {
      content,
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens,
      totalTokens: body.usage?.total_tokens,
      providerRequestId: body.id,
    }
  }
}
