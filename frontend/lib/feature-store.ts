import {
  FEATURE_DEFAULTS,
  type Feature,
  type FeatureKey,
  type FeatureStatus,
} from "@/lib/features"

/**
 * ponytail: process-memory store. Global across users (correct for a
 * platform-level flag) but resets on server restart and is per-instance.
 * Replace `statuses` with a database table when persistence lands — the
 * accessors below are the only readers and writers.
 */
const statuses = new Map<FeatureKey, FeatureStatus>(
  FEATURE_DEFAULTS.map((feature) => [feature.key, feature.status])
)

export function getFeatures(): Feature[] {
  return FEATURE_DEFAULTS.map((feature) => ({
    ...feature,
    status: statuses.get(feature.key) ?? feature.status,
  }))
}

export function getFeatureStatus(key: FeatureKey): FeatureStatus {
  return statuses.get(key) ?? "enabled"
}

export function isFeatureOpen(key: FeatureKey): boolean {
  return getFeatureStatus(key) === "enabled"
}

export function setFeatureStatus(key: FeatureKey, status: FeatureStatus): void {
  statuses.set(key, status)
}
