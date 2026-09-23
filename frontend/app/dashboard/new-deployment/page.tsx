import {
  SiCaddy,
  SiCaddyHex,
  SiDocker,
  SiDockerHex,
  SiExpress,
  SiGithub,
  SiLetsencrypt,
  SiLetsencryptHex,
  SiLinux,
  SiN8n,
  SiN8nHex,
  SiNextdotjs,
  SiNginx,
  SiNginxHex,
  SiNodedotjs,
  SiNodedotjsHex,
  SiPostgresql,
  SiPostgresqlHex,
  SiReact,
  SiReactHex,
  SiRedis,
  SiRedisHex,
  SiTerraform,
  SiTerraformHex,
  SiTypescript,
  SiTypescriptHex,
  SiUbuntu,
  SiUbuntuHex,
  SiVercel,
  SiVite,
  SiViteHex,
} from "@icons-pack/react-simple-icons"
import { ArrowRight, BadgeCheck, Plus } from "lucide-react"
import Link from "next/link"

import { ProviderIcon } from "@/components/deployment/provider-icon"
import { canUseFeature, requireFeature } from "@/lib/feature-guard"
import {
  hiddenBuiltInTemplateIds,
  listPublishedCustomTemplates,
} from "@tisiops/server/services/templates/admin"
import type { TemplateManifest } from "@tisiops/server/services/templates"

type Mark = {
  name: string
  Icon: React.ComponentType<{ className?: string; color?: string }>
  /** A mark that is black by design cannot keep one colour across themes. */
  monochrome?: boolean
  color?: string
}

type Template = {
  id?: string
  name: string
  description: string
  /** What the template provisions — shown as the stack strip on the card. */
  stack: (Mark | { name: string; provider: string })[]
  /** Official templates carry the verified mark; community ones would not. */
  publisher: string
  verified?: boolean
  href?: string
} & Mark

const templates: Template[] = [
  {
    id: "vercel-frontend",
    // The only template wired to a real flow; the rest still open the wizard.
    name: "Vercel Frontend",
    description:
      "Deploy a Next.js or React frontend from GitHub to a TisiOps-managed Vercel preview URL.",
    Icon: SiVercel,
    // Monochrome mark: follows the theme instead of a fixed black, which
    // disappears on a dark ground.
    monochrome: true,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "GitHub", Icon: SiGithub, monochrome: true },
      { name: "Next.js", Icon: SiNextdotjs, monochrome: true },
      { name: "React", Icon: SiReact, color: SiReactHex },
      { name: "Vite", Icon: SiVite, color: SiViteHex },
      { name: "Vercel", provider: "vercel" },
    ],
    href: "/dashboard/new-deployment/vercel",
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    description: "Provision a clean Ubuntu server for custom deployments.",
    Icon: SiUbuntu,
    color: SiUbuntuHex,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "AWS", provider: "aws" },
      { name: "Ubuntu", Icon: SiUbuntu, color: SiUbuntuHex },
      { name: "Terraform", Icon: SiTerraform, color: SiTerraformHex },
    ],
    href: "/dashboard/new-deployment/aws",
  },
  {
    id: "aws-n8n-server",
    name: "n8n",
    description:
      "Run a private n8n automation server on a TisiOps-managed AWS server.",
    Icon: SiN8n,
    color: SiN8nHex,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "AWS", provider: "aws" },
      { name: "n8n", Icon: SiN8n, color: SiN8nHex },
      { name: "PostgreSQL", Icon: SiPostgresql, color: SiPostgresqlHex },
      { name: "Docker", Icon: SiDocker, color: SiDockerHex },
      { name: "Caddy", Icon: SiCaddy, color: SiCaddyHex },
    ],
    href: "/dashboard/new-deployment/n8n",
  },
  {
    id: "postgres-managed-server",
    name: "PostgreSQL",
    description:
      "Deploy a public password-protected PostgreSQL server with generated credentials.",
    Icon: SiPostgresql,
    color: SiPostgresqlHex,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "AWS", provider: "aws" },
      { name: "PostgreSQL", Icon: SiPostgresql, color: SiPostgresqlHex },
      { name: "Docker", Icon: SiDocker, color: SiDockerHex },
      { name: "Ubuntu", Icon: SiUbuntu, color: SiUbuntuHex },
    ],
    href: "/dashboard/new-deployment/postgres",
  },
  {
    id: "aws-linux",
    // simple-icons has no Amazon/AWS mark (removed at Amazon's request), so the Linux mark stands in.
    name: "AWS Linux",
    description: "Start with an Amazon Linux server environment.",
    Icon: SiLinux,
    monochrome: true,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "AWS", provider: "aws" },
      { name: "Linux", Icon: SiLinux, monochrome: true },
      { name: "Terraform", Icon: SiTerraform, color: SiTerraformHex },
      { name: "nginx", Icon: SiNginx, color: SiNginxHex },
    ],
  },
  {
    id: "node-app",
    name: "Node.js App",
    description: "Deploy a Node.js backend or API service.",
    Icon: SiNodedotjs,
    color: SiNodedotjsHex,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "GitHub", Icon: SiGithub, monochrome: true },
      { name: "Node.js", Icon: SiNodedotjs, color: SiNodedotjsHex },
      { name: "Express", Icon: SiExpress, monochrome: true },
      { name: "Redis", Icon: SiRedis, color: SiRedisHex },
    ],
  },
  {
    id: "next-app",
    name: "Next.js App",
    description: "Deploy a modern Next.js web application.",
    Icon: SiNextdotjs,
    monochrome: true,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "GitHub", Icon: SiGithub, monochrome: true },
      { name: "Next.js", Icon: SiNextdotjs, monochrome: true },
      { name: "TypeScript", Icon: SiTypescript, color: SiTypescriptHex },
      { name: "Node.js", Icon: SiNodedotjs, color: SiNodedotjsHex },
    ],
  },
  {
    id: "docker-app",
    name: "Docker App",
    description: "Deploy an app from an existing Docker setup.",
    Icon: SiDocker,
    color: SiDockerHex,
    publisher: "TisiOps Official",
    verified: true,
    stack: [
      { name: "Docker", Icon: SiDocker, color: SiDockerHex },
      { name: "AWS", provider: "aws" },
      { name: "nginx", Icon: SiNginx, color: SiNginxHex },
      {
        name: "Let's Encrypt",
        Icon: SiLetsencrypt,
        color: SiLetsencryptHex,
      },
    ],
  },
]

function customTemplate(manifest: TemplateManifest): Template {
  return {
    id: manifest.metadata.id,
    name: manifest.metadata.name,
    description: manifest.metadata.description,
    Icon: SiDocker,
    color: SiDockerHex,
    publisher: "TisiOps Admin",
    verified: true,
    stack: [
      { name: manifest.spec.provider.default.toUpperCase(), provider: manifest.spec.provider.default },
      ...manifest.spec.services.slice(0, 3).map((service) => ({
        name: service.name,
        Icon: service.name.includes("postgres") ? SiPostgresql : SiDocker,
        color: service.name.includes("postgres") ? SiPostgresqlHex : SiDockerHex,
      })),
    ],
  }
}

/** One mark in a fixed square so wordmark and square logos read the same size. */
function StackMark({ item }: { item: Template["stack"][number] }) {
  return (
    <span
      title={item.name}
      className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-line bg-canvas"
    >
      {"provider" in item ? (
        <ProviderIcon id={item.provider} />
      ) : (
        <item.Icon
          className={`size-4.5 ${item.monochrome ? "text-ink-strong" : ""}`}
          color={item.monochrome ? "currentColor" : item.color}
        />
      )}
      <span className="sr-only">{item.name}</span>
    </span>
  )
}

export default async function NewDeploymentPage() {
  await requireFeature("new-deployment")
  const showTemplates = await canUseFeature("templates")
  const hidden = showTemplates ? await hiddenBuiltInTemplateIds() : new Set<string>()
  const customTemplates = showTemplates ? await listPublishedCustomTemplates() : []
  const visibleTemplates = [
    ...templates.filter((template) => !template.id || !hidden.has(template.id)),
    ...customTemplates.map(customTemplate),
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-10">
        <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
          New Deployment
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          Create a new deployment from scratch or get started faster with a
          ready-made template.
        </p>

        <Link
          href="/dashboard/new-deployment/create"
          className="group mt-6 flex w-full items-center gap-5 rounded-[8px] bg-brand px-6 py-5 text-left transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-active"
        >
          <span className="flex size-13 shrink-0 items-center justify-center rounded-[8px] bg-white text-brand">
            <Plus className="size-6" aria-hidden />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-semibold tracking-[-0.02em] text-white">
              Create New Deployment
            </span>
            <span className="block text-sm text-white/80">
              Start from scratch
            </span>
          </span>

          <ArrowRight
            className="size-5 shrink-0 text-white transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      </div>

      {showTemplates ? (
        <section>
          <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            Choose from templates
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Start quickly with a pre-configured environment or application
            template.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleTemplates.map((template) => (
              <article
                key={template.name}
                className="flex flex-col rounded-lg border border-line bg-surface p-5 shadow-card transition-colors duration-150 ease-out hover:border-line-warm"
              >
                <div className="flex items-center gap-2.5">
                  {/* Fixed slot: brand marks have different aspect ratios and
                      would otherwise read at different optical sizes. */}
                  <span className="flex size-8 shrink-0 items-center justify-center">
                    {/* A brand mark that is black by design cannot keep a fixed
                        colour across themes, so those follow the text colour.
                        Coloured marks keep theirs — they read on both grounds. */}
                    <template.Icon
                      className={`max-h-7 max-w-7 ${
                        template.monochrome ? "text-ink-strong" : ""
                      }`}
                      color={
                        template.monochrome ? "currentColor" : template.color
                      }
                      aria-hidden
                    />
                  </span>

                  <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-ink-strong">
                    {template.name}
                  </h3>

                  {template.verified ? (
                    <BadgeCheck
                      className="size-4.5 shrink-0 fill-brand text-surface"
                      strokeWidth={2}
                      aria-label="Official template"
                    />
                  ) : null}

                  <span
                    className={`ml-auto shrink-0 rounded-[4px] border px-2 py-0.5 text-xs font-medium ${
                      template.href
                        ? "border-brand/30 bg-brand-soft text-brand"
                        : "border-line bg-canvas text-ink-muted"
                    }`}
                  >
                    {template.href ? "Ready" : "Wizard"}
                  </span>
                </div>

                {/* What gets provisioned, before the prose — the stack is the
                    fastest way to tell two templates apart at a glance. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {template.stack.map((item) => (
                    <StackMark key={item.name} item={item} />
                  ))}
                </div>

                <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                  {template.description}
                </p>
                <p className="mt-3 text-xs text-ink-muted">
                  {template.publisher}
                </p>
                <div className="mt-auto w-full pt-5">
                  <Link
                    href={template.id ? `/dashboard/new-deployment/target?template=${template.id}` : template.href ?? "/dashboard/new-deployment/create"}
                    className="inline-flex h-9 w-full items-center justify-center rounded-[6px] border border-line-warm bg-surface px-4 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
                  >
                    Use Template
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
