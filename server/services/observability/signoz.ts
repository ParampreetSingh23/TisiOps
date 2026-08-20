export type SignozMode = "self_hosted" | "cloud"

function bool(name: string): boolean {
  return process.env[name] === "true"
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/\/+$/, "") : null
}

export function signozConfig() {
  const signozEnabled = bool("SIGNOZ_ENABLED")
  const otelEnabled = bool("OTEL_ENABLED")
  const signozEndpoint = clean(process.env.SIGNOZ_OTLP_ENDPOINT)
  const otelEndpoint = clean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)

  return {
    otelEnabled,
    signozEnabled,
    mode: (process.env.SIGNOZ_MODE ?? "self_hosted") as SignozMode,
    dashboardUrl: clean(process.env.SIGNOZ_DASHBOARD_URL),
    otlpEndpoint: signozEnabled ? signozEndpoint : otelEndpoint,
    fallbackOtelEndpoint: otelEndpoint,
    serviceName: process.env.OTEL_SERVICE_NAME ?? "tisiops-backend",
    hasIngestionKey: Boolean(process.env.SIGNOZ_INGESTION_KEY),
  }
}

export function signozHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const pair of (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
    const [key, ...rest] = pair.split("=")
    if (key?.trim() && rest.length > 0) headers[key.trim()] = rest.join("=").trim()
  }

  if (process.env.SIGNOZ_INGESTION_KEY) {
    headers["signoz-ingestion-key"] = process.env.SIGNOZ_INGESTION_KEY
  }

  return headers
}

export async function signozStatus() {
  const config = signozConfig()
  let reachable: boolean | null = null

  if (config.otlpEndpoint) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1_500)
      const response = await fetch(`${config.otlpEndpoint}/v1/traces`, {
        method: "POST",
        body: "{}",
        signal: controller.signal,
      })
      clearTimeout(timer)
      reachable = response.status < 500
    } catch {
      reachable = false
    }
  }

  return {
    otelEnabled: config.otelEnabled,
    signozEnabled: config.signozEnabled,
    mode: config.mode,
    dashboardUrl: config.dashboardUrl,
    otlpHttpEndpoint: config.otlpEndpoint,
    otlpGrpcEndpoint: config.otlpEndpoint?.replace(/:4318$/, ":4317") ?? null,
    serviceName: config.serviceName,
    hasIngestionKey: config.hasIngestionKey,
    reachable,
  }
}
