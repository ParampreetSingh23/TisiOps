import { redirect } from "next/navigation"
import Link from "next/link"

import { FeatureFlags } from "@/components/admin/feature-flags"
import { ProviderFlags } from "@/components/admin/provider-flags"
import { isAdmin } from "@/lib/auth"
import { getFeatures } from "@/lib/feature-store"
import { getProviders } from "@/lib/provider-store"

const stats = [
  "Total Users",
  "Total Deployments",
  "Active Servers",
  "Failed Jobs",
]

export default async function AdminPage() {
  // Server-side gate. Hiding the sidebar link is not protection.
  if (!(await isAdmin())) redirect("/dashboard")

  return (
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Admin Panel
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Manage platform-level controls and internal TisiOps operations.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((label) => (
          <div
            key={label}
            className="rounded-lg border border-line bg-surface p-5 shadow-card"
          >
            <p className="text-sm font-medium text-ink-muted">{label}</p>
            <p className="mt-2 font-heading text-3xl font-medium tracking-[-0.03em] text-ink-strong">
              0
            </p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-[8px] border border-line bg-surface p-5 shadow-card">
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          Deployment templates
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Create, validate, preview, test, and publish YAML templates without
          changing built-in file templates.
        </p>
        <Link
          href="/dashboard/admin/templates"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Create New Template
        </Link>
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          Feature flags
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Control which features normal users can reach. Locked and disabled
          features disappear from their sidebar and their routes redirect to the
          overview. Admins always keep access. Changes apply immediately and
          reset when the server restarts.
        </p>

        <div className="mt-6">
          <FeatureFlags features={getFeatures()} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          Cloud providers
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Control which providers users can pick in the deployment wizard.
          Providers marked Coming Soon show in the wizard but cannot be
          selected.
        </p>

        <div className="mt-6">
          <ProviderFlags providers={getProviders()} />
        </div>
      </section>
    </div>
  )
}
