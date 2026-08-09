import type { ClerkUsersApi } from "./status"

/**
 * Repository listing for the deployment flow.
 *
 * Only ever lists repositories the signed-in user's own GitHub token can see,
 * so one user can never enumerate or deploy another user's repositories. The
 * token stays in this module.
 */

export type Repository = {
  name: string
  owner: string
  fullName: string
  private: boolean
  defaultBranch: string
  url: string
  language: string | null
  updatedAt: string
}

export type RepositoryList =
  | { source: "github"; repositories: Repository[] }
  | { source: "mock"; repositories: Repository[]; note: string }
  | { source: "error"; repositories: []; error: string }

/** Shown only when a real GitHub connection is unavailable, and always labelled. */
const MOCK_REPOSITORIES: Repository[] = [
  {
    name: "portfolio-nextjs",
    owner: "example",
    fullName: "example/portfolio-nextjs",
    private: false,
    defaultBranch: "main",
    url: "https://github.com/example/portfolio-nextjs",
    language: "TypeScript",
    updatedAt: new Date("2026-01-01").toISOString(),
  },
  {
    name: "client-dashboard",
    owner: "example",
    fullName: "example/client-dashboard",
    private: true,
    defaultBranch: "main",
    url: "https://github.com/example/client-dashboard",
    language: "TypeScript",
    updatedAt: new Date("2026-01-01").toISOString(),
  },
  {
    name: "landing-page",
    owner: "example",
    fullName: "example/landing-page",
    private: false,
    defaultBranch: "main",
    url: "https://github.com/example/landing-page",
    language: "JavaScript",
    updatedAt: new Date("2026-01-01").toISOString(),
  },
]

export const MOCK_REPOSITORY_NOTE =
  "MVP sample repositories. Connect GitHub with repository access to see your own."

export function mockRepositories(): RepositoryList {
  return {
    source: "mock",
    repositories: MOCK_REPOSITORIES,
    note: MOCK_REPOSITORY_NOTE,
  }
}

type GithubRepo = {
  name: string
  private: boolean
  default_branch: string
  html_url: string
  language: string | null
  updated_at: string
  owner: { login: string }
}

/**
 * The caller has already confirmed repository access via getGithubStatus();
 * this reads the token again rather than accepting one, so no caller can pass
 * in someone else's.
 */
export async function listRepositories(
  clerkUserId: string,
  users: ClerkUsersApi
): Promise<RepositoryList> {
  let token: string | undefined

  try {
    const stored = await users.getUserOauthAccessToken(clerkUserId, "github")
    token = stored.data[0]?.token
  } catch {
    return {
      source: "error",
      repositories: [],
      error: "Could not read the GitHub authorization.",
    }
  }

  if (!token) {
    return {
      source: "error",
      repositories: [],
      error: "GitHub repository access has not been granted.",
    }
  }

  let response: Response
  try {
    response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "TisiOps",
        },
      }
    )
  } catch {
    return {
      source: "error",
      repositories: [],
      error: "Could not reach GitHub.",
    }
  }

  if (response.status === 401 || response.status === 403) {
    return {
      source: "error",
      repositories: [],
      error: "GitHub rejected the authorization. Reconnect GitHub.",
    }
  }

  if (!response.ok) {
    return {
      source: "error",
      repositories: [],
      error: "GitHub could not list repositories.",
    }
  }

  const body = (await response.json()) as GithubRepo[]

  return {
    source: "github",
    repositories: body.map((repo) => ({
      name: repo.name,
      owner: repo.owner.login,
      fullName: `${repo.owner.login}/${repo.name}`,
      private: repo.private,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
      language: repo.language,
      updatedAt: repo.updated_at,
    })),
  }
}
