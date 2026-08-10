import type { z } from "zod"

import type { templateManifestSchema } from "./template.schema"

/**
 * Types for the YAML template manifests.
 *
 * Inferred from the schema rather than written twice, so a manifest that
 * validates always matches the type and the two cannot drift.
 */

export type TemplateManifest = z.infer<typeof templateManifestSchema>

export type TemplateMetadata = TemplateManifest["metadata"]
export type TemplateSpec = TemplateManifest["spec"]
export type TemplateService = TemplateSpec["services"][number]
export type TemplateVariable = TemplateSpec["variables"][number]
export type TemplateInstruction = TemplateSpec["instructions"][number]
export type TemplateHealthCheck = TemplateSpec["healthChecks"][number]
export type TemplateAccess = TemplateSpec["access"]

/** What a list view needs, without the whole spec. */
export type TemplateSummary = TemplateMetadata & {
  accessMode: TemplateAccess["mode"]
  provider: string
  region: string
  plan: string
  services: string[]
}
