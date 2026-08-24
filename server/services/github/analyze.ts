import type { ClerkUsersApi } from "./status"

/**
 * Repository inspection for github_agent.
 *
 * Everything here reads GitHub with the signed-in user's own token, fetched
 * per call from Clerk — no caller can pass one in, so no user can inspect
 * another user's repository. The token never leaves this module.
 *
 * Read-only by construction: only GET requests are ever issued.
 *
 * Cost shape: one git-tree call returns every path in the repository, which
 * is what makes nested-service detection cheap — candidate folders are found
 * in that single response, and only their manifests are fetched as content.
 */

const API = "https://api.github.com"

/** Folders that conventionally hold a deployable app inside a larger repo. */
const CANDIDATE_DIRECTORIES = [
  "frontend",
  "client",
  "web",
  "app",
  "server",
  "backend",
  "api",
]

/** Containers whose children are services, rather than services themselves. */
const WORKSPACE_DIRECTORIES = ["packages", "apps", "services"]

/** Any of these makes a directory worth analysing as its own service. */
const MANIFESTS = [
  "package.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "astro.config.mjs",
  "astro.config.ts",
  "Dockerfile",
  "requirements.txt",
  "pyproject.toml",
  "manage.py",
  "pom.xml",
  "go.mod",
]

const MAX_SERVICES = 8

type PackageJson = {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  engines?: { node?: string }
}

export type CodeDependency =
  | "Postgres"
  | "Redis"
  | "MySQL"
  | "MongoDB"
  | "SQLite"

export type DockerInfo = {
  hasDockerfile: boolean
  compose: boolean
  /** Service names declared in docker-compose.yml, e.g. ["web", "db"]. */
  services: string[]
  /** Mapped ports, e.g. ["3000:3000"]. */
  ports: string[]
  healthcheck: boolean
  /** Dockerfile EXPOSE ports. */
  exposedPorts: string[]
}

export type ConfigFiles = {
  caddyfile: boolean
  nginx: boolean
}

/** How the code expects to be deployed, in one flat shape. */
export type CodeProfile = {
  repository: string
  owner: string
  architecture: string
  runtime: string | null
  nodeVersion: string | null
  packageManager: string | null
  build: string | null
  start: string | null
  port: number | null
  dependencies: string[]
  services: string[]
  environment: string[]
  deployment: string
}

export type ProjectType =
  "frontend" | "backend" | "fullstack" | "static" | "docker" | "unknown"

export type Deployability =
  | "ready"
  | "needs_env_vars"
  | "needs_backend_target"
  | "needs_docker_or_server"
  | "insufficient_information"

export type ServiceAnalysis = {
  name: string
  /** Repository-relative directory. Empty string means the repository root. */
  path: string
  projectType: ProjectType
  framework: string | null
  runtime: string | null
  /** Expected Node major from `.nvmrc` or `engines.node`, e.g. "22". */
  nodeVersion: string | null
  packageManager: string | null
  buildCommand: string | null
  startCommand: string | null
  appPort: number | null
  envKeys: string[]
  envSources: string[]
  recommendedTarget: string
  deployability: Deployability
  vercelReady: boolean
  /** Why Vercel is not the right home for this service, when it is not. */
  vercelNote: string | null
  missing: string[]
  /** Runtime dependencies, e.g. ["Postgres", "Redis"]. */
  dependencies: CodeDependency[]
  docker: DockerInfo
  configFiles: ConfigFiles
  healthEndpoint: string | null
}

export type RepoAnalysis = {
  repository: string
  owner: string
  branch: string
  isMonorepo: boolean
  services: ServiceAnalysis[]
  workflows: string[]
  summary: string

  // Flattened view of the primary service, so callers that care about one
  // answer ("what framework is this?") do not have to walk the list.
  framework: string | null
  runtime: string | null
  nodeVersion: string | null
  packageManager: string | null
  buildCommand: string | null
  startCommand: string | null
  projectType: ProjectType
  envKeys: string[]
  envSources: string[]
  hasDockerfile: boolean
  vercelReady: boolean
  deployability: Deployability
  recommendedTarget: string
  missing: string[]

  // Repo-wide view: the union of everything any service needs.
  dependencies: CodeDependency[]
  docker: DockerInfo
  configFiles: ConfigFiles
  healthEndpoint: string | null
  codeProfile: CodeProfile
}

export const VERCEL_TARGET = "TisiOps Managed Vercel Preview"
export const BACKEND_TARGET = "Railway / Render / Fly.io / TisiOps VPS (later)"

/** Sent when a user asks to put a long-running server on Vercel. */
export const SERVER_ON_VERCEL_EXPLANATION =
  "The server folder can only run on Vercel if it is structured as serverless functions or Next.js API routes. A normal Node/Express backend should be deployed to Railway, Render, Fly.io, or TisiOps VPS later. For now, TisiOps can deploy the /frontend folder to Managed Vercel Preview and prepare a backend deployment plan."

async function githubToken(
  clerkUserId: string,
  users: ClerkUsersApi
): Promise<string | null> {
  try {
    const stored = await users.getUserOauthAccessToken(clerkUserId, "github")
    return stored.data[0]?.token ?? null
  } catch {
    return null
  }
}

/** Read-only: this helper only ever issues GET requests. */
async function github(path: string, token: string): Promise<Response | null> {
  try {
    return await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TisiOps",
      },
    })
  } catch {
    return null
  }
}

async function readTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  const response = await github(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token
  )
  if (!response?.ok) return []

  const body = (await response.json()) as { tree?: { path: string }[] }
  return (body.tree ?? []).map((entry) => entry.path)
}

async function readFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  const response = await github(
    `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    token
  )
  if (!response?.ok) return null

  const body = (await response.json()) as {
    content?: string
    encoding?: string
  }
  if (!body.content) return null

  return Buffer.from(
    body.content,
    body.encoding === "base64" ? "base64" : "utf8"
  )
    .toString("utf8")
    .slice(0, 20000)
}

export type Branches = {
  branches: string[]
  defaultBranch: string
  stagingBranch: string | null
}

export async function readBranches(
  clerkUserId: string,
  users: ClerkUsersApi,
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<Branches | null> {
  const token = await githubToken(clerkUserId, users)
  if (!token) return null

  const response = await github(
    `/repos/${owner}/${repo}/branches?per_page=100`,
    token
  )
  if (!response?.ok) return null

  const body = (await response.json()) as { name: string }[]
  const branches = body.map((entry) => entry.name)

  return {
    branches,
    defaultBranch,
    stagingBranch:
      branches.find((name) => /^(staging|develop|dev)$/i.test(name)) ?? null,
  }
}

/** Environment variable names only — values are never read or returned. */
function envKeysFrom(envExample: string | null): string[] {
  if (!envExample) return []

  return Array.from(
    new Set(
      envExample
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map((line) => line.split("=")[0]?.trim() ?? "")
        .filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    )
  ).slice(0, 50)
}

/** Reads a PORT default out of .env.example, when one is written there. */
function portFrom(envExample: string | null): number | null {
  const match = envExample?.match(/^\s*(?:APP_)?PORT\s*=\s*"?(\d{2,5})"?/m)
  return match ? Number(match[1]) : null
}

const FRONTEND_FRAMEWORKS = [
  "Next.js",
  "Nuxt",
  "SvelteKit",
  "Astro",
  "Vite",
  "Create React App",
  "React",
  "Vue",
]

/** Long-running processes: a preview host cannot keep these alive. */
const LONG_RUNNING_FRAMEWORKS = [
  "Express",
  "Fastify",
  "NestJS",
  "Koa",
  "Django",
  "Flask",
  "FastAPI",
  "Python",
  "Java",
  "Go",
]

type DirectoryFacts = {
  path: string
  paths: string[]
  packageJson: PackageJson | null
  envExample: string | null
  nvmrc: string | null
  compose: string | null
  dockerfile: string | null
  caddyfile: string | null
  nginx: string | null
}

function detectFramework(facts: DirectoryFacts): string | null {
  const deps = {
    ...facts.packageJson?.dependencies,
    ...facts.packageJson?.devDependencies,
  }
  const has = (name: string) => name in deps
  const file = (pattern: RegExp) =>
    facts.paths.some((path) => pattern.test(path))

  if (has("next") || file(/^next\.config\./)) return "Next.js"
  if (has("nuxt") || file(/^nuxt\.config\./)) return "Nuxt"
  if (has("@sveltejs/kit")) return "SvelteKit"
  if (has("astro") || file(/^astro\.config\./)) return "Astro"
  if (has("@nestjs/core")) return "NestJS"
  // react-scripts is the only reliable Create React App marker, and it is the
  // only React setup whose output really is `build`.
  if (has("react-scripts")) return "Create React App"
  if (has("vite") || file(/^vite\.config\./)) return "Vite"
  if (has("react")) return "React"
  if (has("vue")) return "Vue"
  if (has("express")) return "Express"
  if (has("fastify")) return "Fastify"
  if (has("koa")) return "Koa"
  if (file(/^manage\.py$/)) return "Django"
  if (file(/^(requirements\.txt|pyproject\.toml)$/)) return "Python"
  if (file(/^pom\.xml$/)) return "Java"
  if (file(/^go\.mod$/)) return "Go"
  if (file(/^index\.html$/) || file(/\.html$/)) return "HTML/CSS/JS Website"
  return null
}

function detectPackageManager(paths: string[]): string | null {
  if (paths.includes("pnpm-lock.yaml")) return "pnpm"
  if (paths.includes("yarn.lock")) return "yarn"
  if (paths.includes("bun.lockb")) return "bun"
  if (paths.includes("package-lock.json")) return "npm"
  return null
}

/** Expected Node major from `.nvmrc` or `engines.node`, e.g. "22". */
export function detectNodeVersion(
  pkg: PackageJson | null,
  nvmrc: string | null
): string | null {
  const engines = pkg?.engines as { node?: string } | undefined
  const source = nvmrc?.trim() || engines?.node?.trim()
  if (!source) return null
  const match = source.match(/(\d+)/)
  return match ? match[1] : null
}

const DEP_PACKAGES: Record<string, CodeDependency> = {
  pg: "Postgres",
  "pg-promise": "Postgres",
  postgres: "Postgres",
  postgresql: "Postgres",
  "@prisma/client": "Postgres",
  redis: "Redis",
  ioredis: "Redis",
  mysql: "MySQL",
  mysql2: "MySQL",
  mariadb: "MySQL",
  mongodb: "MongoDB",
  mongoose: "MongoDB",
  "better-sqlite3": "SQLite",
  sqlite3: "SQLite",
}

const DEP_IMAGES: [string, CodeDependency][] = [
  ["postgres", "Postgres"],
  ["redis", "Redis"],
  ["mysql", "MySQL"],
  ["mariadb", "MySQL"],
  ["mongo", "MongoDB"],
]

function orderedDeps(set: Set<CodeDependency>): CodeDependency[] {
  const order: CodeDependency[] = ["Postgres", "Redis", "MySQL", "MongoDB", "SQLite"]
  return order.filter((dep) => set.has(dep))
}

/** Runtime dependencies declared in package.json dependencies only. */
export function dependenciesFromPackage(pkg: PackageJson | null): CodeDependency[] {
  const names = Object.keys({
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  })
  const found = new Set<CodeDependency>()
  for (const name of names) {
    const dep = DEP_PACKAGES[name]
    if (dep) found.add(dep)
  }
  return orderedDeps(found)
}

/** Runtime dependencies implied by docker-compose image names. */
export function dependenciesFromCompose(
  compose: string | null
): CodeDependency[] {
  if (!compose) return []
  const found = new Set<CodeDependency>()
  for (const [image, dep] of DEP_IMAGES) {
    if (new RegExp(`\\b${image}(?::|\\s)`).test(compose)) found.add(dep)
  }
  return orderedDeps(found)
}

export function parseCompose(content: string | null): {
  services: string[]
  ports: string[]
  healthcheck: boolean
} {
  if (!content) return { services: [], ports: [], healthcheck: false }
  const services = new Set<string>()
  const ports = new Set<string>()
  let healthcheck = false
  for (const raw of content.split("\n")) {
    const indent = raw.match(/^ */)?.[0].length ?? 0
    const line = raw.trim()
    // Top-level service names sit at exactly two spaces: "  web:".
    if (indent === 2 && /^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      services.add(line.replace(/:\s*$/, ""))
    }
    const port = line.match(/^-\s*"?(\d{2,5}(?::\d{2,5})?)"?$/)
    if (indent >= 4 && port) ports.add(port[1]!)
    if (/^healthcheck\s*:/i.test(line)) healthcheck = true
  }
  return { services: [...services], ports: [...ports], healthcheck }
}

export function exposedPorts(dockerfile: string | null): string[] {
  if (!dockerfile) return []
  const out = new Set<string>()
  for (const line of dockerfile.split("\n")) {
    const match = line.match(/^\s*EXPOSE\s+([0-9\s]+)\s*$/i)
    if (match) {
      for (const port of match[1]!.split(/\s+/).filter(Boolean)) out.add(port)
    }
  }
  return [...out]
}

/** A health endpoint path, when the files name one, e.g. "/health". */
export function healthEndpoint(
  compose: string | null,
  dockerfile: string | null
): string | null {
  const haystack = `${compose ?? ""}\n${dockerfile ?? ""}`
  const match = haystack.match(/\/(?:api\/)?(?:healthz?|readyz?|livez?|ping)\b/i)
  return match?.[0] ?? null
}

export function buildCodeProfile(
  repository: string,
  owner: string,
  primary: ServiceAnalysis,
  deps: CodeDependency[],
  repoHasCompose: boolean
): CodeProfile {
  return {
    repository,
    owner,
    architecture: primary.projectType === "static" ? "website" : primary.projectType,
    runtime: primary.runtime,
    nodeVersion: primary.nodeVersion,
    packageManager: primary.packageManager,
    build: primary.buildCommand,
    start: primary.startCommand,
    port: primary.appPort,
    dependencies: deps,
    services: primary.docker.services,
    environment: primary.envKeys,
    deployment: repoHasCompose ? "Docker Compose" : primary.recommendedTarget,
  }
}

function detectProjectType(
  facts: DirectoryFacts,
  framework: string | null
): ProjectType {
  const hasDocker =
    facts.paths.includes("Dockerfile") ||
    facts.paths.includes("docker-compose.yml")

  if (framework && FRONTEND_FRAMEWORKS.includes(framework)) return "frontend"
  if (framework === "HTML/CSS/JS Website" || framework === "Static site") return "static"
  if (framework && LONG_RUNNING_FRAMEWORKS.includes(framework)) return "backend"
  if (hasDocker) return "docker"

  // A package.json with a start script and no frontend framework is a server.
  if (facts.packageJson?.scripts?.start) return "backend"
  return "unknown"
}

/**
 * Deployment target and readiness for one service.
 *
 * Vercel is recommended only for frontends and static sites. A long-running
 * server is not "not ready" — it is ready for a different host, and saying so
 * is more useful than calling it a failure.
 */
function classify(service: {
  framework: string | null
  projectType: ProjectType
  buildCommand: string | null
  envKeys: string[]
}): Pick<
  ServiceAnalysis,
  | "deployability"
  | "recommendedTarget"
  | "vercelReady"
  | "vercelNote"
  | "missing"
> {
  const missing: string[] = []

  if (service.projectType === "frontend" || service.projectType === "static") {
    if (!service.buildCommand && service.projectType === "frontend") {
      missing.push("No build script in package.json")
    }

    if (service.envKeys.length > 0) {
      missing.unshift(
        `${service.envKeys.length} environment variable${service.envKeys.length === 1 ? "" : "s"} to supply`
      )
    }

    return {
      deployability: missing.length > 0 ? "needs_env_vars" : "ready",
      recommendedTarget: VERCEL_TARGET,
      vercelReady: true,
      vercelNote: null,
      missing,
    }
  }

  if (service.projectType === "backend") {
    return {
      deployability: "needs_backend_target",
      recommendedTarget: BACKEND_TARGET,
      vercelReady: false,
      vercelNote:
        "A long-running server only runs on Vercel as serverless functions or Next.js API routes.",
      missing: ["A backend host — this MVP deploys frontends to Vercel only"],
    }
  }

  if (service.projectType === "docker") {
    return {
      deployability: "needs_docker_or_server",
      recommendedTarget: BACKEND_TARGET,
      vercelReady: false,
      vercelNote: "Vercel previews do not run Docker images.",
      missing: ["A container host — Vercel previews are frontend only"],
    }
  }

  return {
    deployability: "insufficient_information",
    recommendedTarget: "Unknown",
    vercelReady: false,
    vercelNote: null,
    missing: ["No framework or package manifest detected in this folder"],
  }
}

function analyseDirectory(facts: DirectoryFacts): ServiceAnalysis {
  const framework = detectFramework(facts)
  const projectType = detectProjectType(facts, framework)
  const envKeys = envKeysFrom(facts.envExample)
  const scripts = facts.packageJson?.scripts ?? {}

  const envSources: string[] = []
  if (facts.envExample) {
    envSources.push(`${facts.path === "" ? "" : `${facts.path}/`}.env.example`)
  }

  const buildCommand = scripts.build ? "npm run build" : null

  const docker = parseCompose(facts.compose)
  const dockerInfo: DockerInfo = {
    hasDockerfile: facts.paths.includes("Dockerfile") || Boolean(facts.dockerfile),
    compose: Boolean(facts.compose),
    services: docker.services,
    ports: docker.ports,
    healthcheck: docker.healthcheck,
    exposedPorts: exposedPorts(facts.dockerfile),
  }

  const dependencies = orderedDeps(
    new Set([
      ...dependenciesFromPackage(facts.packageJson),
      ...dependenciesFromCompose(facts.compose),
    ])
  )

  return {
    name: facts.path === "" ? "root" : facts.path,
    path: facts.path,
    projectType,
    framework,
    runtime: facts.packageJson
      ? "Node.js"
      : framework === "Python" || framework === "Django"
        ? "Python"
        : framework === "Go"
          ? "Go"
          : framework === "Java"
            ? "Java"
            : null,
    nodeVersion: detectNodeVersion(facts.packageJson, facts.nvmrc),
    packageManager: detectPackageManager(facts.paths),
    buildCommand,
    startCommand: scripts.start
      ? "npm start"
      : scripts.dev
        ? "npm run dev"
        : null,
    appPort: portFrom(facts.envExample),
    envKeys,
    envSources,
    dependencies,
    docker: dockerInfo,
    configFiles: {
      caddyfile: Boolean(facts.caddyfile),
      nginx: Boolean(facts.nginx),
    },
    healthEndpoint: healthEndpoint(facts.compose, facts.dockerfile),
    ...classify({ framework, projectType, buildCommand, envKeys }),
  }
}

/** Directories worth analysing, derived from the full path list. */
function candidateDirectories(paths: string[], hints: string[]): string[] {
  const hasManifest = (directory: string) =>
    MANIFESTS.some((manifest) =>
      paths.includes(directory === "" ? manifest : `${directory}/${manifest}`)
    )

  const found: string[] = []
  if (hasManifest("")) found.push("")

  for (const directory of CANDIDATE_DIRECTORIES) {
    if (hasManifest(directory)) found.push(directory)
  }

  // packages/* and apps/* hold services one level deeper.
  for (const workspace of WORKSPACE_DIRECTORIES) {
    const children = new Set(
      paths
        .filter((path) => path.startsWith(`${workspace}/`))
        .map((path) => path.split("/").slice(0, 2).join("/"))
    )
    for (const child of children) {
      if (hasManifest(child) && !found.includes(child)) found.push(child)
    }
  }

  // A path the user pointed at wins even if it is not a conventional name.
  for (const hint of hints) {
    const clean = hint.replace(/^\/+|\/+$/g, "")
    if (clean !== "" && !found.includes(clean) && hasManifest(clean)) {
      found.push(clean)
    }
  }

  return found.slice(0, MAX_SERVICES)
}

function summarise(
  repo: string,
  services: ServiceAnalysis[],
  isMonorepo: boolean
): string {
  if (services.length === 0) {
    return `${repo}: no deployable project detected. TisiOps checked the repository root and the usual app folders.`
  }

  if (!isMonorepo) {
    const only = services[0]!
    const displayType = only.projectType === "static" ? "website" : only.projectType
    return `${repo}: ${only.framework ?? "unknown framework"} (${displayType}).`
  }

  const parts = services.map(
    (service) =>
      `/${service.path || "root"} ${service.framework ?? (service.projectType === "static" ? "website" : service.projectType)}`
  )
  return `${repo}: monorepo with ${services.length} services — ${parts.join(", ")}.`
}

/**
 * Reads a repository and analyses every service inside it.
 *
 * `pathHints` come from the user correcting or narrowing the search
 * ("the frontend is inside /frontend"); they are analysed in addition to the
 * conventional folders, never instead of them.
 *
 * Returns null when GitHub cannot be read at all, so callers can say so
 * rather than presenting guesses as findings.
 */
export async function analyzeRepository(
  clerkUserId: string,
  users: ClerkUsersApi,
  input: { owner: string; repo: string; branch: string; pathHints?: string[] }
): Promise<RepoAnalysis | null> {
  const token = await githubToken(clerkUserId, users)
  if (!token) return null

  const paths = await readTree(token, input.owner, input.repo, input.branch)
  const directories = candidateDirectories(paths, input.pathHints ?? [])

  const analysed = await Promise.all(
    directories.map(async (directory): Promise<ServiceAnalysis> => {
      const prefix = directory === "" ? "" : `${directory}/`
      const local = paths
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((path) => path !== "")

      const [packageJsonRaw, envExample, nvmrcRaw, composeRaw, dockerfileRaw, caddyRaw, nginxRaw] =
        await Promise.all([
          local.includes("package.json")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}package.json`,
                input.branch
              )
            : Promise.resolve(null),
          local.includes(".env.example")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}.env.example`,
                input.branch
              )
            : Promise.resolve(null),
          local.includes(".nvmrc")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}.nvmrc`,
                input.branch
              )
            : Promise.resolve(null),
          local.includes("docker-compose.yml")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}docker-compose.yml`,
                input.branch
              )
            : Promise.resolve(null),
          local.includes("Dockerfile")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}Dockerfile`,
                input.branch
              )
            : Promise.resolve(null),
          local.includes("Caddyfile")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}Caddyfile`,
                input.branch
              )
            : Promise.resolve(null),
          local.includes("nginx.conf")
            ? readFile(
                token,
                input.owner,
                input.repo,
                `${prefix}nginx.conf`,
                input.branch
              )
            : Promise.resolve(null),
        ])

      let packageJson: PackageJson | null = null
      try {
        packageJson = packageJsonRaw
          ? (JSON.parse(packageJsonRaw) as PackageJson)
          : null
      } catch {
        packageJson = null
      }

      return analyseDirectory({
        path: directory,
        paths: local,
        packageJson,
        envExample,
        nvmrc: nvmrcRaw,
        compose: composeRaw,
        dockerfile: dockerfileRaw,
        caddyfile: caddyRaw,
        nginx: nginxRaw,
      })
    })
  )

  // A repository root that only holds workspace config is not itself a
  // service — drop it once real services were found in subfolders.
  const nested = analysed.filter((service) => service.path !== "")
  const services =
    nested.length > 0 && analysed.some((service) => service.path === "")
      ? analysed.filter(
          (service) => service.path !== "" || service.projectType !== "unknown"
        )
      : analysed

  const isMonorepo =
    services.filter((service) => service.path !== "").length > 1

  // The service a single-answer question is about: a deployable frontend
  // first, then anything identified, then whatever we have.
  const primary =
    services.find((service) => service.vercelReady) ??
    services.find((service) => service.projectType !== "unknown") ??
    services[0] ??
    analyseDirectory({
      path: "",
      paths,
      packageJson: null,
      envExample: null,
      nvmrc: null,
      compose: null,
      dockerfile: null,
      caddyfile: null,
      nginx: null,
    })

  const dependencies = orderedDeps(
    new Set(services.flatMap((service) => service.dependencies))
  )
  const repoHasCompose = services.some((service) => service.docker.compose)

  return {
    repository: input.repo,
    owner: input.owner,
    branch: input.branch,
    isMonorepo,
    services,
    workflows: paths.filter((path) =>
      /^\.github\/workflows\/.+\.(ya?ml)$/.test(path)
    ),
    summary: summarise(input.repo, services, isMonorepo),

    framework: primary.framework,
    runtime: primary.runtime,
    nodeVersion: primary.nodeVersion,
    packageManager: primary.packageManager,
    buildCommand: primary.buildCommand,
    startCommand: primary.startCommand,
    projectType: isMonorepo ? "fullstack" : primary.projectType,
    envKeys: primary.envKeys,
    envSources: services.flatMap((service) => service.envSources),
    hasDockerfile:
      paths.includes("Dockerfile") || paths.includes("docker-compose.yml"),
    vercelReady: primary.vercelReady,
    deployability: primary.deployability,
    recommendedTarget: primary.recommendedTarget,
    missing: primary.missing,

    dependencies,
    docker: {
      hasDockerfile: primary.docker.hasDockerfile,
      compose: repoHasCompose,
      services: Array.from(
        new Set(services.flatMap((service) => service.docker.services))
      ),
      ports: Array.from(
        new Set(services.flatMap((service) => service.docker.ports))
      ),
      healthcheck: services.some((service) => service.docker.healthcheck),
      exposedPorts: Array.from(
        new Set(services.flatMap((service) => service.docker.exposedPorts))
      ),
    },
    configFiles: {
      caddyfile: services.some((service) => service.configFiles.caddyfile),
      nginx: services.some((service) => service.configFiles.nginx),
    },
    healthEndpoint:
      services.find((service) => service.healthEndpoint)?.healthEndpoint ?? null,
    codeProfile: buildCodeProfile(
      input.repo,
      input.owner,
      primary,
      dependencies,
      repoHasCompose
    ),
  }
}
