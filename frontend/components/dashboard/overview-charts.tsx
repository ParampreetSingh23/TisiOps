"use client"

import type { ReactNode } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { OverviewStats } from "@tisiops/server/services/deployments/overview"

const COLORS = [
  "var(--tisi-brand)",
  "var(--tisi-text-default)",
  "var(--tisi-text-secondary)",
  "var(--tisi-border-warm)",
  "var(--tisi-border)",
]
const tooltipStyle = {
  background: "var(--tisi-surface)",
  border: "1px solid var(--tisi-border-warm)",
  borderRadius: 6,
  color: "var(--tisi-text-primary)",
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-[6px] border border-dashed border-line bg-canvas text-sm text-ink-muted">
      {label}
    </div>
  )
}

function ChartShell({
  title,
  value,
  className = "",
  children,
}: {
  title: string
  value: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-surface p-5 shadow-card ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-strong">
          {title}
        </h2>
        <span className="font-mono text-xs text-ink-muted">{value}</span>
      </div>
      <div className="h-[220px]">{children}</div>
    </section>
  )
}

export function OverviewCharts({ stats }: { stats: OverviewStats }) {
  const hasTrend = stats.deploymentTrend.some(
    (item) => item.deployments > 0 || item.aiActions > 0
  )
  const hasStatuses = stats.statusBreakdown.length > 0
  const hasProviders = stats.providerBreakdown.length > 0

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <ChartShell
        title="7-day activity"
        value="deploys + AI"
        className="lg:col-span-6"
      >
        {hasTrend ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.deploymentTrend} accessibilityLayer>
              <CartesianGrid
                stroke="var(--tisi-border-warm)"
                strokeDasharray="3 3"
              />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ stroke: "var(--tisi-brand)", strokeWidth: 1 }}
                contentStyle={tooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="aiActions"
                name="AI actions"
                stroke="var(--tisi-text-secondary)"
                fill="var(--tisi-border-warm)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="deployments"
                name="Deployments"
                stroke="var(--tisi-brand)"
                fill="var(--tisi-brand-soft)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No activity in last 7 days" />
        )}
      </ChartShell>

      <ChartShell
        title="Deployment status"
        value={`${stats.deployments} total`}
        className="lg:col-span-3"
      >
        {hasStatuses ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.statusBreakdown} accessibilityLayer>
              <CartesianGrid
                stroke="var(--tisi-border-warm)"
                strokeDasharray="3 3"
              />
              <XAxis dataKey="status" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "var(--tisi-brand-soft)" }}
                contentStyle={tooltipStyle}
              />
              <Bar
                dataKey="count"
                name="Deployments"
                fill="var(--tisi-brand)"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No deployments yet" />
        )}
      </ChartShell>

      <ChartShell
        title="Provider mix"
        value="live inventory"
        className="lg:col-span-3"
      >
        {hasProviders ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer>
              <Pie
                data={stats.providerBreakdown}
                dataKey="count"
                nameKey="provider"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={3}
              >
                {stats.providerBreakdown.map((entry, index) => (
                  <Cell
                    key={entry.provider}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No providers in use" />
        )}
      </ChartShell>
    </div>
  )
}
