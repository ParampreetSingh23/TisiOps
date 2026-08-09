import { auth, currentUser } from "@clerk/nextjs/server"

import { isAdminEmail } from "../constants/index"
import { syncUser } from "../services/user-service"

/** Clerk user id of the caller, or null when signed out. */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId
}

/** Signed-in Clerk profile, or null. */
export async function getClerkUser() {
  return currentUser()
}

/** Admin check from the Clerk profile — no database round trip. */
export async function isAdminUser(): Promise<boolean> {
  const user = await currentUser()
  return isAdminEmail(user?.primaryEmailAddress?.emailAddress)
}

/**
 * Writes the signed-in Clerk user into the database and returns the row.
 * Returns null when nobody is signed in.
 */
export async function syncCurrentUser() {
  const user = await currentUser()
  if (!user) return null

  const email = user.primaryEmailAddress?.emailAddress
  if (!email) return null

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()

  return syncUser({
    clerkId: user.id,
    email,
    name: name.length > 0 ? name : null,
    imageUrl: user.imageUrl || null,
  })
}
