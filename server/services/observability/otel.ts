import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { signozConfig, signozHeaders } from "./signoz"

let sdk: NodeSDK | null = null

export function initOpenTelemetry(): void {
  if (sdk || process.env.OTEL_ENABLED !== "true") return

  const config = signozConfig()
  const endpoint = config.otlpEndpoint ?? config.fallbackOtelEndpoint
  const headers = signozHeaders()

  try {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
      }),
      traceExporter: new OTLPTraceExporter(
        endpoint ? { url: `${endpoint}/v1/traces`, headers } : {}
      ),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(
          endpoint ? { url: `${endpoint}/v1/metrics`, headers } : {}
        ),
      }),
    })

    sdk.start()
  } catch (cause) {
    console.warn(
      "[otel] disabled:",
      cause instanceof Error ? cause.message : "unknown error"
    )
    sdk = null
  }
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk) return
  await sdk.shutdown().catch(() => undefined)
  sdk = null
}
