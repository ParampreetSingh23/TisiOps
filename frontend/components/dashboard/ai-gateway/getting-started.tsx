"use client"

import { ArrowRight, Code2, KeyRound } from "lucide-react"

interface GettingStartedProps {
  onOpenCreateKey: () => void
  hasKeys: boolean
  firstKeyPrefix?: string
}

export function GettingStarted({
  onOpenCreateKey,
  hasKeys,
  firstKeyPrefix,
}: GettingStartedProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          Getting Started
        </h2>
        <p className="text-xs text-ink-muted">
          Start proxying AI requests through TisiOps in two steps.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Step 1: Create an API key */}
        <div className="flex flex-col justify-between rounded-[8px] border border-line bg-surface p-5 shadow-card transition-all duration-150 hover:border-line-warm">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-brand">01</span>
              <KeyRound className="size-4 text-ink-muted" />
            </div>

            <h3 className="mt-3 text-sm font-semibold text-ink-strong">
              Create an API key
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Generate a secure TisiOps key to authenticate all external API calls against the gateway.
            </p>

            <div className="mt-4 rounded-[4px] border border-line bg-canvas p-2.5 font-mono text-xs text-ink-muted select-all">
              {hasKeys && firstKeyPrefix ? (
                <span className="text-ink-default font-medium">{firstKeyPrefix}••••••••7K2P</span>
              ) : (
                <span>tisiops_sk_live_••••••••••••7K2P</span>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-muted">
              {hasKeys ? "Key created & active" : "Required for API calls"}
            </span>
            <button
              onClick={onOpenCreateKey}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <span>{hasKeys ? "+ New Key" : "Create API Key"}</span>
              <ArrowRight className="size-3" />
            </button>
          </div>
        </div>

        {/* Step 2: Send your first request */}
        <div className="flex flex-col justify-between rounded-[8px] border border-line bg-surface p-5 shadow-card transition-all duration-150 hover:border-line-warm">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-brand">02</span>
              <Code2 className="size-4 text-ink-muted" />
            </div>

            <h3 className="mt-3 text-sm font-semibold text-ink-strong">
              Send your first request
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Use your Bearer token with the unified TisiOps chat completions endpoint.
            </p>

            <div className="mt-4 rounded-[4px] border border-line bg-canvas p-2.5 font-mono text-[11px] text-ink-muted leading-relaxed">
              <p className="text-ink-strong font-semibold">POST /api/v1/ai/chat</p>
              <p className="text-brand">Authorization: Bearer tisiops_sk_live_...</p>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-muted">
              Standard JSON payload
            </span>
            <a
              href="#quick-start"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <span>View Code Samples</span>
              <ArrowRight className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
