import { auth } from "@clerk/nextjs/server"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { isAdmin } from "@/lib/auth"
import { getFeatures } from "@/lib/feature-store"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Protects /dashboard and every child route. Redirects logged-out users to /sign-in.
  await auth.protect()

  return (
    <div className="flex min-h-svh flex-col bg-canvas text-ink-default lg:flex-row">
      <DashboardSidebar
        isAdmin={await isAdmin()}
        openFeatures={getFeatures()
          .filter((feature) => feature.status === "enabled")
          .map((feature) => feature.key)}
      />
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  )
}
