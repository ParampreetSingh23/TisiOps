import { TEMPLATES } from "../terraform/terraformTemplateRegistry"
import { safeProjectName } from "../terraform/terraformVariableValidator"

export type PostgresConfigInput = {
  workspaceName?: string | null
  databaseName?: string | null
  databaseUser?: string | null
  postgresVersion?: string | null
}

export type PostgresConfig = {
  workspaceName: string
  databaseName: string
  databaseUser: string
  postgresVersion: string
  region: string
  plan: "STARTER"
  instanceType: string
  volumeSizeGb: number
}

const TEMPLATE = TEMPLATES["aws-postgres-server"]

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
const VERSION = /^[0-9][A-Za-z0-9._-]{0,30}$/

export function workspaceSlug(value: string): string {
  const slug = safeProjectName(value)
  return slug.length >= 3 ? slug : "postgres-db"
}

export function validatePostgresConfig(input: PostgresConfigInput): {
  ok: true
  config: PostgresConfig
} | { ok: false; error: string } {
  const databaseName = input.databaseName?.trim() || "appdb"
  const databaseUser = input.databaseUser?.trim() || "tisiops_user"
  const postgresVersion = input.postgresVersion?.trim() || "16-alpine"
  const workspaceName = workspaceSlug(input.workspaceName || databaseName)

  if (!NAME.test(databaseName)) {
    return { ok: false, error: "Database name must be a valid PostgreSQL identifier." }
  }

  if (!NAME.test(databaseUser)) {
    return { ok: false, error: "Database user must be a valid PostgreSQL identifier." }
  }

  if (!VERSION.test(postgresVersion)) {
    return { ok: false, error: "PostgreSQL version must be a safe Docker tag." }
  }

  return {
    ok: true,
    config: {
      workspaceName,
      databaseName,
      databaseUser,
      postgresVersion,
      region: TEMPLATE.allowedRegions[0],
      plan: "STARTER",
      instanceType: TEMPLATE.defaultInstanceType,
      volumeSizeGb: TEMPLATE.volumeSizeGb.default,
    },
  }
}
