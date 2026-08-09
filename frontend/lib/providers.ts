/** Cloud provider definitions. Client-safe: plain data only, no icons or server imports. */

export type Provider = {
  id: string
  name: string
  description: string
  available: boolean
}

export const PROVIDER_DEFAULTS: Provider[] = [
  {
    id: "aws",
    name: "AWS",
    description: "Deploy to Amazon Web Services with EC2 and Docker.",
    available: true,
  },
  {
    id: "custom-vps",
    name: "Custom VPS",
    description: "Bring your own server over SSH.",
    available: false,
  },
  {
    id: "gcp",
    name: "GCP",
    description: "Google Cloud Platform compute instances.",
    available: false,
  },
  {
    id: "azure",
    name: "Azure",
    description: "Microsoft Azure virtual machines.",
    available: false,
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    description: "Droplets with predictable pricing.",
    available: false,
  },
  {
    id: "hetzner",
    name: "Hetzner",
    description: "Low-cost European cloud servers.",
    available: false,
  },
]

export const PROVIDER_IDS = PROVIDER_DEFAULTS.map((provider) => provider.id)
