import {
  SiDocker,
  SiDockerHex,
  SiLinux,
  SiN8n,
  SiN8nHex,
  SiNextdotjs,
  SiNodedotjs,
  SiNodedotjsHex,
  SiUbuntu,
  SiUbuntuHex,
  SiVercel,
} from "@icons-pack/react-simple-icons"
import { ArrowRight, Plus } from "lucide-react"
import Link from "next/link"

import { canUseFeature, requireFeature } from "@/lib/feature-guard"

const templates = [
  {
    // The only template wired to a real flow; the rest still open the wizard.
    name: "Vercel Frontend",
    description:
      "Deploy a Next.js or React frontend from GitHub to a TisiOps-managed Vercel preview URL.",
    Icon: SiVercel,
    // Monochrome mark: follows the theme instead of a fixed black, which
    // disappears on a dark ground.
    monochrome: true,
    href: "/dashboard/new-deployment/vercel",
  },
  {
    name: "Ubuntu",
    description: "Provision a clean Ubuntu server for custom deployments.",
    Icon: SiUbuntu,
    color: SiUbuntuHex,
  },
  {
    name: "n8n",
    description:
      "Run a private n8n automation server on a TisiOps-managed AWS server.",
    Icon: SiN8n,
    color: SiN8nHex,
    href: "/dashboard/new-deployment/n8n",
  },
  {
    // simple-icons has no Amazon/AWS mark (removed at Amazon's request), so the Linux mark stands in.
    name: "AWS Linux",
    description: "Start with an Amazon Linux server environment.",
    Icon: SiLinux,
    monochrome: true,
  },
  {
    name: "Node.js App",
    description: "Deploy a Node.js backend or API service.",
    Icon: SiNodedotjs,
    color: SiNodedotjsHex,
  },
  {
    name: "Next.js App",
    description: "Deploy a modern Next.js web application.",
    Icon: SiNextdotjs,
    monochrome: true,
  },
  {
    name: "Docker App",
    description: "Deploy an app from an existing Docker setup.",
    Icon: SiDocker,
    color: SiDockerHex,
  },
]

export default async function NewDeploymentPage() {
  await requireFeature("new-deployment")
  const showTemplates = await canUseFeature("templates")

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
            {templates.map((template) => (
              <article
                key={template.name}
                className="flex flex-col rounded-lg border border-line bg-surface p-5 shadow-card"
              >
                {/* Fixed slot: brand marks have different aspect ratios and
                    would otherwise read at different optical sizes. */}
                <span className="flex size-8 items-center justify-center">
                  {/* A brand mark that is black by design cannot keep a fixed
                      colour across themes, so those follow the text colour.
                      Coloured marks keep theirs — they read on both grounds. */}
                  <template.Icon
                    className={`max-h-7 max-w-7 ${
                      "monochrome" in template && template.monochrome
                        ? "text-ink-strong"
                        : ""
                    }`}
                    color={
                      "monochrome" in template && template.monochrome
                        ? "currentColor"
                        : template.color
                    }
                    aria-hidden
                  />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-[-0.01em] text-ink-strong">
                  {template.name}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {template.description}
                </p>
                <div className="mt-auto w-full pt-5">
                  <Link
                    href={template.href ?? "/dashboard/new-deployment/create"}
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
