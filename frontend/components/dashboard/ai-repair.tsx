"use client"

import { Loader2, ShieldCheck, Wrench } from "lucide-react"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card, primaryButton, secondaryButton } from "@/lib/ui"

type RepairAction = {
  id: string
  label: string
  risk: "READ_ONLY" | "PLANNING" | "EXECUTION" | "DESTRUCTIVE"
  requiresApproval: boolean
  implemented: boolean
}

type RepairSummary = {
  repairPlanId: string
  status: string
  failurePoint: string | null
  likelyCause: string
  recommendedFix: string
  riskLevel: string
  approvalRequired: boolean
  repairActions: RepairAction[]
  evidence: string[]
}

export function AiRepair({ deploymentId, prominent = false }: { deploymentId: string; prominent?: boolean }) {
  const [summary, setSummary] = useState<RepairSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    apiFetch<RepairSummary | null>(`/api/deployments/${deploymentId}/repair-summary`)
      .then((next) => active && setSummary(next))
      .catch(() => {})

    return () => {
      active = false
    }
  }, [deploymentId])

  async function diagnose() {
    setLoading(true)
    setError(null)
    setQueued(null)

    try {
      const next = await apiFetch<RepairSummary>("/api/ai/repair/diagnose", {
        method: "POST",
        body: JSON.stringify({ deploymentId }),
      })
      setSummary(next)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function approve(actionId: string) {
    if (!summary) return
    setApproving(actionId)
    setError(null)

    try {
      const result = await apiFetch<{ progressUrl: string }>("/api/ai/repair/approve", {
        method: "POST",
        body: JSON.stringify({
          repairPlanId: summary.repairPlanId,
          repairActionId: actionId,
        }),
      })
      setQueued(result.progressUrl)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setApproving(null)
    }
  }

  const visibleActions = summary?.repairActions ?? []

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            AI Repair
          </p>
          <h2 className="mt-1 font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            {summary ? "AI Repair Diagnosis" : "Ask AI to Repair"}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => void diagnose()}
          disabled={loading}
          className={prominent || !summary ? primaryButton : secondaryButton}
        >
          {loading ? (
            <Loader2 className="mr-2 size-4 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Wrench className="mr-2 size-4" aria-hidden />
          )}
          Ask AI to Repair
        </button>
      </div>

      {summary ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Failure point</dt>
              <dd className="mt-1 font-mono text-sm text-ink-strong">
                {summary.failurePoint ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Risk</dt>
              <dd className="mt-1 text-sm text-ink-strong">
                {summary.riskLevel.replaceAll("_", " ").toLowerCase()}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-medium text-ink-strong">Likely cause</h3>
            <p className="mt-1 text-sm text-ink-muted">{summary.likelyCause}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-ink-strong">Evidence</h3>
            <ul className="mt-1 space-y-1 text-sm text-ink-muted">
              {summary.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="rounded-[6px] border border-line bg-canvas px-3 py-2.5 text-sm text-ink-default">
            {summary.recommendedFix}
          </p>

          {visibleActions.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {visibleActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => void approve(action.id)}
                  disabled={approving === action.id || !action.implemented}
                  className={secondaryButton}
                >
                  {approving === action.id ? (
                    <Loader2 className="mr-2 size-4 motion-safe:animate-spin" aria-hidden />
                  ) : (
                    <ShieldCheck className="mr-2 size-4" aria-hidden />
                  )}
                  {action.implemented ? action.label : `${action.label} (planned)`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {queued ? (
        <p className="mt-3 rounded-[6px] border border-[#cfe6dc] bg-[#f2f9f6] px-3 py-2 text-sm text-[#0f6b4f]">
          Repair queued. Track progress on this deployment page.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#a8341f]">
          {error}
        </p>
      ) : null}
    </section>
  )
}
