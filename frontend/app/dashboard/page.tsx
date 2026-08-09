import { auth, clerkClient, currentUser } from "@clerk/nextjs/server"
import { ArrowRight, Check, Rocket, Server, Waypoints } from "lucide-react"
import Link from "next/link"

import { LockedNotice } from "@/components/dashboard/locked-notice"
import { GithubConnect } from "@/components/deployment/github-connect"
import { canUseFeature } from "@/lib/feature-guard"
import { getFeatures } from "@/lib/feature-store"
import {
  getGithubStatus,
  type GithubStatus,
} from "@tisiops/server/services/github"

const stats = [
  { label: "Deployments", value: "0", icon: Rocket },
  { label: "Active servers", value: "0", icon: Server },
  { label: "AI actions", value: "0", icon: Waypoints },
  { label: "Failed deployments", value: "0", icon: Rocket },
]

const card = "rounded-lg border border-line bg-surface p-5 shadow-card"

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
  // Locking Overview cannot redirect here — that loops. Render the notice instead.
  if (!(await canUseFeature("overview"))) {
    return <LockedNotice feature="Overview" />
  }

  const user = await currentUser()
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? null

  // Resolved here so the checklist and the card below can never disagree
  // about whether GitHub is connected.
  const githubStatus = await readGithubStatus()
  const githubConnected = githubStatus.state === "repo_access_granted"

  // Set when a guard bounced the user off a locked route.
  const { locked } = await searchParams
  const lockedName = getFeatures().find(
    (feature) => feature.key === locked
  )?.name

  const setupSteps = [
    {
      title: "Connect GitHub",
      detail: "So TisiOps can read your repositories.",
      done: githubConnected,
      action: { label: "Connect", href: "#github" },
    },
    {
      title: "Choose a cloud provider",
      detail: "AWS or your own server over SSH.",
      done: false,
      action: { label: "Choose", href: "/dashboard/new-deployment/create" },
    },
    {
      title: "Deploy your first app",
      detail: "TisiOps writes the plan and shows it before anything runs.",
      done: false,
      action: { label: "Deploy", href: "/dashboard/new-deployment/create" },
    },
  ]

  return (
    <div>
      {lockedName ? (
        <p className="mb-6 rounded-[6px] border border-line bg-surface px-4 py-3 text-sm text-ink-default">
          <span className="font-semibold text-ink-strong">{lockedName}</span> is
          locked. Ask an admin to enable it.
        </p>
      ) : null}

      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Welcome back{displayName ? `, ${displayName}` : ""}.
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Manage your deployments, servers, and AI DevOps actions from one place.
      </p>

      {/* Signature element: the command bar from the landing page, brought inside. */}
      <Link
        href="/dashboard/ai-console"
        className="group mt-7 flex items-center gap-3 rounded-[6px] border border-line bg-surface py-3 pr-3 pl-5 shadow-float transition-colors duration-150 ease-out hover:border-line-warm"
      >
        <Waypoints className="size-4 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-brand">Ask TisiOps</span>
          <span className="text-ink-muted">
            {" "}
            to deploy, restart, roll back, or explain a failure…
          </span>
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-brand text-white transition-colors duration-150 ease-out group-hover:bg-brand-hover">
          <ArrowRight className="size-4" aria-hidden />
        </span>
      </Link>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={card}>
            <div className="flex items-center gap-2">
              <stat.icon className="size-4 text-ink-muted" aria-hidden />
              <p className="text-sm font-medium text-ink-muted">{stat.label}</p>
            </div>
            <p className="mt-2 font-heading text-3xl font-medium tracking-[-0.03em] text-ink-strong">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">
            Get set up
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Three steps to your first deployment.
          </p>

          <ol className="mt-5 flex flex-col">
            {setupSteps.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-wrap items-center gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done
                      ? "bg-brand-soft text-brand"
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
                  <span className="text-sm font-medium text-brand">Done</span>
                ) : (
                  <Link
                    href={step.action.href}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-4 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
                  >
                    {step.action.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-4">
          <div id="github" className="scroll-mt-6">
            <GithubConnect
              initialStatus={githubStatus}
              repositoriesHref="/dashboard/new-deployment/create"
            />
          </div>

          <section className={`${card} flex flex-1 flex-col justify-center`}>
            <div className="py-2 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-[8px] bg-canvas text-ink-muted">
                <Rocket className="size-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-sm font-semibold tracking-[-0.01em] text-ink-strong">
                No deployments yet
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Your deployments show up here with status and logs.
              </p>
              <Link
                href="/dashboard/new-deployment/create"
                className="mt-4 inline-flex h-9 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-4 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
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
