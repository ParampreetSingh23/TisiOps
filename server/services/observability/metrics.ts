import { metrics } from "@opentelemetry/api"

const meter = metrics.getMeter("tisiops")

export const deploymentTotal = meter.createCounter("deployment_total")
export const deploymentSuccessTotal = meter.createCounter("deployment_success_total")
export const deploymentFailedTotal = meter.createCounter("deployment_failed_total")
export const deploymentDurationMs = meter.createHistogram("deployment_duration_ms")
export const workerJobDurationMs = meter.createHistogram("worker_job_duration_ms")
export const workerJobFailedTotal = meter.createCounter("worker_job_failed_total")
export const redisQueueJobTotal = meter.createCounter("redis_queue_job_total")
export const terraformApplyDurationMs = meter.createHistogram("terraform_apply_duration_ms")
export const sshConnectionFailedTotal = meter.createCounter("ssh_connection_failed_total")
export const healthcheckFailedTotal = meter.createCounter("healthcheck_failed_total")
