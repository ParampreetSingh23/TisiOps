"use client"

import { Activity, Coins, KeyRound, MessageSquare } from "lucide-react"

interface Summary {
  plan: string
  dailyMessagesUsed: number
  dailyMessagesLimit: number
  dailyTokensUsed: number
  dailyTokensLimit: number
  estimatedCostToday: string
  activeApiKeys: number
  availableModels: number
}

interface UsageRow {
  modelCode: string
  source: string
  _count: { id: number }
  _sum: { totalTokens: number | null; estimatedCost: string | null }
}

interface GatewayUsageProps {
  summary: Summary | null
  rows: UsageRow[]
  isLoading: boolean
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toLocaleString()
}

export function GatewayUsage({ summary, rows, isLoading }: GatewayUsageProps) {
  const cost = summary ? parseFloat(summary.estimatedCostToday || "0") : 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          Usage & Telemetry
        </h2>
        <p className="text-xs text-ink-muted">
          Realtime token consumption, request counts, and spend for your account today.
        </p>
      </div>

      {/* Structured Metrics Strip (Single Card with Internal Dividers) */}
      <div className="overflow-hidden rounded-[8px] border border-line bg-surface shadow-card">
        <div className="grid grid-cols-2 divide-y divide-line sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
          {/* Requests Metric */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-ink-muted">
                Requests Today
              </span>
              <MessageSquare className="size-3.5 text-ink-muted" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-medium tracking-[-0.03em] text-ink-strong">
                {isLoading ? "—" : summary?.dailyMessagesUsed ?? 0}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                / {isLoading ? "—" : summary?.dailyMessagesLimit ?? 50}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {summary ? `${Math.round(((summary.dailyMessagesUsed || 0) / (summary.dailyMessagesLimit || 50)) * 100)}% daily limit` : "Current billing window"}
            </p>
          </div>

          {/* Tokens Metric */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-ink-muted">
                Tokens Today
              </span>
              <Activity className="size-3.5 text-ink-muted" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-medium tracking-[-0.03em] text-ink-strong">
                {isLoading ? "—" : formatTokens(summary?.dailyTokensUsed ?? 0)}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                / {isLoading ? "—" : formatTokens(summary?.dailyTokensLimit ?? 100_000)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Prompt & completion
            </p>
          </div>

          {/* Estimated Spend Metric */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-ink-muted">
                Estimated Cost
              </span>
              <Coins className="size-3.5 text-brand" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-medium tracking-[-0.03em] text-brand">
                {isLoading ? "—" : cost > 0 ? `$${cost.toFixed(4)}` : "$0.00"}
              </span>
              <span className="font-mono text-[11px] text-ink-muted">USD</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Based on model rates
            </p>
          </div>

          {/* Active Keys Metric */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-ink-muted">
                Active Keys
              </span>
              <KeyRound className="size-3.5 text-ink-muted" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-medium tracking-[-0.03em] text-ink-strong">
                {isLoading ? "—" : summary?.activeApiKeys ?? 0}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                keys
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Plan: <strong className="text-ink-strong">{summary?.plan ?? "Free"}</strong>
            </p>
          </div>
        </div>

        {/* Detailed Breakdown or Clean Empty State */}
        <div className="border-t border-line bg-canvas/40 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Model Activity Breakdown
            </h3>
            <span className="font-mono text-[11px] text-ink-muted">
              UTC Day {new Date().toISOString().split("T")[0]}
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="py-4 text-xs text-ink-muted text-center border border-dashed border-line rounded-[4px]">
              No gateway calls recorded today. Usage will appear here in realtime once your application or AI Console sends requests.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-ink-muted">
                    <th className="py-2 font-medium">Model</th>
                    <th className="py-2 font-medium">Origin Source</th>
                    <th className="py-2 font-medium text-right">Requests</th>
                    <th className="py-2 font-medium text-right">Total Tokens</th>
                    <th className="py-2 font-medium text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {rows.map((row) => (
                    <tr key={`${row.modelCode}-${row.source}`}>
                      <td className="py-2.5 font-mono font-medium text-brand">
                        {row.modelCode}
                      </td>
                      <td className="py-2.5 text-ink-default font-mono text-[11px]">
                        {row.source}
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-strong">
                        {row._count.id.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono text-ink-strong">
                        {(row._sum.totalTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-ink-strong">
                        {row._sum.estimatedCost ? `$${parseFloat(row._sum.estimatedCost).toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
