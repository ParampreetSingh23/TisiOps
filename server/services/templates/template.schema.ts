import { z } from "zod"

/**
 * The shape a TisiOps template manifest has to have, and the safety rules it
 * has to satisfy.
 *
 * A manifest describes a deployment; it does not run one. That makes this file
 * a documentation check rather than a firewall — the firewall is still
 * terraformVariableValidator and services/n8n/plans.ts. It still refuses
 * anything that would describe an unsafe deployment, because a manifest that
 * says Postgres is public is either wrong about the deployment or about to make
 * it wrong, and both are worth failing on.
 */

/** The only ports a template may publish. Anything else is refused. */
export const ALLOWED_PUBLIC_PORTS = [80, 443]

/** Ports that must never be reachable from outside the server. */
export const NEVER_PUBLIC_PORTS = [5678, 5432]

/** Services every TisiOps template is currently expected to declare. */
const REQUIRED_SERVICES = ["postgres", "n8n", "caddy"]

const port = z.number().int().min(1).max(65535)

/**
 * One environment variable.
 *
 * `generated` and `fromSecret` are the two ways a value can be a secret:
 * generated at deploy time, or copied from another service's generated one.
 * Either way it must be marked, and it must not be exposed.
 */
const envVarSchema = z.object({
  default: z.string().optional(),
  readonly: z.boolean().optional(),
  generated: z.boolean().optional(),
  secret: z.boolean().optional(),
  expose: z.boolean().optional(),
  fromSecret: z.string().optional(),
})

const serviceSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "service names are lowercase and safe"),
  image: z.string().min(1),
  type: z.literal("PREBUILT"),
  internalPort: port.optional(),
  public: z.boolean(),
  publicPorts: z.array(port).optional(),
  dependsOn: z.array(z.string()).optional(),
  volumes: z
    .array(z.object({ id: z.string().min(1), dir: z.string().startsWith("/") }))
    .optional(),
  env: z.record(z.string(), envVarSchema).optional(),
  configs: z
    .array(
      z.object({
        path: z.string().startsWith("/"),
        envsubst: z.boolean().optional(),
        template: z.string().min(1),
      })
    )
    .optional(),
})

const templateSchema = z.object({
  apiVersion: z.literal("tisiops.com/v1"),
  kind: z.literal("Template"),
  metadata: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    icon: z.string().min(1),
    tags: z.array(z.string()).default([]),
  }),
  spec: z.object({
    provider: z.object({
      default: z.string().min(1),
      supported: z.array(z.string()).min(1),
    }),
    access: z.object({
      mode: z.enum(["ELASTIC_IP_HTTP", "DOMAIN_HTTPS"]),
      publicProtocol: z.enum(["http", "https"]),
      publicPort: port,
      internalAppPort: port,
    }),
    defaults: z.object({
      region: z.string().min(1),
      plan: z.string().min(1),
      instanceType: z.string().min(1),
      volumeSizeGb: z.number().int().positive(),
      timezone: z.string().min(1),
      n8nVersion: z.string().min(1).optional(),
    }),
    variables: z
      .array(
        z.object({
          key: z.string().min(1),
          type: z.enum(["STRING", "NUMBER", "BOOLEAN"]),
          required: z.boolean(),
          default: z.string().optional(),
          userVisible: z.boolean(),
          advanced: z.boolean(),
          name: z.string().min(1),
          description: z.string().min(1),
        })
      )
      .default([]),
    services: z.array(serviceSchema).min(1),
    security: z.object({
      publicPorts: z.array(port),
      internalOnlyPorts: z.array(port),
      provisioningPorts: z.array(port).default([]),
      secrets: z.array(z.string()).default([]),
    }),
    healthChecks: z
      .array(
        z.object({
          name: z.string().min(1),
          type: z.literal("HTTP"),
          url: z.string().min(1),
          expectedStatus: z.array(z.number().int()).min(1),
        })
      )
      .min(1, "a template must declare at least one health check"),
    instructions: z
      .array(
        z.object({
          type: z.enum(["TEXT", "WARNING"]),
          title: z.string().min(1),
          content: z.string().min(1),
        })
      )
      .min(1, "a template must tell the user how to reach the deployment"),
    readme: z.string().min(1),
  }),
})

/**
 * The rules that need the whole document.
 *
 * Kept as a separate pass rather than inside the field schemas so a failure
 * reads as "this manifest is unsafe" instead of "this field is the wrong type".
 */
export const templateManifestSchema = templateSchema.superRefine(
  (manifest, ctx) => {
    const fail = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path })

    const services = manifest.spec.services
    const names = services.map((service) => service.name)

    for (const [index, name] of names.entries()) {
      if (names.indexOf(name) !== index) {
        fail(`duplicate service name: ${name}`, ["spec", "services", index])
      }
    }

    for (const required of REQUIRED_SERVICES) {
      if (!names.includes(required)) {
        fail(`missing required service: ${required}`, ["spec", "services"])
      }
    }

    // A dependency on a service that is not in the manifest is a start order
    // that can never be satisfied.
    for (const [index, service] of services.entries()) {
      for (const dependency of service.dependsOn ?? []) {
        if (!names.includes(dependency)) {
          fail(`${service.name} depends on unknown service ${dependency}`, [
            "spec",
            "services",
            index,
            "dependsOn",
          ])
        }
      }
    }

    // --- Ports ---------------------------------------------------------------

    const published = [
      ...manifest.spec.security.publicPorts,
      ...services.flatMap((service) => service.publicPorts ?? []),
      manifest.spec.access.publicPort,
    ]

    for (const value of published) {
      if (!ALLOWED_PUBLIC_PORTS.includes(value)) {
        fail(`port ${value} is not an allowed public port`, ["spec"])
      }

      if (NEVER_PUBLIC_PORTS.includes(value)) {
        fail(`port ${value} must never be public`, ["spec"])
      }
    }

    for (const value of NEVER_PUBLIC_PORTS) {
      if (!manifest.spec.security.internalOnlyPorts.includes(value)) {
        fail(`port ${value} must be listed as internal only`, [
          "spec",
          "security",
          "internalOnlyPorts",
        ])
      }
    }

    // A service that publishes nothing must not claim it is public, and one
    // that publishes ports must say so — otherwise the manifest and the
    // security group describe different servers.
    for (const [index, service] of services.entries()) {
      const publishes = (service.publicPorts ?? []).length > 0
      if (service.public !== publishes) {
        fail(
          `${service.name} is marked public: ${service.public} but publishes ${publishes ? "ports" : "nothing"}`,
          ["spec", "services", index, "public"]
        )
      }
    }

    // --- Secrets -------------------------------------------------------------

    const declared = new Set<string>()

    for (const [index, service] of services.entries()) {
      for (const [key, variable] of Object.entries(service.env ?? {})) {
        const path = ["spec", "services", index, "env", key]
        const isSecret = Boolean(variable.generated || variable.fromSecret)

        if (isSecret && variable.secret !== true) {
          fail(`${key} holds a secret and must set secret: true`, path)
        }

        if (isSecret && variable.expose !== false) {
          fail(`${key} holds a secret and must set expose: false`, path)
        }

        // The only thing that would put a real secret in the manifest.
        if (isSecret && variable.default !== undefined) {
          fail(`${key} is a secret and must not carry a default value`, path)
        }

        if (variable.generated) declared.add(key)
      }
    }

    for (const service of services) {
      for (const [key, variable] of Object.entries(service.env ?? {})) {
        if (variable.fromSecret && !declared.has(variable.fromSecret)) {
          fail(`${key} reads unknown secret ${variable.fromSecret}`, [
            "spec",
            "services",
          ])
        }
      }
    }

    for (const secret of manifest.spec.security.secrets) {
      if (!declared.has(secret)) {
        fail(`declared secret ${secret} is generated by no service`, [
          "spec",
          "security",
          "secrets",
        ])
      }
    }
  }
)
