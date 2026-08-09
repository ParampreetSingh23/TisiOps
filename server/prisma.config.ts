import { config } from "dotenv"
import { defineConfig } from "prisma/config"

// Loads server/.env when run from this package.
config({ path: ".env" })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct (unpooled) connection on Neon; the app uses the pooled URL.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
})
