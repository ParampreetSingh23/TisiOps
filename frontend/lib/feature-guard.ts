import { redirect } from "next/navigation"

import { isFeatureOpen } from "@/lib/feature-store"
import type { FeatureKey } from "@/lib/features"

/**
 * Locks apply to everyone, admins included, so an admin can see the effect of
 * their own switch. The Admin Panel carries no feature flag, so flipping a
 * feature off can never lock an admin out of the controls that undo it.
 */
export async function canUseFeature(key: FeatureKey): Promise<boolean> {
  return isFeatureOpen(key)
}

/** Server-side gate. Hiding the sidebar link is not protection. */
export async function requireFeature(key: FeatureKey): Promise<void> {
  if (!(await canUseFeature(key))) redirect("/dashboard?locked=" + key)
}
