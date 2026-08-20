"use client"

import { AlertTriangle, ExternalLink, Loader2, RotateCw } from "lucide-react"

import { DeploymentActions } from "@/components/dashboard/deployment-actions"
import { AiRepair } from "@/components/dashboard/ai-repair"
import { ErrorDialog } from "@/components/dashboard/error-dialog"
import { DeploymentTimeline } from "@/components/dashboard/deployment-timeline"
import { GithubConnect } from "@/components/deployment/github-connect"
import { ProviderIcon } from "@/components/deployment/provider-icon"
import Link from "next/link"
import { useEffect, useState } from "react"

import {
  formatDateTime,
  StatusBadge,
} from "@/components/dashboard/deployments-list"
import { apiFetch } from "@/lib/api"
import { card, primaryButton, secondaryButton } from "@/lib/ui"
import type { SafeDeployment } from "@tisiops/server/services/deployments"

/** A run that stopped before going live, with a reason worth reading. */
function isFailure(deployment: SafeDeployment): boolean {
  return (
    Boolean(deployment.statusDetail) &&
    (deployment.status === "FAILED" || deployment.status === "CANCELLED")
  )
}

/** Mirrors outputDirectoryFor() on the server. */
function outputDirectoryLabel(framework: string | null): string {
  if (framework === "Vite" || framework === "Astro" || framework === "Vue") {
    return "dist"
  }
  if (framework === "Create React App") return "build"
  return "Default / managed by Vercel"
}

/**
 * Deployment status. The API answers 404 for a deployment that is not this
 * user's, so pasting somebody else's id shows "not found" — the same answer
 * as an id that never existed.
 */
export function DeploymentStatus({ id }: { id: string }) {
  const [deployment, setDeployment] = useState<SafeDeployment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [retryStarted, setRetryStarted] = useState(false)
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    let active = true

    apiFetch<SafeDeployment>(`/api/deployments/${id}`)
      .then((next) => {
        if (!active) return
        setDeployment(next)
        // Announced where the data arrives, so it fires once per load rather
        // than on every render.
        if (isFailure(next)) setShowError(true)
      })
      .catch(() => {
        if (active) setError("Deployment not found.")
      })

    return () => {
      active = false
    }
  }, [id])

  const hasFailure = deployment ? isFailure(deployment) : false

  // A build finishes on Vercel's clock, not ours: keep asking while it runs.
  useEffect(() => {
    if (!deployment) return
    const running = ["BUILDING", "RETRYING", "PREPARING"].includes(
      deployment.status
    )
    if (!running) return

    const timer = setInterval(() => {
      apiFetch<SafeDeployment>(`/api/deployments/${id}`)
        .then((next) => {
          setDeployment(next)
          if (isFailure(next)) setShowError(true)
        })
        .catch(() => {
          // A transient refresh failure is not worth interrupting the page.
        })
    }, 6000)

    return () => clearInterval(timer)
  }, [deployment, id])

  async function retry() {
    setIsRetrying(true)
    setRetryError(null)

    try {
      // The server reuses the stored configuration and secrets; nothing
      // about them is sent from here.
      const updated = await apiFetch<SafeDeployment>(
        `/api/deployments/${id}/retry`,
        { method: "POST" }
      )
      setDeployment(updated)
      setRetryStarted(true)
      // A retry that failed again is worth surfacing immediately.
      if (isFailure(updated)) setShowError(true)
    } catch (caught) {
      setRetryError(
        caught instanceof Error ? caught.message : "Could not start the retry"
      )
    } finally {
      setIsRetrying(false)
    }
  }

  if (error) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
          Deployment not found
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          This deployment does not exist, or it belongs to another account.
        </p>
        <Link
          href="/dashboard/deployments"
          className={`mt-6 ${secondaryButton}`}
        >
          Back to Deployments
        </Link>
      </div>
    )
  }

  if (!deployment) {
    return (
      <p className={`${card} flex items-center gap-3 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading deployment…
      </p>
    )
  }

  /**
   * The build settings, as a spec list.
   *
   * Facts about a deployment are a definition list, not eleven cards. A box
   * per key/value pair gives "Framework: —" the same visual weight as the
   * repository, and turns a page you scan in two seconds into one you have to
   * read. Hairline rows put them back in a column the eye can run down.
   */
  const spec: { label: string; value: string; mono?: boolean }[] =
    deployment.type === "POSTGRES"
      ? [
          { label: "Type", value: "PostgreSQL Managed Server" },
          { label: "Provider", value: "TisiOps Managed AWS" },
          { label: "Created", value: formatDateTime(deployment.createdAt) },
          { label: "Last updated", value: formatDateTime(deployment.updatedAt) },
        ]
      : [
          {
            label: "Repository",
            value: `${deployment.repositoryOwner}/${deployment.repositoryName}`,
            mono: true,
          },
          { label: "Branch", value: deployment.branch, mono: true },
          {
            label: "Root directory",
            value: deployment.servicePath || "repository root",
            mono: true,
          },
          { label: "Framework", value: deployment.framework ?? "Not detected" },
          {
            label: "Build command",
            value: deployment.buildCommand ?? "Framework default",
            mono: true,
          },
          {
            label: "Output directory",
            value: outputDirectoryLabel(deployment.framework),
          },
          { label: "Provider", value: "TisiOps Managed Vercel" },
          { label: "Created", value: formatDateTime(deployment.createdAt) },
          { label: "Last updated", value: formatDateTime(deployment.updatedAt) },
        ]

  const building = ["BUILDING", "RETRYING", "PREPARING"].includes(
    deployment.status
  )

  return (
    <div className="flex flex-col gap-5">
      {/* One header: what it is, what state it is in, and where it lives. */}
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-line bg-canvas">
            <ProviderIcon id={deployment.type.toLowerCase()} />
          </span>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
            {deployment.appName}
          </h1>
          <StatusBadge status={deployment.status} />
          {building ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <Loader2
                className="size-3.5 motion-safe:animate-spin"
                aria-hidden
              />
              Watching Vercel for the build result
            </span>
          ) : null}
        </div>

        <p className="mt-2 font-mono text-xs text-ink-muted">{deployment.id}</p>
      </header>

      {/* The address is what someone opens this page for, so it leads. */}
      {deployment.previewUrl ? (
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                {deployment.status === "PLACEHOLDER"
                  ? "Placeholder URL"
                  : "Public URL"}
              </p>
              <p className="mt-1.5 font-mono text-sm break-all text-ink-strong">
                {deployment.previewUrl}
              </p>
            </div>

            {deployment.status === "LIVE" ? (
              <a
                href={deployment.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={primaryButton}
              >
                Open
                <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>

          {deployment.status === "PLACEHOLDER" ? (
            <p className="mt-3 text-sm text-ink-muted">
              Placeholder address — it will not load.
            </p>
          ) : null}

          {/* Folded away: it is a debugging detail, and Deployment Protection
              usually blocks it, so it must never look like the address to use. */}
          {deployment.vercelDeploymentUrl ? (
            <details className="mt-4 border-t border-line pt-4">
              <summary className="cursor-pointer text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                Build URL
              </summary>
              <p className="mt-2 font-mono text-sm break-all text-ink-muted">
                {deployment.vercelDeploymentUrl}
              </p>
              <p className="mt-1.5 text-sm text-ink-muted">
                Per-build address, kept for debugging. Vercel Deployment
                Protection usually blocks it.
              </p>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* Said once. The same warning printed twice reads as a bug. */}
      {deployment.status === "ACCESS_BLOCKED" ? (
        <section className="rounded-[6px] border border-line bg-brand-soft px-4 py-3.5 text-sm text-ink-default">
          <p className="font-medium text-ink-strong">
            The build succeeded, but no URL is public yet.
          </p>
          <p className="mt-1.5">
            Neither the public project URL nor the build URL opens without a
            Vercel login.
          </p>
          <p className="mt-1.5 text-ink-muted">
            Fix once in the TisiOps Vercel account: Settings → Deployment
            Protection → turn off Vercel Authentication. Requesting access per
            visitor will not help.
          </p>
        </section>
      ) : null}

      {deployment.needsGithubReconnect ? (
        <section className={card}>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">
            GitHub access needs attention
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            {deployment.statusDetail}
          </p>
          <div className="mt-4">
            <GithubConnect />
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Once repository access is granted, retry the deployment below.
          </p>
        </section>
      ) : null}

      {deployment.status === "PLACEHOLDER" ? (
        <p className="rounded-[6px] border border-line bg-canvas px-4 py-3 text-sm text-ink-default">
          MVP placeholder: real Vercel deployment execution is not enabled yet.
        </p>
      ) : null}

      {hasFailure ? (
        <>
          <DeploymentTimeline deploymentId={deployment.id} />
          <AiRepair deploymentId={deployment.id} prominent />
          <div>
            <button
              type="button"
              onClick={() => setShowError(true)}
              className={secondaryButton}
            >
              <AlertTriangle className="mr-2 size-4 text-[#a8341f]" aria-hidden />
              View error details
            </button>
          </div>
        </>
      ) : null}

      <ErrorDialog
        open={showError}
        title={
          deployment.status === "CANCELLED"
            ? "Deployment cancelled"
            : "Deployment failed"
        }
        summary={
          deployment.needsGithubReconnect
            ? "TisiOps could not read the repository with your current GitHub access."
            : "The deployment stopped before it went live. Nothing is serving from this project."
        }
        detail={deployment.statusDetail}
        onClose={() => setShowError(false)}
        onRetry={
          deployment.canRetry && deployment.canReuseEnvironmentVariables
            ? () => {
                setShowError(false)
                void retry()
              }
            : undefined
        }
        isRetrying={isRetrying}
      />

      {/* Two columns of rows rather than a grid of boxes: same information,
          one border instead of eleven. */}
      <section className={card}>
        <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Configuration
        </p>
        <dl className="mt-1 grid sm:grid-cols-2 sm:gap-x-10">
          {spec.map((item) => (
            <div
              key={item.label}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/60 py-2.5 last:border-b-0 sm:last:border-b sm:[&:nth-last-child(-n+1)]:border-b-0"
            >
              <dt className="text-sm text-ink-muted">{item.label}</dt>
              <dd
                className={`min-w-0 text-right text-sm break-all text-ink-strong ${
                  item.mono ? "font-mono" : ""
                }`}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {deployment.canRetry ? (
        <section className={`${card} mt-4`}>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">
            Retry with same configuration
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            This will retry the deployment using the previous repository,
            branch, build settings, and saved environment variables.
          </p>

          {!deployment.canReuseEnvironmentVariables ? (
            <p className="mt-3 rounded-[6px] border border-line bg-canvas px-3.5 py-3 text-sm text-ink-default">
              Some environment variables must be re-entered before retrying.
              Environment variables need to be entered again because the saved
              values could not be read.
            </p>
          ) : deployment.environmentVariableCount > 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              {deployment.environmentVariableCount} saved environment variable
              {deployment.environmentVariableCount === 1 ? "" : "s"} will be
              reused server-side. Values are never shown again.
            </p>
          ) : null}

          {retryStarted ? (
            <p className="mt-3 rounded-[6px] border border-[#cfe6dc] bg-[#f2f9f6] px-3.5 py-3 text-sm text-[#0f6b4f]">
              Retry started — attempt #{deployment.retryCount + 1}.
            </p>
          ) : null}

          {retryError ? (
            <p
              role="alert"
              className="mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3.5 py-3 text-sm text-[#a8341f]"
            >
              {retryError}
            </p>
          ) : null}

          <button
            type="button"
            disabled={isRetrying || !deployment.canReuseEnvironmentVariables}
            onClick={() => void retry()}
            className={`mt-4 ${primaryButton}`}
          >
            {isRetrying ? (
              <>
                <Loader2
                  className="mr-2 size-4 motion-safe:animate-spin"
                  aria-hidden
                />
                Retrying…
              </>
            ) : (
              <>
                <RotateCw className="mr-2 size-4" aria-hidden />
                Retry Deployment
              </>
            )}
          </button>
        </section>
      ) : null}

      <DeploymentActions id={deployment.id} />

      {/* Open lives with the URL above; repeating it here would be the same
          action twice on one screen. */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/dashboard/logs?deployment=${deployment.id}`}
          className={secondaryButton}
        >
          View Logs
        </Link>
        <Link href="/dashboard/deployments" className={secondaryButton}>
          Back to Deployments
        </Link>
      </div>
    </div>
  )
}
