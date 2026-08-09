"use server"

import { revalidatePath } from "next/cache"

import { isAdmin } from "@/lib/auth"
import { setFeatureStatus } from "@/lib/feature-store"
import {
  FEATURE_KEYS,
  FEATURE_STATUSES,
  type FeatureKey,
  type FeatureStatus,
} from "@/lib/features"
import { setProviderAvailable } from "@/lib/provider-store"
import { PROVIDER_IDS } from "@/lib/providers"

export async function updateFeatureStatus(key: string, status: string) {
  // Server actions are public endpoints: re-check the caller, never trust the UI.
  if (!(await isAdmin())) {
    throw new Error("Not authorized")
  }

  if (!FEATURE_KEYS.includes(key as FeatureKey)) {
    throw new Error(`Unknown feature: ${key}`)
  }

  if (!FEATURE_STATUSES.includes(status as FeatureStatus)) {
    throw new Error(`Unknown status: ${status}`)
  }

  setFeatureStatus(key as FeatureKey, status as FeatureStatus)

  // Sidebar lives in the dashboard layout, so revalidate the whole subtree.
  revalidatePath("/dashboard", "layout")
}

export async function updateProviderAvailability(
  id: string,
  available: boolean
) {
  if (!(await isAdmin())) {
    throw new Error("Not authorized")
  }

  if (!PROVIDER_IDS.includes(id)) {
    throw new Error(`Unknown provider: ${id}`)
  }

  setProviderAvailable(id, available)
  revalidatePath("/dashboard", "layout")
}
