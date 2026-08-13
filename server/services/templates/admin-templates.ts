import { parse } from "yaml"
import type {
  AdminTemplate,
  TemplateRunnerType,
  TemplateStatus,
} from "../../db/generated/client"
import { templateManifestSchema } from "./template.schema"
import type { TemplateManifest } from "./templates.types"

export const RUNNERS = [
  "DOCKER_COMPOSE_SERVER_RUNNER",
  "DATABASE_SERVICE_RUNNER",
  "N8N_MANAGED_SERVER_RUNNER",
] as const satisfies readonly TemplateRunnerType[]

export type RunnerInput =
  | "docker-compose-server-runner"
  | "database-service-runner"
  | "n8n-managed-server-runner"
  | "custom-handler"
  | ""

const RUNNER_TO_DB: Record<Exclude<RunnerInput, "">, TemplateRunnerType> = {
  "docker-compose-server-runner": "DOCKER_COMPOSE_SERVER_RUNNER",
  "database-service-runner": "DATABASE_SERVICE_RUNNER",
  "n8n-managed-server-runner": "N8N_MANAGED_SERVER_RUNNER",
  "custom-handler": "CUSTOM_HANDLER",
}

const DB_TO_RUNNER: Record<TemplateRunnerType, Exclude<RunnerInput, "">> = {
  DOCKER_COMPOSE_SERVER_RUNNER: "docker-compose-server-runner",
  DATABASE_SERVICE_RUNNER: "database-service-runner",
  N8N_MANAGED_SERVER_RUNNER: "n8n-managed-server-runner",
  CUSTOM_HANDLER: "custom-handler",
}

export const BUILT_IN_TEMPLATE_IDS = [
  "aws-n8n-server",
  "postgres-managed-server",
] as const

const BUILT_INS = [
  {
    file: "n8n/aws-n8n-server.yaml",
    runnerType: "n8n-managed-server-runner",
  },
  {
    file: "postgres/postgres-managed-server.yaml",
    runnerType: "database-service-runner",
  },
] as const

export type TemplateInput = {
  templateId: string
  name: string
  description: string
  category: string
  tags: string[]
  iconUrl?: string | null
  coverImageUrl?: string | null
  yamlContent: string
  runnerType?: RunnerInput
}

export type TemplateReview = {
  valid: boolean
  securityPassed: boolean
  runnerSupported: boolean
  errors: string[]
  warnings: string[]
  manifest: TemplateManifest | null
}

async function getPrisma() {
  const db = await import("../../db/prisma")
  return db.prisma
}

function issuePath(path: readonly PropertyKey[]) {
  return path.length ? path.map(String).join(".") : "manifest"
}

function runnerToDb(input?: RunnerInput): TemplateRunnerType | null {
  if (!input) return null
  return RUNNER_TO_DB[input] ?? null
}

function runnerSupported(runner: TemplateRunnerType | null) {
  return runner ? RUNNERS.includes(runner as (typeof RUNNERS)[number]) : false
}

function securityReview(manifest: TemplateManifest): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const services = manifest.spec.services
  const serviceNames = new Set(services.map((service) => service.name))

  for (const service of services) {
    for (const dependency of service.dependsOn ?? []) {
      if (!serviceNames.has(dependency)) {
        errors.push(`${service.name} depends on missing ${dependency}`)
      }
    }

    for (const port of service.publicPorts ?? []) {
      warnings.push(`${service.name} publishes port ${port}`)
    }

    for (const volume of service.volumes ?? []) {
      if (!volume.dir.startsWith("/var/lib/") && !volume.dir.startsWith("/home/")) {
        warnings.push(`${service.name} volume ${volume.id} mounts ${volume.dir}`)
      }
    }

    for (const [key, env] of Object.entries(service.env ?? {})) {
      const looksSecret = /password|secret|token|key|database_url/i.test(key)

      if (looksSecret && env.expose === true) {
        errors.push(`${key} looks secret and must not be exposed`)
      }

      if ((env.generated || env.fromSecret) && env.secret !== true) {
        errors.push(`${key} is generated/fromSecret and must set secret: true`)
      }

      if (looksSecret && env.secret !== true) {
        warnings.push(`${key} looks secret but is not marked secret`)
      }
    }
  }

  for (const check of manifest.spec.healthChecks) {
    if (check.type === "COMMAND") {
      warnings.push(`${check.name} uses a command health check; runner must approve it`)
    }
  }

  return { errors, warnings }
}

/**
 * The creator edits metadata in form fields and the deployment spec in YAML.
 * The form is the source of truth for metadata, so it is written onto the
 * manifest rather than compared against it — otherwise renaming a template
 * means editing the same string in two places and validation fails in between.
 */
function applyMetadata(
  manifest: TemplateManifest,
  input: TemplateInput
): TemplateManifest {
  return {
    ...manifest,
    metadata: {
      ...manifest.metadata,
      id: input.templateId,
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category.trim(),
      icon: input.iconUrl?.trim() || manifest.metadata.icon,
      tags: input.tags,
    },
  }
}

function metadataErrors(input: TemplateInput): string[] {
  const errors: string[] = []

  // The id is an identifier, not a label: it keys template lookups and is
  // recorded on every deployment made from this template.
  if (!/^[a-z0-9-]+$/.test(input.templateId)) {
    errors.push("Template ID must be lowercase letters, numbers, and dashes")
  }

  if (!input.name.trim()) errors.push("Name is required")
  if (!input.description.trim()) errors.push("Description is required")
  if (!input.category.trim()) errors.push("Category is required")

  return errors
}

export function validateTemplateInput(input: TemplateInput): TemplateReview {
  const errors: string[] = metadataErrors(input)
  let raw: unknown

  try {
    raw = parse(input.yamlContent)
  } catch (cause) {
    return {
      valid: false,
      securityPassed: false,
      runnerSupported: false,
      errors: [`YAML parse failed: ${(cause as Error).message}`],
      warnings: [],
      manifest: null,
    }
  }

  const parsed = templateManifestSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issuePath(issue.path)}: ${issue.message}`)
    }
  }

  const manifest = parsed.success
    ? applyMetadata(parsed.data, input)
    : null
  const security = manifest ? securityReview(manifest) : { errors: [], warnings: [] }
  const dbRunner = runnerToDb(input.runnerType)

  return {
    valid: errors.length === 0,
    securityPassed: errors.length === 0 && security.errors.length === 0,
    runnerSupported: runnerSupported(dbRunner),
    errors: [...errors, ...security.errors],
    warnings: security.warnings,
    manifest,
  }
}

export type SafeAdminTemplate = {
  id: string
  templateId: string
  name: string
  description: string
  category: string
  tags: string[]
  iconUrl: string | null
  coverImageUrl: string | null
  yamlContent: string
  parsedManifest: TemplateManifest
  status: TemplateStatus
  runnerType: RunnerInput
  version: number
  createdAt: string
  updatedAt: string
}

export function toSafeAdminTemplate(row: AdminTemplate): SafeAdminTemplate {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    iconUrl: row.iconUrl,
    coverImageUrl: row.coverImageUrl,
    yamlContent: row.yamlContent,
    parsedManifest: row.parsedManifest as TemplateManifest,
    status: row.status,
    runnerType: row.runnerType ? DB_TO_RUNNER[row.runnerType] : "",
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listAdminTemplates(): Promise<SafeAdminTemplate[]> {
  const prisma = await getPrisma()
  const rows = await prisma.adminTemplate.findMany({
    orderBy: [{ updatedAt: "desc" }],
  })

  return rows.map(toSafeAdminTemplate)
}

export async function ensureBuiltInTemplates(createdBy: string) {
  const prisma = await getPrisma()
  const { readFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { loadTemplateFile, TEMPLATE_ROOT } = await import("./template-loader")

  for (const builtIn of BUILT_INS) {
    const manifest = loadTemplateFile(builtIn.file)
    const existing = await prisma.adminTemplate.findFirst({
      where: { templateId: manifest.metadata.id },
      orderBy: { version: "desc" },
    })
    if (existing) continue

    await prisma.adminTemplate.create({
      data: {
        templateId: manifest.metadata.id,
        name: manifest.metadata.name,
        description: manifest.metadata.description,
        category: manifest.metadata.category,
        tags: manifest.metadata.tags,
        iconUrl: manifest.metadata.icon,
        yamlContent: readFileSync(join(TEMPLATE_ROOT, builtIn.file), "utf8"),
        parsedManifest: manifest as never,
        runnerType: runnerToDb(builtIn.runnerType),
        status: "PUBLISHED",
        version: 1,
        createdBy,
      },
    })
  }
}

export async function saveTemplateDraft(input: TemplateInput & { createdBy: string }) {
  const review = validateTemplateInput(input)
  // Drafts are allowed to be invalid, but not to be unidentifiable: templateId
  // keys every later lookup and version bump.
  if (!review.manifest || metadataErrors(input).length > 0) {
    return { ok: false as const, review }
  }

  const prisma = await getPrisma()
  const latest = await prisma.adminTemplate.findFirst({
    where: { templateId: input.templateId },
    orderBy: { version: "desc" },
  })

  const version =
    latest?.status === "PUBLISHED" ? latest.version + 1 : latest?.version ?? 1

  const row =
    latest && latest.status !== "PUBLISHED"
      ? await prisma.adminTemplate.update({
          where: { id: latest.id },
          data: {
            name: input.name,
            description: input.description,
            category: input.category,
            tags: input.tags,
            iconUrl: input.iconUrl ?? null,
            coverImageUrl: input.coverImageUrl ?? null,
            yamlContent: input.yamlContent,
            parsedManifest: review.manifest as never,
            runnerType: runnerToDb(input.runnerType),
            status: review.securityPassed ? "VALIDATED" : "DRAFT",
          },
        })
      : await prisma.adminTemplate.create({
          data: {
            templateId: input.templateId,
            name: input.name,
            description: input.description,
            category: input.category,
            tags: input.tags,
            iconUrl: input.iconUrl ?? null,
            coverImageUrl: input.coverImageUrl ?? null,
            yamlContent: input.yamlContent,
            parsedManifest: review.manifest as never,
            runnerType: runnerToDb(input.runnerType),
            status: review.securityPassed ? "VALIDATED" : "DRAFT",
            version,
            createdBy: input.createdBy,
          },
        })

  return { ok: true as const, review, template: toSafeAdminTemplate(row) }
}

export async function markTemplateTested(id: string): Promise<boolean> {
  const prisma = await getPrisma()
  const row = await prisma.adminTemplate.findUnique({ where: { id } })
  if (!row || !runnerSupported(row.runnerType)) return false

  await prisma.adminTemplate.update({
    where: { id },
    data: { status: "TESTED" },
  })

  return true
}

export async function publishTemplate(id: string): Promise<{
  ok: boolean
  error?: string
}> {
  const prisma = await getPrisma()
  const row = await prisma.adminTemplate.findUnique({ where: { id } })
  if (!row) return { ok: false, error: "Template not found" }

  const review = validateTemplateInput({
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    iconUrl: row.iconUrl,
    coverImageUrl: row.coverImageUrl,
    yamlContent: row.yamlContent,
    runnerType: row.runnerType ? DB_TO_RUNNER[row.runnerType] : "",
  })

  if (!review.valid) return { ok: false, error: "YAML is invalid" }
  if (!review.securityPassed) return { ok: false, error: "Security review failed" }
  if (!runnerSupported(row.runnerType)) {
    return { ok: false, error: "No supported runner is attached" }
  }

  await prisma.adminTemplate.update({
    where: { id },
    data: { status: "PUBLISHED" },
  })

  return { ok: true }
}

export async function setTemplateVisible(
  id: string,
  visible: boolean
): Promise<SafeAdminTemplate | null> {
  const prisma = await getPrisma()
  const row = visible
    ? await prisma.adminTemplate.findUnique({ where: { id } })
    : await prisma.adminTemplate.update({
        where: { id },
        data: { status: "DISABLED" },
      })

  if (!row) return null
  if (!visible) return toSafeAdminTemplate(row)

  const result = await publishTemplate(id)
  if (!result.ok) throw new Error(result.error ?? "Could not publish template")

  const published = await prisma.adminTemplate.findUnique({ where: { id } })
  return published ? toSafeAdminTemplate(published) : null
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const prisma = await getPrisma()
  const row = await prisma.adminTemplate.findUnique({ where: { id } })
  if (!row || BUILT_IN_TEMPLATE_IDS.includes(row.templateId as never)) {
    return false
  }

  await prisma.adminTemplate.delete({ where: { id } })
  return true
}

export async function listPublishedDbTemplates(): Promise<TemplateManifest[]> {
  const prisma = await getPrisma()
  const rows = await prisma.adminTemplate.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ templateId: "asc" }, { version: "desc" }],
  })
  const seen = new Set<string>()
  const manifests: TemplateManifest[] = []

  for (const row of rows) {
    if (seen.has(row.templateId)) continue
    seen.add(row.templateId)
    manifests.push(row.parsedManifest as TemplateManifest)
  }

  return manifests
}

export async function hiddenBuiltInTemplateIds(): Promise<Set<string>> {
  const prisma = await getPrisma()
  const rows = await prisma.adminTemplate.findMany({
    where: { templateId: { in: [...BUILT_IN_TEMPLATE_IDS] } },
    orderBy: [{ templateId: "asc" }, { version: "desc" }],
  })
  const seen = new Set<string>()
  const hidden = new Set<string>()

  for (const row of rows) {
    if (seen.has(row.templateId)) continue
    seen.add(row.templateId)
    if (row.status !== "PUBLISHED") hidden.add(row.templateId)
  }

  return hidden
}

export async function listPublishedCustomTemplates(): Promise<TemplateManifest[]> {
  const published = await listPublishedDbTemplates()
  return published.filter(
    (manifest) => !BUILT_IN_TEMPLATE_IDS.includes(manifest.metadata.id as never)
  )
}
