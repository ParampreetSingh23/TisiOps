"use client"

import { AlertCircle, Check, GitBranch, Lock } from "lucide-react"
import { useState } from "react"

import { GithubConnect } from "@/components/deployment/github-connect"
import { VercelFlow } from "@/components/deployment/vercel-flow"
import { card, primaryButton, secondaryButton } from "@/lib/ui"
import type { GithubAgentResponse } from "@tisiops/server/services/github/agent"
import type {
  Deployability,
  RepoAnalysis,
  ServiceAnalysis,
} from "@tisiops/server/services/github/analyze"

/**
 * Renders github_agent results as cards.
 *
 * These are live-turn only: the chat transcript stores the assistant's text,
 * not the findings, so reopening an old conversation shows what was said
 * rather than re-running GitHub calls against a repository that has since
 * changed.
 */

const DEPLOYABILITY: Record<
  Deployability,
  { label: string; className: string }
> = {
  ready: {
    label: "Ready to deploy",
    className: "border-[#cfe6dc] bg-[#f2f9f6] text-[#0f6b4f]",
  },
  needs_env_vars: {
    label: "Needs env vars",
    className: "border-brand bg-brand-soft text-brand",
  },
  needs_backend_target: {
    label: "Needs backend target",
    className: "border-line-warm bg-canvas text-ink-muted",
  },
  needs_docker_or_server: {
    label: "Needs server setup",
    className: "border-line-warm bg-canvas text-ink-muted",
  },
  insufficient_information: {
    label: "Not enough information",
    className: "border-line-warm bg-canvas text-ink-muted",
  },
}

const MUTED_BADGE =
  "rounded-[4px] bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-40 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 font-medium break-words text-ink-strong">
        {value}
      </dd>
    </div>
  )
}

/**
 * One service inside a repository. A monorepo answer is a list of these,
 * because "the repo" is not the unit that gets deployed — a folder is.
 */
function ServiceCard({
  service,
  onDeploy,
  onAsk,
}: {
  service: ServiceAnalysis
  onDeploy: () => void
  onAsk: (text: string) => void
}) {
  const status = DEPLOYABILITY[service.deployability]

  return (
    <article className={card}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h4 className="font-mono text-sm font-semibold text-ink-strong">
          /{service.path || "root"}
        </h4>
        <span
          className={`rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
        <span className={MUTED_BADGE}>
          {service.projectType === "static" ? "website" : service.projectType}
        </span>
        {service.framework ? (
          <span className={MUTED_BADGE}>{service.framework}</span>
        ) : null}
        {service.appPort ? (
          <span className={MUTED_BADGE}>port {service.appPort}</span>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Row label="Runtime" value={service.runtime ?? "Not detected"} />
        <Row
          label="Package Manager"
          value={service.packageManager ?? "Not detected"}
        />
        <Row label="Build" value={service.buildCommand ?? "None found"} />
        <Row label="Start" value={service.startCommand ?? "None found"} />
        <Row label="Target" value={service.recommendedTarget} />
        <Row
          label="Env variables"
          value={
            service.envKeys.length > 0
              ? `${service.envKeys.length} declared`
              : "None declared"
          }
        />
      </dl>

      {service.vercelNote ? (
        <p className="mt-3 text-sm text-ink-muted">{service.vercelNote}</p>
      ) : null}
      <Missing items={service.missing} />

      <div className="mt-4 flex flex-wrap gap-3">
        {service.vercelReady ? (
          <button type="button" onClick={onDeploy} className={primaryButton}>
            Deploy {service.path ? `/${service.path}` : "frontend"} to Vercel
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              onAsk(`Create a deployment plan for /${service.path}`)
            }
            className={secondaryButton}
          >
            Create backend deployment plan
          </button>
        )}
        {service.envKeys.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              onAsk(`What env variables does /${service.path} need?`)
            }
            className={secondaryButton}
          >
            View required env variables
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            onAsk(`Build a staging environment for /${service.path}`)
          }
          className={secondaryButton}
        >
          Build staging environment
        </button>
      </div>
    </article>
  )
}

function AnalysisRows({ analysis }: { analysis: RepoAnalysis }) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <Row label="Framework" value={analysis.framework ?? "Not detected"} />
      <Row label="Runtime" value={analysis.runtime ?? "Not detected"} />
      <Row
        label="Package Manager"
        value={analysis.packageManager ?? "Not detected"}
      />
      <Row
        label="Build Command"
        value={analysis.buildCommand ?? "None found"}
      />
      <Row
        label="Start Command"
        value={analysis.startCommand ?? "None found"}
      />
      <Row
        label="Project Type"
        value={analysis.projectType === "static" ? "Website" : analysis.projectType}
      />
      <Row
        label="Environment Variables"
        value={
          analysis.envKeys.length > 0
            ? `${analysis.envKeys.length} declared`
            : "None declared"
        }
      />
      <Row label="Recommended Target" value={analysis.recommendedTarget} />
    </dl>
  )
}

function Missing({ items }: { items: string[] }) {
  if (items.length === 0) return null

  return (
    <ul className="mt-3 flex flex-col gap-1">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-ink-muted">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-muted" />
          {item}
        </li>
      ))}
    </ul>
  )
}

export function GithubCards({
  response,
  question,
  onAsk,
}: {
  response: GithubAgentResponse
  /** The message that produced this card, reused when asking a follow-up. */
  question: string
  onAsk: (text: string) => void
}) {
  const [showDeploy, setShowDeploy] = useState(false)

  // Starting the deployment hands over to vercel_deployment_agent, which the
  // flow component drives — the same one the template page mounts.
  if (showDeploy) return <VercelFlow />

  const deployButton = (
    <button
      type="button"
      onClick={() => setShowDeploy(true)}
      className={primaryButton}
    >
      Deploy to Vercel
    </button>
  )

  if (response.type === "github_connection_required") {
    return (
      <div className="mt-3">
        <GithubConnect />
      </div>
    )
  }

  if (response.type === "error") {
    return (
      <p
        role="alert"
        className="mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3.5 py-3 text-sm text-[#a8341f]"
      >
        <AlertCircle className="mr-2 inline size-4" aria-hidden />
        {response.message}
      </p>
    )
  }

  if (
    response.type === "github_repo_list" ||
    response.type === "github_repo_choice_required"
  ) {
    const pick = response.type === "github_repo_choice_required"

    return (
      <ul className="mt-3 flex flex-col gap-2">
        {response.repositories.map((repo) => (
          <li key={repo.fullName}>
            <button
              type="button"
              onClick={() =>
                onAsk(
                  pick
                    ? `${question} ${repo.name}`
                    : `Analyze ${repo.name} repo`
                )
              }
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] border border-line-warm bg-surface px-3.5 py-2.5 text-left text-sm transition-colors duration-150 ease-out hover:border-brand"
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
                <span>{new Date(repo.updatedAt).toLocaleDateString()}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  if (response.type === "github_deployability_audit") {
    return (
      <div className="mt-3 flex flex-col gap-3">
        {response.results.map((analysis) => {
          const status = DEPLOYABILITY[analysis.deployability]

          return (
            <article key={analysis.repository} className={card}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h4 className="font-mono text-sm font-semibold text-ink-strong">
                  {analysis.repository}
                </h4>
                <span
                  className={`rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${status.className}`}
                >
                  {status.label}
                </span>
                <span className={MUTED_BADGE}>
                  {analysis.framework ?? "Unknown framework"}
                </span>
                <span className={MUTED_BADGE}>{analysis.projectType}</span>
              </div>

              <p className="mt-2 text-sm text-ink-muted">
                Recommended target: {analysis.recommendedTarget}
              </p>
              <Missing items={analysis.missing} />

              <div className="mt-4 flex flex-wrap gap-3">
                {analysis.vercelReady ? deployButton : null}
                <button
                  type="button"
                  onClick={() => onAsk(`Analyze ${analysis.repository} repo`)}
                  className={secondaryButton}
                >
                  View Details
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAsk(`Create a deployment plan for ${analysis.repository}`)
                  }
                  className={secondaryButton}
                >
                  Create Deployment Plan
                </button>
              </div>
            </article>
          )
        })}

        {response.total > response.scanned ? (
          <p className="text-sm text-ink-muted">
            Scanned the {response.scanned} most recently updated of{" "}
            {response.total} repositories.
          </p>
        ) : null}
      </div>
    )
  }

  if (
    response.type === "github_repo_analysis" ||
    response.type === "github_repo_structure_analysis"
  ) {
    const { analysis } = response

    // A monorepo answer is per service; a single-project repo keeps the
    // flat table, which reads better when there is only one thing to say.
    if (analysis.isMonorepo || analysis.services.length > 1) {
      return (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-ink-default">{analysis.summary}</p>
          {analysis.services.map((service) => (
            <ServiceCard
              key={service.path || "root"}
              service={service}
              onDeploy={() => setShowDeploy(true)}
              onAsk={onAsk}
            />
          ))}
        </div>
      )
    }

    return (
      <div className={`${card} mt-3`}>
        <AnalysisRows analysis={analysis} />
        <Missing items={analysis.missing} />
        {analysis.vercelReady ? (
          <div className="mt-4">{deployButton}</div>
        ) : null}
      </div>
    )
  }

  if (response.type === "github_write_refused") {
    return (
      <div className={`${card} mt-3`}>
        <div className="flex items-center gap-2.5">
          <Lock className="size-4 shrink-0 text-brand" aria-hidden />
          <h4 className="text-sm font-semibold text-ink-strong">
            Read-only in MVP mode
          </h4>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {response.plan.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm text-ink-muted">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-muted" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (response.type === "github_vercel_readiness") {
    return (
      <div className={`${card} mt-3`}>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-6 items-center justify-center rounded-full ${
              response.ready
                ? "bg-[#0f6b4f] text-white"
                : "bg-canvas text-ink-muted"
            }`}
          >
            {response.ready ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Lock className="size-3.5" aria-hidden />
            )}
          </span>
          <h4 className="text-sm font-semibold text-ink-strong">
            {response.ready ? "Website Deployment Plan Ready" : "Target Not Supported"}
          </h4>
        </div>

        {response.service ? (
          <p className="mt-2 font-mono text-sm text-ink-muted">
            /{response.service.path || "root"} · {response.service.projectType === "static" ? "website" : response.service.projectType}
          </p>
        ) : null}

        <AnalysisRows analysis={response.analysis} />
        <Missing items={(response.service ?? response.analysis).missing} />

        {response.alternative ? (
          <p className="mt-3 rounded-[6px] border border-line bg-brand-soft px-3.5 py-3 text-sm text-ink-default">
            {response.alternative}
          </p>
        ) : null}

        {response.ready || response.alternative ? (
          <div className="mt-4">{deployButton}</div>
        ) : null}
      </div>
    )
  }

  if (response.type === "github_branch_analysis") {
    return (
      <div className={`${card} mt-3`}>
        <dl className="flex flex-col gap-2">
          <Row label="Default branch" value={response.defaultBranch} />
          <Row
            label="Staging branch"
            value={response.stagingBranch ?? "Not found"}
          />
        </dl>

        <div className="mt-3 flex flex-wrap gap-2">
          {response.branches.map((branch) => (
            <span
              key={branch}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-mono text-xs ${
                branch === response.stagingBranch
                  ? "border-brand text-brand"
                  : "border-line-warm text-ink-default"
              }`}
            >
              <GitBranch className="size-3" aria-hidden />
              {branch}
            </span>
          ))}
        </div>

        <p className="mt-4 text-sm text-ink-default">{response.suggestion}</p>
        {response.stagingBranch ? (
          <div className="mt-4">{deployButton}</div>
        ) : null}
      </div>
    )
  }

  if (response.type === "github_env_analysis") {
    return (
      <div className={`${card} mt-3`}>
        {response.envKeys.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {response.envKeys.map((key) => (
                <span
                  key={key}
                  className="rounded-[4px] border border-line-warm px-2 py-1 font-mono text-xs text-ink-strong"
                >
                  {key}
                </span>
              ))}
            </div>
            {response.sources.length > 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Detected in {response.sources.join(", ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            No environment variables declared.
          </p>
        )}

        <p className="mt-4 flex items-start gap-2.5 rounded-[6px] border border-line bg-brand-soft px-3.5 py-3 text-sm text-ink-default">
          <Lock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          {response.warning}
        </p>
      </div>
    )
  }

  if (response.type === "github_cicd_analysis") {
    return (
      <div className={`${card} mt-3`}>
        {response.workflows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {response.workflows.map((workflow) => (
              <span
                key={workflow}
                className="rounded-[4px] border border-line-warm px-2 py-1 font-mono text-xs text-ink-strong"
              >
                {workflow}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No workflows found in .github/workflows.
          </p>
        )}

        <h4 className="mt-4 text-sm font-semibold text-ink-strong">
          Suggested CI/CD plan
        </h4>
        <ol className="mt-3 flex flex-col gap-2">
          {response.plan.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-canvas text-xs font-semibold text-ink-muted">
                {index + 1}
              </span>
              <span className="text-ink-default">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-sm text-ink-muted">
          Plan only — TisiOps does not write workflow files to your repository.
        </p>
      </div>
    )
  }

  return null
}
