"use client"

import { SiGithub } from "@icons-pack/react-simple-icons"
import { Home, LayoutDashboard, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { TisiOpsLogo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

export function DocsNavbar() {
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-canvas/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <TisiOpsLogo href="/" />
          <span className="hidden rounded-[4px] border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-brand sm:inline-block">
            Docs
          </span>
        </div>

        {/* Search input UI */}
        <div className="relative mx-4 max-w-md flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Search className="size-4 text-ink-muted" aria-hidden />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation..."
            className="w-full rounded-[6px] border border-line bg-surface py-1.5 pr-4 pl-9 text-xs text-ink-strong placeholder:text-ink-muted focus:border-brand focus:outline-hidden"
          />
          <kbd className="pointer-events-none absolute inset-y-1.5 right-2 hidden items-center rounded border border-line bg-canvas px-1.5 text-[10px] font-mono text-ink-muted sm:flex">
            ⌘K
          </kbd>
        </div>

        {/* Right Navigation */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-medium text-ink-default transition-colors hover:text-brand sm:flex"
          >
            <Home className="size-3.5" />
            Homepage
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-medium text-ink-default transition-colors hover:text-brand"
          >
            <LayoutDashboard className="size-3.5" />
            Dashboard
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-8 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-muted transition-colors hover:text-ink-strong"
            aria-label="GitHub Repository"
          >
            <SiGithub className="size-4" />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
