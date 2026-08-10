"use client"

import { UserButton } from "@clerk/nextjs"
import {
  BookOpen,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  Waypoints,
  Terminal,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { TisiOpsLogo } from "@/components/brand/logo"
import { DeploymentNav } from "@/components/dashboard/deployment-nav"
import { ThemeToggleRow } from "@/components/theme-toggle"
import type { FeatureKey } from "@/lib/features"

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  target?: string
  rel?: string
  /** Absent for items that no feature flag governs, such as the Admin Panel. */
  feature?: FeatureKey
}

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboard,
        feature: "overview",
      },
      {
        href: "/dashboard/new-deployment",
        label: "New Deployment",
        icon: Rocket,
        feature: "new-deployment",
      },
      {
        href: "/dashboard/deployments",
        label: "Deployments",
        icon: Terminal,
        feature: "deployments",
      },
      {
        href: "/dashboard/servers",
        label: "Servers",
        icon: Server,
        feature: "servers",
      },
    ],
  },
  {
    label: "AI",
    items: [
      {
        href: "/dashboard/ai-console",
        label: "AI Console",
        icon: Waypoints,
        feature: "ai-console",
      },
      {
        href: "/dashboard/logs",
        label: "Logs",
        icon: FileText,
        feature: "logs",
      },
    ],
  },
  {
    label: "Account & Help",
    items: [
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        feature: "settings",
      },
      {
        href: "/docs",
        label: "Docs",
        icon: BookOpen,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    ],
  },
]

const adminGroup: { label: string; items: NavItem[] } = {
  label: "Admin",
  items: [
    { href: "/dashboard/admin", label: "Admin Panel", icon: ShieldCheck },
    { href: "/dashboard/admin/templates", label: "Templates", icon: FileText },
  ],
}

export function DashboardSidebar({
  isAdmin,
  openFeatures,
}: {
  isAdmin: boolean
  openFeatures: FeatureKey[]
}) {
  const pathname = usePathname()
  const isOpen = (feature?: FeatureKey) =>
    !feature || openFeatures.includes(feature)

  // Locked features vanish for normal users; admins keep them, marked with a lock.
  const featureGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isOpen(item.feature)),
    }))
    .filter((group) => group.items.length > 0)

  const visibleGroups = isAdmin ? [...featureGroups, adminGroup] : featureGroups

  return (
    <aside className="flex scrollbar-subtle shrink-0 flex-col gap-6 border-b border-line bg-surface p-4 lg:sticky lg:top-0 lg:h-svh lg:w-60 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <TisiOpsLogo href="/" />
        <UserButton />
      </div>

      <nav aria-label="Dashboard" className="flex flex-col gap-5">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
              {group.label}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              {group.items.map((item) => {
                // Deployments is a tree, not a destination: clicking it opens
                // the templates below it. "View all deployments" inside keeps
                // /dashboard/deployments one click away.
                if (item.href === "/dashboard/deployments") {
                  return <DeploymentNav key={item.href} />
                }

                const isActive = pathname === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      target={item.target}
                      rel={item.rel}
                      aria-current={isActive ? "page" : undefined}
                      className={
                        isActive
                          ? "flex items-center gap-2.5 rounded-[6px] bg-brand-soft px-2.5 py-2 text-sm font-medium text-brand"
                          : "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas hover:text-ink-strong"
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {item.target === "_blank" ? (
                        <ExternalLink className="size-3 text-ink-muted shrink-0" />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sits below the navigation so it never competes with it. */}
      <div className="mt-auto border-t border-line pt-3">
        <ThemeToggleRow />
      </div>
    </aside>
  )
}
