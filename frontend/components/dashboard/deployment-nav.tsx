"use client"

import {
  SiDocker,
  SiDockerHex,
  SiN8n,
  SiN8nHex,
  SiNextdotjs,
  SiNodedotjs,
  SiNodedotjsHex,
  SiPostgresql,
  SiPostgresqlHex,
  SiReact,
  SiReactHex,
  SiUbuntu,
  SiUbuntuHex,
  SiVercel,
} from "@icons-pack/react-simple-icons"
import { ChevronRight, Terminal } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { ProviderIcon } from "@/components/deployment/provider-icon"
import { StatusDot } from "@/components/dashboard/deployments-list"
import { apiFetch } from "@/lib/api"
import type { SafeDeployment } from "@tisiops/server/services/deployments"

/**
 * Deployments as a nested tree: template groups, then the projects deployed
 * with each. Only the signed-in user's deployments ever appear — the API
 * derives the user from the Clerk session and scopes the query to it.
 */

/**
 * Template registry, keyed by `deployment.type`.
 *
 * Only VERCEL exists in the enum today. The rest are here so adding a type is
 * one row in this table rather than a new branch in the component — and a type
 * with no entry still renders, under its own name with a neutral glyph.
 */
const TEMPLATES: Record<string, { label: string; icon: React.ReactNode }> = {
  VERCEL: {
    label: "Vercel",
    icon: <SiVercel className="size-4 text-ink-strong" />,
  },
  NEXTJS: {
    label: "Next.js",
    icon: <SiNextdotjs className="size-4 text-ink-strong" />,
  },
  REACT: {
    label: "React",
    icon: <SiReact className="size-4" color={SiReactHex} />,
  },
  NODE: {
    label: "Node.js",
    icon: <SiNodedotjs className="size-4" color={SiNodedotjsHex} />,
  },
  DOCKER: {
    label: "Docker",
    icon: <SiDocker className="size-4" color={SiDockerHex} />,
  },
  UBUNTU: {
    label: "Ubuntu",
    icon: <SiUbuntu className="size-4" color={SiUbuntuHex} />,
  },
  N8N: { label: "n8n", icon: <SiN8n className="size-4" color={SiN8nHex} /> },
  POSTGRES: {
    label: "PostgreSQL",
    icon: <SiPostgresql className="size-4" color={SiPostgresqlHex} />,
  },
  // Simple Icons dropped the AWS mark at the trademark owner's request, so
  // both of these reuse the logos ProviderIcon already inlines.
  AWS_LINUX: { label: "AWS Linux", icon: <ProviderIcon id="aws" /> },
  CUSTOM_VPS: { label: "Custom VPS", icon: <ProviderIcon id="custom-vps" /> },
}

/** Title case as a last resort, so an unmapped type still reads as a name. */
function templateLabel(type: string): string {
  return (
    TEMPLATES[type]?.label ??
    type
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  )
}

type Group = { type: string; deployments: SafeDeployment[] }

/** Groups in the order the user last deployed to them. */
function groupByTemplate(deployments: SafeDeployment[]): Group[] {
  const groups = new Map<string, SafeDeployment[]>()

  for (const deployment of deployments) {
    const existing = groups.get(deployment.type)
    if (existing) existing.push(deployment)
    else groups.set(deployment.type, [deployment])
  }

  return [...groups].map(([type, rows]) => ({ type, deployments: rows }))
}

/**
 * Height-animated container. A grid row from 0fr to 1fr animates without the
 * fixed pixel height a max-height trick needs, so a group of any length opens
 * at the same speed and none of them clip.
 */
function Collapse({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`grid duration-200 ease-out motion-safe:transition-[grid-template-rows] ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={`size-3.5 shrink-0 text-ink-muted duration-200 ease-out motion-safe:transition-transform ${
        open ? "rotate-90" : ""
      }`}
      aria-hidden
    />
  )
}

/**
 * The hairline that carries depth in this tree. It is drawn per row rather
 * than once around the list, so the segment beside the open project can turn
 * orange — the eye finds the current row without another badge or fill
 * competing for attention in the sidebar.
 *
 * Rows carry their own vertical padding instead of a list gap, which keeps the
 * hairline continuous rather than dashed.
 */
const nest = "ml-[19px] flex flex-col"
const rail = "border-l border-line pl-3"

// No font-size here: nested levels set their own, and two font-size utilities
// on one element resolve by stylesheet order rather than by which was written
// last, which is a coin flip.
const row =
  "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"

const quietRow = `${row} text-ink-default hover:bg-canvas hover:text-ink-strong`

export function DeploymentNav() {
  const pathname = usePathname()
  const [deployments, setDeployments] = useState<SafeDeployment[] | null>(null)

  const inDeployments = pathname.startsWith("/dashboard/deployments")
  const activeId = pathname.split("/dashboard/deployments/")[1] ?? ""

  // Null means "follow the route": the tree is open because a deployment page
  // is open. A click records a real preference, which then wins. The dashboard
  // layout keeps this component mounted across navigation, so a preference
  // survives without a store.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null)
  const [templateOverride, setTemplateOverride] = useState<
    Record<string, boolean>
  >({})

  useEffect(() => {
    let active = true

    apiFetch<SafeDeployment[]>("/api/deployments")
      .then((next) => active && setDeployments(next))
      // A sidebar that cannot load its tree still has to render its links, so
      // a failure reads as "no deployments" rather than an error in the nav.
      .catch(() => active && setDeployments([]))

    return () => {
      active = false
    }
    // Refetched when the open deployment changes, which is what happens right
    // after one is created — the tree would otherwise stay stale until reload.
    // Deliberately not every navigation: this endpoint reconciles in-flight
    // builds against Vercel, so it is not free.
  }, [activeId, inDeployments])

  // Cancelled deployments have nothing left to open — their infrastructure is
  // gone. They stay in "View all deployments" for their history, but the tree
  // is for things you can still use.
  const live = (deployments ?? []).filter(
    (deployment) => deployment.status !== "CANCELLED"
  )

  const groups = groupByTemplate(live)
  const isOpen = openOverride ?? inDeployments

  return (
    <li className="w-full">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpenOverride(!isOpen)}
        className={`text-sm ${
          inDeployments
            ? `${row} bg-brand-soft text-brand`
            : `${quietRow} cursor-pointer`
        }`}
      >
        <Terminal className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Deployments</span>
        <Chevron open={isOpen} />
      </button>

      <Collapse open={isOpen}>
        <ul className={`mt-1 ${nest}`}>
          <li className={rail}>
            <Link
              href="/dashboard/deployments"
              aria-current={
                pathname === "/dashboard/deployments" ? "page" : undefined
              }
              className={`text-[13px] ${
                pathname === "/dashboard/deployments"
                  ? `${row} bg-brand-soft text-brand`
                  : quietRow
              }`}
            >
              View all deployments
            </Link>
          </li>

          {deployments === null ? (
            <li className={`${rail} py-2`}>
              <p className="px-2.5 text-[13px] text-ink-muted">Loading…</p>
            </li>
          ) : null}

          {deployments !== null && live.length === 0 ? (
            <li className={`${rail} px-2.5 py-2`}>
              <p className="text-[13px] text-ink-muted">No deployments yet</p>
              <Link
                href="/dashboard/new-deployment"
                className="mt-1.5 inline-flex text-[13px] font-medium text-brand transition-colors duration-150 ease-out hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Create deployment
              </Link>
            </li>
          ) : null}

          {groups.map((group) => {
            const holdsActive = group.deployments.some(
              (deployment) => deployment.id === activeId
            )
            // Same rule as the parent: the group holding the open deployment
            // is expanded until the user says otherwise.
            const isTemplateOpen = templateOverride[group.type] ?? holdsActive

            return (
              <li key={group.type} className={rail}>
                <button
                  type="button"
                  aria-expanded={isTemplateOpen}
                  onClick={() =>
                    setTemplateOverride((open) => ({
                      ...open,
                      [group.type]: !isTemplateOpen,
                    }))
                  }
                  className={`cursor-pointer text-[13px] ${
                    holdsActive ? `${row} text-ink-strong` : quietRow
                  }`}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {TEMPLATES[group.type]?.icon ?? (
                      <Terminal className="size-4 text-ink-muted" aria-hidden />
                    )}
                  </span>
                  <span className="flex-1 truncate text-left">
                    {templateLabel(group.type)}
                  </span>
                  <span className="text-xs text-ink-muted tabular-nums">
                    {group.deployments.length}
                  </span>
                  <Chevron open={isTemplateOpen} />
                </button>

                <Collapse open={isTemplateOpen}>
                  <ul className={`mt-0.5 ${nest}`}>
                    {group.deployments.map((deployment) => {
                      const isActive = deployment.id === activeId

                      return (
                        <li
                          key={deployment.id}
                          className={
                            // The one place orange is spent in this tree.
                            isActive ? "border-l border-brand pl-3" : rail
                          }
                        >
                          <Link
                            href={`/dashboard/deployments/${deployment.id}`}
                            aria-current={isActive ? "page" : undefined}
                            className={`block rounded-[6px] px-2.5 py-1.5 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                              isActive ? "bg-brand-soft" : "hover:bg-canvas"
                            }`}
                          >
                            <span
                              className={`block truncate text-[13px] font-medium ${
                                isActive ? "text-brand" : "text-ink-default"
                              }`}
                            >
                              {deployment.appName}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 truncate">
                              <StatusDot status={deployment.status} />
                              {deployment.branch ? (
                                <span className="truncate text-xs text-ink-muted">
                                  · {deployment.branch}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </Collapse>
              </li>
            )
          })}
        </ul>
      </Collapse>
    </li>
  )
}
