import { DeploymentsList } from "@/components/dashboard/deployments-list"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Deployments" }

export default async function Page() {
  await requireFeature("deployments")

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Deployments
      </h1>
      <p className="mt-2 mb-8 text-base text-ink-muted">
        Every deployment TisiOps has run for you.
      </p>

      <DeploymentsList />
    </div>
  )
}
