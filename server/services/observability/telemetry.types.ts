export type DeploymentStepStatus = "started" | "success" | "failed"

export type SafeTelemetryAttrs = {
  deploymentId?: string | null
  deploymentJobId?: string | null
  userId?: string | null
  templateId?: string | null
  provider?: string | null
  jobType?: string | null
  workerId?: string | null
  errorCode?: string | null
  serverId?: string | null
  dockerStatus?: string | null
  collectionStatus?: string | null
  health?: string | null
  intent?: string | null
  freshness?: string | null
}

export type DeploymentTimelineEvent = {
  id: string
  step: string
  status: DeploymentStepStatus
  level: string
  message: string
  errorCode: string | null
  durationMs: number | null
  traceId: string | null
  spanId: string | null
  createdAt: string
}
