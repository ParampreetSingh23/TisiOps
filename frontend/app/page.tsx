import type { Metadata } from "next"

import { Hero } from "@/components/landing/hero"
import { Navbar } from "@/components/landing/navbar"

export const metadata: Metadata = {
  title: "TisiOps — Deploy apps using natural language",
  description:
    "TisiOps is an AI DevOps engineer that deploys, monitors, debugs, and manages your applications without manual server, Docker, Nginx, SSL, or CI/CD configuration.",
}

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col bg-canvas text-ink-default">
      <Navbar />
      <main className="flex-1">
        <Hero />
      </main>
    </div>
  )
}
