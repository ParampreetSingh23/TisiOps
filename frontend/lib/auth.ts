import { auth, currentUser } from "@clerk/nextjs/server"

import { isAdminEmail } from "@tisiops/server/constants"

export type Role = "user" | "admin"

export async function getRole(): Promise<Role> {
  const { sessionClaims } = await auth()
  if (sessionClaims?.metadata?.role === "admin") return "admin"

  const user = await currentUser()

  return isAdminEmail(user?.primaryEmailAddress?.emailAddress) ? "admin" : "user"
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin"
}
