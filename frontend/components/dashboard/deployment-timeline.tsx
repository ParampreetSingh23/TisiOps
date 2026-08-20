"use client"

import { AlertTriangle, Check, Clock, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card } from "@/lib/ui"

type TimelineEvent = {
  id: string
  step: string
  status: "started" | "success" | "failed"
  message: string
  errorCode: string | null
  durationMs: number | null
  createdAt: string
}

type Diagnosis = {
  failedStep: string | null
  lastSuccessfulStep: string | null
  errorCode: string | null
} | null

function duration(ms: number | null) {
  if (ms === null) return ""
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function diagnosisText(diagnosis: Diagnosis) {
  if (!diagnosis?.failedStep) return "No failed telemetry step recorded yet."
  if (diagnosis.lastSuccessfulStep === "terraform.apply" && diagnosis.failedStep.includes("ssh")) {
    return "Terraform created the server, but TisiOps could not connect over SSH. Likely causes: blocked port 22, wrong SSH key, or server still booting."
  }
  if (diagnosis.failedStep.includes("docker")) {
    return "Server was reachable, but Docker setup failed. Likely causes: package manager lock, missing sudo access, or network issue on server."
  }
  if (diagnosis.failedStep.includes("health")) {
    return "Service started, but final health check failed. App may not listen on expected port or proxy may be misconfigured."
  }
  return "Deployment failed at the recorded step. Ask AI to Repair for a repair plan."
}

export function DeploymentTimeline({ deploymentId }: { deploymentId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [diagnosis, setDiagnosis] = useState<Diagnosis>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<{ events: TimelineEvent[]; diagnosis: Diagnosis }>(
      `/api/deployments/${deploymentId}/timeline`
    )
      .then((next) => {
        if (!active) return
        setEvents(next.events)
        setDiagnosis(next.diagnosis)
      })
      .catch(() => {})
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [deploymentId])

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Deployment Timeline
          </p>
          <h2 className="mt-1 font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            AI Diagnosis
          </h2>
        </div>
        {loading ? <Loader2 className="size-4 text-ink-muted motion-safe:animate-spin" aria-hidden /> : null}
      </div>

      <p className="mt-3 rounded-[6px] border border-line bg-canvas px-3 py-2 text-sm text-ink-default">
        {diagnosisText(diagnosis)}
      </p>

      <ol className="mt-4 space-y-2">
        {events.length === 0 ? (
          <li className="text-sm text-ink-muted">No structured timeline yet.</li>
        ) : (
          events.map((event) => {
            const failed = event.status === "failed"
            const done = event.status === "success"
            const Icon = failed ? AlertTriangle : done ? Check : Clock

            return (
              <li key={event.id} className="flex gap-3 border-t border-line/60 pt-2 first:border-t-0 first:pt-0">
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${
                    failed ? "text-[#a8341f]" : done ? "text-[#0f6b4f]" : "text-ink-muted"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-mono text-sm text-ink-strong">{event.step}</p>
                    <p className="text-xs text-ink-muted">
                      {duration(event.durationMs) || new Date(event.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">{event.message}</p>
                  {event.errorCode ? (
                    <p className="mt-1 font-mono text-xs text-[#a8341f]">{event.errorCode}</p>
                  ) : null}
                </div>
              </li>
            )
          })
        )}
      </ol>
    </section>
  )
}
