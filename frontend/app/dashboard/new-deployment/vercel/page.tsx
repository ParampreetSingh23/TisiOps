import { VercelFlow } from "@/components/deployment/vercel-flow"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Vercel Frontend" }

/**
 * Template entry point. Renders the same component the AI Console does, so
 * both paths run one flow.
 */
export default async function Page() {
  await requireFeature("new-deployment")

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Vercel Frontend
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Deploy a Next.js or React frontend from GitHub to a TisiOps-managed
        Vercel preview URL.
      </p>

      <VercelFlow />
    </div>
  )
}
