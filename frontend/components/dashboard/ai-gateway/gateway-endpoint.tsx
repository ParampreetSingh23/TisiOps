"use client"

import { Check, Copy, Globe, Lock, Network, Server } from "lucide-react"
import { useEffect, useState } from "react"

export function GatewayEndpoint() {
  const [copied, setCopied] = useState(false)
  const [host, setHost] = useState("https://api.tisiops.com")

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setHost(window.location.origin)
    }
  }, [])

  const fullUrl = `${host}/api/v1/ai/chat`

  function handleCopy() {
    navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          Gateway Endpoint
        </h2>
        <p className="text-xs text-ink-muted">
          Send all OpenAI-compatible and multimodal chat completion requests to this endpoint.
        </p>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-line bg-surface shadow-card">
        {/* Endpoint URL Row */}
        <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-[4px] bg-brand px-2.5 py-1 font-mono text-xs font-bold text-white uppercase">
                POST
              </span>
              <code className="font-mono text-sm font-semibold text-ink-strong select-all">
                {fullUrl}
              </code>
            </div>

            <button
              onClick={handleCopy}
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line bg-canvas px-3 text-xs font-medium text-ink-default hover:bg-surface transition-colors shrink-0"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-ink-muted" />
                  <span>Copy URL</span>
                </>
              )}
            </button>
          </div>

          {/* Headers & Parameter Specs */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-[6px] border border-line bg-canvas p-3">
              <div className="flex items-center gap-2 text-ink-muted font-semibold">
                <Lock className="size-3.5 text-brand" />
                <span>Authorization Header</span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-ink-strong select-all font-medium">
                Bearer tisiops_sk_live_...
              </p>
            </div>

            <div className="rounded-[6px] border border-line bg-canvas p-3">
              <div className="flex items-center gap-2 text-ink-muted font-semibold">
                <Globe className="size-3.5 text-brand" />
                <span>Content-Type</span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-ink-strong select-all font-medium">
                application/json
              </p>
            </div>

            <div className="rounded-[6px] border border-line bg-canvas p-3">
              <div className="flex items-center gap-2 text-ink-muted font-semibold">
                <Server className="size-3.5 text-brand" />
                <span>Response Format</span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-ink-strong font-medium">
                Standard OpenAI Chat JSON
              </p>
            </div>
          </div>
        </div>

        {/* Structural Routing Hint Strip */}
        <div className="border-t border-line bg-canvas/40 px-5 py-3 text-xs font-mono text-ink-muted">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink-strong">Routing Path:</span>
            <span>Your App</span>
            <span className="text-line-warm">→</span>
            <span className="text-brand font-medium">TisiOps AI Gateway</span>
            <span className="text-line-warm">→</span>
            <span>Provider Adapter</span>
            <span className="text-line-warm">→</span>
            <span className="text-ink-strong">Upstream Model</span>
          </div>
        </div>
      </div>
    </section>
  )
}
