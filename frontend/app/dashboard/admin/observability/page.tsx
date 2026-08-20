import { redirect } from "next/navigation"

import { ObservabilityPanel } from "@/components/admin/observability-panel"
import { isAdmin } from "@/lib/auth"

export default async function AdminObservabilityPage() {
  if (!(await isAdmin())) redirect("/dashboard")

  return <ObservabilityPanel />
}
