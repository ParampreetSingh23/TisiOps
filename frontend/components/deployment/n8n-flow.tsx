"use client"

import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import {
  card,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "@/lib/ui"
import type { PlanLine } from "@tisiops/server/services/n8n/console"
import type { N8nProgress } from "@tisiops/server/services/n8n"
import type { TemplateSummary } from "@tisiops/server/services/templates"

/**
 * The one-click n8n deployment, inside the AI Console.
 *
 * The template is a product decision, not a form: region, size, access mode,
 * stack, and address are already fixed, so the card shows them and asks for one
 * thing — approval. The workspace name is the only editable field, because it
 * is a label rather than an infrastructure choice.
 *
 * Like the Vercel flow, this fetches its own defaults from the API instead of
 * receiving them in the chat message, so reopening an old conversation renders
 * the same card without anything about the deployment being stored in it.
 */

type QuickStart = {
  config: {
    workspaceName: string
    adminEmail: string
    timezone: string
    region: string
    plan: string
    domainMode: string
    domain: string | null
  }
  plan: PlanLine[]
  /** Read from the aws-n8n-server YAML manifest, so the card describes the
   * same template the manifest does. */
  template: TemplateSummary
  warning: string
  approveLabel: string
  activeDeployments: number
  activeLimitMessage: string
}

const POLL_MS = 5_000

export function N8nFlow() {
  const [start, setStart] = useState<QuickStart | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<QuickStart>("/api/deployments/n8n/quick-start")
      .then((next) => {
        if (!active) return
        setStart(next)
        setWorkspaceName(next.config.workspaceName)
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
      // The server revalidates every value against the template allowlists, so
      // this is a request rather than an instruction.
      const created = await apiFetch<{ id: string }>(
        "/api/deployments/n8n/deploy",
        {
          method: "POST",
          body: JSON.stringify({ ...start.config, workspaceName }),
        }
      )
      setDeploymentId(created.id)
    } catch (cause) {
      setError((cause as Error).message)
      setIsDeploying(false)
    }
  }

  if (deploymentId) {
    return <DeploymentStatus id={deploymentId} />
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

  const atLimit = start.activeDeployments > 0

  return (
    <div className={`${card} mt-3`}>
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Deployment plan
      </p>

      <p className="mt-2 text-sm text-ink-default">
        {start.template.description}
      </p>

      <dl className="mt-3 flex flex-col gap-1.5">
        {start.plan.map((line) => (
          <div key={line.label} className="flex gap-3 text-sm">
            <dt className="w-24 shrink-0 text-ink-muted">{line.label}</dt>
            <dd className="min-w-0 font-mono break-all text-ink-strong">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 max-w-xs">
        <label className={labelClass} htmlFor="n8n-workspace-name">
          Workspace name
        </label>
        <input
          id="n8n-workspace-name"
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

      {atLimit ? (
        <p className="mt-3 text-sm text-ink-muted">
          {start.activeLimitMessage}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3 py-2.5 text-sm text-[#a8341f]"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={isDeploying || atLimit || workspaceName.trim().length < 3}
          className={primaryButton}
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

        {/* Everything this card decided for the user lives in the wizard. */}
        <Link href="/dashboard/new-deployment/n8n" className={secondaryButton}>
          Advanced settings
        </Link>
      </div>

      <p className="mt-2.5 text-xs text-ink-muted">
        Nothing is created until you approve.
      </p>
    </div>
  )
}

/**
 * What the deployment is doing, inside the conversation.
 *
 * A short line and one link, not the full progress screen — that already exists
 * at /dashboard/deployments/[id]/progress and is one click away.
 */
function DeploymentStatus({ id }: { id: string }) {
  const [progress, setProgress] = useState<N8nProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      try {
        const next = await apiFetch<N8nProgress>(
          `/api/deployments/${id}/progress`
        )
        if (!active) return
        setProgress(next)

        // Only a run in progress can change on its own.
        if (next.phase === "deploying") {
          timer = setTimeout(() => void tick(), POLL_MS)
        }
      } catch (cause) {
        if (active) setError((cause as Error).message)
      }
    }

    void tick()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [id])

  const live = progress?.phase === "live" && progress.publicUrl

  return (
    <div className={`${card} mt-3`}>
      {live ? (
        <>
          <p className="text-sm text-ink-strong">
            Your n8n server is live:{" "}
            <span className="font-mono break-all">{progress.publicUrl}</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={progress.publicUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryButton}
            >
              Open n8n
              <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
            </a>
            <Link
              href={`/dashboard/deployments/${id}/progress`}
              className={secondaryButton}
            >
              Deployment details
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm text-ink-default">
            {progress?.phase === "failed" ? null : (
              <Loader2
                className="size-4 shrink-0 text-brand motion-safe:animate-spin"
                aria-hidden
              />
            )}
            {progress?.phase === "failed"
              ? "The deployment failed."
              : `Deploying your n8n server${
                  progress ? ` — ${progress.percent}%` : ""
                }`}
          </p>

          {progress?.statusDetail ? (
            <p className="mt-1.5 text-sm text-ink-muted">
              {progress.statusDetail}
            </p>
          ) : null}

          <Link
            href={`/dashboard/deployments/${id}/progress`}
            className={`${secondaryButton} mt-4`}
          >
            Follow the deployment
          </Link>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#a8341f]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
