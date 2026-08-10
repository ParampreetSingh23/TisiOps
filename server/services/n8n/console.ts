import { getTemplateById, summarize } from "../templates/template-registry"
import {
  DEFAULT_REGION,
  DEFAULT_TIMEZONE,
  findPlan,
  workspaceSlug,
  type N8nConfigInput,
} from "./plans"

/**
 * The one-click n8n deployment the AI Console offers.
 *
 * Everything here is a decision TisiOps has already made. The MVP deploys one
 * shape of n8n server — Starter, Elastic IP, plain HTTP, Docker Compose — so
 * asking the user for a provider, a region, an instance type, a domain, an SSL
 * email, or a port is asking them to re-choose what the template already fixed.
 *
 * The values are still ordinary config: they go through validateN8nConfig and
 * the template allowlists like any other request, so nothing here can widen
 * what Terraform is allowed to create. This file only decides the defaults.
 *
 * Anyone who wants to change them opens the full wizard, which is the
 * "advanced settings" path — not the conversation.
 */

export const N8N_TEMPLATE = "aws-n8n-server"

/** The message the console opens the flow with. */
export const QUICK_START_MESSAGE =
  "I'll spin up a new n8n server using the TisiOps Managed AWS n8n template."

export const QUICK_START_NEXT_STEP =
  "Review the plan below and approve it. Nothing is created until you do."

export const QUICK_START_WARNING =
  "This will create AWS resources and may cost money."

export const APPROVE_LABEL = "Approve and Deploy n8n"

/** A region code says nothing about where it is; the city does. */
const REGION_CITY: Record<string, string> = {
  "ap-south-1": "Mumbai",
  "us-east-1": "N. Virginia",
  "eu-central-1": "Frankfurt",
}

const QUICK_PLAN_KEY = "STARTER"

/**
 * The default request.
 *
 * `domainMode: "NONE"` is what makes the rest of the flow simple: no DNS wait,
 * no certificate, no email for the certificate authority — Caddy answers on
 * port 80 and n8n is reachable at the Elastic IP the moment it is healthy.
 */
export function quickStartConfig(user: {
  email: string
  name: string | null
}): N8nConfigInput {
  const base = workspaceSlug(user.name ?? user.email.split("@")[0] ?? "")

  return {
    // The email is already on the account, so the console never asks for it.
    workspaceName: base.length >= 3 ? `${base}-n8n` : "n8n-workspace",
    adminEmail: user.email,
    timezone: DEFAULT_TIMEZONE,
    region: DEFAULT_REGION,
    plan: QUICK_PLAN_KEY,
    domainMode: "NONE",
    domain: null,
  }
}

export type PlanLine = { label: string; value: string }

/** Access modes are enum values in the manifest; this is how a person reads them. */
const ACCESS_LABEL: Record<string, string> = {
  ELASTIC_IP_HTTP: "Elastic IP over HTTP",
  DOMAIN_HTTPS: "Domain over HTTPS",
}

/** Service names as the manifest writes them, except where the brand differs. */
const SERVICE_LABEL: Record<string, string> = {
  postgres: "Postgres",
  caddy: "Caddy",
}

/**
 * The whole plan, in six lines.
 *
 * Deliberately not the wizard's plan: this one is read inside a chat message,
 * where a table of Terraform variables is noise. It says which template runs,
 * where the server is, how big it is, how it is reached, what runs on it, and
 * what the address will look like — everything a person needs to decide whether
 * to approve.
 *
 * The descriptive lines come from the aws-n8n-server YAML manifest, so the card
 * and the template description cannot drift apart. Nothing here changes what is
 * deployed: the config below still goes through validateN8nConfig.
 */
export function quickStartPlan(): PlanLine[] {
  const plan = findPlan(QUICK_PLAN_KEY)
  const city = REGION_CITY[DEFAULT_REGION]
  const { metadata, spec } = getTemplateById(N8N_TEMPLATE)

  return [
    { label: "Template", value: metadata.name },
    {
      label: "Region",
      value: city ? `${DEFAULT_REGION} (${city})` : DEFAULT_REGION,
    },
    {
      label: "Server",
      value: `${plan?.name ?? "Starter"} — ${plan?.instanceType ?? "t3.micro"}, ${plan?.memory ?? "1 GB RAM"}, ${plan?.rootVolumeGb ?? 20} GB disk`,
    },
    {
      label: "Access",
      value: ACCESS_LABEL[spec.access.mode] ?? spec.access.mode,
    },
    {
      label: "Stack",
      value: [
        "Docker",
        ...spec.services.map((s) => SERVICE_LABEL[s.name] ?? s.name),
      ].join(" + "),
    },
    {
      label: "Final URL",
      value: `${spec.access.publicProtocol}://<Elastic-IP>`,
    },
  ]
}

/** Template metadata for the console and any template detail view. */
export function n8nTemplateSummary() {
  return summarize(getTemplateById(N8N_TEMPLATE))
}
