/**
 * AI Console intent classification.
 *
 * Rules, not a model call: classification runs on every message, and a
 * deterministic table is free, instant, and testable against the exact
 * phrasings the product promises to understand.
 *
 * Order matters. The list is read top to bottom and the first match wins, so
 * narrow intents (CI/CD, env vars) sit above broad ones (list repositories).
 */

export type ConsoleIntent =
  | "github_list_repositories"
  | "github_repo_deployability_audit"
  | "github_single_repo_analysis"
  | "github_branch_analysis"
  | "github_vercel_readiness"
  | "github_env_analysis"
  | "github_repo_structure_analysis"
  | "github_cicd_analysis"
  | "github_write_request"
  | "vercel_deployment"
  | "deployment_planning"
  | "general_answer"
  | "out_of_scope"

export const GITHUB_INTENTS = [
  "github_list_repositories",
  "github_repo_deployability_audit",
  "github_single_repo_analysis",
  "github_branch_analysis",
  "github_vercel_readiness",
  "github_env_analysis",
  "github_repo_structure_analysis",
  "github_cicd_analysis",
  "github_write_request",
] as const

export type GithubIntent = (typeof GITHUB_INTENTS)[number]

export function isGithubIntent(intent: ConsoleIntent): intent is GithubIntent {
  return (GITHUB_INTENTS as readonly string[]).includes(intent)
}

const VERCEL = /\bvercel\b/i
const REPO_WORD = /\b(repo|repos|repository|repositories|project|projects)\b/i
const GITHUB_WORD = /\bgit\s?hub\b|\bgithub\b/i

/** "which repos", "all repos", "my repos" — a sweep rather than one project. */
const PLURAL_SCOPE =
  /\b(which|what|all|any|every|each)\b[\s\w]{0,20}\b(repo|repos|repository|repositories|project|projects)\b|\brepos\b|\brepositories\b/i

/**
 * Imperative "deploy it" phrasing, as opposed to "can it deploy?". These keep
 * going straight to vercel_deployment_agent so the existing one-step deploy
 * is not turned into a two-step readiness check.
 */
/** "Can I deploy X?" asks about fitness; "Deploy X" is an instruction. */
const QUESTION_OPENER =
  /^\s*(can|could|is|are|does|do|did|should|would|will|which|what|how|why|who)\b/i

const DEPLOY_IMPERATIVE =
  /^(please\s+)?(deploy|host|ship|publish|launch)\b|\b(deploy|host|ship|publish)\s+(my|this|the|it)\b/i

/**
 * `selfEvident` rules use vocabulary that means only one thing inside a DevOps
 * console — "CI/CD", ".env", "monorepo" — so they fire without the message
 * naming a repository. The rest ("analyze", "show") are too generic on their
 * own and stay gated behind a repository or GitHub word.
 */
type Rule = {
  intent: ConsoleIntent
  test: (text: string) => boolean
  selfEvident?: true
}

const RULES: Rule[] = [
  {
    // Checked before everything else: a write request must be refused, not
    // quietly answered as if it were a read.
    intent: "github_write_request",
    selfEvident: true,
    test: (text) =>
      /\b(delete|remove|drop)\b[\s\w]{0,20}\b(repo|repository|branch|workflow|secret|collaborator)\b/i.test(
        text
      ) ||
      /\b(push|commit|merge)\b[\s\w]{0,20}\b(code|change|changes|branch|pull request|pr|main|master)\b/i.test(
        text
      ) ||
      /\b(create|add|write|update|modify|edit)\b[\s\w]{0,20}\b(commit|workflow file|github action|secret|branch protection|collaborator|repo settings)\b/i.test(
        text
      ) ||
      /\brename (the )?(repo|repository|branch)\b|\bforce push\b/i.test(text) ||
      /\b(change|update|edit|modify)\b[\s\w]{0,20}\b(repo|repository|branch)\b[\s\w]{0,10}\bsettings?\b/i.test(
        text
      ),
  },
  {
    intent: "github_cicd_analysis",
    selfEvident: true,
    test: (text) =>
      /\bci\s?\/?\s?cd\b|\bgithub actions\b|\bworkflows?\b|\bpipelines?\b/i.test(
        text
      ),
  },
  {
    intent: "github_env_analysis",
    selfEvident: true,
    test: (text) =>
      /\benv(ironment)?\s*(vars?|variables?)\b|\.env\b|\benv requirements?\b|\benv needs?\b/i.test(
        text
      ),
  },
  {
    intent: "github_branch_analysis",
    selfEvident: true,
    test: (text) => /\bbranch(es)?\b|\bstaging\b|\bdevelop\b/i.test(text),
  },
  {
    intent: "github_repo_structure_analysis",
    selfEvident: true,
    test: (text) =>
      /\bmono\s?repo\b|\bproject structure\b|\bstructure\b|\bfolders?\b|\bfrontend (and|or) backend\b|\bbackend (and|or) frontend\b/i.test(
        text
      ),
  },
  {
    // Imperative deploys go to the deployment flow; questions about fitness
    // go to the readiness card, which offers a Deploy button.
    intent: "vercel_deployment",
    selfEvident: true,
    test: (text) =>
      VERCEL.test(text) &&
      DEPLOY_IMPERATIVE.test(text) &&
      !QUESTION_OPENER.test(text),
  },
  {
    intent: "github_repo_deployability_audit",
    selfEvident: true,
    test: (text) =>
      /\bdeployable\b|\bwhat can i deploy\b|\bwhat i can deploy\b|\bfind deployable\b|\banalyz(e|se) all\b|\baudit\b/i.test(
        text
      ) ||
      // "Which repo can go to Vercel?" sweeps every repo; "Which repos are
      // Vercel ready?" is answered by the readiness rule further down.
      // Plural scope with any inspection verb sweeps every repository
      // instead of stopping to ask the user which one they meant.
      (PLURAL_SCOPE.test(text) &&
        /\bdeploy\b|\bgo(es)? to\b|\bcan go\b|\banalyz(e|se)\b|\bcheck\b|\bscan\b|\breview\b/i.test(
          text
        )),
  },
  {
    intent: "github_vercel_readiness",
    selfEvident: true,
    test: (text) => VERCEL.test(text),
  },
  {
    intent: "github_single_repo_analysis",
    test: (text) =>
      /\banalyz(e|se)\b|\bwhat framework\b|\bwhich framework\b|\bcheck (this|my|the)\b|\binspect\b/i.test(
        text
      ) &&
      (REPO_WORD.test(text) || GITHUB_WORD.test(text)),
  },
  {
    intent: "github_list_repositories",
    test: (text) =>
      /\b(show|list|open|see|view|display|get)\b[\s\w]{0,20}\b(repo|repos|repository|repositories|projects)\b/i.test(
        text
      ) ||
      /\bwhat repos\b|\bwhich repos\b|\bmy repos\b|\bmy repositories\b/i.test(
        text
      ) ||
      (GITHUB_WORD.test(text) && /\bconnected\b/i.test(text)),
  },
]

const OPS_TOPIC =
  /\b(deploy|deployment|server|servers|docker|container|infra|infrastructure|host|hosting|scale|scaling|rollback|roll back|restart|pipeline|ci\/cd|nginx|caddy|ssl|https|domain|dns|logs|monitor|monitoring|production|staging|build|failing|failure|outage|downtime)\b/i

/**
 * Classifies one console message.
 *
 * A GitHub rule only fires when the message is actually about a repository —
 * "check my branches" in a Git context, not "branch" in a bank sense — so
 * every GitHub rule is gated on a repository or GitHub word, except those
 * whose vocabulary is unambiguous on its own.
 *
 * `out_of_scope` is not decided here: keyword matching cannot separate a
 * medical question from a DevOps one, so the chat system prompt refuses those.
 * The label stays in the union because the API contract names it.
 */
export function detectIntent(text: string): ConsoleIntent {
  const mentionsRepo = REPO_WORD.test(text) || GITHUB_WORD.test(text)

  for (const rule of RULES) {
    if (!rule.test(text)) continue
    if (rule.selfEvident || mentionsRepo) return rule.intent
  }

  if (
    VERCEL.test(text) &&
    DEPLOY_IMPERATIVE.test(text) &&
    !QUESTION_OPENER.test(text)
  ) {
    return "vercel_deployment"
  }

  return OPS_TOPIC.test(text) ? "deployment_planning" : "general_answer"
}
