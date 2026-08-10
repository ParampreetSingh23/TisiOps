"use client"

import {
  ArrowDown,
  Check,
  Copy,
  Loader2,
  Search,
  Terminal,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { ProviderIcon } from "@/components/deployment/provider-icon"
import { StatusDot } from "@/components/dashboard/deployments-list"
import { apiFetch } from "@/lib/api"
import { card } from "@/lib/ui"
import type {
  SafeAttempt,
  SafeDeployment,
  SafeLog,
} from "@tisiops/server/services/deployments"

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
  const [searchQuery, setSearchQuery] = useState("")
  const [filterLevel, setFilterLevel] = useState<"ALL" | "ERROR" | "INFO">("ALL")
  const [copied, setCopied] = useState(false)

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

  const selectedDeployment = deployments?.find((d) => d.id === selected)

  const filteredLogs = (logs ?? []).filter((log) => {
    if (filterLevel !== "ALL" && log.level !== filterLevel) return false
    if (searchQuery.trim()) {
      return log.message.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  const handleCopyLogs = () => {
    if (!filteredLogs.length) return
    const text = filteredLogs
      .map((l) => `[${time(l.createdAt)}] [${l.level}] ${l.message}`)
      .join("\n")
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const scrollToBottom = () => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }

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
        Loading deployments…
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
    <div className="flex flex-1 flex-col gap-5 min-h-0 lg:flex-row lg:h-full">
      {/* Deployments Selector Sidebar */}
      <aside className="flex flex-col lg:w-72 lg:shrink-0 lg:h-full lg:overflow-hidden">
        <h2 className="shrink-0 px-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">
          Deployments
        </h2>
        <ul className="mt-2.5 flex max-h-56 flex-col gap-1.5 overflow-y-auto scrollbar-subtle lg:max-h-full">
          {deployments.map((deployment) => {
            const isSelected = deployment.id === selected
            const isN8n = deployment.type === "N8N"

            return (
              <li key={deployment.id}>
                <button
                  type="button"
                  onClick={() => {
                    setLogs(null)
                    setAttempts([])
                    setSelected(deployment.id)
                  }}
                  aria-current={isSelected ? "true" : undefined}
                  className={`group flex w-full items-center gap-3 rounded-[8px] border p-3 text-left transition-colors duration-150 ease-out ${
                    isSelected
                      ? "border-brand-soft bg-brand-soft shadow-xs"
                      : "border-line bg-surface hover:border-line-warm hover:bg-canvas"
                  }`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-line bg-canvas">
                    <ProviderIcon id={deployment.type.toLowerCase()} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`truncate text-sm font-semibold ${
                          isSelected ? "text-brand" : "text-ink-strong"
                        }`}
                      >
                        {deployment.appName}
                      </span>
                      <StatusDot status={deployment.status} />
                    </div>

                    <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">
                      {isN8n ? (
                        "n8n Managed Server"
                      ) : (
                        <>
                          {deployment.type} {deployment.branch ? `· ${deployment.branch}` : ""}
                        </>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* Log Console Window */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        {/* Terminal Header Bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Terminal className="size-4 shrink-0 text-brand" aria-hidden />
            <span className="truncate font-heading text-sm font-semibold text-ink-strong">
              {selectedDeployment?.appName ?? "Logs"}
            </span>
            {selectedDeployment ? (
              <StatusDot status={selectedDeployment.status} />
            ) : null}
            {logs ? (
              <span className="rounded-[4px] border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                {filteredLogs.length} / {logs.length} lines
              </span>
            ) : null}
          </div>

          {/* Console Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search filter */}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs…"
                className="h-7 w-32 rounded-[6px] border border-line bg-surface pl-8 pr-2.5 text-xs text-ink-strong placeholder:text-ink-muted focus:border-brand focus:outline-hidden sm:w-40"
              />
            </div>

            {/* Log Level Filter Tabs */}
            <div className="flex items-center rounded-[6px] border border-line bg-surface p-0.5 text-xs">
              {(["ALL", "INFO", "ERROR"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilterLevel(lvl)}
                  className={`rounded-[4px] px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${
                    filterLevel === lvl
                      ? "bg-brand font-semibold text-white"
                      : "text-ink-muted hover:text-ink-strong"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <button
              type="button"
              onClick={handleCopyLogs}
              disabled={!logs || logs.length === 0}
              className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-surface px-2.5 text-xs font-medium text-ink-default transition-colors hover:bg-canvas disabled:opacity-50"
              title="Copy visible logs"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-[#0f6b4f]" />
                  <span className="text-[#0f6b4f]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3 text-ink-muted" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={scrollToBottom}
              disabled={!logs || logs.length === 0}
              className="inline-flex size-7 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-muted transition-colors hover:bg-canvas hover:text-ink-strong disabled:opacity-50"
              title="Scroll to bottom"
            >
              <ArrowDown className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Console Viewport */}
        <div className="flex-1 min-h-0 p-4">
          {logs === null ? (
            <div className="flex h-full items-center justify-center gap-2.5 text-sm text-ink-muted min-h-64">
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              Fetching deployment logs…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted min-h-64">
              {logs.length === 0
                ? "No logs recorded for this deployment yet."
                : "No log lines match your current filter."}
            </div>
          ) : (
            <pre
              ref={logRef}
              className="scrollbar-subtle h-full overflow-x-auto overflow-y-auto font-mono text-xs leading-relaxed"
            >
              {filteredLogs.map((log, index) => {
                const attempt = attemptOf(log, attempts)
                const previous =
                  index > 0 ? attemptOf(filteredLogs[index - 1]!, attempts) : null
                const startsAttempt =
                  attempt !== null && attempt.id !== previous?.id

                return (
                  <div key={log.id}>
                    {startsAttempt ? (
                      <div className="mt-3 mb-1 flex items-center gap-2 border-t border-line pt-3 text-ink-muted first:mt-0 first:border-t-0 first:pt-0">
                        <span className="font-semibold text-ink-strong">
                          Attempt #{attempt.attemptNumber}
                        </span>
                        <span className="text-[11px] font-mono uppercase tracking-wider">
                          ({attempt.status.toLowerCase()})
                        </span>
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
        </div>
      </section>
    </div>
  )
}
