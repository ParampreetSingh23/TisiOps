import { auth, clerkClient, currentUser } from "@clerk/nextjs/server"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  PauseCircle,
  Rocket,
  Server,
  Waypoints,
} from "lucide-react"
import Link from "next/link"

import { LockedNotice } from "@/components/dashboard/locked-notice"
import { GithubConnect } from "@/components/deployment/github-connect"
import { canUseFeature } from "@/lib/feature-guard"
import { getFeatures } from "@/lib/feature-store"
import {
  getGithubStatus,
  type GithubStatus,
} from "@tisiops/server/services/github"
import {
  getOverviewStats,
} from "@tisiops/server/services/deployments/overview"

/** Never throws: a Clerk hiccup should not take the whole dashboard down. */
async function readGithubStatus(): Promise<GithubStatus> {
  const { userId } = await auth()
  const fallback: GithubStatus = {
    state: "connection_error",
    username: null,
    grantedScopes: [],
    error: "Could not check the GitHub connection.",
  }

  if (!userId) return fallback

  try {
    const client = await clerkClient()
    return await getGithubStatus(userId, client.users)
  } catch {
    return fallback
  }
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string }>
}) {
  if (!(await canUseFeature("overview"))) {
    return <LockedNotice feature="Overview" />
  }

  const user = await currentUser()
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? null

  const githubStatus = await readGithubStatus()
  const { userId: clerkUserId } = await auth()
  const stats = await getOverviewStats(clerkUserId)
  const githubConnected = githubStatus.state === "repo_access_granted"

  const { locked } = await searchParams
  const lockedName = getFeatures().find(
    (feature) => feature.key === locked
  )?.name

  const setupSteps = [
    {
      title: "Connect GitHub",
      detail: "Grant access so TisiOps can analyze your repositories.",
      done: githubConnected,
      action: { label: "Connect", href: "#github" },
    },
    {
      title: "Choose a cloud provider",
      detail: "AWS managed servers or bring your own VPS.",
      done: false,
      action: { label: "Choose", href: "/dashboard/new-deployment/create" },
    },
    {
      title: "Deploy your first app",
      detail: "TisiOps prepares the plan and asks for approval before running.",
      done: false,
      action: { label: "Deploy", href: "/dashboard/new-deployment/create" },
    },
  ]

  const metrics = [
    { label: "Deployments", value: stats.deployments, icon: Rocket, isAccent: false },
    { label: "Live", value: stats.live, icon: Check, isAccent: stats.live > 0 },
    { label: "Active servers", value: stats.activeServers, icon: Server, isAccent: false },
    { label: "Stopped", value: stats.stopped, icon: PauseCircle, isAccent: false },
    { label: "Failed", value: stats.failed, icon: AlertTriangle, isAccent: stats.failed > 0 },
    { label: "AI actions today", value: stats.aiActionsToday, icon: Waypoints, isAccent: false },
  ]

  return (
    <div className="space-y-5">
      {lockedName ? (
        <p className="rounded-[6px] border border-line bg-surface px-4 py-3 text-sm text-ink-default">
          <span className="font-semibold text-ink-strong">{lockedName}</span> is locked. Ask an admin to enable it.
        </p>
      ) : null}

      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
          Welcome back{displayName ? `, ${displayName}` : ""}.
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage your deployments, servers, and AI DevOps actions from one place.
        </p>
      </div>

      {/* Persistent AI Console Launcher */}
      <Link
        href="/dashboard/ai-console"
        className="group flex items-center gap-3.5 rounded-[8px] border border-line bg-surface p-3.5 shadow-card transition-colors duration-150 ease-out hover:border-line-warm"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-brand-soft text-brand">
          <Waypoints className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-brand">Ask TisiOps</span>
          <span className="text-ink-muted"> to deploy, restart, roll back, or explain a failure…</span>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-brand text-white transition-colors duration-150 ease-out group-hover:bg-brand-hover">
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>

      {/* Sleek Unified Metrics Bar */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <div className="grid grid-cols-2 divide-y divide-line sm:grid-cols-3 sm:divide-y-0 sm:divide-x xl:grid-cols-6">
          {metrics.map((item) => (
            <div key={item.label} className="flex flex-col justify-between p-4">
              <div className="flex items-center gap-2">
                <item.icon className={`size-3.5 ${item.isAccent ? "text-brand" : "text-ink-muted"}`} aria-hidden />
                <span className="text-xs font-medium text-ink-muted">{item.label}</span>
              </div>
              <p className={`mt-2 font-heading text-2xl font-medium tracking-[-0.03em] ${item.isAccent ? "text-brand" : "text-ink-strong"}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Setup & Activity Section */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Onboarding Checklist */}
        <section className="rounded-lg border border-line bg-surface p-5 shadow-card lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">
                Get set up
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Three steps to your first deployment.
              </p>
            </div>
            <span className="rounded-[4px] border border-line bg-canvas px-2.5 py-1 text-xs font-mono font-medium text-ink-muted">
              {githubConnected ? "1 of 3 complete" : "0 of 3 complete"}
            </span>
          </div>

          <ol className="mt-5 divide-y divide-line border-t border-line">
            {setupSteps.map((step, index) => (
              <li key={step.title} className="flex flex-wrap items-center gap-4 py-4 first:pt-4 last:pb-0">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done
                      ? "bg-[#0f6b4f] text-white"
                      : "bg-canvas text-ink-muted"
                  }`}
                >
                  {step.done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-ink-strong">
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">{step.detail}</p>
                </div>

                {step.done ? (
                  <span className="text-xs font-semibold tracking-wide text-[#0f6b4f] uppercase">
                    Done
                  </span>
                ) : (
                  <Link
                    href={step.action.href}
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-3.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
                  >
                    {step.action.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* GitHub & Quick Action Sidebar */}
        <div className="space-y-5 lg:col-span-5">
          <div id="github" className="scroll-mt-6">
            <GithubConnect
              initialStatus={githubStatus}
              repositoriesHref="/dashboard/new-deployment/create"
            />
          </div>

          <section className="rounded-lg border border-line bg-surface p-5 text-center shadow-card">
            <div className="py-2 text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-[8px] bg-canvas text-ink-muted">
                <Rocket className="size-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-sm font-semibold tracking-[-0.01em] text-ink-strong">
                No active deployments
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Your deployments and servers will show up here with status and live logs.
              </p>
              <Link
                href="/dashboard/new-deployment/create"
                className="mt-4 inline-flex h-9 items-center justify-center rounded-[6px] bg-brand px-4 text-xs font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Create deployment
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
