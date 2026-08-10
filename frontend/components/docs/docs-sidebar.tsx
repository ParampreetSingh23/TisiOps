"use client"

import { Menu, X } from "lucide-react"
import { useEffect, useState } from "react"

export type NavGroup = {
  title: string
  items: { label: string; href: string }[]
}

const DOCS_GROUPS: NavGroup[] = [
  {
    title: "Get Started",
    items: [
      { label: "Introduction", href: "#introduction" },
      { label: "Quickstart", href: "#quickstart" },
      { label: "Core Concepts", href: "#core-concepts" },
    ],
  },
  {
    title: "AI DevOps",
    items: [
      { label: "AI Console", href: "#ai-console" },
      { label: "Agent Orchestration", href: "#agent-orchestration" },
      { label: "GitHub Agent", href: "#github-agent" },
      { label: "Retry & Repair Agent", href: "#retry-repair-agent" },
    ],
  },
  {
    title: "Deployments",
    items: [
      { label: "Vercel Frontend", href: "#vercel-frontend" },
      { label: "Website Deployment", href: "#website-deployment" },
      { label: "n8n Managed Server", href: "#n8n-managed-server" },
      { label: "AWS App Server", href: "#aws-app-server" },
      { label: "Ubuntu / Custom VPS", href: "#ubuntu-vps" },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { label: "Terraform Modules", href: "#terraform-modules" },
      { label: "Redis Worker Queue", href: "#redis-worker-queue" },
      { label: "AWS Credentials", href: "#aws-credentials" },
      { label: "Elastic IP Mode", href: "#elastic-ip-mode" },
    ],
  },
  {
    title: "Observability",
    items: [
      { label: "Logs", href: "#logs" },
      { label: "Monitoring", href: "#monitoring" },
      { label: "Grafana, Prometheus, Loki", href: "#observability-stack" },
    ],
  },
  {
    title: "Account & Safety",
    items: [
      { label: "Pricing", href: "#pricing" },
      { label: "Security & Safety", href: "#security" },
      { label: "FAQ", href: "#faq" },
    ],
  },
]

export function DocsSidebar() {
  const [activeHash, setActiveHash] = useState<string>("#introduction")
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash) {
        setActiveHash(window.location.hash)
      }
    }
    handleHashChange()
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  return (
    <>
      {/* Mobile drawer toggle */}
      <div className="sticky top-14 z-40 flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex items-center gap-2 rounded-[6px] border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-strong"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          {mobileOpen ? "Close Menu" : "Documentation Menu"}
        </button>
        <span className="text-xs font-mono text-ink-muted">{activeHash}</span>
      </div>

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-line bg-canvas p-5 pt-20 transition-transform duration-200 lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:w-60 lg:translate-x-0 lg:overflow-y-auto lg:p-5 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-6">
          {DOCS_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="px-2 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
                {group.title}
              </h3>
              <ul className="mt-2 flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = activeHash === item.href

                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        onClick={() => {
                          setActiveHash(item.href)
                          setMobileOpen(false)
                        }}
                        className={`block rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-brand-soft font-semibold text-brand"
                            : "text-ink-default hover:bg-surface hover:text-ink-strong"
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Backdrop for mobile */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
    </>
  )
}
