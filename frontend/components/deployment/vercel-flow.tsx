"use client"

import { Check, Loader2, Lock, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { GithubConnect } from "@/components/deployment/github-connect"
import { Select } from "@/components/ui/select"
import { apiFetch } from "@/lib/api"
import { card, inputClass, primaryButton, secondaryButton } from "@/lib/ui"
import type { SafeDeployment } from "@tisiops/server/services/deployments"
import type { Repository } from "@tisiops/server/services/github/repos"
import type { RepoAnalysis } from "@tisiops/server/services/github/analyze"
import type { VercelFlowStart } from "@tisiops/server/services/vercel"

/**
 * The guided TisiOps Managed Vercel Preview flow.
 *
 * One component serves both entry points — the AI Console and the "Vercel
 * Frontend" template — so the two can never drift apart. It fetches its own
 * state from /api/deployments/vercel/start rather than receiving it, which is
 * what keeps the two callers identical.
 *
 * Environment variable values live in component state only until approval and
 * are cleared immediately after. They are never written to storage, never put
 * in a URL, and never rendered back as text.
 */

type Step = "connect" | "repo" | "branch" | "analysis" | "env" | "plan"

type EnvRow = { key: string; value: string; target: EnvTarget }
type EnvTarget = "PRODUCTION" | "PREVIEW" | "DEVELOPMENT"

const TARGETS: EnvTarget[] = ["PRODUCTION", "PREVIEW", "DEVELOPMENT"]

const STEP_ORDER: Step[] = [
  "connect",
  "repo",
  "branch",
  "analysis",
  "env",
  "plan",
]
const STEP_LABELS: Record<Step, string> = {
  connect: "GitHub",
  repo: "Repository",
  branch: "Branch",
  analysis: "Analysis",
  env: "Environment",
  plan: "Plan",
}

const MUTED_BADGE =
  "rounded-[4px] bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted"

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** Decisions already made, one monospace line each. */
function Ledger({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null

  return (
    <dl className="mb-4 flex flex-col gap-1 border-l-2 border-brand pl-3">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3 text-xs">
          <dt className="w-24 shrink-0 font-semibold tracking-[0.06em] text-ink-muted uppercase">
            {row.label}
          </dt>
          <dd className="font-mono break-all text-ink-strong">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function StepRail({ current }: { current: Step }) {
  const index = STEP_ORDER.indexOf(current)

  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEP_ORDER.map((step, position) => (
        <li
          key={step}
          aria-current={step === current ? "step" : undefined}
          className={
            position === index
              ? "font-semibold text-brand"
              : position < index
                ? "text-ink-default"
                : "text-ink-muted"
          }
        >
          {STEP_LABELS[step]}
          {position < STEP_ORDER.length - 1 ? (
            <span className="ml-2 text-line-warm" aria-hidden>
              /
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

export function VercelFlow() {
  const router = useRouter()
  const [start, setStart] = useState<VercelFlowStart | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>("connect")

  const [repository, setRepository] = useState<Repository | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null)
  /** Monorepo folder to deploy. Empty string means the repository root. */
  const [servicePath, setServicePath] = useState<string>("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [envRows, setEnvRows] = useState<EnvRow[]>([
    { key: "", value: "", target: "PREVIEW" },
  ])
  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<VercelFlowStart>("/api/deployments/vercel/start")
      .then((next) => {
        if (!active) return
        setStart(next)
        // Skip straight to repository choice when GitHub is already usable.
        if (next.github.state === "repo_access_granted") setStep("repo")
      })
      .catch(() => {
        if (active) setLoadError("Could not start the deployment flow.")
      })

    return () => {
      active = false
    }
  }, [])

  // The chosen folder decides the framework, build command, and root
  // directory — a monorepo root says nothing useful about its frontend.
  const service =
    analysis?.services.find((item) => item.path === servicePath) ??
    analysis?.services.find((item) => item.vercelReady) ??
    analysis?.services[0] ??
    null
  const framework = service?.framework ?? null
  // Mirrors outputDirectoryFor() on the server: Next.js must send nothing,
  // which is what the "build" default broke.
  const outputDirectoryLabel =
    framework === "Vite" || framework === "Astro" || framework === "Vue"
      ? "dist"
      : framework === "Create React App"
        ? "build"
        : "Default / managed by Vercel"
  const namedEnv = envRows.filter(
    (row) => row.key.trim() !== "" && row.value !== ""
  )

  const ledger = [
    repository ? { label: "Repo", value: repository.fullName } : null,
    branch ? { label: "Branch", value: branch } : null,
    framework ? { label: "Framework", value: framework } : null,
    analysis
      ? { label: "Root dir", value: servicePath || "repository root" }
      : null,
    step === "plan"
      ? {
          label: "Env vars",
          value: `${namedEnv.length} variable${namedEnv.length === 1 ? "" : "s"}`,
        }
      : null,
  ].filter((row) => row !== null)

  async function selectBranch(value: string) {
    if (!repository) return
    setBranch(value)
    setStep("analysis")
    setIsAnalyzing(true)
    setError(null)

    try {
      const result = await apiFetch<{ analysis: RepoAnalysis }>(
        "/api/deployments/vercel/analyze",
        {
          method: "POST",
          body: JSON.stringify({
            repositoryOwner: repository.owner,
            repositoryName: repository.name,
            branch: value,
          }),
        }
      )
      setAnalysis(result.analysis)
      // Default to the folder that can actually deploy.
      setServicePath(
        result.analysis.services.find((item) => item.vercelReady)?.path ??
          result.analysis.services[0]?.path ??
          ""
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed")
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function approve() {
    if (!repository || !branch) return

    setIsDeploying(true)
    setError(null)

    try {
      const deployment = await apiFetch<SafeDeployment>(
        "/api/deployments/vercel/approve",
        {
          method: "POST",
          body: JSON.stringify({
            appName: servicePath || repository.name,
            repositoryName: repository.name,
            repositoryOwner: repository.owner,
            repositoryUrl: repository.url,
            branch,
            framework,
            servicePath: servicePath || null,
            buildCommand: service?.buildCommand ?? null,
            environmentVariables: namedEnv,
            approved: true,
          }),
        }
      )

      // The values have been sent; drop them before anything else renders.
      setEnvRows([{ key: "", value: "", target: "PREVIEW" }])
      router.push(`/dashboard/deployments/${deployment.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Deployment failed")
      setIsDeploying(false)
    }
  }

  if (loadError) {
    return (
      <section className={`${card} mt-3`}>
        <p role="alert" className="text-sm text-[#a8341f]">
          {loadError}
        </p>
      </section>
    )
  }

  if (!start) {
    return (
      <section
        className={`${card} mt-3 flex items-center gap-3 text-sm text-ink-muted`}
      >
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Preparing the deployment flow…
      </section>
    )
  }

  const repositories = start.repositories.repositories
  const isMockRepos = start.repositories.source === "mock"
  const branches = repository
    ? Array.from(new Set([repository.defaultBranch, "main"]))
    : []

  return (
    <section className={`${card} mt-3`}>
      <div className="mb-4 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="font-heading text-base font-semibold tracking-[-0.01em] text-ink-strong">
            {start.title}
          </h3>
          <span className="rounded-[4px] border border-brand px-2 py-0.5 text-xs font-semibold text-brand">
            {start.badge}
          </span>
          {!start.vercelConfigured ? (
            <span className={MUTED_BADGE}>MVP placeholder</span>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-ink-muted">{start.description}</p>
        <p className="mt-1 text-sm text-ink-muted">{start.note}</p>
      </div>

      <StepRail current={step} />
      <Ledger rows={ledger} />

      {step === "connect" ? (
        <div>
          <GithubConnect />
          <p className="mt-4 text-sm text-ink-muted">
            TisiOps needs GitHub access to list your repositories and deploy the
            selected project. Vercel is provided by TisiOps — you do not connect
            one.
          </p>
          <button
            type="button"
            onClick={() => setStep("repo")}
            className={`mt-4 ${secondaryButton}`}
          >
            {start.github.state === "repo_access_granted"
              ? "Select Repository"
              : "Continue with sample repositories"}
          </button>
        </div>
      ) : null}

      {step === "repo" ? (
        <div>
          <h4 className="text-sm font-semibold text-ink-strong">
            Select a repository
          </h4>
          {isMockRepos ? (
            <p className="mt-1.5 text-sm text-ink-muted">
              {start.repositories.source === "mock"
                ? start.repositories.note
                : null}
            </p>
          ) : null}
          {start.repositories.source === "error" ? (
            <p className="mt-1.5 text-sm text-[#a8341f]">
              {start.repositories.error}
            </p>
          ) : null}

          <ul className="mt-3 flex flex-col gap-2">
            {repositories.map((repo) => (
              <li key={repo.fullName}>
                <button
                  type="button"
                  onClick={() => {
                    setRepository(repo)
                    setBranch(null)
                    setAnalysis(null)
                    setStep("branch")
                  }}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] border border-line-warm bg-surface px-3.5 py-2.5 text-left text-sm transition-colors duration-150 ease-out hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="font-mono text-ink-strong">{repo.name}</span>
                  <span className="text-ink-muted">{repo.owner}</span>
                  <span className={MUTED_BADGE}>
                    {repo.private ? "Private" : "Public"}
                  </span>
                  {repo.language ? (
                    <span className={MUTED_BADGE}>{repo.language}</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-3 text-xs text-ink-muted">
                    <span className="font-mono">{repo.defaultBranch}</span>
                    <span>{formatDate(repo.updatedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setStep("connect")}
            className={`mt-4 ${secondaryButton}`}
          >
            Back
          </button>
        </div>
      ) : null}

      {step === "branch" && repository ? (
        <div>
          <h4 className="text-sm font-semibold text-ink-strong">
            Select a branch
          </h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {branches.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void selectBranch(option)}
                className="h-9 rounded-[6px] border border-line-warm px-3.5 font-mono text-sm text-ink-default transition-colors duration-150 ease-out hover:border-brand hover:text-brand"
              >
                {option}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStep("repo")}
            className={`mt-4 ${secondaryButton}`}
          >
            Back
          </button>
        </div>
      ) : null}

      {step === "analysis" ? (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-sm font-semibold text-ink-strong">
              Repository analysis
            </h4>
            {analysis?.isMonorepo ? (
              <span className={MUTED_BADGE}>Monorepo</span>
            ) : null}
          </div>

          {isAnalyzing ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden
              />
              Analyzing the repository…
            </p>
          ) : null}

          {analysis ? (
            <>
              <p className="mt-2 text-sm text-ink-default">
                {analysis.summary}
              </p>

              {analysis.services.length > 1 ? (
                <div className="mt-3">
                  <p className="text-sm font-medium text-ink-strong">
                    Root directory
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {analysis.services.map((item) => (
                      <button
                        key={item.path || "root"}
                        type="button"
                        onClick={() => setServicePath(item.path)}
                        aria-pressed={item.path === servicePath}
                        className={`h-9 rounded-[6px] border px-3.5 font-mono text-sm transition-colors duration-150 ease-out ${
                          item.path === servicePath
                            ? "border-brand bg-brand-soft text-brand"
                            : "border-line-warm text-ink-default hover:bg-canvas"
                        }`}
                      >
                        /{item.path || "root"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {[
                  {
                    label: "Root Directory",
                    value: servicePath || "repository root",
                  },
                  {
                    label: "Framework",
                    value: service?.framework ?? "Not detected",
                  },
                  {
                    label: "Runtime",
                    value: service?.runtime ?? "Not detected",
                  },
                  {
                    label: "Package Manager",
                    value: service?.packageManager ?? "Not detected",
                  },
                  {
                    label: "Build Command",
                    value: service?.buildCommand ?? "Framework default",
                  },
                  { label: "Output Directory", value: outputDirectoryLabel },
                  {
                    label: "Recommended Target",
                    value: service?.recommendedTarget ?? "Unknown",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex gap-3 text-sm">
                    <dt className="w-44 shrink-0 text-ink-muted">
                      {row.label}
                    </dt>
                    <dd className="font-medium text-ink-strong">{row.value}</dd>
                  </div>
                ))}
              </dl>

              {service && !service.vercelReady ? (
                <p className="mt-3 rounded-[6px] border border-line bg-canvas px-3.5 py-3 text-sm text-ink-default">
                  /{service.path || "root"} is a {service.projectType} service.{" "}
                  {service.vercelNote ?? ""} Recommended target:{" "}
                  {service.recommendedTarget}.
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setStep("branch")}
                  className={secondaryButton}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={service ? !service.vercelReady : false}
                  onClick={() => setStep("env")}
                  className={primaryButton}
                >
                  Add environment variables
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {step === "env" ? (
        <div>
          <h4 className="text-sm font-semibold text-ink-strong">
            Environment variables
          </h4>
          <p className="mt-1.5 text-sm text-ink-muted">
            Enter them here, never in the chat. Values are encrypted before
            storage and are never shown again after you leave this step.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {envRows.map((row, index) => (
              <div key={index} className="flex flex-wrap items-start gap-2">
                <input
                  value={row.key}
                  onChange={(event) =>
                    setEnvRows((rows) =>
                      rows.map((item, position) =>
                        position === index
                          ? { ...item, key: event.target.value }
                          : item
                      )
                    )
                  }
                  placeholder="NEXT_PUBLIC_API_URL"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`Variable ${index + 1} name`}
                  className={`${inputClass} mt-0 min-w-40 flex-1 font-mono`}
                />
                <input
                  type="password"
                  value={row.value}
                  onChange={(event) =>
                    setEnvRows((rows) =>
                      rows.map((item, position) =>
                        position === index
                          ? { ...item, value: event.target.value }
                          : item
                      )
                    )
                  }
                  placeholder="Value"
                  autoComplete="off"
                  aria-label={`Variable ${index + 1} value`}
                  className={`${inputClass} mt-0 min-w-40 flex-1 font-mono`}
                />
                <div className="w-36 shrink-0">
                  <Select
                    label={`Variable ${index + 1} environment`}
                    value={row.target}
                    onValueChange={(next) =>
                      setEnvRows((rows) =>
                        rows.map((item, position) =>
                          position === index
                            ? { ...item, target: next as EnvTarget }
                            : item
                        )
                      )
                    }
                    className="mt-0"
                    options={TARGETS.map((target) => ({
                      value: target,
                      label: target.charAt(0) + target.slice(1).toLowerCase(),
                    }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEnvRows((rows) =>
                      rows.length === 1
                        ? [{ key: "", value: "", target: "PREVIEW" }]
                        : rows.filter((_, position) => position !== index)
                    )
                  }
                  aria-label={`Remove variable ${index + 1}`}
                  className="mt-1 shrink-0 rounded-[4px] p-1.5 text-ink-muted transition-colors duration-150 ease-out hover:text-brand"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setEnvRows((rows) => [
                ...rows,
                { key: "", value: "", target: "PREVIEW" },
              ])
            }
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover"
          >
            <Plus className="size-3.5" aria-hidden />
            Add variable
          </button>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep("analysis")}
              className={secondaryButton}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep("plan")}
              className={primaryButton}
            >
              Generate plan
            </button>
          </div>
        </div>
      ) : null}

      {step === "plan" ? (
        <div>
          <h4 className="text-sm font-semibold text-ink-strong">
            Website Deployment Plan
          </h4>

          <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-[6px] border border-line bg-canvas p-4 sm:grid-cols-2">
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Repository</dt>
              <dd className="font-mono font-medium text-ink-strong">{repository?.fullName}</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Branch</dt>
              <dd className="font-mono font-medium text-ink-strong">{branch}</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Root Directory</dt>
              <dd className="font-medium text-ink-strong">{servicePath || "repository root"}</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Framework/Type</dt>
              <dd className="font-medium text-ink-strong">{framework ?? "Website Project"}</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Target</dt>
              <dd className="font-medium text-ink-strong">TisiOps Managed Vercel Preview</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Build Command</dt>
              <dd className="font-medium text-ink-strong">{service?.buildCommand ?? "Framework default"}</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Output Directory</dt>
              <dd className="font-medium text-ink-strong">{outputDirectoryLabel}</dd>
            </div>
            <div className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">Expected URL</dt>
              <dd className="font-mono font-medium text-brand">https://tisiops-preview.vercel.app</dd>
            </div>
          </dl>

          <p className="mt-4 text-sm text-ink-muted">TisiOps will:</p>
          <ol className="mt-2 flex flex-col gap-2">
            {start.plan.map((planStep, index) => (
              <li key={planStep} className="flex gap-3 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-canvas text-xs font-semibold text-ink-muted">
                  {index + 1}
                </span>
                <span className="text-ink-default">{planStep}</span>
              </li>
            ))}
          </ol>

          <p className="mt-4 flex items-start gap-2.5 rounded-[6px] border border-line bg-brand-soft px-3.5 py-3 text-sm font-medium text-brand">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            No deployment will start until you approve this plan.
          </p>

          {!start.vercelConfigured ? (
            <p className="mt-3 rounded-[6px] border border-line bg-canvas px-3.5 py-3 text-sm text-ink-default">
              MVP placeholder: real Vercel deployment execution is not enabled
              yet. Approving records the deployment, its plan, and its logs
              without building anything.
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3.5 py-3 text-sm text-[#a8341f]"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep("env")}
              className={secondaryButton}
            >
              Back
            </button>
            <button
              type="button"
              disabled={isDeploying}
              onClick={() => void approve()}
              className={primaryButton}
            >
              {isDeploying ? (
                <>
                  <Loader2
                    className="mr-2 size-4 motion-safe:animate-spin"
                    aria-hidden
                  />
                  Deploying…
                </>
              ) : (
                <>
                  <Check className="mr-2 size-4" aria-hidden />
                  Approve and Deploy
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
