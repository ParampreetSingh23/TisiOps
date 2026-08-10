import { N8nWizard } from "@/components/deployment/n8n-wizard"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "n8n Managed Server" }

/**
 * Managed n8n template. Access is enforced by the API on every call — this
 * page only decides what to render, never whether a deployment may happen.
 */
export default async function Page() {
  await requireFeature("new-deployment")

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        n8n
      </h1>
      <p className="mt-2 mb-6 text-base text-ink-muted">
        Run a private n8n automation server on infrastructure TisiOps creates
        and manages for you.
      </p>

      <N8nWizard />
    </div>
  )
}
