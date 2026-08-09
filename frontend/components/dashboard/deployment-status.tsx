"use client"

import { AlertTriangle, ExternalLink, Loader2, RotateCw } from "lucide-react"

import { ErrorDialog } from "@/components/dashboard/error-dialog"
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

  const details = [
    { label: "App Name", value: deployment.appName },
    {
      label: "Repository",
      value: `${deployment.repositoryOwner}/${deployment.repositoryName}`,
    },
    { label: "Branch", value: deployment.branch },
    {
      label: "Root Directory",
      value: deployment.servicePath || "repository root",
    },
    {
      label: "Build Command",
      value: deployment.buildCommand ?? "Framework default",
    },
    {
      label: "Output Directory",
      value: outputDirectoryLabel(deployment.framework),
    },
    { label: "Deployment Type", value: deployment.type },
    { label: "Provider", value: "TisiOps Managed Vercel" },
    { label: "Framework", value: deployment.framework ?? "—" },
    { label: "Created", value: formatDateTime(deployment.createdAt) },
    { label: "Last Updated", value: formatDateTime(deployment.updatedAt) },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-line bg-canvas">
          <ProviderIcon id={deployment.type.toLowerCase()} />
        </span>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
          {deployment.type.charAt(0) + deployment.type.slice(1).toLowerCase()}{" "}
          Deployment
        </h1>
        <StatusBadge status={deployment.status} />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-base text-ink-muted">
        <span className="font-mono text-sm">{deployment.id}</span>
        {["BUILDING", "RETRYING", "PREPARING"].includes(deployment.status) ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Loader2
              className="size-3.5 motion-safe:animate-spin"
              aria-hidden
            />
            Watching Vercel for the build result
          </span>
        ) : null}
      </p>

      {deployment.status === "ACCESS_BLOCKED" ? (
        <div className="mt-5 rounded-[6px] border border-line bg-brand-soft px-4 py-3 text-sm text-ink-default">
          <p className="font-medium text-ink-strong">
            The build succeeded, but the preview URL is not public.
          </p>
          <p className="mt-1.5">
            Deployment was created, but the preview URL is protected by Vercel
            settings. Disable Vercel Deployment Protection for TisiOps-managed
            preview deployments.
          </p>
          <p className="mt-1.5 text-ink-muted">
            Fix once, in the TisiOps Vercel account: Settings → Deployment
            Protection → turn off Vercel Authentication for preview deployments.
            Requesting access per visitor will not help.
          </p>
        </div>
      ) : null}

      {/* A GitHub permission problem is not fixed by retrying — granting
          access is the actual next step. */}
      {deployment.needsGithubReconnect ? (
        <section className={`${card} mt-5`}>
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
        <p className="mt-5 rounded-[6px] border border-line bg-canvas px-4 py-3 text-sm text-ink-default">
          MVP placeholder: real Vercel deployment execution is not enabled yet.
        </p>
      ) : null}

      {/* The failure opens as a dialog rather than sitting inline: it is the
          one thing worth reading on a failed deployment, and the raw provider
          text is too long to wear as a banner. */}
      {hasFailure ? (
        <button
          type="button"
          onClick={() => setShowError(true)}
          className={`mt-5 ${secondaryButton}`}
        >
          <AlertTriangle className="mr-2 size-4 text-[#a8341f]" aria-hidden />
          View error details
        </button>
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {details.map((detail) => (
          <div key={detail.label} className={card}>
            <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              {detail.label}
            </p>
            <p className="mt-2 text-sm font-medium break-all text-ink-strong">
              {detail.value}
            </p>
          </div>
        ))}
      </div>

      {deployment.previewUrl ? (
        <div className={`${card} mt-4`}>
          <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Preview URL
          </p>
          <p className="mt-2 font-mono text-sm break-all text-ink-strong">
            {deployment.previewUrl}
          </p>
          {deployment.status === "ACCESS_BLOCKED" ? (
            <div className="mt-5 rounded-[6px] border border-line bg-brand-soft px-4 py-3 text-sm text-ink-default">
              <p className="font-medium text-ink-strong">
                The build succeeded, but the preview URL is not public.
              </p>
              <p className="mt-1.5">
                Deployment was created, but the preview URL is protected by
                Vercel settings. Disable Vercel Deployment Protection for
                TisiOps-managed preview deployments.
              </p>
              <p className="mt-1.5 text-ink-muted">
                Fix once, in the TisiOps Vercel account: Settings → Deployment
                Protection → turn off Vercel Authentication for preview
                deployments. Requesting access per visitor will not help.
              </p>
            </div>
          ) : null}

          {deployment.status === "PLACEHOLDER" ? (
            <p className="mt-2 text-sm text-ink-muted">
              Placeholder address — it will not load.
            </p>
          ) : null}
        </div>
      ) : null}

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

      <div className="mt-6 flex flex-wrap gap-3">
        {deployment.previewUrl && deployment.status === "LIVE" ? (
          <a
            href={deployment.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={primaryButton}
          >
            Open Preview
            <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
          </a>
        ) : null}
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
