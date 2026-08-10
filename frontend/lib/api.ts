import { getToken } from "@clerk/nextjs"

// Trailing slash stripped so a dashboard-set value like "https://host/" does
// not produce a double-slashed request path.
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001"
).replace(/\/+$/, "")

/**
 * Calls the TisiOps API. The frontend and API sit on different domains in
 * production, so the Clerk session cookie never reaches the API — the session
 * token goes in the Authorization header instead.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getToken()

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  const text = await response.text()
  const body = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return {
            success: false,
            error: `API returned ${response.status} ${response.statusText || "non-JSON response"}`,
          }
        }
      })()
    : null

  if (!response.ok || body?.success === false) {
    throw new Error(body?.error ?? `Request failed: ${response.status}`)
  }

  return body.data as T
}
