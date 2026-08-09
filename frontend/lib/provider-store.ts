import { PROVIDER_DEFAULTS, type Provider } from "@/lib/providers"

/**
 * ponytail: process-memory store, same shape and same ceiling as
 * lib/feature-store.ts — global, resets on restart, per-instance.
 */
const availability = new Map<string, boolean>(
  PROVIDER_DEFAULTS.map((provider) => [provider.id, provider.available])
)

export function getProviders(): Provider[] {
  return PROVIDER_DEFAULTS.map((provider) => ({
    ...provider,
    available: availability.get(provider.id) ?? provider.available,
  }))
}

export function setProviderAvailable(id: string, available: boolean): void {
  availability.set(id, available)
}
