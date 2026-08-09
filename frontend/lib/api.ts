// Trailing slash stripped so a dashboard-set value like "https://host/" does
// not produce a double-slashed request path.
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001"
).replace(/\/+$/, "")

/**
 * Calls the TisiOps API. `credentials: "include"` sends the Clerk session
 * cookie cross-origin, which the API's CORS config allows.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  })

  const body = await response.json()

  if (!response.ok || body?.success === false) {
    throw new Error(body?.error ?? `Request failed: ${response.status}`)
  }

  return body.data as T
}
