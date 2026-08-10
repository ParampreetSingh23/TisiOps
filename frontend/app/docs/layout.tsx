import type { Metadata } from "next"

import { DocsNavbar } from "@/components/docs/docs-navbar"
import { DocsSidebar } from "@/components/docs/docs-sidebar"
import { DocsToc } from "@/components/docs/docs-toc"

export const metadata: Metadata = {
  title: "Documentation — TisiOps AI DevOps Engineer",
  description:
    "Learn how to deploy, debug, monitor, retry, repair, and manage infrastructure with TisiOps AI agents, Terraform modules, and safe plan workflows.",
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink-default antialiased selection:bg-brand-soft selection:text-brand">
      <DocsNavbar />

      <div className="mx-auto flex w-full max-w-[1600px] justify-between">
        <DocsSidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto max-w-3xl">{children}</div>
        </main>
        <DocsToc />
      </div>
    </div>
  )
}
