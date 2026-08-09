import { z } from "zod"

/** Shape accepted when syncing a Clerk user into the database. */
export const userSyncSchema = z.object({
  clerkId: z.string().min(1),
  email: z.email(),
  name: z.string().trim().min(1).max(120).nullable(),
  imageUrl: z.url().nullable(),
})

export type UserSyncInput = z.infer<typeof userSyncSchema>
