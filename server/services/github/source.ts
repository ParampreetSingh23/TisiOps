import { Readable } from "node:stream"
import { createGunzip } from "node:zlib"

import { extract } from "tar-stream"

import type { ClerkUsersApi } from "./status"

/**
 * GitHub source downloader for TisiOps Managed Vercel Preview.
 *
 * The managed Vercel account cannot link a user's repository to itself, so
 * TisiOps reads the source here — with the signed-in user's own token, fetched
 * from Clerk per call. No caller can pass a token in, and the token is never
 * returned, logged, or sent to the browser.
 *
 * Every failure carries a code, because "could not reach GitHub" is the same
 * message whether the token expired, the branch is misspelled, or the repo is
 * private — and the fix is different in each case.
 */

const API = "https://api.github.com"

export type SourceErrorCode =
  | "GITHUB_NOT_CONNECTED"
  | "GITHUB_TOKEN_MISSING"
  | "GITHUB_TOKEN_EXPIRED"
  | "GITHUB_REPO_NOT_FOUND"
  | "GITHUB_REPO_ACCESS_DENIED"
  | "GITHUB_PRIVATE_REPO_PERMISSION_REQUIRED"
  | "GITHUB_BRANCH_NOT_FOUND"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_DOWNLOAD_FAILED"
  | "GITHUB_NETWORK_ERROR"
  | "GITHUB_SOURCE_TOO_LARGE"
  | "GITHUB_SOURCE_EMPTY"

/** What the user should see, and whether reconnecting GitHub would help. */
export const SOURCE_ERRORS: Record<
  SourceErrorCode,
  { message: string; reconnect: boolean }
> = {
  GITHUB_NOT_CONNECTED: {
    message:
      "GitHub is not connected. Connect GitHub to deploy this repository.",
    reconnect: true,
  },
  GITHUB_TOKEN_MISSING: {
    message:
      "TisiOps has no GitHub access for your account. Reconnect GitHub with repository access.",
    reconnect: true,
  },
  GITHUB_TOKEN_EXPIRED: {
    message:
      "Your GitHub authorization is no longer valid. Reconnect GitHub with repository access.",
    reconnect: true,
  },
  GITHUB_REPO_NOT_FOUND: {
    message:
      "This repository could not be found with your GitHub access. It may have been renamed, deleted, or never shared with TisiOps.",
    reconnect: false,
  },
  GITHUB_REPO_ACCESS_DENIED: {
    message:
      "Your GitHub authorization does not allow TisiOps to read this repository.",
    reconnect: true,
  },
  GITHUB_PRIVATE_REPO_PERMISSION_REQUIRED: {
    message:
      "This repository is private. Please grant TisiOps permission to read private repositories from GitHub.",
    reconnect: true,
  },
  GITHUB_BRANCH_NOT_FOUND: {
    message: "That branch does not exist in this repository.",
    reconnect: false,
  },
  GITHUB_RATE_LIMITED: {
    message: "GitHub rate limit reached. Try again in a few minutes.",
    reconnect: false,
  },
  GITHUB_DOWNLOAD_FAILED: {
    message: "GitHub could not provide the repository archive.",
    reconnect: false,
  },
  GITHUB_NETWORK_ERROR: {
    message: "Could not reach GitHub. Try again.",
    reconnect: false,
  },
  GITHUB_SOURCE_TOO_LARGE: {
    message: "This repository is larger than the managed-preview size limit.",
    reconnect: false,
  },
  GITHUB_SOURCE_EMPTY: {
    message: "No deployable files were found in this repository or folder.",
    reconnect: false,
  },
}

export type SourceFile = { file: string; data: string; encoding: "base64" }

export type SourceFailure = {
  ok: false
  code: SourceErrorCode
  message: string
  reconnect: boolean
}

export type SourceSuccess = {
  ok: true
  files: SourceFile[]
  totalBytes: number
  skipped: number
  /** True when the repository required private access to read. */
  private: boolean
}

export type RepositorySource = SourceSuccess | SourceFailure

function failure(code: SourceErrorCode): SourceFailure {
  const { message, reconnect } = SOURCE_ERRORS[code]
  return { ok: false, code, message, reconnect }
}

/** Never uploaded: build output, dependencies, and version control noise. */
const SKIP_DIRECTORIES = [
  ".git/",
  "node_modules/",
  ".next/",
  ".vercel/",
  ".turbo/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  ".cache/",
]

const SKIP_FILES = [".DS_Store", ".env", ".env.local", ".env.production"]

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

function shouldSkip(path: string, size: number): boolean {
  if (size > MAX_FILE_BYTES) return true
  if (SKIP_FILES.includes(path.split("/").pop() ?? "")) return true
  return SKIP_DIRECTORIES.some(
    (directory) =>
      path === directory ||
      path.startsWith(directory) ||
      path.includes(`/${directory}`)
  )
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "TisiOps",
  }
}

/** 403 means two very different things depending on the rate-limit header. */
function isRateLimited(response: Response): boolean {
  return (
    response.status === 403 &&
    response.headers.get("x-ratelimit-remaining") === "0"
  )
}

export type PreflightResult =
  | { ok: true; token: string; private: boolean; defaultBranch: string }
  | SourceFailure

/**
 * Confirms, in order, that: TisiOps holds a token for this user, the token
 * still works, the repository is visible to it, and the branch exists.
 *
 * Each step has its own failure code so the deployment can say what to fix
 * rather than reporting a generic download error.
 */
export async function preflight(input: {
  clerkUserId: string
  users: ClerkUsersApi
  owner: string
  repo: string
  branch: string
  onStep?: (message: string) => Promise<void> | void
}): Promise<PreflightResult> {
  await input.onStep?.("Checking GitHub connection")

  let token: string | undefined
  try {
    const stored = await input.users.getUserOauthAccessToken(
      input.clerkUserId,
      "github"
    )
    token = stored.data[0]?.token
  } catch {
    return failure("GITHUB_NOT_CONNECTED")
  }

  if (!token) return failure("GITHUB_TOKEN_MISSING")
  await input.onStep?.("GitHub connection found")

  // Does the token still work at all?
  let identity: Response
  try {
    identity = await fetch(`${API}/user`, { headers: headers(token) })
  } catch {
    return failure("GITHUB_NETWORK_ERROR")
  }

  if (identity.status === 401) return failure("GITHUB_TOKEN_EXPIRED")
  if (isRateLimited(identity)) return failure("GITHUB_RATE_LIMITED")

  await input.onStep?.("Verifying repository access")

  let repository: Response
  try {
    repository = await fetch(`${API}/repos/${input.owner}/${input.repo}`, {
      headers: headers(token),
    })
  } catch {
    return failure("GITHUB_NETWORK_ERROR")
  }

  if (isRateLimited(repository)) return failure("GITHUB_RATE_LIMITED")
  if (repository.status === 401) return failure("GITHUB_TOKEN_EXPIRED")

  // GitHub answers 404 — not 403 — for a private repository the token cannot
  // see, precisely so it does not reveal that it exists. The granted scopes
  // tell the two cases apart: no `repo` scope means private access was never
  // granted, which is the actionable one.
  if (repository.status === 404) {
    const scopes = identity.headers.get("x-oauth-scopes") ?? ""
    const canReadPrivate = /\brepo\b/.test(scopes)
    return failure(
      canReadPrivate
        ? "GITHUB_REPO_NOT_FOUND"
        : "GITHUB_PRIVATE_REPO_PERMISSION_REQUIRED"
    )
  }

  if (repository.status === 403) return failure("GITHUB_REPO_ACCESS_DENIED")
  if (!repository.ok) return failure("GITHUB_DOWNLOAD_FAILED")

  const details = (await repository.json()) as {
    private?: boolean
    default_branch?: string
    permissions?: { pull?: boolean }
  }

  if (details.permissions && details.permissions.pull === false) {
    return failure("GITHUB_REPO_ACCESS_DENIED")
  }

  await input.onStep?.("Repository access verified")
  await input.onStep?.(`Checking branch: ${input.branch}`)

  let branch: Response
  try {
    branch = await fetch(
      `${API}/repos/${input.owner}/${input.repo}/branches/${encodeURIComponent(input.branch)}`,
      { headers: headers(token) }
    )
  } catch {
    return failure("GITHUB_NETWORK_ERROR")
  }

  if (branch.status === 404) return failure("GITHUB_BRANCH_NOT_FOUND")
  if (isRateLimited(branch)) return failure("GITHUB_RATE_LIMITED")
  if (!branch.ok) return failure("GITHUB_DOWNLOAD_FAILED")

  await input.onStep?.("Branch verified")

  return {
    ok: true,
    token,
    private: details.private === true,
    defaultBranch: details.default_branch ?? input.branch,
  }
}

/** gzip magic bytes, so an already-decompressed body is not gunzipped twice. */
function isGzip(head: Buffer): boolean {
  return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b
}

/**
 * Downloads the tarball and returns its files, base64 encoded.
 *
 * The archive endpoint answers with a redirect to codeload on a signed URL.
 * It is followed manually and *without* the Authorization header: forwarding
 * credentials to a different host is both unnecessary and something HTTP
 * clients treat inconsistently, which is what made this step fail with a bare
 * network error.
 */
async function downloadArchive(
  token: string,
  owner: string,
  repo: string,
  ref: string
): Promise<{ ok: true; body: Buffer } | SourceFailure> {
  let response: Response

  try {
    response = await fetch(
      `${API}/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`,
      { headers: headers(token), redirect: "manual" }
    )
  } catch {
    return failure("GITHUB_NETWORK_ERROR")
  }

  // 302 to codeload with a short-lived signed URL.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location")
    if (!location) return failure("GITHUB_DOWNLOAD_FAILED")

    try {
      response = await fetch(location, {
        headers: { "User-Agent": "TisiOps" },
      })
    } catch {
      return failure("GITHUB_NETWORK_ERROR")
    }
  }

  if (response.status === 401) return failure("GITHUB_TOKEN_EXPIRED")
  if (response.status === 404) return failure("GITHUB_REPO_NOT_FOUND")
  if (isRateLimited(response)) return failure("GITHUB_RATE_LIMITED")
  if (!response.ok) return failure("GITHUB_DOWNLOAD_FAILED")

  try {
    return { ok: true, body: Buffer.from(await response.arrayBuffer()) }
  } catch {
    return failure("GITHUB_DOWNLOAD_FAILED")
  }
}

/**
 * Reads a repository into an upload-ready file list.
 *
 * `rootDirectory` narrows the bundle to one folder of a monorepo; the paths
 * stay repository-relative because Vercel is told the root separately.
 */
export async function fetchRepositorySource(input: {
  clerkUserId: string
  users: ClerkUsersApi
  owner: string
  repo: string
  ref: string
  rootDirectory?: string | null
  onStep?: (message: string) => Promise<void> | void
}): Promise<RepositorySource> {
  const checked = await preflight({
    clerkUserId: input.clerkUserId,
    users: input.users,
    owner: input.owner,
    repo: input.repo,
    branch: input.ref,
    onStep: input.onStep,
  })

  if (!checked.ok) return checked

  await input.onStep?.("Downloading repository source")

  const archive = await downloadArchive(
    checked.token,
    input.owner,
    input.repo,
    input.ref
  )
  if (!archive.ok) return archive

  await input.onStep?.("Repository source downloaded")

  const files: SourceFile[] = []
  let totalBytes = 0
  let skipped = 0
  let overflow = false

  const tar = extract()
  // GitHub sends the tarball gzipped, but an intermediary may have already
  // decompressed it — check the bytes rather than assuming.
  const source = isGzip(archive.body.subarray(0, 2))
    ? Readable.from(archive.body).pipe(createGunzip())
    : Readable.from(archive.body)

  try {
    await new Promise<void>((resolve, reject) => {
      tar.on("entry", (header, stream, next) => {
        const size = header.size ?? 0
        // Strip GitHub's "owner-repo-sha/" wrapper directory.
        const path = header.name.split("/").slice(1).join("/")

        if (header.type !== "file" || path === "" || shouldSkip(path, size)) {
          skipped += 1
          stream.resume()
          stream.on("end", next)
          return
        }

        const chunks: Buffer[] = []
        stream.on("data", (chunk: Buffer) => chunks.push(chunk))
        stream.on("end", () => {
          const contents = Buffer.concat(chunks)
          totalBytes += contents.byteLength

          if (totalBytes > MAX_TOTAL_BYTES) {
            overflow = true
            tar.destroy()
            resolve()
            return
          }

          files.push({
            file: path,
            data: contents.toString("base64"),
            encoding: "base64",
          })
          next()
        })
      })

      tar.on("finish", resolve)
      tar.on("error", reject)
      source.on("error", reject)
      source.pipe(tar)
    })
  } catch {
    return failure("GITHUB_DOWNLOAD_FAILED")
  }

  if (overflow) return failure("GITHUB_SOURCE_TOO_LARGE")
  if (files.length === 0) return failure("GITHUB_SOURCE_EMPTY")

  return {
    ok: true,
    files,
    totalBytes,
    skipped,
    private: checked.private,
  }
}
