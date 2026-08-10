import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { TemplateCreator } from "@/components/admin/template-creator"
import { isAdmin } from "@/lib/auth"
import {
  ensureBuiltInTemplates,
  listAdminTemplates,
} from "@tisiops/server/services/templates/admin"

export default async function AdminTemplatesPage() {
  if (!(await isAdmin())) redirect("/dashboard")

  const { userId } = await auth()
  if (!userId) redirect("/dashboard")

  const { prisma } = await import("@tisiops/server/db")
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true },
  })
  if (user) await ensureBuiltInTemplates(user.id)

  return <TemplateCreator templates={await listAdminTemplates()} />
}
