import { isAdminEmail } from "../constants/index"
import { prisma } from "../db/prisma"
import { userSyncSchema, type UserSyncInput } from "../validations/user"

/**
 * Creates the user on first sight, otherwise refreshes the profile fields.
 * Clerk owns identity; clerkId is the link between the two systems.
 */
export async function syncUser(input: UserSyncInput) {
  const data = userSyncSchema.parse(input)
  const role = isAdminEmail(data.email) ? "ADMIN" : "USER"

  return prisma.user.upsert({
    where: { clerkId: data.clerkId },
    create: {
      clerkId: data.clerkId,
      email: data.email,
      name: data.name,
      imageUrl: data.imageUrl,
      role,
    },
    update: {
      email: data.email,
      name: data.name,
      imageUrl: data.imageUrl,
      // Keep the allowlist authoritative while it is the only source of admin.
      role,
    },
  })
}

export async function findUserByClerkId(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}
