import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts"

/**
 * Identity verification only. sts:GetCallerIdentity is a read-only call that
 * tells us who the credentials belong to — it creates nothing, changes
 * nothing, and costs nothing. No other AWS call belongs in this phase.
 */

export type AwsIdentity = {
  accountId: string | null
  arn: string | null
  userId: string | null
  region: string
}

export type AwsVerifyResult =
  | { success: true; identity: AwsIdentity }
  | { success: false; error: string }

/** AWS error names mapped to something a user can act on. */
const ERROR_MESSAGES: Record<string, string> = {
  InvalidClientTokenId:
    "AWS rejected this Access Key ID. Check the key or create a new one for the IAM user.",
  SignatureDoesNotMatch:
    "AWS rejected the Secret Access Key. Re-copy it — a trailing space is the usual cause.",
  AccessDenied:
    "These credentials are valid but not allowed to call sts:GetCallerIdentity. Attach a policy that permits it.",
  ExpiredToken:
    "These credentials have expired. Generate a new access key for the IAM user.",
  ValidationError: "AWS could not read these credentials. Check both values.",
  UnrecognizedClientException:
    "AWS rejected this Access Key ID. Check the key or create a new one for the IAM user.",
}

function toMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : ""
  if (ERROR_MESSAGES[name]) return ERROR_MESSAGES[name]

  // Network-level failures never reach AWS, so the key may still be fine.
  if (name === "TimeoutError" || name === "NetworkingError") {
    return "Could not reach AWS. Check your network and try again."
  }

  return "Could not verify these credentials with AWS. Check the values and try again."
}

/**
 * Confirms the credentials work and returns who they belong to.
 * Credentials stay in this function — they are never logged or re-thrown.
 */
export async function verifyAwsCredentials(input: {
  accessKeyId: string
  secretAccessKey: string
  region: string
}): Promise<AwsVerifyResult> {
  const client = new STSClient({
    region: input.region,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
    // A wrong key is not worth three retries; fail fast so the UI responds.
    maxAttempts: 2,
  })

  try {
    const identity = await client.send(new GetCallerIdentityCommand({}))

    return {
      success: true,
      identity: {
        accountId: identity.Account ?? null,
        arn: identity.Arn ?? null,
        userId: identity.UserId ?? null,
        region: input.region,
      },
    }
  } catch (error) {
    return { success: false, error: toMessage(error) }
  } finally {
    client.destroy()
  }
}
