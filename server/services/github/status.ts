/**
 * GitHub connection status.
 *
 * Two different things are deliberately kept apart:
 *   - signing in *with* GitHub, which proves identity and nothing else
 *   - granting TisiOps repository access, which is a separate OAuth scope
 *
 * A GitHub login alone never counts as repository access. The token is read
 * here to check it, and never leaves this module — not to the response, not
 * to a log line.
 */

/** Either scope lets TisiOps read repositories; `repo` also covers private ones. */
export const GITHUB_REPO_SCOPES = ["repo", "public_repo"]

export type GithubConnectionState =
  | "not_connected"
  | "github_login_detected"
  | "repo_access_granted"
  | "connection_error"

export type GithubStatus = {
  state: GithubConnectionState
  username: string | null
  grantedScopes: string[]
  error: string | null
}

/**
 * The slice of Clerk's users API this needs. Passing it in keeps the module
 * free of any one Clerk SDK: the Express API hands over `clerkClient.users`
 * from @clerk/express, a Next server component hands over the same object
 * from @clerk/nextjs/server, and neither drags the other into its bundle.
 */
export type ClerkExternalAccount = {
  provider: string
  username?: string | null
  verification?: {
    status?: string | null
    error?: {
      code?: string
      message?: string
      longMessage?: string
      long_message?: string
    } | null
  } | null
}

export type ClerkUsersApi = {
  getUser: (userId: string) => Promise<{
    externalAccounts: ClerkExternalAccount[]
  }>
  getUserOauthAccessToken: (
    userId: string,
    provider: "github"
  ) => Promise<{ data: { token?: string; scopes?: string[] }[] }>
}

/**
 * A linked-but-unverified account means the OAuth round trip failed. Clerk
 * records why, and the reason is usually something only the user can fix, so
 * it is worth surfacing instead of reporting "access not granted".
 */
function linkFailureMessage(account: ClerkExternalAccount): string | null {
  const verification = account.verification
  if (!verification || verification.status === "verified") return null

  const error = verification.error
  if (error?.code === "oauth_identification_claimed") {
    return "This GitHub account is already linked to a different TisiOps account. Sign in with that account, or use a GitHub account whose email is not already registered here."
  }

  if (error?.code === "oauth_access_denied") {
    return "The request was declined on GitHub. Approve it to grant repository access."
  }

  return (
    error?.longMessage ??
    error?.long_message ??
    error?.message ??
    "The GitHub authorization did not finish. Try connecting again."
  )
}

/** Clerk reports `oauth_github` on the backend and `github` on the frontend. */
function isGithubProvider(provider: string): boolean {
  return provider.replace(/^oauth_/, "") === "github"
}

function hasRepoScope(scopes: string[]): boolean {
  return scopes.some((scope) => GITHUB_REPO_SCOPES.includes(scope))
}

type TokenCheck =
  | { ok: true; login: string | null; scopes: string[] }
  | { ok: false; error: string }

/**
 * Confirms the token still works and asks GitHub what it is actually allowed
 * to do. GitHub's own answer beats the stored scope list, which can go stale
 * if the user edits the grant on github.com.
 *
 * This calls /user, never /repos — repositories are not read until access is
 * confirmed and the deployment flow asks for them.
 */
async function checkToken(token: string): Promise<TokenCheck> {
  let response: Response

  try {
    response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TisiOps",
      },
    })
  } catch {
    return { ok: false, error: "Could not reach GitHub. Try again." }
  }

  if (response.status === 401) {
    return {
      ok: false,
      error: "GitHub rejected the stored authorization. Reconnect GitHub.",
    }
  }

  if (!response.ok) {
    return { ok: false, error: "GitHub could not verify this connection." }
  }

  const header = response.headers.get("x-oauth-scopes")
  const body = (await response.json()) as { login?: string }

  return {
    ok: true,
    login: body.login ?? null,
    scopes: header
      ? header
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [],
  }
}

export async function getGithubStatus(
  clerkUserId: string,
  users: ClerkUsersApi
): Promise<GithubStatus> {
  const user = await users.getUser(clerkUserId)
  const account = user.externalAccounts.find((external) =>
    isGithubProvider(external.provider)
  )

  // No GitHub identity at all — an email/password or other-provider user.
  if (!account) {
    return {
      state: "not_connected",
      username: null,
      grantedScopes: [],
      error: null,
    }
  }

  const username = account.username ?? null

  // The account row exists but the OAuth handshake failed — Clerk holds no
  // token, so asking for repository access again would fail the same way.
  const linkFailure = linkFailureMessage(account)
  if (linkFailure) {
    return {
      state: "connection_error",
      username,
      grantedScopes: [],
      error: linkFailure,
    }
  }

  let token: string | undefined
  let storedScopes: string[] = []

  try {
    const stored = await users.getUserOauthAccessToken(clerkUserId, "github")
    token = stored.data[0]?.token
    storedScopes = stored.data[0]?.scopes ?? []
  } catch {
    return {
      state: "connection_error",
      username,
      grantedScopes: [],
      error: "Could not read the GitHub authorization. Try reconnecting.",
    }
  }

  // Signed in with GitHub, but Clerk holds no usable token for us.
  if (!token) {
    return {
      state: "github_login_detected",
      username,
      grantedScopes: [],
      error: null,
    }
  }

  const checked = await checkToken(token)
  if (!checked.ok) {
    return {
      state: "connection_error",
      username,
      grantedScopes: [],
      error: checked.error,
    }
  }

  // GitHub App installations report no scope header; fall back to what Clerk
  // recorded, and treat "no evidence" as "not granted" rather than assuming.
  const grantedScopes =
    checked.scopes.length > 0 ? checked.scopes : storedScopes

  return {
    state: hasRepoScope(grantedScopes)
      ? "repo_access_granted"
      : "github_login_detected",
    username: checked.login ?? username,
    grantedScopes,
    error: null,
  }
}
