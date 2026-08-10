import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "./generated/client"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add your Neon connection string.")
}

// Reuse one client across hot reloads; a new client per reload exhausts connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const cachedPrisma = globalForPrisma.prisma
const needsFreshPrisma =
  cachedPrisma && typeof (cachedPrisma as { adminTemplate?: unknown }).adminTemplate === "undefined"

export const prisma =
  !cachedPrisma || needsFreshPrisma
    ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
    : cachedPrisma

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

/** True when Prisma can reach the database. Used by the health route. */
export async function checkDatabaseConnection(): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`
  return true
}
