/**
 * Feature flag definitions and defaults. Client-safe: data and types only.
 * Live status lives in lib/feature-store.ts.
 */

export type FeatureStatus = "enabled" | "disabled" | "locked"

export type FeatureKey =
  | "overview"
  | "new-deployment"
  | "deployments"
  | "servers"
  | "ai-console"
  | "logs"
  | "settings"
  | "templates"
  | "github"
  | "monitoring"
  | "billing"

export type Feature = {
  key: FeatureKey
  name: string
  description: string
  status: FeatureStatus
}

export const FEATURE_DEFAULTS: Feature[] = [
  {
    key: "overview",
    name: "Overview",
    description: "Dashboard summary of deployments, servers, and AI actions.",
    status: "enabled",
  },
  {
    key: "new-deployment",
    name: "New Deployment",
    description: "Start a deployment from scratch or from a template.",
    status: "enabled",
  },
  {
    key: "deployments",
    name: "Deployments",
    description: "History and status of every deployment.",
    status: "enabled",
  },
  {
    key: "servers",
    name: "Servers",
    description: "Connected servers and their health.",
    status: "enabled",
  },
  {
    key: "ai-console",
    name: "AI Console",
    description: "Natural language control of the platform.",
    status: "enabled",
  },
  {
    key: "logs",
    name: "Logs",
    description: "Build, runtime, and agent logs.",
    status: "enabled",
  },
  {
    key: "settings",
    name: "Settings",
    description: "Workspace and account preferences.",
    status: "enabled",
  },
  {
    key: "templates",
    name: "Templates",
    description: "Pre-configured environments on the New Deployment page.",
    status: "enabled",
  },
  {
    key: "github",
    name: "GitHub Integration",
    description: "Repository access for preparing deployments.",
    status: "locked",
  },
  {
    key: "monitoring",
    name: "Monitoring",
    description: "Metrics, uptime, and alerting.",
    status: "locked",
  },
  {
    key: "billing",
    name: "Billing",
    description: "Plans, usage, and invoices.",
    status: "locked",
  },
]

export const FEATURE_KEYS = FEATURE_DEFAULTS.map((feature) => feature.key)

export const FEATURE_STATUSES: FeatureStatus[] = [
  "enabled",
  "disabled",
  "locked",
]
