import type { Diagnosis } from "./terraformDiagnostics"

/**
 * Everything the agent can read about one deployment.
 *
 * Its own module because both halves need it: the database half fills it in,
 * the pure half reasons over it.
 */

export type TerraformInspection = {
  deploymentId: string
  template: string | null
  region: string | null
  status: string
  statusDetail: string | null
  planSummary: string | null
  outputs: Record<string, unknown> | null
  state: {
    key: string | null
    backend: "s3" | "local"
    /** True once an apply has produced outputs we recorded. */
    hasRecordedOutputs: boolean
    workingDirectory: string | null
  }
  server: {
    instanceId: string | null
    elasticIp: string | null
    publicIp: string | null
    securityGroupId: string | null
    instanceType: string
    region: string
    status: string
  } | null
  lastJob: {
    id: string
    type: string
    status: string
    attempts: number
    errorMessage: string | null
  } | null
  diagnosis: Diagnosis | null
  canRetry: boolean
  canDestroy: boolean
}
