import type { Metadata } from "next"

import { FinalCta } from "@/components/landing/final-cta"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Navbar } from "@/components/landing/navbar"
import { Templates } from "@/components/landing/templates"
import { WhyTisiOps } from "@/components/landing/why-tisiops"

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
        <WhyTisiOps />
        <Templates />
        <HowItWorks />
        <FinalCta />
      </main>
    </div>
  )
}
