import { redirect } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Radio,
  Rocket,
  Server,
  Shield,
  Users,
} from "lucide-react"

import { FeatureFlags } from "@/components/admin/feature-flags"
import { ProviderFlags } from "@/components/admin/provider-flags"
import { isAdmin } from "@/lib/auth"
import { getFeatures } from "@/lib/feature-store"
import { getProviders } from "@/lib/provider-store"
import { getAdminPlatformStats } from "@tisiops/server/services/admin/stats"

export const metadata = { title: "Admin Panel" }

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export default async function AdminPage() {
  // Server-side gate. Hiding the sidebar link is not protection.
  if (!(await isAdmin())) redirect("/dashboard")

  const stats = await getAdminPlatformStats()

  const metrics = [
    {
      label: "Total Users",
      value: stats.totalUsers,
      subtext: "Registered platform accounts",
      icon: Users,
      accent: false,
    },
    {
      label: "Total Deployments",
      value: stats.totalDeployments,
      subtext: `${stats.liveDeployments} currently live`,
      icon: Rocket,
      accent: stats.liveDeployments > 0,
    },
    {
      label: "Active Servers",
      value: stats.activeServers,
      subtext: "Connected & provisioned",
      icon: Server,
      accent: false,
    },
    {
      label: "Failed Jobs",
      value: stats.failedJobs,
      subtext: stats.failedJobs === 0 ? "All jobs healthy" : "Requires review",
      icon: AlertTriangle,
      accent: stats.failedJobs > 0,
      danger: stats.failedJobs > 0,
    },
  ]

  return (
    <div className="space-y-10">
      {/* Header with Live Sync Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink-strong">
            Admin Panel
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Real-time analytics, platform-level controls, and system state.
          </p>
        </div>
      </div>

      {/* Analytics Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <div
            key={item.label}
            className="flex flex-col justify-between rounded-lg border border-line bg-surface p-5 shadow-card transition-all duration-150 ease-out hover:border-line-warm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">{item.label}</span>
              <item.icon
                className={`size-4 ${
                  item.danger
                    ? "text-red-500"
                    : item.accent
                    ? "text-brand"
                    : "text-ink-muted"
                }`}
                aria-hidden
              />
            </div>
            <div className="mt-4">
              <p
                className={`font-heading text-3xl font-medium tracking-[-0.03em] ${
                  item.danger
                    ? "text-red-500"
                    : item.accent
                    ? "text-brand"
                    : "text-ink-strong"
                }`}
              >
                {item.value}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{item.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Realtime Platform Feeds: Recent Deployments & Recent Users */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Deployments */}
        <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="font-heading text-base font-semibold text-ink-strong">
                Latest Platform Deployments
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Most recent app deployments across all users.
              </p>
            </div>
            <Link
              href="/dashboard/deployments"
              className="text-xs font-medium text-brand hover:underline"
            >
              View all →
            </Link>
          </div>

          {stats.recentDeployments.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">
              No deployments recorded on the platform yet.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {stats.recentDeployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="flex items-center justify-between gap-3 py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-strong truncate">
                        {deployment.appName}
                      </span>
                      <span className="rounded-[4px] border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-muted uppercase">
                        {deployment.provider.replace(/^TISIOPS_MANAGED_/, "")}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-ink-muted text-[11px]">
                      User: {deployment.userEmail}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`rounded-[4px] px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        deployment.status === "LIVE"
                          ? "bg-brand-soft text-brand"
                          : deployment.status === "FAILED"
                          ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                          : "bg-canvas text-ink-muted"
                      }`}
                    >
                      {deployment.status}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {formatRelativeTime(deployment.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Registered Users */}
        <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="font-heading text-base font-semibold text-ink-strong">
                Registered Platform Users
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Latest user accounts synced via Clerk auth.
              </p>
            </div>
            <span className="rounded-[4px] border border-line bg-canvas px-2 py-0.5 font-mono text-xs text-ink-muted">
              {stats.totalUsers} total
            </span>
          </div>

          {stats.recentUsers.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">
              No users registered yet.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {stats.recentUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-strong truncate">
                      {user.name || user.email}
                    </p>
                    <p className="mt-0.5 truncate text-ink-muted text-[11px]">
                      {user.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        user.role === "ADMIN"
                          ? "bg-brand-soft text-brand"
                          : "bg-canvas text-ink-muted"
                      }`}
                    >
                      {user.role === "ADMIN" ? (
                        <Shield className="size-3 text-brand" />
                      ) : null}
                      {user.role}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {formatRelativeTime(user.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Deployment Templates */}
      <section className="rounded-[8px] border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="size-4 text-brand" />
              <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
                Deployment templates
              </h2>
              <span className="rounded-[4px] border border-line bg-canvas px-2 py-0.5 font-mono text-xs text-ink-muted">
                {stats.totalTemplates} custom template(s)
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Create, validate, preview, test, and publish YAML templates without
              changing built-in file templates.
            </p>
          </div>
          <Link
            href="/dashboard/admin/templates"
            className="inline-flex h-9 items-center justify-center rounded-[6px] bg-brand px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Manage Templates
          </Link>
        </div>
      </section>

      {/* Feature Flags */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
              Feature flags
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Control which features normal users can reach. Locked and disabled
              features disappear from their sidebar and their routes redirect to the
              overview. Admins always keep access. Changes apply immediately.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FeatureFlags features={getFeatures()} />
        </div>
      </section>

      {/* Cloud Providers */}
      <section>
        <div>
          <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            Cloud providers
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Control which providers users can pick in the deployment wizard.
            Providers marked Coming Soon show in the wizard but cannot be
            selected.
          </p>
        </div>

        <div className="mt-5">
          <ProviderFlags providers={getProviders()} />
        </div>
      </section>
    </div>
  )
}
