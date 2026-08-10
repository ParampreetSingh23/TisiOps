import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parse } from "yaml"

import { templateManifestSchema } from "./template.schema"
import type { TemplateManifest } from "./templates.types"

/**
 * Reads one template manifest off disk and validates it.
 *
 * Synchronous on purpose: manifests are static files loaded once at startup,
 * and a synchronous read lets the registry be a plain constant that anything —
 * including an Express handler — can use without awaiting.
 *
 * Throws on anything wrong. A manifest that does not validate is a manifest
 * TisiOps would otherwise describe deployments with, so failing at startup is
 * the safe answer; the alternative is a UI confidently showing the wrong ports.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** server/templates — never composed from caller input. */
export const TEMPLATE_ROOT = path.resolve(HERE, "../../templates")

export function loadTemplateFile(relativePath: string): TemplateManifest {
  const file = path.join(TEMPLATE_ROOT, relativePath)
  const parsed = templateManifestSchema.safeParse(parse(readFileSync(file, "utf8")))

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n  ")

    throw new Error(`Invalid template manifest ${relativePath}:\n  ${issues}`)
  }

  return parsed.data
}
