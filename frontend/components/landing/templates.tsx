import { SiDocker, SiN8n, SiVercel } from "@icons-pack/react-simple-icons"
import { Server, Wrench } from "lucide-react"

import { ProviderIcon } from "@/components/deployment/provider-icon"
import {
  Section,
  SectionHeading,
  SectionLead,
} from "@/components/landing/section"

/**
 * The template grid.
 *
 * Badges are honest about what exists: only Vercel ships today, and saying so
 * is what makes the rest of the page credible. Brand marks come from the
 * simple-icons package already installed for the dashboard — AWS is not in
 * that set, so it reuses the mark ProviderIcon inlines.
 */

type Status = "Available" | "In progress" | "Coming next" | "Planned" | "Agent"

const BADGES: Record<Status, string> = {
  Available: "border-[#cfe6dc] bg-[#f2f9f6] text-[#0f6b4f]",
  "In progress": "border-brand/30 bg-brand-soft text-brand",
  "Coming next": "border-line-warm bg-canvas text-ink-default",
  Planned: "border-line bg-canvas text-ink-muted",
  Agent: "border-line-warm bg-surface text-ink-default",
}

const TEMPLATES: {
  name: string
  body: string
  status: Status
  icon: React.ReactNode
}[] = [
  {
    name: "Vercel Frontend",
    body: "Deploy Next.js, React, Vite, Astro, and static frontends with correct build settings and preview URLs.",
    status: "Available",
    icon: <SiVercel className="size-5 text-ink-strong" />,
  },
  {
    name: "AWS App Server",
    body: "Create EC2 servers, security groups, Elastic IPs, and deploy apps using Terraform-backed workflows.",
    status: "In progress",
    icon: <ProviderIcon id="aws" />,
  },
  {
    name: "n8n Managed Server",
    body: "Launch n8n on a managed AWS server with Docker, Postgres, persistent storage, and health checks.",
    status: "Coming next",
    icon: <SiN8n className="size-5" color="#EA4B71" />,
  },
  {
    name: "Docker App",
    body: "Deploy containerized apps with safe worker execution, logs, retries, and repair actions.",
    status: "Planned",
    icon: <SiDocker className="size-5" color="#2496ED" />,
  },
  {
    name: "Custom VPS",
    body: "Use your own server and let TisiOps configure Docker, reverse proxy, SSL, and app runtime.",
    status: "Planned",
    icon: <Server className="size-5 text-ink-muted" aria-hidden />,
  },
  {
    name: "AI Repair Agent",
    body: "Detect broken ports, missing Elastic IPs, failed builds, bad output folders, and unreachable apps.",
    status: "Agent",
    icon: <Wrench className="size-5 text-ink-muted" aria-hidden />,
  },
]

export function Templates() {
  return (
    <Section className="border-t border-line bg-surface">
      <div className="max-w-[720px]">
        <SectionHeading>
          Start with templates. Scale into full deployments.
        </SectionHeading>
        <SectionLead>
          Choose a deployment template and TisiOps turns it into a safe,
          reviewable plan before anything runs.
        </SectionLead>
      </div>

      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((template) => (
          <li
            key={template.name}
            className="flex flex-col rounded-[8px] border border-line bg-canvas p-6 transition-colors duration-150 ease-out hover:border-line-warm"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[6px] border border-line bg-surface">
                {template.icon}
              </span>
              <span
                className={`ml-auto rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${BADGES[template.status]}`}
              >
                {template.status}
              </span>
            </div>

            <h3 className="mt-5 text-base font-semibold tracking-[-0.01em] text-ink-strong">
              {template.name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {template.body}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
