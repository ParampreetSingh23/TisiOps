/**
 * Turns Terraform and AWS failure output into something a user can act on.
 *
 * Raw Terraform errors name file paths, variables, provider internals, and
 * occasionally credentials. None of that belongs in a log row or a browser, and
 * none of it tells the user what to do next — so every failure is classified
 * here into a short sentence plus a concrete next step.
 *
 * Rules rather than a model call: this runs on every failure, the phrasings are
 * stable, and a wrong guess here sends someone to fix the wrong thing.
 */

export type FailureCode =
  | "AWS_CREDENTIALS_INVALID"
  | "AWS_PERMISSION_DENIED"
  | "REGION_INVALID"
  | "INSTANCE_TYPE_UNSUPPORTED"
  | "EC2_QUOTA_EXCEEDED"
  | "EIP_QUOTA_EXCEEDED"
  | "SECURITY_GROUP_CONFLICT"
  | "AMI_NOT_FOUND"
  | "KEY_PAIR_FAILURE"
  | "STATE_LOCKED"
  | "STATE_MISSING"
  | "INIT_FAILED"
  | "PROVIDER_DOWNLOAD_FAILED"
  | "APPLY_PARTIAL"
  | "DUPLICATE_RESOURCE"
  | "AWS_THROTTLED"
  | "TERRAFORM_MISSING"
  | "UNKNOWN"

export type Diagnosis = {
  code: FailureCode
  /** One sentence, safe to store and show. Never contains provider detail. */
  message: string
  /** What the user can do. Empty when only an operator can act. */
  nextStep: string
  /** True when running the same job again could plausibly succeed. */
  retryable: boolean
}

/**
 * Ordered: the first pattern that matches wins.
 *
 * Narrow, high-confidence signatures sit above broad ones, because a generic
 * "AccessDenied" would otherwise swallow the specific quota and region cases
 * that have much better advice attached.
 */
const RULES: { pattern: RegExp; diagnosis: Diagnosis }[] = [
  {
    pattern:
      /InvalidClientTokenId|SignatureDoesNotMatch|AuthFailure|UnrecognizedClientException/i,
    diagnosis: {
      code: "AWS_CREDENTIALS_INVALID",
      message: "AWS rejected the TisiOps credentials.",
      nextStep:
        "An administrator needs to check the AWS access key configured on the worker.",
      retryable: false,
    },
  },
  {
    pattern: /RequestLimitExceeded|Throttling|TooManyRequests|Rate exceeded/i,
    diagnosis: {
      code: "AWS_THROTTLED",
      message: "AWS is rate limiting requests right now.",
      nextStep: "Retry in a few minutes.",
      retryable: true,
    },
  },
  {
    pattern: /AddressLimitExceeded|Elastic IP address limit/i,
    diagnosis: {
      code: "EIP_QUOTA_EXCEEDED",
      message:
        "The AWS account has no Elastic IP addresses left in this region.",
      nextStep:
        "Release an unused Elastic IP, deploy to another region, or request a quota increase.",
      retryable: false,
    },
  },
  {
    pattern:
      /InstanceLimitExceeded|VcpuLimitExceeded|MaxSpotInstanceCountExceeded/i,
    diagnosis: {
      code: "EC2_QUOTA_EXCEEDED",
      message: "The AWS account has reached its EC2 limit in this region.",
      nextStep:
        "Terminate an unused instance, choose another region, or request a quota increase.",
      retryable: false,
    },
  },
  {
    pattern:
      /Unsupported.*instance type|InvalidParameterValue.*instance type|does not support the instance type|InvalidInstanceType/i,
    diagnosis: {
      code: "INSTANCE_TYPE_UNSUPPORTED",
      message: "AWS rejected the instance type in this region.",
      nextStep:
        "Choose a smaller plan, or deploy to a region that offers this instance type.",
      retryable: false,
    },
  },
  {
    pattern: /no valid credential sources|NoCredentialProviders/i,
    diagnosis: {
      code: "AWS_CREDENTIALS_INVALID",
      message: "No AWS credentials are configured on the TisiOps worker.",
      nextStep: "An administrator needs to configure AWS access.",
      retryable: false,
    },
  },
  {
    pattern: /UnauthorizedOperation|AccessDenied|not authorized to perform/i,
    diagnosis: {
      code: "AWS_PERMISSION_DENIED",
      message:
        "The AWS credentials are valid but are missing a permission this deployment needs.",
      nextStep:
        "An administrator needs to grant the worker's IAM user EC2 permissions.",
      retryable: false,
    },
  },
  {
    pattern:
      /InvalidAMIID|No AMI found|not found for ami|InvalidAMIID\.NotFound/i,
    diagnosis: {
      code: "AMI_NOT_FOUND",
      message: "No matching Ubuntu image was found in this region.",
      nextStep: "Deploy to another region.",
      retryable: false,
    },
  },
  {
    pattern:
      /InvalidGroup\.Duplicate|already exists.*security group|InvalidPermission\.Duplicate/i,
    diagnosis: {
      code: "SECURITY_GROUP_CONFLICT",
      message: "A security group from an earlier run is still in the way.",
      nextStep:
        "Retry — Terraform reuses what it already created. If it repeats, run a cleanup.",
      retryable: true,
    },
  },
  {
    pattern: /InvalidKeyPair|key pair does not exist/i,
    diagnosis: {
      code: "KEY_PAIR_FAILURE",
      message: "AWS could not find the SSH key pair for this instance.",
      nextStep: "Retry. This deployment does not require SSH access.",
      retryable: true,
    },
  },
  {
    pattern:
      /Error acquiring the state lock|ConditionalCheckFailedException.*lock|state blob is already locked/i,
    diagnosis: {
      code: "STATE_LOCKED",
      message:
        "Another run is holding the Terraform state lock for this deployment.",
      nextStep:
        "Wait for the running job to finish, then retry. A stuck lock needs an administrator to clear it.",
      retryable: true,
    },
  },
  {
    pattern:
      /Failed to load state|state file.*not found|NoSuchBucket|state snapshot was created by/i,
    diagnosis: {
      code: "STATE_MISSING",
      message: "The Terraform state for this deployment could not be read.",
      nextStep:
        "An administrator needs to check the state backend before retrying, so a retry does not create duplicate resources.",
      retryable: false,
    },
  },
  {
    pattern:
      /Failed to install provider|could not download|failed to retrieve.*provider|registry\.terraform\.io.*(timeout|connection)/i,
    diagnosis: {
      code: "PROVIDER_DOWNLOAD_FAILED",
      message:
        "Terraform could not download the AWS provider, usually a network problem on the worker.",
      nextStep: "Retry in a few minutes.",
      retryable: true,
    },
  },
  {
    pattern: /terraform could not start|ENOENT.*terraform/i,
    diagnosis: {
      code: "TERRAFORM_MISSING",
      message: "Terraform is not installed on the TisiOps worker.",
      nextStep: "An administrator needs to install Terraform on the worker.",
      retryable: false,
    },
  },
  {
    pattern:
      /Terraform initialized in an empty directory|Initialization failed|Error: Failed to initialize/i,
    diagnosis: {
      code: "INIT_FAILED",
      message: "Terraform could not initialise the deployment workspace.",
      nextStep: "Retry. If it repeats, an administrator needs to look at it.",
      retryable: true,
    },
  },
  {
    pattern: /already exists|Duplicate|AlreadyExists/i,
    diagnosis: {
      code: "DUPLICATE_RESOURCE",
      message:
        "An AWS resource with this name already exists from an earlier run.",
      nextStep:
        "Retry — Terraform adopts what its state already tracks. If it repeats, run a cleanup first.",
      retryable: true,
    },
  },
]

/**
 * Detects a partially-completed apply.
 *
 * The important case: Terraform created some resources and then failed. A blind
 * "start over" would leave the created ones orphaned and unmanaged, so this is
 * called out separately from a clean failure.
 */
// [\s\S] rather than the `s` flag: this module is also type-checked by the
// frontend, whose target predates dotAll.
const PARTIAL =
  /Creation complete after|still creating|Apply complete![\s\S]*Error|Error: [\s\S]*Creation complete/i

export function diagnoseTerraformFailure(output: string): Diagnosis {
  if (!output?.trim()) {
    return {
      code: "UNKNOWN",
      message: "Terraform failed without reporting a reason.",
      nextStep: "Retry, and check the deployment logs if it repeats.",
      retryable: true,
    }
  }

  for (const rule of RULES) {
    if (rule.pattern.test(output)) return rule.diagnosis
  }

  if (PARTIAL.test(output)) {
    return {
      code: "APPLY_PARTIAL",
      message:
        "Terraform created some resources before it failed, so this deployment is half-built.",
      nextStep:
        "Retry — it reuses the existing state and finishes the missing pieces rather than starting over.",
      retryable: true,
    }
  }

  return {
    code: "UNKNOWN",
    message: "Terraform failed while creating the infrastructure.",
    nextStep: "Retry, and check the deployment logs if it repeats.",
    retryable: true,
  }
}

/** One line for a log row or an error banner. */
export function describeFailure(diagnosis: Diagnosis): string {
  return diagnosis.nextStep
    ? `${diagnosis.message} ${diagnosis.nextStep}`
    : diagnosis.message
}
