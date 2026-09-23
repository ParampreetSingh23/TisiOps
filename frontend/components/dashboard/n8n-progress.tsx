"use client"

import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Play,
  RotateCw,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { DeploymentActions } from "@/components/dashboard/deployment-actions"
import { AiRepair } from "@/components/dashboard/ai-repair"
import { DeploymentTimeline } from "@/components/dashboard/deployment-timeline"
import { TerraformPanel } from "@/components/dashboard/terraform-panel"
import { apiFetch } from "@/lib/api"
import { card, primaryButton, secondaryButton } from "@/lib/ui"
import type { SafeJob } from "@tisiops/server/services/deployment-job"
import type { SafeLog } from "@tisiops/server/services/deployments"
import type { N8nProgress } from "@tisiops/server/services/n8n"

/**
 * A managed server deployment, seen from the outside.
 *
 * Built around what the deployment *is* right now, not around a step list. A
 * live workspace wants one link, a stopped one wants one button, and only a
 * run in progress wants a timeline — showing all three at once is what buried
 * the start button under a progress bar reading 0%.
 *
 * Serves n8n and plain AWS servers alike: the steps come from the server and
 * the wording from COPY, so neither is hardcoded here.
 *
 * Everything is read from Postgres. Polling stops once the state cannot change
 * on its own.
 */

type ServerSummary = {
  region: string
  instanceType: string
  awsInstanceId: string | null
  elasticIp: string | null
  publicIp: string | null
  status: string
} | null

/**
 * The progress route serves every deployment type and says which one it sent,
 * so the retry button can post to the right place without this screen knowing
 * how each type is built.
 */
type Progress = N8nProgress & { server: ServerSummary; type: string }

/**
 * The words that differ per type. Everything else here — timeline, log, retry,
 * power, address — is the same machine underneath, so a second copy of this
 * screen would only be a second place for the timeline to rot.
 */
const COPY: Record<
  string,
  {
    live: string
    starting: string
    deploying: string
    kind: string
    template: string
    access: string
    /** Route segment for POST /api/deployments/:id/<retry>/retry. */
    retry: string
  }
> = {
  N8N: {
    live: "Your n8n workspace is live",
    starting: "Starting your n8n workspace",
    deploying: "Deploying n8n",
    kind: "n8n Managed Server",
    template: "aws-n8n-server",
    access: "Elastic IP HTTP",
    retry: "n8n",
  },
  AWS_SERVER: {
    live: "Your server is ready",
    starting: "Starting your server",
    deploying: "Creating your server",
    kind: "Ubuntu Server",
    template: "aws-ubuntu-server",
    access: "SSH",
    retry: "aws",
  },
}

const POLL_MS = 4_000

/** Terminal-style log line: fixed-width time, then the message. */
function LogLine({ log }: { log: SafeLog }) {
  const time = new Date(log.createdAt).toLocaleTimeString("en-GB", {
    hour12: false,
  })

  const tone =
    log.level === "ERROR"
      ? "text-[#ff8b73]"
      : log.level === "WARNING"
        ? "text-[#ffb066]"
        : log.level === "SUCCESS"
          ? "text-[#7ee2b8]"
          : "text-[#d6d3d1]"

  return (
    <p className="flex gap-3 font-mono text-xs leading-relaxed">
      <span className="shrink-0 text-[#78716c]">[{time}]</span>
      <span className={`min-w-0 break-words ${tone}`}>{log.message}</span>
    </p>
  )
}

/**
 * The state line: a dot, a word, and nothing else.
 *
 * Colour is the only decoration, and it only ever carries one meaning — the
 * accent is spent here and on the primary button, nowhere else.
 */
function StatePill({ progress }: { progress: Progress }) {
  const map: Record<string, { label: string; dot: string; text: string }> = {
    live: { label: "Live", dot: "bg-[#0f6b4f]", text: "text-[#0f6b4f]" },
    stopped: { label: "Stopped", dot: "bg-ink-muted", text: "text-ink-muted" },
    failed: { label: "Failed", dot: "bg-[#a8341f]", text: "text-[#a8341f]" },
    deploying: { label: "Deploying", dot: "bg-brand", text: "text-brand" },
    starting: { label: "Starting", dot: "bg-brand", text: "text-brand" },
    stopping: { label: "Stopping", dot: "bg-brand", text: "text-brand" },
  }

  const tone = map[progress.phase] ?? map.deploying
  const moving =
    progress.phase === "deploying" ||
    progress.phase === "starting" ||
    progress.phase === "stopping"

  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-medium ${tone.text}`}
    >
      <span
        className={`size-1.5 rounded-full ${tone.dot} ${
          moving ? "motion-safe:animate-pulse" : ""
        }`}
        aria-hidden
      />
      {tone.label}
    </span>
  )
}

function StepMark({ state }: { state: string }) {
  if (state === "done") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand">
        <Check className="size-2.5 text-white" aria-hidden />
      </span>
    )
  }

  if (state === "current") {
    return (
      <Loader2
        className="size-4 shrink-0 text-brand motion-safe:animate-spin"
        aria-hidden
      />
    )
  }

  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span className="size-1.5 rounded-full bg-line-warm" />
    </span>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 truncate font-mono text-sm text-ink-strong">
        {value}
      </dd>
    </div>
  )
}

export function N8nProgressView({ id }: { id: string }) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [logs, setLogs] = useState<SafeLog[]>([])
  const [jobs, setJobs] = useState<SafeJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      try {
        // All three come from Postgres. The screen never reads Redis: the
        // queue holds a notification, not the state of the deployment.
        const [next, nextLogs, nextJobs] = await Promise.all([
          apiFetch<Progress>(`/api/deployments/${id}/progress`),
          apiFetch<SafeLog[]>(`/api/deployments/${id}/logs`),
          apiFetch<SafeJob[]>(`/api/deployments/${id}/jobs`),
        ])

        if (!active) return
        setProgress(next)
        setLogs(nextLogs)
        setJobs(nextJobs)

        // Only a run in progress can change on its own. Power transitions
        // count too, or the screen can keep offering the wrong action while
        // AWS is still settling.
        if (
          next.phase === "deploying" ||
          next.phase === "starting" ||
          next.phase === "stopping"
        ) {
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

  async function retry() {
    if (!progress) return

    setIsRetrying(true)
    setError(null)

    const kind = COPY[progress.type] ?? COPY.N8N

    try {
      await apiFetch(`/api/deployments/${id}/${kind.retry}/retry`, {
        method: "POST",
      })
      window.location.reload()
    } catch (cause) {
      setError((cause as Error).message)
      setIsRetrying(false)
    }
  }

  if (error && !progress) {
    return (
      <div className={card}>
        <p className="text-sm text-ink-default">{error}</p>
      </div>
    )
  }

  if (!progress) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading deployment…
      </div>
    )
  }

  const { phase } = progress
  const copy = COPY[progress.type] ?? COPY.N8N
  const byok = progress.provider === "BYOK_SERVER"
  // Deploying and restarting look the same on screen — a percentage, a bar, a
  // step list, and the live log — because in both the user is waiting on work
  // that is already under way. Only the steps differ, and the server decides
  // those.
  const running = phase === "deploying" || phase === "starting"

  return (
    <div className="flex flex-col gap-4">
      {/* The headline: what this is, and the one thing to do with it. */}
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <StatePill progress={progress} />

            <h2 className="mt-2 font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong">
              {phase === "live"
                ? copy.live
                : phase === "starting"
                  ? copy.starting
                  : phase === "stopping"
                    ? "Stopping server"
                  : phase === "stopped"
                    ? "Server stopped"
                    : phase === "failed"
                      ? "Deployment failed"
                      : copy.deploying}
            </h2>

            {progress.publicUrl && phase === "live" ? (
              <p className="mt-1.5 font-mono text-sm break-all text-ink-muted">
                {progress.publicUrl}
              </p>
            ) : progress.statusDetail ? (
              <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
                {progress.statusDetail}
              </p>
            ) : null}
          </div>

          {running ? (
            <span className="shrink-0 font-mono text-2xl text-ink-strong tabular-nums">
              {progress.percent}%
            </span>
          ) : null}
        </div>

        {running ? (
          <div
            className="mt-4 h-1 w-full overflow-hidden rounded-full bg-canvas"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-brand duration-500 ease-out motion-safe:transition-[width]"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        ) : null}

        {/* One primary action per state, always above the fold. */}
        <div className="mt-5 flex flex-wrap gap-3">
          {phase === "live" && progress.publicUrl ? (
            <a
              href={progress.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryButton}
            >
              Open n8n
              <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
            </a>
          ) : null}

          {phase === "stopped" ? <StartButton id={id} /> : null}

          {progress.canRetry ? (
            <button
              type="button"
              onClick={() => void retry()}
              disabled={isRetrying}
              className={primaryButton}
            >
              {isRetrying ? (
                <Loader2
                  className="mr-2 size-4 motion-safe:animate-spin"
                  aria-hidden
                />
              ) : (
                <RotateCw className="mr-2 size-4" aria-hidden />
              )}
              Retry deployment
            </button>
          ) : null}

          <Link
            href={`/dashboard/logs?deployment=${id}`}
            className={secondaryButton}
          >
            View logs
          </Link>
        </div>
      </div>

      {progress.status === "WAITING_FOR_DNS" && progress.server?.elasticIp ? (
        <div className="rounded-[6px] border border-line bg-brand-soft px-4 py-3">
          <p className="flex gap-2 text-sm text-ink-default">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden
            />
            <span>
              Create an A record pointing{" "}
              <span className="font-mono">{progress.domain}</span> to{" "}
              <span className="font-mono">{progress.server.elasticIp}</span>.
            </span>
          </p>
        </div>
      ) : null}

      {phase === "failed" ? (
        <>
          <DeploymentTimeline deploymentId={id} />
          <AiRepair deploymentId={id} prominent />
        </>
      ) : null}

      <dl className={`${card} grid gap-4 sm:grid-cols-4`}>
        <Detail label="Type" value={byok ? "n8n Connected Server" : copy.kind} />
        <Detail label="Provider" value={byok ? "Your connected server" : "AWS"} />
        <Detail label="Template" value={byok ? "n8n Docker Compose" : copy.template} />
        <Detail label="Access Mode" value={byok ? "SSH + Docker" : copy.access} />
        {/* Read from the Server row, which does not exist until Terraform has
            run — a default here would name a region the server is not in. */}
        <Detail label={byok ? "Server region" : "Region"} value={progress.server?.region ?? "Pending"} />
        <Detail label={byok ? "Server size" : "Size"} value={progress.server?.instanceType ?? "Pending"} />
        <Detail label="Address" value={progress.publicUrl ?? (byok ? progress.server?.publicIp : progress.server?.elasticIp) ?? "Pending allocation"} />
        <Detail label="Status" value={progress.status} />
      </dl>

      {/* The timeline is only interesting while something is happening. */}
      {running ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <ol className={card}>
            {progress.steps.map((step) => (
              <li
                key={step.label}
                className="flex items-center gap-2.5 py-1.5 not-first:border-t not-first:border-line/60"
              >
                <StepMark state={step.state} />
                <span
                  className={`min-w-0 text-sm ${
                    step.state === "current"
                      ? "font-medium text-ink-strong"
                      : step.state === "done"
                        ? "text-ink-default"
                        : "text-ink-muted"
                  } ${step.state === "skipped" ? "line-through" : ""}`}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>

          <LogPanel logs={logs} />
        </div>
      ) : (
        // Finished: the log is history, so it folds away rather than filling
        // the screen with something already read.
        <details className={card}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-strong">
            <ChevronRight className="size-4 text-ink-muted" aria-hidden />
            Deployment log
            <span className="ml-auto text-xs font-normal text-ink-muted">
              {logs.length} entries
            </span>
          </summary>
          <div className="mt-3">
            <LogPanel logs={logs} />
          </div>
        </details>
      )}

      {!byok ? <TerraformPanel id={id} /> : null}
      <DeploymentActions id={id} />

      {jobs.length > 0 ? (
        <details className={card}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-strong">
            <ChevronRight className="size-4 text-ink-muted" aria-hidden />
            Job history
            <span className="ml-auto text-xs font-normal text-ink-muted">
              {jobs.length}
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {jobs.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <span className="font-medium text-ink-strong">
                  {entry.type.replaceAll("_", " ").toLowerCase()}
                </span>
                <span className="text-ink-muted">
                  {entry.status.toLowerCase()}
                </span>
                {entry.attempts > 1 ? (
                  <span className="text-xs text-ink-muted">
                    attempt {entry.attempts}
                  </span>
                ) : null}
                {entry.errorMessage ? (
                  <span className="w-full text-xs text-[#a8341f]">
                    {entry.errorMessage}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-4 py-3 text-sm text-[#a8341f]"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function LogPanel({ logs }: { logs: SafeLog[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-[#1c1917] p-4">
      <div className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="font-mono text-xs text-[#78716c]">
            Waiting for the worker…
          </p>
        ) : (
          logs.map((log) => <LogLine key={log.id} log={log} />)
        )}
      </div>
    </div>
  )
}

/**
 * Start, promoted out of the Manage panel.
 *
 * A stopped server has exactly one thing you want to do with it, so the button
 * sits with the headline rather than three cards down.
 */
function StartButton({ id }: { id: string }) {
  const [isStarting, setIsStarting] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function start() {
    setIsStarting(true)
    setFailed(null)

    try {
      await apiFetch(`/api/deployments/${id}/actions/start`, { method: "POST" })
      window.location.reload()
    } catch (cause) {
      setFailed((cause as Error).message)
      setIsStarting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={isStarting}
        className={primaryButton}
      >
        {isStarting ? (
          <Loader2
            className="mr-2 size-4 motion-safe:animate-spin"
            aria-hidden
          />
        ) : (
          <Play className="mr-2 size-4" aria-hidden />
        )}
        Start server
      </button>
      {failed ? (
        <p role="alert" className="w-full text-sm text-[#a8341f]">
          {failed}
        </p>
      ) : null}
    </>
  )
}
