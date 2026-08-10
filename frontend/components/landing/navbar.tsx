import { Show, UserButton } from "@clerk/nextjs"
import Link from "next/link"

import { TisiOpsLogo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

const primaryLink =
  "inline-flex h-9 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover active:bg-brand-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"

const quietLink =
  "inline-flex h-9 items-center justify-center rounded-[6px] px-3 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-canvas/90 backdrop-blur-[2px]">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-14"
      >
        <TisiOpsLogo />

        <div className="flex items-center gap-2">
          <Link
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={quietLink}
          >
            Docs
          </Link>
          <ThemeToggle />
          <Show when="signed-out">
            <Link href="/sign-in" className={quietLink}>
              Login
            </Link>
            <Link href="/sign-up" className={primaryLink}>
              Get Started
            </Link>
          </Show>

          <Show when="signed-in">
            <Link href="/dashboard" className={quietLink}>
              Dashboard
            </Link>
            <UserButton />
          </Show>
        </div>
      </nav>
    </header>
  )
}
