"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import { apiFetch } from "@/lib/api"
import { card, inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui"
import type { PlanLine } from "@tisiops/server/services/postgres/console"
import type { TemplateSummary } from "@tisiops/server/services/templates"

type QuickStart = {
  config: {
    workspaceName?: string | null
    databaseName?: string | null
    databaseUser?: string | null
    postgresVersion?: string | null
  }
  plan: PlanLine[]
  template: TemplateSummary
  warning: string
  approveLabel: string
  activeDeployments: number
}

export function PostgresFlow() {
  const targetServerId = useSearchParams().get("targetServerId")
  const byok = Boolean(targetServerId)
  const [start, setStart] = useState<QuickStart | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<QuickStart>("/api/deployments/postgres/quick-start")
      .then((next) => {
        if (!active) return
        setStart(next)
        setWorkspaceName(next.config.workspaceName ?? "postgres-db")
      })
      .catch((cause: Error) => active && setError(cause.message))

    return () => {
      active = false
    }
  }, [])

  async function approve() {
    if (!start) return

    setIsDeploying(true)
    setError(null)

    try {
      const created = await apiFetch<{ id: string }>(
        "/api/deployments/postgres/deploy",
        {
          method: "POST",
          body: JSON.stringify({ ...start.config, workspaceName, targetServerId }),
        }
      )
      setDeploymentId(created.id)
    } catch (cause) {
      setError((cause as Error).message)
      setIsDeploying(false)
    }
  }

  if (deploymentId) {
    return (
      <div className={`${card} mt-3`}>
        <p className="text-sm text-ink-strong">
          PostgreSQL deployment queued{byok ? " for your connected server" : ""}.
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">
          TisiOps will show the masked DATABASE_URL on the deployment details
          page after the health check passes.
        </p>
        <Link
          href={`/dashboard/deployments/${deploymentId}`}
          className={`${secondaryButton} mt-4`}
        >
          Deployment details
        </Link>
      </div>
    )
  }

  if (error && !start) {
    return (
      <div className={`${card} mt-3`}>
        <p className="text-sm text-ink-default">{error}</p>
      </div>
    )
  }

  if (!start) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Preparing the plan…
      </p>
    )
  }

  return (
    <div className={`${card} mt-3`}>
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Deployment plan
      </p>

      <p className="mt-2 text-sm text-ink-default">
        {byok ? "TisiOps will preflight Docker and port 5432, then install PostgreSQL on the selected server after approval." : start.template.description}
      </p>

      <dl className="mt-3 flex flex-col gap-1.5">
        {start.plan.map((line) => (
          <div key={line.label} className="flex gap-3 text-sm">
            <dt className="w-28 shrink-0 text-ink-muted">{line.label}</dt>
            <dd className="min-w-0 font-mono break-all text-ink-strong">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 max-w-xs">
        <label className={labelClass} htmlFor="postgres-workspace-name">
          Workspace name
        </label>
        <input
          id="postgres-workspace-name"
          className={inputClass}
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          maxLength={60}
          disabled={isDeploying}
        />
      </div>

      <p className="mt-4 flex gap-2 rounded-[6px] border border-line bg-brand-soft px-3 py-2.5 text-sm text-ink-default">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-brand"
          aria-hidden
        />
        {start.warning}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3 py-2.5 text-sm text-[#a8341f]"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void approve()}
        disabled={isDeploying || workspaceName.trim().length < 3}
        className={`${primaryButton} mt-4`}
      >
        {isDeploying ? (
          <>
            <Loader2
              className="mr-2 size-4 motion-safe:animate-spin"
              aria-hidden
            />
            Creating deployment…
          </>
        ) : (
          start.approveLabel
        )}
      </button>

      <p className="mt-2.5 text-xs text-ink-muted">
        Nothing is created until you approve.
      </p>
    </div>
  )
}
