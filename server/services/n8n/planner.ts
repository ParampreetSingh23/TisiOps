import { askTisiOps, type ModelCaller } from "../chat-service"
import {
  findPlan,
  subdomainAutomationEnabled,
  SUBDOMAIN_UNAVAILABLE,
  type N8nConfig,
} from "./plans"

/**
 * The deployment plan the user approves.
 *
 * The steps are computed here, not by the model. What TisiOps will create is a
 * fact about the Terraform module, and a model that invented an extra resource
 * or dropped one would be describing a deployment that does not happen. The
 * model only writes the summary paragraph.
 *
 * Nothing this file returns reaches Terraform. The worker builds its variables
 * from the validated config, so the plan is a description of the run rather
 * than an input to it.
 */

export type PlanSection = { title: string; items: string[] }

export type DeploymentPlan = {
  summary: string
  sections: PlanSection[]
  warnings: string[]
  estimatedMinutes: number
  /** True when the summary is the model's, false when it is the fallback. */
  aiGenerated: boolean
}

export type ByokTarget = { name: string; address: string }

function sections(config: N8nConfig, target?: ByokTarget): PlanSection[] {
  if (target) return [
    { title: "Selected connected server", items: [`${target.name} (${target.address})`, "SSH credentials are stored for this server"] },
    { title: "Checks before changes", items: ["Verify SSH and passwordless sudo", "Check that ports 80 and 443 are free", "Check Docker can be installed and used"] },
    { title: "Changes after approval", items: ["Install Docker Engine and Compose if needed", "Install n8n, PostgreSQL 16, and Caddy with persistent volumes", "Run n8n health check before marking deployment live"] },
    { title: "Network and domain", items: ["No EC2 instance, Elastic IP, or AWS security group will be created", ...(config.domain ? [`Point ${config.domain} at the selected server`, "Caddy requests HTTPS after DNS resolves"] : ["n8n uses the selected server over plain HTTP until a domain is configured", "Webhooks need an HTTPS domain to be reliable"])] },
  ]
  const plan = findPlan(config.plan)

  return [
    {
      title: "Infrastructure created in the TisiOps AWS account",
      items: [
        `EC2 instance (${config.instanceType}, ${plan?.memory ?? "—"}) in ${config.region}`,
        `Encrypted ${config.rootVolumeGb} GB gp3 root volume`,
        "Security group allowing inbound HTTP and HTTPS only",
        "Elastic IP, allocated and associated with the instance",
      ],
    },
    {
      title: "Services installed on the server",
      items: [
        "Docker Engine and the Compose plugin",
        "n8n, from the official image",
        "PostgreSQL 16 as the n8n database, with a persistent volume",
        "Caddy as the reverse proxy in front of n8n",
      ],
    },
    {
      title: "Network and access",
      items: networkItems(config),
    },
    {
      title: "Domain and certificate",
      items: domainItems(config),
    },
    {
      title: "After the deployment",
      items: [
        "A health check runs against n8n before it is marked live",
        "You create the owner account on first visit",
        "Workflow data lives on the server's encrypted volume",
      ],
    },
  ]
}

/**
 * What is reachable, and what is not.
 *
 * Written from the security group and the Compose file rather than from a
 * general description of the stack: n8n's own port and Postgres are never
 * published to the host, so the only way in is Caddy. Port 22 is open to the
 * TisiOps worker for the length of the run, because the worker installs the
 * stack over SSH — saying it is closed would be untrue.
 */
function networkItems(config: N8nConfig): string[] {
  const items = ["Port 80 open — Caddy answers here"]

  if (config.domain) {
    items.push("Port 443 open — n8n over HTTPS, once the certificate is issued")
  }

  return [
    ...items,
    "Port 22 open to the TisiOps worker only, for server setup",
    "Port 5678 not exposed — n8n is reachable only through Caddy",
    "Port 5432 not exposed — Postgres is reachable only by n8n",
  ]
}

function domainItems(config: N8nConfig): string[] {
  if (config.domainMode === "CUSTOM" && config.domain) {
    return [
      `You point an A record for ${config.domain} at the Elastic IP`,
      "The deployment waits at that step until the record resolves",
      "Caddy then requests a certificate automatically over HTTPS",
    ]
  }

  if (config.domainMode === "TISIOPS_SUBDOMAIN") {
    return subdomainAutomationEnabled()
      ? [
          `An A record for ${config.domain} is created automatically`,
          "Caddy requests a certificate for it",
        ]
      : [
          SUBDOMAIN_UNAVAILABLE,
          "n8n will answer on the Elastic IP over plain HTTP until a domain is set",
        ]
  }

  return [
    "No domain: n8n answers on the Elastic IP over plain HTTP",
    "Webhooks that call back into n8n need a real HTTPS domain to be reliable",
  ]
}

function warnings(config: N8nConfig, target?: ByokTarget): string[] {
  if (target) return ["This deployment changes your selected server. No TisiOps AWS resources will be created."]
  const list = [
    "This will create paid AWS resources in the TisiOps AWS account.",
  ]

  if (
    config.domainMode === "TISIOPS_SUBDOMAIN" &&
    !subdomainAutomationEnabled()
  ) {
    list.push(SUBDOMAIN_UNAVAILABLE)
  }

  if (!config.domain) {
    list.push(
      "Without a domain there is no HTTPS, and n8n webhook URLs will use a bare IP address."
    )
  }

  return list
}

const FALLBACK =
  "TisiOps will create one server in its own AWS account, install n8n with a PostgreSQL database behind a Caddy reverse proxy, and hand back the address once a health check passes. Nothing is created until you approve this plan."

/**
 * Asks the model for the summary paragraph only.
 *
 * A failure here is not a deployment failure: the plan still renders with a
 * written fallback, because the steps below it are the real content.
 */
async function summarize(
  config: N8nConfig,
  caller: ModelCaller,
  target?: ByokTarget
): Promise<{
  summary: string
  aiGenerated: boolean
}> {
  if (target) return { summary: `TisiOps will configure n8n on ${target.name} (${target.address}) after SSH and port checks pass. No AWS infrastructure will be created. Nothing changes until you approve this plan.`, aiGenerated: false }
  const plan = findPlan(config.plan)

  try {
    const answer = await askTisiOps(
      [
        {
          role: "user",
          content: [
            "Write a short plain-English summary, 2 to 3 sentences, of this deployment for the person approving it.",
            "Do not use bullet points, headings, or markdown. Do not invent steps. Do not mention credentials.",
            "",
            `Product: n8n workflow automation, self-hosted on a TisiOps-managed AWS server.`,
            `Workspace: ${config.workspaceName}`,
            `Region: ${config.region}`,
            `Plan: ${plan?.name ?? config.plan} (${config.instanceType}, ${plan?.memory ?? ""})`,
            `Address: ${config.domain ? `https://${config.domain}` : "the server's Elastic IP over plain HTTP"}`,
            `Database: PostgreSQL on the same server`,
          ].join("\n"),
        },
      ],
      caller,
      undefined,
      "AGENT"
    )

    const summary = answer.content.trim()
    return summary
      ? { summary, aiGenerated: true }
      : { summary: FALLBACK, aiGenerated: false }
  } catch {
    // Covers a provider failure and a user who has spent their AI limit alike:
    // the plan still renders, because its steps come from the module, not the
    // model. Only the summary paragraph changes.
    return { summary: FALLBACK, aiGenerated: false }
  }
}

export async function buildDeploymentPlan(
  config: N8nConfig,
  caller: ModelCaller,
  target?: ByokTarget
): Promise<DeploymentPlan> {
  const { summary, aiGenerated } = await summarize(config, caller, target)

  return {
    summary,
    sections: sections(config, target),
    warnings: warnings(config, target),
    estimatedMinutes: target ? 3 : 6,
    aiGenerated,
  }
}
