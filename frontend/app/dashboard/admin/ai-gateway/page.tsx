import { redirect } from "next/navigation"

import { AiGatewayAdmin } from "@/components/admin/ai-gateway-admin"
import { isAdmin } from "@/lib/auth"

export default async function Page() {
  if (!(await isAdmin())) redirect("/dashboard")

  return <AiGatewayAdmin />
}
