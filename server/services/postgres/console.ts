import { getTemplateById, summarize } from "../templates/template-registry"
import { validatePostgresConfig, workspaceSlug, type PostgresConfigInput } from "./plans"

export const POSTGRES_TEMPLATE = "postgres-managed-server"

export const QUICK_START_MESSAGE =
  "I’ll create a PostgreSQL managed database for you."

export const QUICK_START_NEXT_STEP =
  "Review the plan below and approve it. Nothing is created until you do."

export const QUICK_START_WARNING =
  "This PostgreSQL server is publicly reachable on port 5432 and protected by password only. This is for MVP/testing only."

export const APPROVE_LABEL = "Approve and Deploy PostgreSQL"

export type PlanLine = { label: string; value: string }

export function quickStartConfig(user: {
  email: string
  name: string | null
}): PostgresConfigInput {
  const base = workspaceSlug(user.name ?? user.email.split("@")[0] ?? "")
  return { workspaceName: `${base}-postgres` }
}

export function quickStartPlan(): PlanLine[] {
  const template = getTemplateById(POSTGRES_TEMPLATE)
  const validated = validatePostgresConfig({})
  const config = validated.ok
    ? validated.config
    : {
        databaseName: "appdb",
        databaseUser: "tisiops_user",
        postgresVersion: "16-alpine",
      }

  return [
    { label: "Template", value: template.metadata.name },
    { label: "Provider", value: "AWS EC2" },
    { label: "Region", value: "ap-south-1" },
    { label: "Server", value: "t3.micro — 1 vCPU, 1 GB RAM" },
    { label: "Disk", value: "20 GB encrypted gp3 root volume" },
    { label: "OS", value: "Ubuntu 24.04 LTS" },
    { label: "Runtime", value: "Docker Compose + postgres:16-alpine" },
    { label: "Access", value: "Public password-protected PostgreSQL" },
    { label: "Port", value: "5432" },
    { label: "Database", value: config.databaseName },
    { label: "User", value: config.databaseUser },
    { label: "Password", value: "generated securely" },
    { label: "Persistence", value: "enabled" },
    {
      label: "Connection string",
      value: `postgresql://${config.databaseUser}:<hidden>@<server-ip>:5432/${config.databaseName}`,
    },
  ]
}

export function postgresTemplateSummary() {
  return summarize(getTemplateById(POSTGRES_TEMPLATE))
}
