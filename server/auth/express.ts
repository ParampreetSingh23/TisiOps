import { clerkClient } from "@clerk/express"

import { syncUser } from "../services/user-service"

/**
 * Express-side counterpart of syncCurrentUser(). The Next helpers read the
 * request context via @clerk/nextjs, which does not exist here, so the profile
 * is fetched from Clerk by id instead.
 *
 * Kept in its own file so importing @tisiops/server/auth from the Next app
 * never pulls Express into that bundle.
 */
export async function syncCurrentUserById(clerkId: string) {
  const user = await clerkClient.users.getUser(clerkId)

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
