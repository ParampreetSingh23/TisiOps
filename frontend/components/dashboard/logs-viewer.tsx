"use client"

import { Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card } from "@/lib/ui"
import type {
  SafeAttempt,
  SafeDeployment,
  SafeLog,
} from "@tisiops/server/services/deployments"

/**
 * Logs, scoped to the signed-in user. The deployment list and the log fetch
 * are both user-scoped server-side, so another account's logs cannot be
 * reached by picking an id.
 */

const LEVEL_STYLES: Record<string, string> = {
  INFO: "text-ink-default",
  SUCCESS: "text-[#0f6b4f]",
  WARNING: "text-[#a8641f]",
  ERROR: "text-[#a8341f]",
}

/** The attempt a log line belongs to, when it was recorded against one. */
function attemptOf(log: SafeLog, attempts: SafeAttempt[]): SafeAttempt | null {
  return attempts.find((attempt) => attempt.id === log.attemptId) ?? null
}

function time(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function LogsViewer() {
  const logRef = useRef<HTMLPreElement>(null)
  const params = useSearchParams()
  const requested = params.get("deployment")

  const [deployments, setDeployments] = useState<SafeDeployment[] | null>(null)
  const [selected, setSelected] = useState<string | null>(requested)
  const [logs, setLogs] = useState<SafeLog[] | null>(null)
  const [attempts, setAttempts] = useState<SafeAttempt[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<SafeDeployment[]>("/api/deployments")
      .then((list) => {
        if (!active) return
        setDeployments(list)
        setSelected((current) => current ?? list[0]?.id ?? null)
      })
      .catch(() => {
        if (active) setError("Could not load your deployments.")
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    let active = true

    Promise.all([
      apiFetch<SafeLog[]>(`/api/deployments/${selected}/logs`),
      apiFetch<SafeAttempt[]>(`/api/deployments/${selected}/attempts`),
    ])
      .then(([nextLogs, nextAttempts]) => {
        if (!active) return
        setLogs(nextLogs)
        setAttempts(nextAttempts)
      })
      .catch(() => {
        if (active) setError("Could not load logs for this deployment.")
      })

    return () => {
      active = false
    }
  }, [selected])

  useEffect(() => {
    if (logs && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  if (error && !deployments) {
    return (
      <p role="alert" className={`${card} text-sm text-[#a8341f]`}>
        {error}
      </p>
    )
  }

  if (!deployments) {
    return (
      <p className={`${card} flex items-center gap-3 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }

  if (deployments.length === 0) {
    return (
      <p className={`${card} text-sm text-ink-muted`}>
        No deployments yet, so there are no logs. Start one from the AI Console
        or the Vercel Frontend template.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="lg:w-72 lg:shrink-0">
        <h2 className="text-sm font-semibold text-ink-strong">Deployments</h2>
        <ul className="mt-3 flex flex-col gap-1">
          {deployments.map((deployment) => (
            <li key={deployment.id}>
              <button
                type="button"
                onClick={() => {
                  // Cleared here rather than in the effect, so the pane never
                  // shows the previous deployment's logs under a new title.
                  setLogs(null)
                  setAttempts([])
                  setSelected(deployment.id)
                }}
                aria-current={deployment.id === selected ? "true" : undefined}
                className={`w-full rounded-[6px] px-3 py-2 text-left text-sm transition-colors duration-150 ease-out ${
                  deployment.id === selected
                    ? "bg-brand-soft font-medium text-brand"
                    : "text-ink-default hover:bg-surface"
                }`}
              >
                <span className="block truncate">{deployment.appName}</span>
                <span className="mt-0.5 block truncate font-mono text-xs text-ink-muted">
                  {deployment.type} · {deployment.branch}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`${card} min-w-0 flex-1 self-start`}>
        {logs === null ? (
          <p className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
            Loading logs…
          </p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-ink-muted">No logs for this deployment.</p>
        ) : (
          // A fixed viewport: the log list grows without bound, and a page
          // that grows with it buries the composer and the actions below.
          <pre
            ref={logRef}
            // Tall enough to read a whole attempt without scrolling, but still a
            // fixed viewport so the page never grows with the log.
            className="scrollbar-subtle h-[min(72svh,52rem)] overflow-x-auto overflow-y-auto font-mono text-xs leading-relaxed"
          >
            {logs.map((log, index) => {
              // A separator wherever the run changes, so a retry reads as its
              // own attempt rather than more lines on the same list.
              const attempt = attemptOf(log, attempts)
              const previous =
                index > 0 ? attemptOf(logs[index - 1]!, attempts) : null
              const startsAttempt =
                attempt !== null && attempt.id !== previous?.id

              return (
                <div key={log.id}>
                  {startsAttempt ? (
                    <div className="mt-3 mb-1 flex items-center gap-2 border-t border-line pt-3 text-ink-muted first:mt-0 first:border-t-0 first:pt-0">
                      <span className="font-semibold text-ink-strong">
                        Attempt #{attempt.attemptNumber}
                      </span>
                      <span>{attempt.status.toLowerCase()}</span>
                    </div>
                  ) : null}
                  <div className={LEVEL_STYLES[log.level]}>
                    <span className="text-ink-muted">
                      [{time(log.createdAt)}]
                    </span>{" "}
                    {log.message}
                  </div>
                </div>
              )
            })}
          </pre>
        )}
      </section>
    </div>
  )
}
