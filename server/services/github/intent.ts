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
  | "github_code_profile"
  | "vercel_deployment"
  | "static_site_deployment"
  | "n8n_managed_server_deployment"
  | "postgres_managed_server_deployment"
  | "server_connection"
  | "terraform_agent"
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
  "github_code_profile",
  "static_site_deployment",
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
    intent: "github_code_profile",
    test: (text) =>
      // "code profile" / "deployment profile" mean only one thing in a DevOps
      // console, so they fire without naming a repository.
      /\b(code profile|deployment profile|build profile)\b/i.test(text) ||
      (/\bhow is (this|it|the) (repo|repository|app|project|code) built\b|\bhow should (this|it) be deployed\b|\bwhat does (this|it) need to deploy\b/i.test(
        text
      ) &&
        (REPO_WORD.test(text) || GITHUB_WORD.test(text))),
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
/**
 * Terraform questions, routed to terraform_agent.
 *
 * Checked before the repository rules because "what resources were created"
 * and "why did it fail" are about infrastructure, not GitHub, and the broad
 * repo rules would otherwise claim them.
 */
const TERRAFORM =
  /\bterraform\b|\btfstate\b|\bterraform state\b|\bdrift\b|\belastic ip\b|\bsecurity group\b|\bec2\b|\binstance id\b/i

const INFRA_QUESTION =
  /\b(what|which|why|did|does|is|are|show|check|can)\b[\s\S]{0,60}\b(created|create|provision|provisioned|infrastructure|resources?|server|instance|ip|state|plan|apply|destroy|clean\s?up|retry)\b/i

const DESTROY_WORDS =
  /\b(destroy|tear\s?down|delete)\b[\s\S]{0,30}\b(deployment|server|infrastructure|resources?|stack)\b|\bclean\s?up\b[\s\S]{0,30}\b(failed|resources?|infrastructure)\b/i

/**
 * Server-monitoring vocabulary. A monitoring question (CPU, RAM, disk, Docker,
 * container health, heartbeat, "is my server healthy") reads live metrics from a
 * server — it is NOT an infrastructure/Terraform question. This guard keeps the
 * Terraform and deployment classifiers from claiming monitoring queries. Kept
 * local to this file to avoid a circular import with the orchestrator's
 * classifier. The orchestrator's monitoring branch is the single place that
 * answers these; context must never decide intent.
 */
const SERVER_MONITORING =
  /\b(cpu|processor|memory|ram|disk|storage|docker|container|unhealthy|heartbeat|metrics?|monitoring?|health|healthy|slow|performance|lag|sluggish|usage|load)\b/i

function isServerMonitoringQuestion(text: string): boolean {
  const t = text.toLowerCase()
  if (!SERVER_MONITORING.test(t)) return false
  // A monitoring question talks about a server, or a metric word with a
  // possessive/question opener ("my cpu", "what is cpu load"). Deployment actions
  // ("deploy my app", "what will my server create") carry none of these metric
  // words, so they are not captured here.
  if (/\bserver\b/.test(t)) return true
  if (/\b(my|the|this|our)\b[\s\S]{0,20}\b(cpu|memory|ram|disk|docker|container|health|resource|load|usage|metrics?|monitoring?|heartbeat)\b/.test(t)) return true
  if (/^(what|how|is|are|show|check|see|tell|why)\b/.test(t) && /\b(cpu|memory|ram|disk|docker|container|health|resource|load|usage|metrics?|monitoring?|heartbeat)\b/.test(t)) return true
  return false
}

/** True when the message is about a deployment's infrastructure. */
export function isTerraformIntent(text: string): boolean {
  if (isServerMonitoringQuestion(text)) return false
  if (TERRAFORM.test(text)) return true
  if (DESTROY_WORDS.test(text)) return true

  // "what will be created", "why is my server missing a public ip" — infra
  // questions that never say the word Terraform.
  return INFRA_QUESTION.test(text) && !REPO_WORD.test(text)
}

/**
 * Deploying a website that needs no server.
 *
 * The word "static" is one of the least likely ways a user says this. They say
 * portfolio, landing page, docs, "put it online", "make it live" — so the rule
 * matches the *kind of thing* being deployed and the *act of publishing*,
 * rather than a vocabulary word almost nobody uses.
 *
 * This only classifies intent. Whether the repository really is static is
 * decided by the analysis step, which reads the files.
 */

/** Things that are websites rather than services. */
const SITE_NOUN =
  /\b(static\s+(site|website|page)|website|web\s?site|web\s?page|landing\s?page|portfolio|resume|cv\s+site|personal\s+site|docs?\s?(site)?|documentation|documentation\s+site|marketing\s?(page|site)?|one[\s-]?pager?|one[\s-]?page\s+(site|website)|blog|client\s+(site|website)|this\s+page|page|this\s+repo|repo)\b/i

/** Front-end vocabulary that implies no server of its own. */
const FRONTEND_TECH =
  /\bhtml\b|\bcss\b|\bvanilla\s?js\b|\bplain\s+(html|js|javascript)\b|\bbootstrap\b|\btailwind\b|\bjamstack\b|\bfront[\s-]?end(\s+only)?\b|\bstatic\s+front[\s-]?end\b|\breact(\s+app)?\b|\bvite(\s+app)?\b|\bnext(\.js)?(\s+app)?\b|\bastro(\s+site)?\b|\bhtml\s+project\b|\bcss\s+project\b|\bjavascript\s+project\b|\bjs\s+project\b/i

/** "no backend", "without a server" — said explicitly. */
const NO_BACKEND =
  /\b(no|without|w\/o)\s+(a\s+)?(backend|back[\s-]?end|server|api|database)\b|\bfront[\s-]?end\s+only\b|\bstatic\s+only\b/i

/** The act of publishing something, however phrased. */
const PUBLISH_VERB =
  /\b(deploy|host|publish|launch|ship)\b|\bput\b[\s\S]{0,20}\b(online|live|on\s+the\s+web)\b|\bmake\b[\s\S]{0,20}\blive\b|\bgo\s+live\b|\btake\b[\s\S]{0,20}\blive\b/i

/**
 * A server the user asked for by name.
 *
 * "deploy my site on a VPS" is not a static deployment even though it names a
 * site — an explicit server request wins, because the user said what they
 * wanted and guessing past it would be worse than not classifying at all.
 */
const WANTS_SERVER =
  /\b(ec2|vps|droplet|aws\s+server|virtual\s+machine|vm|docker|container|kubernetes|k8s|n8n)\b/i

/** Backend words that make "deploy my app" a service deployment. */
const BACKEND_TECH =
  /\b(express|fastapi|django|flask|spring|rails|laravel|nest(js)?|backend|back[\s-]?end|api\s+server|websocket|worker|cron|postgres|mysql|mongo|redis)\b/i

export function isStaticSiteIntent(text: string): boolean {
  if (!PUBLISH_VERB.test(text)) return false

  // An explicitly requested server always wins: the user said what they
  // wanted, and guessing past it is worse than not classifying at all.
  if (WANTS_SERVER.test(text)) return false

  // Checked before the backend words, because "without a backend" contains
  // one. A negation means the opposite of the word it negates.
  if (NO_BACKEND.test(text)) return true

  if (BACKEND_TECH.test(text)) return false

  return SITE_NOUN.test(text) || FRONTEND_TECH.test(text)
}

/**
 * Asking for an n8n server.
 *
 * The template is a product, not a set of infrastructure choices, so this is
 * checked before every other rule — otherwise "spin a new server using the n8n
 * template" lands in terraform_agent or deployment_planning, and the console
 * starts interviewing the user about regions and instance types instead of
 * proposing the one configuration TisiOps actually deploys.
 */
const N8N = /\bn8n\b/i
const POSTGRES =
  /\b(postgres|postgresql)\b|\b(create|make|provision|deploy|spin\s?up|set\s?up|setup)\b[\s\S]{0,40}\b(database|db)\b/i

const WANTS_NEW_SERVER =
  /\b(spin|spin\s?up|create|make|launch|provision|deploy|start|set\s?up|setup|install|host|run|build|new|another)\b/i

/**
 * Vocabulary about a server that already exists. A question about a failing or
 * unwanted n8n deployment belongs to the Terraform and deployment agents, and
 * proposing a second server in answer to it would be the wrong move entirely.
 */
const EXISTING_N8N =
  /\b(fail|failed|failing|error|errors|logs?|destroy|delete|remove|stop|stopped|restart|retry|broken|down|why|debug|cost|bill)\b/i

export function isN8nServerIntent(text: string): boolean {
  if (!N8N.test(text)) return false
  if (EXISTING_N8N.test(text)) return false

  return WANTS_NEW_SERVER.test(text)
}

export function isPostgresServerIntent(text: string): boolean {
  if (!POSTGRES.test(text)) return false
  if (/\b(fail|failed|failing|error|logs?|destroy|delete|remove|stop|restart|retry|broken|down|why|debug)\b/i.test(text)) return false
  return WANTS_NEW_SERVER.test(text) || /\bdatabase|db\b/i.test(text)
}

const CONNECT_SERVER =
  /\b(connect|add|bring|link)\b[\s\S]{0,30}\b(server|vps|ubuntu|host|ip|machine)\b|\b(byos|have a server|own server)\b/i

export function isServerConnectIntent(text: string): boolean {
  return CONNECT_SERVER.test(text)
}

export function detectIntent(text: string): ConsoleIntent {
  const mentionsRepo = REPO_WORD.test(text) || GITHUB_WORD.test(text)

  if (isServerConnectIntent(text)) return "server_connection"
  if (isN8nServerIntent(text)) return "n8n_managed_server_deployment"
  if (isPostgresServerIntent(text)) return "postgres_managed_server_deployment"

  if (isTerraformIntent(text)) return "terraform_agent"

  // Checked before the repository rules: "deploy my portfolio" is a
  // deployment instruction, not a question about a repository.
  if (isStaticSiteIntent(text)) return "static_site_deployment"

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
