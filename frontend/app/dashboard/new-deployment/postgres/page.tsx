import { PostgresFlow } from "@/components/deployment/postgres-flow"
import { requireFeature } from "@/lib/feature-guard"

export default async function PostgresDeploymentPage() {
  await requireFeature("new-deployment")

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Deploy PostgreSQL
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Create a managed PostgreSQL server with generated credentials and
        persistent storage.
      </p>
      <PostgresFlow />
    </div>
  )
}
