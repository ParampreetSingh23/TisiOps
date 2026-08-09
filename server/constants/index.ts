/** Backend constants shared across services, auth helpers, and routes. */

export const ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

/**
 * MVP admin allowlist. Anyone here is promoted to ADMIN on sync.
 * Remove entries once roles are managed in the database or Clerk metadata.
 */
export const ADMIN_EMAILS = ["parampreetsinghlall@gmail.com"]

export function isAdminEmail(email: string | null | undefined): boolean {
  return email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false
}

/**
 * Cloud providers TisiOps knows about. `AWS` is the only one wired up;
 * the rest exist so the schema and the provider picker agree on the list.
 */
export const CLOUD_PROVIDERS = [
  "AWS",
  "GCP",
  "AZURE",
  "DIGITALOCEAN",
  "HETZNER",
  "CUSTOM_VPS",
] as const

export type CloudProviderName = (typeof CLOUD_PROVIDERS)[number]

/** Regions offered in the connect form. Client-safe: imported by the UI too. */
export const AWS_REGIONS = [
  { id: "ap-south-1", city: "Mumbai" },
  { id: "us-east-1", city: "North Virginia" },
  { id: "us-west-2", city: "Oregon" },
  { id: "eu-west-1", city: "Ireland" },
  { id: "eu-central-1", city: "Frankfurt" },
  { id: "ap-southeast-1", city: "Singapore" },
] as const

export const AWS_REGION_IDS = AWS_REGIONS.map((region) => region.id) as unknown as [
  string,
  ...string[],
]
