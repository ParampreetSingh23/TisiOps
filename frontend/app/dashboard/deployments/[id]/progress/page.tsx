import Link from "next/link"

import { N8nProgressView } from "@/components/dashboard/n8n-progress"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Deployment progress" }

/**
 * Live progress for a managed-server deployment. The API answers 404 for a
 * deployment that is not this user's, so a pasted id shows nothing.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireFeature("deployments")
  const { id } = await params

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/dashboard/deployments"
        className="text-sm text-ink-muted transition-colors duration-150 ease-out hover:text-ink-strong"
      >
        ← Deployments
      </Link>

      <h1 className="mt-3 mb-6 font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Deployment progress
      </h1>

      <N8nProgressView id={id} />
    </div>
  )
}
