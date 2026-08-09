import { z } from "zod"

import { AWS_REGION_IDS } from "../constants/index"

/**
 * Request shapes for the AWS connect flow. Everything crossing the network
 * is parsed here first — the services below assume validated input.
 */

const accessKeyId = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{16,128}$/, "Access Key ID looks wrong. It should look like AKIA…")

const secretAccessKey = z
  .string()
  .trim()
  .min(20, "Secret Access Key is too short")
  .max(256, "Secret Access Key is too long")

const region = z.enum(AWS_REGION_IDS, { error: "Choose a supported region" })

/** POST /api/providers/aws/test — verify credentials, store nothing. */
export const awsTestSchema = z.object({
  provider: z.literal("AWS").default("AWS"),
  accessKeyId,
  secretAccessKey,
  region,
})

/** POST /api/providers/aws — verify again, then save encrypted. */
export const awsConnectionSchema = awsTestSchema.extend({
  name: z
    .string()
    .trim()
    .min(2, "Connection name must be at least 2 characters")
    .max(60, "Connection name must be 60 characters or fewer"),
  confirmedNotRoot: z
    .boolean()
    .refine(
      (value) => value,
      "Confirm these are not root AWS account credentials"
    ),
})

export type AwsTestInput = z.infer<typeof awsTestSchema>
export type AwsConnectionInput = z.infer<typeof awsConnectionSchema>

/** First validation message, for a single clean line in the UI. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request"
}
