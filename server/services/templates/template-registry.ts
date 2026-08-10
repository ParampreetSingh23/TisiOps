import { loadTemplateFile } from "./template-loader"
import type { TemplateManifest, TemplateSummary } from "./templates.types"

export type * from "./templates.types"

/**
 * The YAML template manifests.
 *
 * What this is
 * ------------
 * TisiOps describes each deployable template in a YAML manifest under
 * `server/templates/`. The manifest is the written description of a template:
 * its name, category, tags, provider, access mode, services, ports, volumes,
 * env keys, secrets, health checks, and the instructions shown to the user.
 *
 * What it is NOT, yet
 * -------------------
 * It is metadata- and planning-first. Nothing here executes a deployment.
 * The existing path is untouched and still does the work:
 *
 *   validateN8nConfig  → the allowlists that guard AWS spend
 *   createManagedN8nDeployment → Deployment + DeploymentJob rows, Redis job
 *   n8nManagedDeployment.handler → the worker
 *   n8nBootstrap.service → the real docker-compose.yml, Caddyfile, and .env
 *
 * The manifest is read for display and description only: the AI Console plan
 * card, template details, and logs. Manifest-driven execution stays off until a
 * generator can produce byte-for-byte what n8nBootstrap.service already
 * produces — the current manifest deliberately does not (no alpine image tags,
 * no memory limits, no Postgres healthcheck, no 443), so switching to it today
 * would change a working deployment.
 *
 * Failure mode
 * ------------
 * Manifests load and validate at import. An invalid one throws before the
 * server can serve a request, rather than silently describing a deployment
 * incorrectly.
 */

/** Every manifest TisiOps ships, by file. n8n only for now. */
const MANIFEST_FILES = ["n8n/aws-n8n-server.yaml"]

const REGISTRY: Map<string, TemplateManifest> = new Map(
  MANIFEST_FILES.map((file) => {
    const manifest = loadTemplateFile(file)
    return [manifest.metadata.id, manifest]
  })
)

export class UnknownTemplateError extends Error {
  constructor(id: string) {
    super(`Unknown template: ${id}`)
    this.name = "UnknownTemplateError"
  }
}

/**
 * Throws rather than returning undefined: every caller today names a template
 * it knows exists, so a miss is a bug in TisiOps, not a user input to branch on.
 */
export function getTemplateById(id: string): TemplateManifest {
  const manifest = REGISTRY.get(id)
  if (!manifest) throw new UnknownTemplateError(id)

  return manifest
}

export function listTemplates(): TemplateManifest[] {
  return [...REGISTRY.values()]
}

/** The list-view shape: metadata plus the few spec facts a card shows. */
export function summarize(manifest: TemplateManifest): TemplateSummary {
  return {
    ...manifest.metadata,
    accessMode: manifest.spec.access.mode,
    provider: manifest.spec.provider.default,
    region: manifest.spec.defaults.region,
    plan: manifest.spec.defaults.plan,
    services: manifest.spec.services.map((service) => service.name),
  }
}
