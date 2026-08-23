"use client"

import { BookOpen, KeyRound, Network, RefreshCw, ShieldCheck } from "lucide-react"

interface AiGatewayHeaderProps {
  onOpenCreateKey: () => void
  onRefresh: () => void
  isLoading: boolean
}

export function AiGatewayHeader({
  onOpenCreateKey,
  onRefresh,
  isLoading,
}: AiGatewayHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-[8px] border border-line bg-surface p-6 shadow-card sm:p-8">
      {/* Background Architectural Watermark / Grid Lines */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-1/3 opacity-[0.03] dark:opacity-[0.05] hidden lg:block overflow-hidden select-none font-mono text-[10px] leading-tight">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="whitespace-nowrap">
            01000001 01001001 00100000 01000111 01000001 01010100 01000101 01010111 01000001 01011001
          </div>
        ))}
      </div>

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Identity & Core Narrative */}
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase text-brand">
              AI Gateway
            </span>
            <span className="text-line-warm font-mono">/</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operational · v1 API
            </span>
          </div>

          <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-medium tracking-[-0.035em] text-ink-strong">
            One API for your AI models.
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-muted sm:text-base">
            Route requests across supported LLM providers using a single TisiOps API key,
            while keeping token auditing, rate limiting, and model access centralized in one place.
          </p>

          {/* Action CTAs */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenCreateKey}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-brand px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-brand-hover active:bg-brand-active shadow-xs"
            >
              <KeyRound className="size-3.5" />
              <span>Create API Key</span>
            </button>

            <a
              href="#quick-start"
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line-warm bg-canvas px-4 text-xs font-medium text-ink-default transition-colors duration-150 hover:bg-surface"
            >
              <BookOpen className="size-3.5 text-ink-muted" />
              <span>View Quick Start</span>
            </a>

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line bg-canvas px-3 text-xs font-medium text-ink-muted hover:text-ink-strong hover:bg-surface transition-colors disabled:opacity-50"
              title="Refresh AI Gateway telemetry"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Right: Technical Routing Node Preview */}
        <div className="rounded-[6px] border border-line bg-canvas p-4 text-xs font-mono lg:w-80 shrink-0">
          <div className="flex items-center justify-between border-b border-line pb-2.5 text-[11px] text-ink-muted font-semibold">
            <div className="flex items-center gap-1.5">
              <Network className="size-3.5 text-brand" />
              <span>ROUTING SPECIFICATION</span>
            </div>
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Authentication</span>
              <span className="text-ink-strong font-medium">Bearer Key</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Rate Limiting</span>
              <span className="text-ink-strong font-medium">10 req / min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Encryption</span>
              <span className="text-brand font-medium">AES-256-GCM</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Model Fallback</span>
              <span className="text-ink-strong font-medium">Automatic</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
