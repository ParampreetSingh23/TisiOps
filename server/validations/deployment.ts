import { z } from "zod"

/**
 * Deployment request shapes. No userId is ever accepted — the owner comes
 * from the Clerk session.
 */

/** Real analysis reads the repository; the language hint is gone on purpose. */
export const analyzeRepositorySchema = z.object({
  repositoryOwner: z.string().trim().min(1, "Select a repository"),
  repositoryName: z.string().trim().min(1, "Select a repository"),
  branch: z.string().trim().min(1, "Select a branch"),
  servicePath: z.string().trim().max(200).nullable().default(null),
})

const environmentVariable = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Environment variable name is required")
    .max(128)
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      "Names use letters, digits, and underscores, and cannot start with a digit"
    ),
  value: z.string().min(1, "Environment variable value is required").max(4096),
  target: z.enum(["PRODUCTION", "PREVIEW", "DEVELOPMENT"]).default("PREVIEW"),
})

export const approveDeploymentSchema = z.object({
  appName: z.string().trim().min(1, "App name is required").max(80),
  repositoryName: z.string().trim().min(1, "Select a repository").max(200),
  repositoryOwner: z
    .string()
    .trim()
    .min(1, "Repository owner is required")
    .max(200),
  repositoryUrl: z.url().nullable().default(null),
  branch: z.string().trim().min(1, "Select a branch").max(200),
  framework: z.string().trim().max(80).nullable().default(null),
  /** Monorepo folder to deploy, e.g. "frontend". */
  servicePath: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9._\/-]*$/, "Invalid folder path")
    .nullable()
    .default(null),
  buildCommand: z.string().trim().max(200).nullable().default(null),
  environmentVariables: z.array(environmentVariable).max(100).default([]),
  approved: z
    .boolean()
    .refine((value) => value, "Approve the deployment plan to continue"),
})

export type AnalyzeRepositoryInput = z.infer<typeof analyzeRepositorySchema>
export type ApproveDeploymentInput = z.infer<typeof approveDeploymentSchema>
