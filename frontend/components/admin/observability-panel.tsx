"use client"

import { ExternalLink, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card, primaryButton } from "@/lib/ui"

type ObservabilityStatus = {
  otelEnabled: boolean
  signozEnabled: boolean
  mode: string
  dashboardUrl: string | null
  otlpHttpEndpoint: string | null
  otlpGrpcEndpoint: string | null
  serviceName: string
  workerServiceName: string
  hasIngestionKey: boolean
  reachable: boolean | null
  lastTelemetryEvent: {
    createdAt: string
    step: string | null
    message: string
    traceId: string | null
  } | null
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line/60 py-2.5 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-mono text-sm break-all text-ink-strong">{value}</dd>
    </div>
  )
}

export function ObservabilityPanel() {
  const [status, setStatus] = useState<ObservabilityStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<ObservabilityStatus>("/api/admin/observability")
      .then(setStatus)
      .catch((cause) => setError((cause as Error).message))
  }, [])

  if (error) {
    return <p className="text-sm text-[#a8341f]">{error}</p>
  }

  if (!status) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading observability…
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Observability
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Admin-only SigNoz and OpenTelemetry status.
      </p>

      <section className={`${card} mt-8`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
              SigNoz Status
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {status.reachable === false
                ? "OTLP endpoint not reachable. App still runs."
                : status.signozEnabled
                  ? "SigNoz export configured."
                  : "SigNoz disabled."}
            </p>
          </div>

          {status.dashboardUrl ? (
            <a
              href={status.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryButton}
            >
              Open SigNoz Dashboard
              <ExternalLink className="ml-2 size-4" aria-hidden />
            </a>
          ) : null}
        </div>

        <dl className="mt-5">
          <Row label="SigNoz Mode" value={status.mode} />
          <Row label="OTel Enabled" value={String(status.otelEnabled)} />
          <Row label="SigNoz Enabled" value={String(status.signozEnabled)} />
          <Row label="Dashboard URL" value={status.dashboardUrl ?? "Not set"} />
          <Row label="OTLP HTTP Endpoint" value={status.otlpHttpEndpoint ?? "Not set"} />
          <Row label="OTLP gRPC Endpoint" value={status.otlpGrpcEndpoint ?? "Not set"} />
          <Row label="Backend Service" value={status.serviceName} />
          <Row label="Worker Service" value={status.workerServiceName} />
          <Row label="Ingestion Key" value={status.hasIngestionKey ? "Configured" : "Not configured"} />
        </dl>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-heading text-base font-medium tracking-[-0.02em] text-ink-strong">
          Last Telemetry Event
        </h2>
        {status.lastTelemetryEvent ? (
          <dl className="mt-3">
            <Row label="Step" value={status.lastTelemetryEvent.step ?? "unknown"} />
            <Row label="Trace ID" value={status.lastTelemetryEvent.traceId ?? "none"} />
            <Row label="Time" value={status.lastTelemetryEvent.createdAt} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No traced deployment log yet.</p>
        )}
      </section>
    </div>
  )
}
