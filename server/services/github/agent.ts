import {
  analyzeRepository,
  readBranches,
  SERVER_ON_VERCEL_EXPLANATION,
  type RepoAnalysis,
  type ServiceAnalysis,
} from "./analyze"
import type { GithubIntent } from "./intent"
import { listRepositories, type Repository } from "./repos"
import { getGithubStatus, type ClerkUsersApi } from "./status"

/**
 * github_agent — every GitHub-related console request lands here.
 *
 * Two rules hold throughout:
 *   - nothing is reported unless GitHub was actually read, so the assistant
 *     never claims to have checked repositories it could not see
 *   - every read uses the signed-in user's own token, so one user's results
 *     can never contain another user's repositories
 */

export const CONNECT_PROMPT =
  "Connect GitHub so TisiOps can inspect your repositories and recommend what can be deployed."

/** Repositories scanned in one audit. Each costs GitHub calls, so it is capped. */
const AUDIT_LIMIT = 8

/** Where the conversation currently is, so follow-ups need no repeat. */
export type RepoContext = {
  owner: string
  name: string
  branch: string
  servicePath: string | null
}

type WithContext = { context?: RepoContext }

export type GithubAgentResponse = (
  | {
      type: "github_connection_required"
      intent: GithubIntent
      message: string
      /** Distinguishes "no GitHub at all" from "signed in, no repo access". */
      githubState: string
    }
  | {
      type: "github_repo_list"
      intent: GithubIntent
      message: string
      repositories: Repository[]
    }
  | {
      type: "github_deployability_audit"
      intent: GithubIntent
      message: string
      results: RepoAnalysis[]
      scanned: number
      total: number
    }
  | {
      type: "github_repo_analysis"
      intent: GithubIntent
      message: string
      analysis: RepoAnalysis
    }
  | {
      type: "github_branch_analysis"
      intent: GithubIntent
      message: string
      repository: string
      defaultBranch: string
      branches: string[]
      stagingBranch: string | null
      suggestion: string
    }
  | {
      type: "github_vercel_readiness"
      intent: GithubIntent
      message: string
      analysis: RepoAnalysis
      ready: boolean
      /** The folder the answer is about, when the question named one. */
      service: ServiceAnalysis | null
      /** What can be deployed instead, when the named folder cannot. */
      alternative: string | null
    }
  | {
      type: "github_env_analysis"
      intent: GithubIntent
      message: string
      repository: string
      envKeys: string[]
      sources: string[]
      warning: string
    }
  | {
      type: "github_repo_structure_analysis"
      intent: GithubIntent
      message: string
      analysis: RepoAnalysis
    }
  | {
      type: "github_cicd_analysis"
      intent: GithubIntent
      message: string
      repository: string
      workflows: string[]
      plan: string[]
    }
  | {
      type: "github_repo_choice_required"
      intent: GithubIntent
      message: string
      repositories: Repository[]
    }
  | {
      type: "github_write_refused"
      intent: GithubIntent
      message: string
      plan: string[]
    }
  | { type: "error"; intent: GithubIntent; message: string }
) &
  WithContext

const ENV_WARNING =
  "These are variable names only. Never paste secret values into chat — add them in the deployment form, where they are encrypted before storage."

const CICD_PLAN = [
  "Add a workflow that runs on pushes to the deployment branch",
  "Install dependencies with the detected package manager",
  "Run the build command and fail the run on build errors",
  "Call the TisiOps deployment API once the build passes",
  "Report the deployment status back to the commit",
]

/**
 * Finds which repository the message is about by matching the user's actual
 * repository names against it. Guessing is deliberately avoided: when nothing
 * matches, the caller asks the user to pick.
 */
export function matchRepository(
  text: string,
  repositories: Repository[]
): Repository | null {
  const haystack = text.toLowerCase()

  // Longest name first, so "client-dashboard" wins over "client".
  const byLength = [...repositories].sort(
    (a, b) => b.name.length - a.name.length
  )

  return (
    byLength.find(
      (repo) =>
        haystack.includes(repo.fullName.toLowerCase()) ||
        haystack.includes(repo.name.toLowerCase())
    ) ?? null
  )
}

/**
 * Folder the user is pointing at: "/frontend", "the server folder", "deploy
 * the frontend". Matched against the paths actually found in the repository,
 * so a guess can never send the user to a folder that does not exist.
 */
export function matchServicePath(
  text: string,
  services: ServiceAnalysis[]
): string | null {
  const haystack = text.toLowerCase()
  const named = services
    .filter((service) => service.path !== "")
    .sort((a, b) => b.path.length - a.path.length)

  return (
    named.find((service) => {
      const path = service.path.toLowerCase()
      return (
        haystack.includes(`/${path}`) ||
        new RegExp(`\\b${path}\\b`).test(haystack)
      )
    })?.path ?? null
  )
}

/**
 * Folder corrections the user typed ("the frontend is inside /frontend").
 * These are analysed on top of the conventional folders, so a correction is
 * acted on rather than ignored.
 */
export function extractPathHints(text: string): string[] {
  const hints = new Set<string>()

  for (const match of text.matchAll(/(?:^|\s)\/([A-Za-z0-9._-]{1,40})/g)) {
    hints.add(match[1]!)
  }
  for (const match of text.matchAll(
    /\b(?:inside|in|under|at)\s+\/?([A-Za-z0-9._-]{1,40})\s*(?:folder|directory|dir)?\b/gi
  )) {
    hints.add(match[1]!)
  }
  for (const match of text.matchAll(
    /\b([A-Za-z0-9._-]{1,40})\s+(?:folder|directory)\b/gi
  )) {
    hints.add(match[1]!)
  }

  return Array.from(hints).filter(
    (hint) => !["the", "a", "my", "this", "that", "is", "in"].includes(hint)
  )
}

const READ_ONLY_PLAN = [
  "TisiOps reads repositories, branches, and config files only",
  "Write actions — commits, pushes, merges, settings, secrets — are not enabled",
  "Review the suggested plan, then make the change yourself on GitHub",
]

/** Every service's variables, de-duplicated, for a repo-wide answer. */
function allEnvKeys(analysis: RepoAnalysis): string[] {
  return Array.from(
    new Set(analysis.services.flatMap((service) => service.envKeys))
  )
}

function summarise(analysis: RepoAnalysis): string {
  return analysis.summary
}

/**
 * Runs one GitHub intent for the signed-in user.
 *
 * `clerkUserId` comes from the Clerk session at the route, never from a
 * request body.
 */
export async function runGithubAgent(input: {
  clerkUserId: string
  users: ClerkUsersApi
  intent: GithubIntent
  text: string
  /** Repository this conversation is already about, when there is one. */
  context?: RepoContext | null
}): Promise<GithubAgentResponse & { context?: RepoContext }> {
  const { clerkUserId, users, intent, text } = input

  // A write request is refused before any lookup: the answer is the same
  // whether or not the repository exists.
  if (intent === "github_write_request") {
    return {
      type: "github_write_refused",
      intent,
      message:
        "TisiOps is read-only on GitHub in MVP mode. I can inspect repositories and suggest a plan, but I will not push code, change settings, or modify workflows.",
      plan: READ_ONLY_PLAN,
    }
  }

  // Nothing is read before the connection is confirmed.
  const status = await getGithubStatus(clerkUserId, users)
  if (status.state !== "repo_access_granted") {
    return {
      type: "github_connection_required",
      intent,
      message: CONNECT_PROMPT,
      githubState: status.state,
    }
  }

  const list = await listRepositories(clerkUserId, users)
  if (list.source !== "github") {
    return {
      type: "error",
      intent,
      message:
        list.source === "error"
          ? list.error
          : "Could not read your repositories from GitHub.",
    }
  }

  const repositories = list.repositories

  if (intent === "github_list_repositories") {
    return {
      type: "github_repo_list",
      intent,
      message: `You have ${repositories.length} repositor${repositories.length === 1 ? "y" : "ies"} available to TisiOps.`,
      repositories,
    }
  }

  if (intent === "github_repo_deployability_audit") {
    const scanned = repositories.slice(0, AUDIT_LIMIT)
    const results = (
      await Promise.all(
        scanned.map((repo) =>
          analyzeRepository(clerkUserId, users, {
            owner: repo.owner,
            repo: repo.name,
            branch: repo.defaultBranch,
          })
        )
      )
    ).filter((result): result is RepoAnalysis => result !== null)

    const ready = results.filter((result) => result.deployability === "ready")

    return {
      type: "github_deployability_audit",
      intent,
      message:
        ready.length > 0
          ? `${ready.length} of ${results.length} scanned repositories can deploy today: ${ready.map((r) => r.repository).join(", ")}.`
          : `None of the ${results.length} scanned repositories are ready to deploy as-is. Each card lists what is missing.`,
      results,
      scanned: results.length,
      total: repositories.length,
    }
  }

  // Everything below is about one repository. A name in the message wins;
  // otherwise the conversation's active repository answers "this repo".
  const named = matchRepository(text, repositories)
  const remembered =
    input.context &&
    repositories.find(
      (repo) =>
        repo.owner.toLowerCase() === input.context!.owner.toLowerCase() &&
        repo.name.toLowerCase() === input.context!.name.toLowerCase()
    )

  const repository = named ?? remembered ?? null
  if (!repository) {
    return {
      type: "github_repo_choice_required",
      intent,
      message:
        "Which repository should I look at? Pick one and I will run the check.",
      repositories,
    }
  }

  const branch = (!named && input.context?.branch) || repository.defaultBranch

  if (intent === "github_branch_analysis") {
    const branches = await readBranches(
      clerkUserId,
      users,
      repository.owner,
      repository.name,
      branch
    )

    if (!branches) {
      return {
        type: "error",
        intent,
        message: "Could not read branches for this repository.",
      }
    }

    return {
      type: "github_branch_analysis",
      intent,
      message: branches.stagingBranch
        ? `${repository.name} has a ${branches.stagingBranch} branch you can deploy as a staging preview.`
        : `${repository.name} has no staging or develop branch. Create one, or deploy ${branches.defaultBranch} as a preview.`,
      repository: repository.fullName,
      defaultBranch: branches.defaultBranch,
      branches: branches.branches,
      stagingBranch: branches.stagingBranch,
      suggestion: branches.stagingBranch
        ? `Deploy ${branches.stagingBranch} to a TisiOps Managed Vercel Preview.`
        : `Create a staging branch, or use ${branches.defaultBranch} for the preview deployment.`,
    }
  }

  // A correction like "the frontend is inside /frontend" is analysed too.
  const analysis = await analyzeRepository(clerkUserId, users, {
    owner: repository.owner,
    repo: repository.name,
    branch,
    pathHints: extractPathHints(text),
  })

  if (!analysis) {
    return {
      type: "error",
      intent,
      message: "Could not read this repository from GitHub.",
    }
  }

  // Which folder the question is about: one named now, else one chosen
  // earlier in the conversation.
  const servicePath =
    matchServicePath(text, analysis.services) ??
    input.context?.servicePath ??
    null
  const service =
    analysis.services.find((item) => item.path === servicePath) ?? null

  const context: RepoContext = {
    owner: repository.owner,
    name: repository.name,
    branch,
    servicePath: service?.path ?? null,
  }

  if (intent === "github_vercel_readiness") {
    // Asked about a specific folder that cannot run on Vercel — say why, and
    // point at the part of the repository that can.
    if (service && !service.vercelReady) {
      const frontend = analysis.services.find((item) => item.vercelReady)

      return {
        type: "github_vercel_readiness",
        intent,
        context,
        message:
          service.projectType === "backend"
            ? SERVER_ON_VERCEL_EXPLANATION
            : `/${service.path} cannot run on a Vercel preview. ${service.vercelNote ?? ""} Recommended target: ${service.recommendedTarget}.`,
        analysis,
        ready: false,
        service,
        alternative: frontend
          ? `TisiOps can deploy /${frontend.path || "the repository root"} to Managed Vercel Preview instead.`
          : null,
      }
    }

    const target = service ?? analysis.services.find((item) => item.vercelReady)

    return {
      type: "github_vercel_readiness",
      intent,
      context,
      message: target?.vercelReady
        ? `${analysis.repository}${target.path ? ` /${target.path}` : ""} looks suitable for a TisiOps Managed Vercel Preview${target.envKeys.length > 0 ? `, once you supply ${target.envKeys.length} environment variable${target.envKeys.length === 1 ? "" : "s"}` : ""}.`
        : `${analysis.repository} has no frontend this MVP can deploy to Vercel. ${analysis.summary}`,
      analysis,
      ready: Boolean(target?.vercelReady),
      service: target ?? null,
      alternative: null,
    }
  }

  if (intent === "github_env_analysis") {
    return {
      type: "github_env_analysis",
      intent,
      context,
      message:
        analysis.envKeys.length > 0
          ? `${analysis.repository} declares ${analysis.envKeys.length} environment variable${analysis.envKeys.length === 1 ? "" : "s"}.`
          : `No environment variables are declared in ${analysis.repository}. Add a .env.example to document them.`,
      repository: analysis.repository,
      envKeys: service ? service.envKeys : allEnvKeys(analysis),
      sources: service ? service.envSources : analysis.envSources,
      warning: ENV_WARNING,
    }
  }

  if (intent === "github_repo_structure_analysis") {
    return {
      type: "github_repo_structure_analysis",
      intent,
      context,
      message: `${analysis.repository} looks like a ${analysis.projectType} project. Recommended target: ${analysis.recommendedTarget}.`,
      analysis,
    }
  }

  if (intent === "github_cicd_analysis") {
    return {
      type: "github_cicd_analysis",
      intent,
      context,
      message:
        analysis.workflows.length > 0
          ? `${analysis.repository} already has ${analysis.workflows.length} GitHub Actions workflow${analysis.workflows.length === 1 ? "" : "s"}.`
          : `${analysis.repository} has no GitHub Actions workflows. Here is a plan — TisiOps will not write files to your repository.`,
      repository: analysis.repository,
      workflows: analysis.workflows,
      plan: CICD_PLAN,
    }
  }

  return {
    type: "github_repo_analysis",
    intent,
    context,
    message: summarise(analysis),
    analysis,
  }
}
