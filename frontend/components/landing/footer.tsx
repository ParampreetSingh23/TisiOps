import Link from "next/link"

import { TisiOpsLogo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { label: "Deployments", href: "/dashboard/deployments" },
      { label: "Servers", href: "/dashboard/servers" },
      { label: "AI Console", href: "/dashboard/ai-console" },
      { label: "AI Gateway", href: "/dashboard/ai-gateway" },
      { label: "Templates", href: "/dashboard/new-deployment" },
      { label: "Logs", href: "/dashboard/logs" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Quickstart", href: "/docs" },
      { label: "Architecture", href: "/docs" },
      { label: "Security & Encryption", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/" },
      { label: "GitHub", href: "https://github.com", external: true },
      { label: "Discord", href: "https://discord.com", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Security Policy", href: "#" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand & Status Column */}
          <div className="space-y-4 lg:col-span-4">
            <TisiOpsLogo href="/" />
            <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
              AI-powered DevOps Platform-as-a-Service. Deploy, manage, monitor,
              and repair applications using natural language.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <ThemeToggle />
              <div className="flex items-center gap-2 font-mono text-xs text-ink-muted">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>All systems operational</span>
              </div>
            </div>

            <p className="font-mono text-[11px] text-ink-muted/80 pt-4">
              © {new Date().getFullYear()} TisiOps Inc. All rights reserved.
            </p>
          </div>

          {/* Links Grid */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {FOOTER_LINKS.map((column) => (
              <div key={column.title} className="space-y-3">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-strong">
                  {column.title}
                </p>
                <ul className="space-y-2 text-xs">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        className="text-ink-muted transition-colors hover:text-brand"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
