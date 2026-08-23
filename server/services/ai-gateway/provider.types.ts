export type AiMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type ProviderChatInput = {
  providerModel: string
  messages: AiMessage[]
  temperature?: number
  maxTokens?: number
  apiKey: string
  baseUrl?: string | null
}

export type ProviderChatOutput = {
  content: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  providerRequestId?: string
}

export interface AiProviderAdapter {
  chat(input: ProviderChatInput): Promise<ProviderChatOutput>
}

export class AiGatewayError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly status = 400
  ) {
    super(message)
    this.name = "AiGatewayError"
  }
}
