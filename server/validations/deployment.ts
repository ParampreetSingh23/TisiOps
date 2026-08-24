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

/**
 * Managed n8n request. Values are checked again by validateN8nConfig on the
 * server before anything reaches Terraform — this only shapes the request.
 */
export const n8nDeploymentSchema = z.object({
  workspaceName: z.string().trim().min(3, "Workspace name is required").max(60),
  adminEmail: z.email("Enter a valid admin email"),
  timezone: z.string().trim().min(3).max(60).default("Asia/Kolkata"),
  region: z.string().trim().min(3).max(30).default("ap-south-1"),
  plan: z.enum(["STARTER", "GROWTH", "PRO"]).default("STARTER"),
  domainMode: z.enum(["TISIOPS_SUBDOMAIN", "CUSTOM", "NONE"]).default("NONE"),
  domain: z.string().trim().max(253).nullable().default(null),
})

export const postgresDeploymentSchema = z.object({
  workspaceName: z.string().trim().min(3).max(60).nullable().optional(),
  databaseName: z.string().trim().min(1).max(63).nullable().optional(),
  databaseUser: z.string().trim().min(1).max(63).nullable().optional(),
  postgresVersion: z.string().trim().min(1).max(31).nullable().optional(),
})

/**
 * A plain AWS server request. Shapes the body only — the registry decides
 * which regions, instance types and disk sizes are actually allowed, so an
 * out-of-range value is refused by validateAwsServerConfig rather than here.
 */
export const awsServerSchema = z.object({
  projectName: z.string().trim().min(1).max(60),
  region: z.string().trim().min(1).max(30).nullable().optional(),
  instanceType: z.string().trim().min(1).max(30).nullable().optional(),
  volumeSizeGb: z.number().int().nullable().optional(),
})

/**
 * Terraform Agent plan request. The template name is checked against the
 * registry by the validator — this only shapes the request body.
 */
export const terraformPlanSchema = z.object({
  deploymentId: z.string().trim().min(1, "Deployment is required"),
  template: z.string().trim().min(1, "Template is required").max(60),
  projectName: z.string().trim().min(3, "Project name is required").max(60),
  region: z.string().trim().min(3).max(30),
  instanceType: z.string().trim().min(2).max(30),
  volumeSize: z.number().int().nullable().default(null),
  allowedSshCidr: z.string().trim().max(43).nullable().default(null),
  environment: z.enum(["preview", "staging", "production"]).default("preview"),
})
