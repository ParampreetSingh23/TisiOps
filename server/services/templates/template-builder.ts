import { stringify } from "yaml"

import type { TemplateManifest, TemplateService } from "./templates.types"

/**
 * The manifest side of the admin template creator.
 *
 * The creator is a form, not a YAML editor, so it needs two things this file
 * provides: a starting manifest that is already deployable, and a way to fill
 * in the parts of the manifest a form should not ask a human about — whether a
 * service is "public", which ports the security group opens, which env keys are
 * secrets. Those are all consequences of answers the form already collected,
 * and asking for them separately is how the two drift apart.
 *
 * Deriving them is a convenience, never an escape hatch: template.schema.ts
 * still runs on whatever is submitted, and refuses anything unsafe.
 */

const sortedUnique = (values: number[]) =>
  [...new Set(values)].sort((left, right) => left - right)

/** A new template: the smallest thing that validates and actually deploys. */
export function emptyManifest(): TemplateManifest {
  return {
    apiVersion: "tisiops.com/v1",
    kind: "Template",
    metadata: {
      id: "my-template",
      name: "My Template",
      description: "Deploy a service on a TisiOps managed server.",
      category: "app",
      icon: "docker",
      tags: ["docker"],
    },
    spec: {
      provider: { default: "aws", supported: ["aws"] },
      access: {
        mode: "ELASTIC_IP_HTTP",
        publicProtocol: "http",
        publicPort: 80,
        internalAppPort: 3000,
      },
      defaults: {
        region: "ap-south-1",
        plan: "Starter",
        instanceType: "t3.micro",
        volumeSizeGb: 20,
      },
      variables: [],
      services: [
        {
          name: "app",
          image: "nginx:alpine",
          type: "PREBUILT",
          internalPort: 3000,
          public: true,
          publicPorts: [80],
        },
      ],
      security: {
        publicPorts: [80],
        internalOnlyPorts: [3000],
        provisioningPorts: [22],
        secrets: [],
      },
      healthChecks: [
        {
          name: "http",
          type: "HTTP",
          url: "http://${ELASTIC_IP}",
          expectedStatus: [200],
        },
      ],
      instructions: [
        {
          type: "TEXT",
          title: "Open app",
          content: "http://${ELASTIC_IP}",
        },
      ],
      readme: "# My Template\n",
    },
  }
}

export function emptyService(index: number): TemplateService {
  return {
    name: `service-${index}`,
    image: "nginx:alpine",
    type: "PREBUILT",
    internalPort: 8080,
    public: false,
    publicPorts: [],
  }
}

function normalizeService(service: TemplateService): TemplateService {
  const publicPorts = sortedUnique(service.publicPorts ?? [])
  const env = service.env
    ? Object.fromEntries(
        Object.entries(service.env).map(([key, variable]) => [
          key,
          // A generated value, or one copied from a generated value, is a
          // secret whether or not whoever typed it remembered to say so.
          variable.generated || variable.fromSecret
            ? { ...variable, secret: true, expose: false }
            : variable,
        ])
      )
    : undefined

  return {
    ...service,
    publicPorts,
    public: publicPorts.length > 0,
    ...(env ? { env } : {}),
  }
}

/**
 * Fill in everything the form does not ask about, from what it does.
 *
 * Run this on the manifest the creator is editing before validating or saving
 * it. It never opens a port or exposes a value the services did not already
 * ask for — it only closes the gap in the other direction.
 */
export function normalizeManifest(manifest: TemplateManifest): TemplateManifest {
  const services = manifest.spec.services.map(normalizeService)
  const publicPorts = sortedUnique([
    manifest.spec.access.publicPort,
    ...services.flatMap((service) => service.publicPorts ?? []),
  ])
  const internalOnlyPorts = sortedUnique(
    services
      .map((service) => service.internalPort)
      .filter(
        (port): port is number =>
          typeof port === "number" && !publicPorts.includes(port)
      )
  )
  const secrets = services
    .flatMap((service) => Object.entries(service.env ?? {}))
    .filter(([, variable]) => variable.generated)
    .map(([key]) => key)

  return {
    ...manifest,
    spec: {
      ...manifest.spec,
      services,
      security: {
        ...manifest.spec.security,
        publicPorts,
        internalOnlyPorts,
        secrets: [...new Set(secrets)].sort(),
      },
    },
  }
}

/** What the admin sees in the YAML tab, and what gets stored. */
export function manifestToYaml(manifest: TemplateManifest): string {
  return stringify(manifest, { lineWidth: 0 })
}
