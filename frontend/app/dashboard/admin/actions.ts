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
import {
  deleteTemplate,
  markTemplateTested,
  publishTemplate,
  saveTemplateDraft,
  setTemplateVisible,
  validateTemplateInput,
  type RunnerInput,
  type VariableEdit,
} from "@tisiops/server/services/templates/admin"
import { auth } from "@clerk/nextjs/server"

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

async function requireAdminUserId() {
  if (!(await isAdmin())) {
    throw new Error("Not authorized")
  }

  const { userId } = await auth()
  if (!userId) throw new Error("Not authorized")

  const { prisma } = await import("@tisiops/server/db")
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true },
  })
  if (!user) throw new Error("Admin user not synced")

  return user.id
}

function formInput(formData: FormData) {
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
  const variableEdits = JSON.parse(
    String(formData.get("variableEdits") ?? "[]")
  ) as VariableEdit[]

  return {
    templateId: String(formData.get("templateId") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    tags,
    iconUrl: String(formData.get("iconUrl") ?? "").trim() || null,
    coverImageUrl: String(formData.get("coverImageUrl") ?? "").trim() || null,
    yamlContent: String(formData.get("yamlContent") ?? ""),
    runnerType: String(formData.get("runnerType") ?? "") as RunnerInput,
    variableEdits,
  }
}

export async function validateTemplateAction(_: unknown, formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not authorized")
  return validateTemplateInput(formInput(formData))
}

export async function saveTemplateAction(_: unknown, formData: FormData) {
  const createdBy = await requireAdminUserId()
  const result = await saveTemplateDraft({ ...formInput(formData), createdBy })
  revalidatePath("/dashboard/admin/templates")
  return result
}

export async function markTemplateTestedAction(id: string) {
  await requireAdminUserId()
  const ok = await markTemplateTested(id)
  if (!ok) throw new Error("No supported runner attached")
  revalidatePath("/dashboard/admin/templates")
  return true
}

export async function publishTemplateAction(id: string, confirmed: boolean) {
  await requireAdminUserId()
  if (!confirmed) throw new Error("Confirm publish first")
  const result = await publishTemplate(id)
  if (!result.ok) throw new Error(result.error ?? "Could not publish template")
  revalidatePath("/dashboard/admin/templates")
  return true
}

export async function setTemplateVisibleAction(id: string, visible: boolean) {
  await requireAdminUserId()
  const template = await setTemplateVisible(id, visible)
  if (!template) throw new Error("Template not found")
  revalidatePath("/dashboard/admin/templates")
  revalidatePath("/dashboard/new-deployment")
  return template
}

export async function deleteTemplateAction(id: string) {
  await requireAdminUserId()
  const ok = await deleteTemplate(id)
  if (!ok) throw new Error("Built-in templates can only be removed from New Deployment")
  revalidatePath("/dashboard/admin/templates")
  revalidatePath("/dashboard/new-deployment")
  return true
}
