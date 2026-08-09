import type { SourceFile } from "../github/source"

/**
 * Vercel REST client for the TisiOps-managed account.
 *
 * Deployments upload source files rather than linking a Git repository.
 * Linking is impossible here by design: a repository can only be linked to a
 * Vercel account that has a GitHub login connection to its owner, and the
 * managed account cannot have one with every user. TisiOps reads the source
 * with the user's own GitHub token instead and uploads it.
 *
 * The Vercel token is TisiOps-owned, read from the environment here only, and
 * never sent to the browser, logged, or accepted from a request.
 */

const API = "https://api.vercel.com"

/** Surfaced when Vercel still reports the old linking failure. */
export const LINKING_NOT_SUPPORTED =
  "This managed deployment cannot link user GitHub repos directly to the TisiOps Vercel account. Use source upload deployment or BYO Vercel mode."

export const PROTECTED_PREVIEW_MESSAGE =
  "Deployment was created, but the preview URL is protected by Vercel settings. Disable Vercel Deployment Protection for TisiOps-managed preview deployments."

export function isVercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN)
}

function teamQuery(extra = ""): string {
  const teamId = process.env.VERCEL_TEAM_ID
  const team = teamId ? `teamId=${encodeURIComponent(teamId)}` : ""
  const query = [team, extra].filter(Boolean).join("&")
  return query ? `?${query}` : ""
}

/** Vercel project names: lowercase, digits and dashes, 100 chars max. */
export function projectName(
  repository: string,
  servicePath?: string | null
): string {
  const prefix = process.env.VERCEL_PROJECT_PREFIX ?? "tisiops"
  const suffix = servicePath ? `-${servicePath.replace(/\//g, "-")}` : ""

  return `${prefix}-${repository}${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100)
}

/**
 * Framework slugs Vercel understands.
 *
 * Only frameworks detected from files and dependencies belong here. A
 * repository *language* ("TypeScript", "Shell") is not a framework, and
 * guessing one is what produced deployments configured as create-react-app —
 * which then failed looking for a `build` directory a Next.js app never
 * produces.
 */
const FRAMEWORK_SLUGS: Record<string, string> = {
  "next.js": "nextjs",
  nuxt: "nuxtjs",
  sveltekit: "sveltekit",
  astro: "astro",
  vite: "vite",
  "create react app": "create-react-app",
  vue: "vue",
}

/**
 * Output directory per framework.
 *
 * `null` means "send nothing and let Vercel manage it", which is the only
 * correct answer for Next.js: its output is `.next`, and naming any directory
 * makes the build fail at the end.
 */
const OUTPUT_DIRECTORIES: Record<string, string | null> = {
  "next.js": null,
  nuxt: null,
  sveltekit: null,
  vite: "dist",
  astro: "dist",
  "create react app": "build",
  vue: "dist",
}

export function frameworkSlug(framework: string | null): string | null {
  return framework ? (FRAMEWORK_SLUGS[framework.toLowerCase()] ?? null) : null
}

/** Null when Vercel should decide — never a guess. */
export function outputDirectoryFor(framework: string | null): string | null {
  if (!framework) return null
  const key = framework.toLowerCase()
  return key in OUTPUT_DIRECTORIES ? OUTPUT_DIRECTORIES[key]! : null
}

type CallResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; error: string }

async function call(
  path: string,
  token: string,
  body?: unknown
): Promise<CallResult> {
  let response: Response

  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    return { ok: false, status: 0, error: "Could not reach Vercel." }
  }

  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >

  if (!response.ok) {
    // Vercel's messages are safe to surface; they never echo the token.
    const error = (data.error ?? {}) as { message?: string }
    const message = error.message ?? `Vercel returned ${response.status}.`
    const isLinkingFailure = /login connection|failed to link/i.test(message)

    return {
      ok: false,
      status: response.status,
      error: isLinkingFailure ? LINKING_NOT_SUPPORTED : message,
    }
  }

  return { ok: true, status: response.status, data }
}

/**
 * Creates the managed project if it does not exist. Deliberately carries no
 * `gitRepository`: that field is what demanded a GitHub login connection.
 */
async function ensureProject(
  token: string,
  name: string,
  framework: string | null,
  environmentVariables: { key: string; value: string; target: string }[]
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const created = await call(`/v11/projects${teamQuery()}`, token, {
    name,
    framework: frameworkSlug(framework),
    environmentVariables: environmentVariables.map((variable) => ({
      key: variable.key,
      value: variable.value,
      target: [variable.target.toLowerCase()],
      type: "encrypted",
    })),
  })

  if (created.ok) return { ok: true, projectId: String(created.data.id ?? "") }
  if (created.status === 409) return { ok: true, projectId: name }

  return { ok: false, error: created.error }
}

export type VercelCreated = {
  ok: true
  projectId: string
  deploymentId: string
  /** Reserved, not yet proven to work — the build has not finished. */
  reservedUrl: string
}

export type VercelResult = VercelCreated | { ok: false; error: string }

/**
 * Uploads the repository source and starts a preview build.
 *
 * Returns as soon as Vercel accepts the request. The URL it hands back is
 * reserved, not live: the build runs afterwards and can still fail, so the
 * caller must wait for the real status before calling anything successful.
 */
export async function deployFromSource(input: {
  repositoryName: string
  framework: string | null
  files: SourceFile[]
  buildCommand: string | null
  /** Monorepo folder to build from, e.g. "frontend". */
  rootDirectory: string | null
  environmentVariables: { key: string; value: string; target: string }[]
}): Promise<VercelResult> {
  const token = process.env.VERCEL_TOKEN
  if (!token) return { ok: false, error: "VERCEL_TOKEN is not configured." }

  const name = projectName(input.repositoryName, input.rootDirectory)

  const project = await ensureProject(
    token,
    name,
    input.framework,
    input.environmentVariables
  )
  if (!project.ok) return { ok: false, error: project.error }

  const outputDirectory = outputDirectoryFor(input.framework)

  const deployment = await call(`/v13/deployments${teamQuery()}`, token, {
    name,
    project: name,
    // `target` is deliberately omitted. Vercel accepts only "production",
    // "staging", or a custom environment id — a preview is what you get when
    // no target is sent, and sending "preview" is rejected outright.
    files: input.files,
    projectSettings: {
      framework: frameworkSlug(input.framework),
      buildCommand: input.buildCommand,
      rootDirectory: input.rootDirectory,
      // Omitted entirely when null: sending "build" for a Next.js app is what
      // produced "No Output Directory named build found".
      ...(outputDirectory === null ? {} : { outputDirectory }),
    },
  })

  if (!deployment.ok) return { ok: false, error: deployment.error }

  const url = deployment.data.url
  return {
    ok: true,
    projectId: project.projectId,
    deploymentId: String(deployment.data.id ?? ""),
    reservedUrl: typeof url === "string" ? `https://${url}` : "",
  }
}

export type BuildOutcome =
  | { state: "ready"; url: string }
  | { state: "failed"; error: string }
  | { state: "cancelled" }
  | { state: "timeout"; lastState: string }

/** Vercel readyState values, mapped to what TisiOps records. */
function classifyState(
  readyState: string
): "ready" | "failed" | "cancelled" | "pending" {
  if (readyState === "READY") return "ready"
  if (readyState === "ERROR") return "failed"
  if (readyState === "CANCELED" || readyState === "CANCELLED")
    return "cancelled"
  return "pending"
}

/**
 * Waits for the build to finish.
 *
 * A deployment URL exists from the moment Vercel accepts the request, long
 * before the build succeeds — polling is the only way to know the difference
 * between "reserved" and "live".
 */
export async function waitForBuild(
  deploymentId: string,
  options: {
    timeoutMs?: number
    intervalMs?: number
    onState?: (state: string) => Promise<void> | void
  } = {}
): Promise<BuildOutcome> {
  const token = process.env.VERCEL_TOKEN
  if (!token)
    return { state: "failed", error: "VERCEL_TOKEN is not configured." }

  const timeoutMs = options.timeoutMs ?? 150_000
  const intervalMs = options.intervalMs ?? 5_000
  const deadline = Date.now() + timeoutMs

  let lastState = "QUEUED"
  let reported = ""

  while (Date.now() < deadline) {
    const response = await call(
      `/v13/deployments/${deploymentId}${teamQuery()}`,
      token
    )

    if (response.ok) {
      lastState = String(
        response.data.readyState ?? response.data.status ?? "QUEUED"
      )

      if (lastState !== reported) {
        reported = lastState
        await options.onState?.(lastState)
      }

      const outcome = classifyState(lastState)
      if (outcome === "ready") {
        const url = response.data.url
        return {
          state: "ready",
          url: typeof url === "string" ? `https://${url}` : "",
        }
      }
      if (outcome === "cancelled") return { state: "cancelled" }
      if (outcome === "failed") {
        const errorMessage =
          (response.data.errorMessage as string | undefined) ??
          (response.data.errorCode as string | undefined) ??
          "The Vercel build failed."
        return { state: "failed", error: errorMessage }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return { state: "timeout", lastState }
}

/**
 * Whether the preview opens without a Vercel login.
 *
 * Deployment Protection answers a normal request with an SSO redirect or a
 * 401, which is what produces the "You Need Access" page — checking for it
 * here means TisiOps can say so instead of handing over a dead link.
 */
export async function isPreviewPublic(url: string): Promise<boolean> {
  if (!url) return false

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "TisiOps" },
    })

    if (response.status === 401 || response.status === 403) return false

    // Protection bounces anonymous traffic to Vercel's SSO host.
    const location = response.headers.get("location") ?? ""
    if (/vercel\.com\/sso|_vercel\/sso|sso-api/.test(location)) return false
    if (response.headers.has("set-cookie") && response.status === 307) {
      return !/_vercel_sso_nonce/.test(response.headers.get("set-cookie") ?? "")
    }

    return response.status < 400
  } catch {
    return false
  }
}
