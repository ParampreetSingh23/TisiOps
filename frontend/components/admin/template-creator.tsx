"use client"

import {
  AlertTriangle,
  Check,
  CircleAlert,
  FileCode2,
  FlaskConical,
  Loader2,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react"
import { useMemo, useRef, useState, useTransition } from "react"
import { parse } from "yaml"

import {
  deleteTemplateAction,
  markTemplateTestedAction,
  publishTemplateAction,
  saveTemplateAction,
  setTemplateVisibleAction,
  validateTemplateAction,
} from "@/app/dashboard/admin/actions"
import {
  AddButton,
  Area,
  Empty,
  Entry,
  Grid,
  List,
  Num,
  Pane,
  Pick,
  Ports,
  Section,
  Text,
  Toggle,
  ghostButton,
  labelText,
  primaryButton,
  tinyButton,
} from "@/components/admin/template-fields"
import type {
  SafeAdminTemplate,
  TemplateReview,
} from "@tisiops/server/services/templates/admin"
import {
  emptyManifest,
  emptyService,
  manifestToYaml,
  normalizeManifest,
} from "@tisiops/server/services/templates/builder"
import type { TemplateManifest } from "@tisiops/server/services/templates"

type Spec = TemplateManifest["spec"]
type Service = Spec["services"][number]
type EnvVar = NonNullable<Service["env"]>[string]

const BUILT_IN_IDS = ["aws-n8n-server", "postgres-managed-server"]
const DANGER = "#c4422a"

const RUNNERS = [
  { value: "", label: "No runner — cannot deploy" },
  { value: "docker-compose-server-runner", label: "Docker Compose server" },
  { value: "database-service-runner", label: "Database service" },
  { value: "n8n-managed-server-runner", label: "n8n managed server" },
  { value: "custom-handler", label: "Custom handler — not publishable yet" },
] as const

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "services", label: "Services" },
  { id: "variables", label: "Variables" },
  { id: "docs", label: "Docs" },
  { id: "yaml", label: "YAML" },
] as const

type Tab = (typeof TABS)[number]["id"]

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Every field the builder reads without a fallback, present and the right shape. */
function isRenderable(value: TemplateManifest | null): value is TemplateManifest {
  const spec = value?.spec as Spec | undefined
  return Boolean(
    value?.metadata &&
      spec?.provider &&
      spec.access &&
      spec.defaults &&
      spec.security &&
      Array.isArray(spec.security.publicPorts) &&
      Array.isArray(spec.security.provisioningPorts) &&
      Array.isArray(spec.services) &&
      Array.isArray(spec.variables) &&
      Array.isArray(spec.healthChecks) &&
      Array.isArray(spec.instructions)
  )
}

type EnvKind = "value" | "generated" | "fromSecret"

function envKind(variable: EnvVar): EnvKind {
  if (variable.generated) return "generated"
  if (variable.fromSecret) return "fromSecret"
  return "value"
}

/**
 * Build the env entry for a kind rather than exposing `secret`/`expose` as
 * checkboxes. The three kinds are the only combinations the validator accepts,
 * so the form cannot produce a manifest that leaks a generated credential.
 */
function envForKind(kind: EnvKind, current: EnvVar, firstSecret: string): EnvVar {
  if (kind === "generated") return { generated: true, secret: true, expose: false }
  if (kind === "fromSecret") {
    return {
      fromSecret: current.fromSecret || firstSecret,
      secret: true,
      expose: false,
    }
  }
  return { default: current.default ?? "" }
}

export function TemplateCreator({
  templates,
}: {
  templates: SafeAdminTemplate[]
}) {
  const [items, setItems] = useState(templates)
  const [manifest, setManifest] = useState<TemplateManifest>(emptyManifest)
  const [runnerType, setRunnerType] = useState<string>(
    "docker-compose-server-runner"
  )
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [saved, setSaved] = useState<SafeAdminTemplate | null>(null)
  const [review, setReview] = useState<TemplateReview | null>(null)
  const [tab, setTab] = useState<Tab>("overview")
  const [yamlDraft, setYamlDraft] = useState<string | null>(null)
  const [idLocked, setIdLocked] = useState(false)
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null
  )
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const normalized = useMemo(() => normalizeManifest(manifest), [manifest])
  const yamlText = yamlDraft ?? manifestToYaml(normalized)
  const spec = manifest.spec

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) =>
      `${item.name} ${item.templateId} ${item.category}`
        .toLowerCase()
        .includes(needle)
    )
  }, [items, query])

  const secretKeys = useMemo(
    () =>
      spec.services.flatMap((service) =>
        Object.entries(service.env ?? {})
          .filter(([, variable]) => variable.generated)
          .map(([key]) => key)
      ),
    [spec.services]
  )

  // --- Editing ---------------------------------------------------------------

  function patchMeta(patch: Partial<TemplateManifest["metadata"]>) {
    setYamlDraft(null)
    setManifest((current) => ({
      ...current,
      metadata: { ...current.metadata, ...patch },
    }))
  }

  function patchSpec(patch: Partial<Spec>) {
    setYamlDraft(null)
    setManifest((current) => ({
      ...current,
      spec: { ...current.spec, ...patch },
    }))
  }

  function patchService(index: number, patch: Partial<Service>) {
    patchSpec({
      services: spec.services.map((service, at) =>
        at === index ? { ...service, ...patch } : service
      ),
    })
  }

  function patchEnv(index: number, key: string, patch: EnvVar | null) {
    const entries = Object.entries(spec.services[index].env ?? {})
    const next = patch
      ? entries.map(([name, variable]) =>
          name === key ? ([name, patch] as const) : ([name, variable] as const)
        )
      : entries.filter(([name]) => name !== key)
    patchService(index, { env: Object.fromEntries(next) })
  }

  function renameEnv(index: number, key: string, nextKey: string) {
    const entries = Object.entries(spec.services[index].env ?? {})
    patchService(index, {
      env: Object.fromEntries(
        entries.map(([name, variable]) =>
          name === key ? [nextKey, variable] : [name, variable]
        )
      ),
    })
  }

  function readYaml(text: string) {
    setYamlDraft(text)
    try {
      const parsed = parse(text) as TemplateManifest | null
      // Half a document would blank the form, so only adopt a shape the builder
      // can render. Deciding whether it is a *valid* manifest is the server's
      // job, and happens on Validate.
      if (isRenderable(parsed)) setManifest(parsed)
    } catch {
      // Keep the text as typed; the error surfaces on Validate.
    }
  }

  // --- Server round trips -----------------------------------------------------

  function formData() {
    return Object.entries({
      templateId: manifest.metadata.id,
      name: manifest.metadata.name,
      description: manifest.metadata.description,
      category: manifest.metadata.category,
      tags: manifest.metadata.tags.join(", "),
      iconUrl: manifest.metadata.icon,
      coverImageUrl,
      runnerType,
      yamlContent: yamlText,
    }).reduce((data, [key, value]) => {
      data.set(key, value)
      return data
    }, new FormData())
  }

  function run(action: () => Promise<string>) {
    setNotice(null)
    startTransition(async () => {
      try {
        setNotice({ tone: "ok", text: await action() })
      } catch (error) {
        setNotice({ tone: "bad", text: (error as Error).message })
      }
    })
  }

  function validate() {
    run(async () => {
      const next = await validateTemplateAction(null, formData())
      setReview(next)
      if (next.manifest) setManifest(next.manifest)
      setYamlDraft(null)
      if (!next.valid) throw new Error(next.errors[0] ?? "Template is not valid")
      return next.securityPassed
        ? "Template is valid and passed security review."
        : "Template parses, but the security review failed."
    })
  }

  function save() {
    run(async () => {
      const result = await saveTemplateAction(null, formData())
      setReview(result.review)
      if (!result.ok) {
        throw new Error(
          result.review.errors[0] ?? "Fix the errors before saving a draft."
        )
      }
      setSaved(result.template)
      setItems((current) => [
        result.template,
        ...current.filter((item) => item.id !== result.template.id),
      ])
      return `Saved ${result.template.templateId} v${result.template.version} as ${result.template.status.toLowerCase()}.`
    })
  }

  function loadTemplate(template: SafeAdminTemplate) {
    setSaved(template)
    setManifest(template.parsedManifest)
    setRunnerType(template.runnerType)
    setCoverImageUrl(template.coverImageUrl ?? "")
    setReview(null)
    setYamlDraft(null)
    setIdLocked(true)
    setNotice(null)
    setTab("overview")
  }

  function createNew() {
    setSaved(null)
    setManifest(emptyManifest())
    setRunnerType("docker-compose-server-runner")
    setCoverImageUrl("")
    setReview(null)
    setYamlDraft(null)
    setIdLocked(false)
    setNotice(null)
    setTab("overview")
  }

  function testDeployment() {
    if (!saved) return
    run(async () => {
      await markTemplateTestedAction(saved.id)
      const next = { ...saved, status: "TESTED" as const }
      setSaved(next)
      setItems((current) =>
        current.map((item) => (item.id === saved.id ? next : item))
      )
      return "Marked tested. It is ready to publish."
    })
  }

  function publish() {
    if (!saved) return
    const confirmed = window.confirm(
      `Publish ${saved.templateId} v${saved.version}? Deployments already running on an older version keep that version.`
    )
    if (!confirmed) return

    run(async () => {
      await publishTemplateAction(saved.id, true)
      const next = { ...saved, status: "PUBLISHED" as const }
      setSaved(next)
      setItems((current) =>
        current.map((item) => (item.id === saved.id ? next : item))
      )
      return `Published ${saved.templateId} v${saved.version}.`
    })
  }

  function setVisible(template: SafeAdminTemplate, visible: boolean) {
    run(async () => {
      const next = await setTemplateVisibleAction(template.id, visible)
      setItems((current) =>
        current.map((item) => (item.id === next.id ? next : item))
      )
      if (saved?.id === next.id) setSaved(next)
      return visible
        ? `${next.name} now appears on New Deployment.`
        : `${next.name} is hidden from New Deployment.`
    })
  }

  function removeTemplate(template: SafeAdminTemplate) {
    if (!window.confirm(`Delete ${template.templateId}? This cannot be undone.`)) {
      return
    }
    run(async () => {
      await deleteTemplateAction(template.id)
      setItems((current) => current.filter((item) => item.id !== template.id))
      if (saved?.id === template.id) createNew()
      return `Deleted ${template.templateId}.`
    })
  }

  const canPublish = Boolean(
    saved && review?.valid && review.securityPassed && review.runnerSupported
  )

  return (
    // A workbench, not a document: on a desktop the tab owns the viewport and
    // each rail scrolls on its own, so the manifest you are editing never
    // scrolls the list and the review out of sight.
    <div className="flex flex-col lg:h-[calc(100svh-5rem)] lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
            {manifest.metadata.name || "Untitled template"}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="font-mono">{manifest.metadata.id || "no-id"}</span>
            <span aria-hidden>·</span>
            <span>{saved ? `v${saved.version}` : "unsaved"}</span>
            <span aria-hidden>·</span>
            <StatusPill status={saved?.status ?? "DRAFT"} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghostButton} onClick={createNew}>
            <Plus className="size-4" aria-hidden />
            New template
          </button>
          <button
            type="button"
            className={ghostButton}
            onClick={validate}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="size-4" aria-hidden />
            )}
            Validate
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={save}
            disabled={isPending}
          >
            Save draft
          </button>
        </div>
      </header>

      {notice ? (
        <p
          className="mb-3 flex shrink-0 items-start gap-2 rounded-[6px] border border-line bg-surface px-3 py-2 text-sm text-ink-default"
          style={
            notice.tone === "bad"
              ? { borderColor: DANGER, color: DANGER }
              : undefined
          }
        >
          {notice.tone === "bad" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          )}
          {notice.text}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-line bg-surface shadow-card lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-line lg:min-h-0 lg:w-60 lg:border-r xl:w-64">
          <div className="shrink-0 border-b border-line p-3">
            <div className="flex h-9 items-center gap-2 rounded-[6px] border border-line-warm px-2.5">
              <Search className="size-3.5 text-ink-muted" aria-hidden />
              <input
                className="w-full bg-transparent text-sm text-ink-strong outline-none placeholder:text-ink-muted"
                placeholder="Find template"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <ul className="max-h-64 min-h-0 flex-1 overflow-y-auto scrollbar-subtle lg:max-h-none">
            {visibleItems.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink-muted">
                No templates match.
              </li>
            ) : (
              visibleItems.map((template) => (
                <li
                  key={template.id}
                  className={`relative border-b border-line last:border-b-0 ${
                    saved?.id === template.id
                      ? "bg-brand-soft"
                      : "hover:bg-canvas"
                  }`}
                >
                  {saved?.id === template.id ? (
                    <span
                      className="absolute inset-y-0 left-0 w-[2px] bg-brand"
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => loadTemplate(template)}
                    className="block w-full px-3.5 pt-2.5 pb-1.5 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-ink-strong">
                      {template.name}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <StatusPill status={template.status} />
                      <span className="font-mono text-[11px] text-ink-muted">
                        v{template.version}
                      </span>
                    </span>
                  </button>
                  <div className="flex gap-3 px-3.5 pb-2.5 text-[11px]">
                    <button
                      type="button"
                      className="text-ink-muted transition-colors hover:text-ink-strong disabled:opacity-40"
                      disabled={isPending}
                      onClick={() =>
                        setVisible(template, template.status !== "PUBLISHED")
                      }
                    >
                      {template.status === "PUBLISHED"
                        ? "Hide from users"
                        : "Show to users"}
                    </button>
                    {BUILT_IN_IDS.includes(template.templateId) ? null : (
                      <button
                        type="button"
                        className="transition-opacity hover:underline disabled:opacity-40"
                        style={{ color: DANGER }}
                        disabled={isPending}
                        onClick={() => removeTemplate(template)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-4 scrollbar-subtle lg:px-6">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  if (entry.id !== "yaml") setYamlDraft(null)
                  setTab(entry.id)
                }}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === entry.id
                    ? "border-brand text-ink-strong"
                    : "border-transparent text-ink-muted hover:text-ink-default"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
            {/* Fields stop at a readable measure instead of stretching to the
                width of the pane on a large monitor. */}
            <div className="mx-auto max-w-[960px] space-y-10 px-4 py-6 lg:px-6">
            {tab === "overview" ? (
              <Section
                title="Identity"
                hint="What a user sees on the New Deployment page. These fields are written into the manifest, so the YAML always agrees with them."
              >
                <Grid>
                  <Text
                    label="Name"
                    value={manifest.metadata.name}
                    onChange={(name) =>
                      patchMeta(
                        idLocked ? { name } : { name, id: slugify(name) }
                      )
                    }
                  />
                  <Text
                    label="Template ID"
                    mono
                    value={manifest.metadata.id}
                    hint="Lowercase letters, numbers, and dashes."
                    onChange={(id) => {
                      setIdLocked(true)
                      patchMeta({ id })
                    }}
                  />
                  <Area
                    label="Description"
                    span
                    rows={2}
                    value={manifest.metadata.description}
                    onChange={(description) => patchMeta({ description })}
                  />
                  <Text
                    label="Category"
                    value={manifest.metadata.category}
                    onChange={(category) => patchMeta({ category })}
                  />
                  <List
                    label="Tags"
                    value={manifest.metadata.tags}
                    placeholder="docker, database"
                    onChange={(tags) => patchMeta({ tags })}
                  />
                  <Text
                    label="Icon"
                    value={manifest.metadata.icon}
                    hint="Icon name or logo URL."
                    onChange={(icon) => patchMeta({ icon })}
                  />
                  <Text
                    label="Cover image URL"
                    value={coverImageUrl}
                    onChange={setCoverImageUrl}
                  />
                  <Pick
                    label="Runner"
                    span
                    value={runnerType}
                    options={RUNNERS.map((runner) => ({ ...runner }))}
                    onChange={setRunnerType}
                    hint="The worker that turns this manifest into a deployment. A template cannot publish without one."
                  />
                </Grid>
              </Section>
            ) : null}

            {tab === "infrastructure" ? (
              <>
                <Section title="Provider">
                  <Grid>
                    <Text
                      label="Default provider"
                      value={spec.provider.default}
                      onChange={(value) =>
                        patchSpec({
                          provider: { ...spec.provider, default: value },
                        })
                      }
                    />
                    <List
                      label="Supported providers"
                      value={spec.provider.supported}
                      onChange={(supported) =>
                        patchSpec({ provider: { ...spec.provider, supported } })
                      }
                    />
                  </Grid>
                </Section>

                <Section
                  title="Access"
                  hint="How a user reaches the deployment once it is running."
                >
                  <Grid>
                    <Pick
                      label="Mode"
                      value={spec.access.mode}
                      options={[
                        { value: "ELASTIC_IP_HTTP", label: "Elastic IP over HTTP" },
                        { value: "DOMAIN_HTTPS", label: "Domain over HTTPS" },
                        {
                          value: "PUBLIC_PASSWORD_MVP",
                          label: "Public port with password (PostgreSQL)",
                        },
                      ]}
                      onChange={(mode) =>
                        patchSpec({ access: { ...spec.access, mode } })
                      }
                    />
                    <Pick
                      label="Protocol"
                      value={spec.access.publicProtocol}
                      options={[
                        { value: "http", label: "http" },
                        { value: "https", label: "https" },
                        { value: "tcp", label: "tcp" },
                      ]}
                      onChange={(publicProtocol) =>
                        patchSpec({ access: { ...spec.access, publicProtocol } })
                      }
                    />
                    <Num
                      label="Public port"
                      value={spec.access.publicPort}
                      hint="Only 80, 443, and 5432 may face the internet."
                      onChange={(publicPort) =>
                        patchSpec({ access: { ...spec.access, publicPort } })
                      }
                    />
                    <Num
                      label="Internal app port"
                      value={spec.access.internalAppPort}
                      onChange={(internalAppPort) =>
                        patchSpec({ access: { ...spec.access, internalAppPort } })
                      }
                    />
                  </Grid>
                </Section>

                <Section
                  title="Server defaults"
                  hint="What a user gets before they change anything."
                >
                  <Grid>
                    <Text
                      label="Region"
                      value={spec.defaults.region}
                      onChange={(region) =>
                        patchSpec({ defaults: { ...spec.defaults, region } })
                      }
                    />
                    <Text
                      label="Plan"
                      value={spec.defaults.plan}
                      onChange={(plan) =>
                        patchSpec({ defaults: { ...spec.defaults, plan } })
                      }
                    />
                    <Text
                      label="Instance type"
                      mono
                      value={spec.defaults.instanceType}
                      onChange={(instanceType) =>
                        patchSpec({ defaults: { ...spec.defaults, instanceType } })
                      }
                    />
                    <Num
                      label="Volume size (GB)"
                      value={spec.defaults.volumeSizeGb}
                      onChange={(volumeSizeGb) =>
                        patchSpec({ defaults: { ...spec.defaults, volumeSizeGb } })
                      }
                    />
                  </Grid>
                </Section>

                <Section
                  title="Provisioning ports"
                  hint="Open only while the server is being built. Public and internal ports are derived from the services below."
                >
                  <Ports
                    label="Provisioning"
                    value={spec.security.provisioningPorts}
                    onChange={(provisioningPorts) =>
                      patchSpec({
                        security: { ...spec.security, provisioningPorts },
                      })
                    }
                  />
                </Section>
              </>
            ) : null}

            {tab === "services" ? (
              <Section
                title="Services"
                hint="Each service is one container. Whether it counts as public, and which ports the firewall opens, follow from the ports you publish here."
                action={
                  <AddButton
                    label="Add service"
                    onClick={() =>
                      patchSpec({
                        services: [
                          ...spec.services,
                          emptyService(spec.services.length + 1),
                        ],
                      })
                    }
                  />
                }
              >
                <div className="space-y-4">
                  {spec.services.map((service, index) => (
                    <Entry
                      key={index}
                      index={index}
                      title={service.name || "service"}
                      onRemove={
                        spec.services.length > 1
                          ? () =>
                              patchSpec({
                                services: spec.services.filter(
                                  (_, at) => at !== index
                                ),
                              })
                          : undefined
                      }
                    >
                      <Grid>
                        <Text
                          label="Name"
                          mono
                          value={service.name}
                          onChange={(name) => patchService(index, { name })}
                        />
                        <Text
                          label="Image"
                          mono
                          value={service.image}
                          onChange={(image) => patchService(index, { image })}
                        />
                        <Num
                          label="Internal port"
                          value={service.internalPort ?? 0}
                          onChange={(internalPort) =>
                            patchService(index, { internalPort })
                          }
                        />
                        <Ports
                          label="Published ports"
                          value={service.publicPorts ?? []}
                          hint="Leave empty to keep the service internal."
                          onChange={(publicPorts) =>
                            patchService(index, {
                              publicPorts,
                              public: publicPorts.length > 0,
                            })
                          }
                        />
                        <List
                          label="Starts after"
                          span
                          value={service.dependsOn ?? []}
                          placeholder="database"
                          onChange={(dependsOn) =>
                            patchService(index, { dependsOn })
                          }
                        />
                      </Grid>

                      <div className="mt-4 border-t border-line pt-3">
                        <div className="flex items-center justify-between">
                          <p className={labelText}>Volumes</p>
                          <AddButton
                            label="Add volume"
                            onClick={() =>
                              patchService(index, {
                                volumes: [
                                  ...(service.volumes ?? []),
                                  { id: "data", dir: "/var/lib/data" },
                                ],
                              })
                            }
                          />
                        </div>
                        {(service.volumes ?? []).map((volume, at) => (
                          <div key={at} className="mt-2 flex gap-2">
                            <input
                              className="h-9 w-32 rounded-[6px] border border-line-warm bg-surface px-2.5 font-mono text-[13px] text-ink-strong outline-none focus:border-brand"
                              value={volume.id}
                              onChange={(event) =>
                                patchService(index, {
                                  volumes: (service.volumes ?? []).map((item, i) =>
                                    i === at
                                      ? { ...item, id: event.target.value }
                                      : item
                                  ),
                                })
                              }
                            />
                            <input
                              className="h-9 flex-1 rounded-[6px] border border-line-warm bg-surface px-2.5 font-mono text-[13px] text-ink-strong outline-none focus:border-brand"
                              value={volume.dir}
                              onChange={(event) =>
                                patchService(index, {
                                  volumes: (service.volumes ?? []).map((item, i) =>
                                    i === at
                                      ? { ...item, dir: event.target.value }
                                      : item
                                  ),
                                })
                              }
                            />
                            <button
                              type="button"
                              className={tinyButton}
                              style={{ color: DANGER }}
                              onClick={() =>
                                patchService(index, {
                                  volumes: (service.volumes ?? []).filter(
                                    (_, i) => i !== at
                                  ),
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 border-t border-line pt-3">
                        <div className="flex items-center justify-between">
                          <p className={labelText}>Environment</p>
                          <AddButton
                            label="Add variable"
                            onClick={() =>
                              patchService(index, {
                                env: {
                                  ...(service.env ?? {}),
                                  NEW_VAR: { default: "" },
                                },
                              })
                            }
                          />
                        </div>
                        {Object.entries(service.env ?? {}).length === 0 ? (
                          <p className="mt-2 text-xs text-ink-muted">
                            No environment variables.
                          </p>
                        ) : (
                          Object.entries(service.env ?? {}).map(([key, variable]) => {
                            const kind = envKind(variable)
                            return (
                              <div
                                key={key}
                                className="mt-2 flex flex-wrap items-center gap-2"
                              >
                                <input
                                  className="h-9 w-56 rounded-[6px] border border-line-warm bg-surface px-2.5 font-mono text-[13px] text-ink-strong outline-none focus:border-brand"
                                  value={key}
                                  onChange={(event) =>
                                    renameEnv(index, key, event.target.value)
                                  }
                                />
                                <select
                                  className="h-9 rounded-[6px] border border-line-warm bg-surface px-2 text-xs text-ink-default outline-none focus:border-brand"
                                  value={kind}
                                  onChange={(event) =>
                                    patchEnv(
                                      index,
                                      key,
                                      envForKind(
                                        event.target.value as EnvKind,
                                        variable,
                                        secretKeys[0] ?? ""
                                      )
                                    )
                                  }
                                >
                                  <option value="value">Plain value</option>
                                  <option value="generated">Generated secret</option>
                                  <option value="fromSecret">Read a secret</option>
                                </select>
                                {kind === "value" ? (
                                  <input
                                    className="h-9 min-w-40 flex-1 rounded-[6px] border border-line-warm bg-surface px-2.5 font-mono text-[13px] text-ink-strong outline-none focus:border-brand"
                                    placeholder="value"
                                    value={variable.default ?? ""}
                                    onChange={(event) =>
                                      patchEnv(index, key, {
                                        ...variable,
                                        default: event.target.value,
                                      })
                                    }
                                  />
                                ) : null}
                                {kind === "fromSecret" ? (
                                  <select
                                    className="h-9 min-w-40 flex-1 rounded-[6px] border border-line-warm bg-surface px-2 font-mono text-[13px] text-ink-strong outline-none focus:border-brand"
                                    value={variable.fromSecret ?? ""}
                                    onChange={(event) =>
                                      patchEnv(index, key, {
                                        ...variable,
                                        fromSecret: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="">Pick a generated secret</option>
                                    {secretKeys.map((secret) => (
                                      <option key={secret} value={secret}>
                                        {secret}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {kind === "generated" ? (
                                  <span className="flex-1 font-mono text-xs text-ink-muted">
                                    generated at deploy · never shown in the manifest
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  className={tinyButton}
                                  style={{ color: DANGER }}
                                  onClick={() => patchEnv(index, key, null)}
                                >
                                  Remove
                                </button>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </Entry>
                  ))}
                </div>
              </Section>
            ) : null}

            {tab === "variables" ? (
              <Section
                title="User inputs"
                hint="What the New Deployment form asks for. Advanced inputs stay collapsed behind a toggle."
                action={
                  <AddButton
                    label="Add input"
                    onClick={() =>
                      patchSpec({
                        variables: [
                          ...spec.variables,
                          {
                            key: `input${spec.variables.length + 1}`,
                            type: "STRING",
                            required: false,
                            default: "",
                            userVisible: true,
                            advanced: false,
                            name: "New input",
                            description: "What this input controls.",
                          },
                        ],
                      })
                    }
                  />
                }
              >
                {spec.variables.length === 0 ? (
                  <Empty>
                    This template asks the user for nothing. Add an input if a
                    deployment needs a name, a version, or a size.
                  </Empty>
                ) : (
                  <div className="space-y-4">
                    {spec.variables.map((variable, index) => {
                      const patchVariable = (patch: Partial<typeof variable>) =>
                        patchSpec({
                          variables: spec.variables.map((item, at) =>
                            at === index ? { ...item, ...patch } : item
                          ),
                        })

                      return (
                        <Entry
                          key={index}
                          index={index}
                          title={variable.key || "input"}
                          onRemove={() =>
                            patchSpec({
                              variables: spec.variables.filter(
                                (_, at) => at !== index
                              ),
                            })
                          }
                        >
                          <Grid>
                            <Text
                              label="Key"
                              mono
                              value={variable.key}
                              onChange={(key) => patchVariable({ key })}
                            />
                            <Text
                              label="Label"
                              value={variable.name}
                              onChange={(name) => patchVariable({ name })}
                            />
                            <Pick
                              label="Type"
                              value={variable.type}
                              options={[
                                { value: "STRING", label: "Text" },
                                { value: "NUMBER", label: "Number" },
                                { value: "BOOLEAN", label: "True / false" },
                              ]}
                              onChange={(type) => patchVariable({ type })}
                            />
                            <Text
                              label="Default"
                              mono
                              value={variable.default ?? ""}
                              onChange={(value) =>
                                patchVariable({ default: value })
                              }
                            />
                            <Area
                              label="Help text"
                              span
                              rows={2}
                              value={variable.description}
                              onChange={(description) =>
                                patchVariable({ description })
                              }
                            />
                          </Grid>
                          <div className="mt-3 flex flex-wrap gap-4">
                            <Toggle
                              label="Required"
                              checked={variable.required}
                              onChange={(required) => patchVariable({ required })}
                            />
                            <Toggle
                              label="Shown to the user"
                              checked={variable.userVisible}
                              onChange={(userVisible) =>
                                patchVariable({ userVisible })
                              }
                            />
                            <Toggle
                              label="Advanced"
                              checked={variable.advanced}
                              onChange={(advanced) => patchVariable({ advanced })}
                            />
                          </div>
                        </Entry>
                      )
                    })}
                  </div>
                )}
              </Section>
            ) : null}

            {tab === "docs" ? (
              <>
                <Section
                  title="Health checks"
                  hint="How the worker decides a deployment came up. At least one is required."
                  action={
                    <AddButton
                      label="Add check"
                      onClick={() =>
                        patchSpec({
                          healthChecks: [
                            ...spec.healthChecks,
                            {
                              name: `check-${spec.healthChecks.length + 1}`,
                              type: "HTTP",
                              url: "http://${ELASTIC_IP}",
                              expectedStatus: [200],
                            },
                          ],
                        })
                      }
                    />
                  }
                >
                  <div className="space-y-4">
                    {spec.healthChecks.map((check, index) => {
                      const patchCheck = (patch: Partial<typeof check>) =>
                        patchSpec({
                          healthChecks: spec.healthChecks.map((item, at) =>
                            at === index ? { ...item, ...patch } : item
                          ),
                        })

                      return (
                        <Entry
                          key={index}
                          index={index}
                          title={check.name || "check"}
                          onRemove={
                            spec.healthChecks.length > 1
                              ? () =>
                                  patchSpec({
                                    healthChecks: spec.healthChecks.filter(
                                      (_, at) => at !== index
                                    ),
                                  })
                              : undefined
                          }
                        >
                          <Grid>
                            <Text
                              label="Name"
                              mono
                              value={check.name}
                              onChange={(name) => patchCheck({ name })}
                            />
                            <Pick
                              label="Type"
                              value={check.type}
                              options={[
                                { value: "HTTP", label: "HTTP request" },
                                { value: "COMMAND", label: "Command on the server" },
                              ]}
                              onChange={(type) => patchCheck({ type })}
                            />
                            {check.type === "HTTP" ? (
                              <>
                                <Text
                                  label="URL"
                                  mono
                                  span
                                  value={check.url ?? ""}
                                  onChange={(url) => patchCheck({ url })}
                                />
                                <Ports
                                  label="Expected status"
                                  value={check.expectedStatus ?? []}
                                  onChange={(expectedStatus) =>
                                    patchCheck({ expectedStatus })
                                  }
                                />
                              </>
                            ) : (
                              <>
                                <Text
                                  label="Command"
                                  mono
                                  span
                                  value={check.command ?? ""}
                                  onChange={(command) => patchCheck({ command })}
                                />
                                <Text
                                  label="Expected output"
                                  mono
                                  value={check.expectedOutput ?? ""}
                                  onChange={(expectedOutput) =>
                                    patchCheck({ expectedOutput })
                                  }
                                />
                              </>
                            )}
                          </Grid>
                        </Entry>
                      )
                    })}
                  </div>
                </Section>

                <Section
                  title="After deployment"
                  hint="Shown to the user once the deployment is live. Warnings are highlighted."
                  action={
                    <AddButton
                      label="Add step"
                      onClick={() =>
                        patchSpec({
                          instructions: [
                            ...spec.instructions,
                            {
                              type: "TEXT",
                              title: "Next step",
                              content: "What the user should do.",
                            },
                          ],
                        })
                      }
                    />
                  }
                >
                  <div className="space-y-4">
                    {spec.instructions.map((instruction, index) => {
                      const patchInstruction = (
                        patch: Partial<typeof instruction>
                      ) =>
                        patchSpec({
                          instructions: spec.instructions.map((item, at) =>
                            at === index ? { ...item, ...patch } : item
                          ),
                        })

                      return (
                        <Entry
                          key={index}
                          index={index}
                          title={instruction.title || "step"}
                          onRemove={
                            spec.instructions.length > 1
                              ? () =>
                                  patchSpec({
                                    instructions: spec.instructions.filter(
                                      (_, at) => at !== index
                                    ),
                                  })
                              : undefined
                          }
                        >
                          <Grid>
                            <Text
                              label="Title"
                              value={instruction.title}
                              onChange={(title) => patchInstruction({ title })}
                            />
                            <Pick
                              label="Type"
                              value={instruction.type}
                              options={[
                                { value: "TEXT", label: "Text" },
                                { value: "WARNING", label: "Warning" },
                                { value: "PASSWORD", label: "Credential" },
                              ]}
                              onChange={(type) => patchInstruction({ type })}
                            />
                            <Area
                              label="Content"
                              span
                              rows={2}
                              value={instruction.content}
                              onChange={(content) => patchInstruction({ content })}
                            />
                          </Grid>
                        </Entry>
                      )
                    })}
                  </div>
                </Section>

                <Section title="Readme" hint="Markdown, shown on the template page.">
                  <Area
                    label="Readme"
                    mono
                    rows={12}
                    value={spec.readme}
                    onChange={(readme) => patchSpec({ readme })}
                  />
                </Section>
              </>
            ) : null}

            {tab === "yaml" ? (
              <Section
                title="Manifest"
                hint="Generated from the form, including the ports and secrets it derives. Edit it here for anything the form does not cover; the form picks the changes back up."
                action={
                  <div className="flex gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".yaml,.yml,text/yaml,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ""
                        void file?.text().then(readYaml)
                      }}
                    />
                    <button
                      type="button"
                      className={tinyButton}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="size-3.5" aria-hidden />
                      Upload
                    </button>
                    <button
                      type="button"
                      className={tinyButton}
                      onClick={() => setYamlDraft(null)}
                    >
                      Regenerate from form
                    </button>
                  </div>
                }
              >
                <textarea
                  className="h-[58vh] min-h-[360px] w-full rounded-[6px] border border-line-warm bg-[#141414] p-4 font-mono text-[12.5px] leading-5 text-[#f2ede9] outline-none transition-colors focus:border-brand"
                  value={yamlText}
                  onChange={(event) => readYaml(event.target.value)}
                  spellCheck={false}
                />
              </Section>
            ) : null}
            </div>
          </div>
        </main>

        <aside className="w-full shrink-0 overflow-y-auto border-line scrollbar-subtle lg:min-h-0 lg:w-[300px] lg:border-l xl:w-[330px]">
          <ExposureMap manifest={normalized} />
          <ReviewPanel review={review} runnerType={runnerType} />
          <PublishPanel
            saved={saved}
            canPublish={canPublish}
            isPending={isPending}
            onTest={testDeployment}
            onPublish={publish}
          />
        </aside>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: SafeAdminTemplate["status"] }) {
  const tone =
    status === "PUBLISHED"
      ? "bg-brand text-white"
      : status === "TESTED" || status === "VALIDATED"
        ? "bg-brand-soft text-brand"
        : "border border-line-warm text-ink-muted"

  return (
    <span
      className={`rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase ${tone}`}
    >
      {status}
    </span>
  )
}

/**
 * The one thing this tab is really about: what a user of this template ends up
 * exposing to the internet. Everything else in the manifest is configuration;
 * this is the part that is expensive to get wrong, so it is the only element
 * that gets colour.
 */
function ExposureMap({ manifest }: { manifest: TemplateManifest }) {
  const { services, security, access } = manifest.spec

  return (
    <Pane title="Exposure" hint="What this template opens to the internet.">
      <div className="mt-4 font-mono text-[11px]">
        <p className="tracking-[0.12em] text-ink-muted uppercase">Internet</p>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {security.publicPorts.length === 0 ? (
            <span className="text-ink-muted">nothing published</span>
          ) : (
            security.publicPorts.map((port) => (
              <span
                key={port}
                className="rounded-[3px] bg-brand px-1.5 py-0.5 text-white"
              >
                {access.publicProtocol}:{port}
              </span>
            ))
          )}
        </div>

        {/* The rule is the wire: everything hanging off it is behind those ports. */}
        <ul className="mt-2 border-l border-line-warm">
          {services.map((service) => (
            <li
              key={service.name}
              className="relative flex items-baseline justify-between gap-3 py-1.5 pl-4"
            >
              <span
                className="absolute top-1/2 left-0 h-px w-2.5 bg-line-warm"
                aria-hidden
              />
              <span className="truncate text-ink-strong">{service.name}</span>
              <span
                className={
                  service.public ? "shrink-0 text-brand" : "shrink-0 text-ink-muted"
                }
              >
                {service.internalPort ? `:${service.internalPort}` : "—"}
                {service.public
                  ? ` ▸ ${(service.publicPorts ?? []).join(", ")}`
                  : " internal"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
        {security.provisioningPorts.length > 0
          ? `Port ${security.provisioningPorts.join(", ")} open during provisioning only. `
          : "No provisioning ports. "}
        {security.secrets.length > 0
          ? `${security.secrets.length} credential${security.secrets.length > 1 ? "s" : ""} generated at deploy.`
          : "No generated credentials."}
      </p>
    </Pane>
  )
}

function ReviewPanel({
  review,
  runnerType,
}: {
  review: TemplateReview | null
  runnerType: string
}) {
  return (
    <Pane
      title="Review"
      icon={<ShieldCheck className="size-4 text-brand" aria-hidden />}
    >
      {!review ? (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          Run Validate to check the manifest, the security rules, and the runner.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <Check3 label="Manifest" ok={review.valid} />
          <Check3 label="Security" ok={review.securityPassed} />
          <Check3
            label="Runner"
            ok={review.runnerSupported}
            note={runnerType ? undefined : "none attached"}
          />

          {review.errors.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {review.errors.map((error) => (
                <li
                  key={error}
                  className="flex gap-1.5 text-xs"
                  style={{ color: DANGER }}
                >
                  <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {error}
                </li>
              ))}
            </ul>
          ) : null}

          {review.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {review.warnings.map((warning) => (
                <li
                  key={warning}
                  className="flex gap-1.5 text-xs text-ink-muted"
                >
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Pane>
  )
}

function Check3({
  label,
  ok,
  note,
}: {
  label: string
  ok: boolean
  note?: string
}) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span
        className="font-mono text-xs"
        style={ok ? undefined : { color: DANGER }}
      >
        {ok ? "passed" : (note ?? "blocked")}
      </span>
    </p>
  )
}

function PublishPanel({
  saved,
  canPublish,
  isPending,
  onTest,
  onPublish,
}: {
  saved: SafeAdminTemplate | null
  canPublish: boolean
  isPending: boolean
  onTest: () => void
  onPublish: () => void
}) {
  const testBlocked = !saved
    ? "Save a draft first."
    : !saved.runnerType
      ? "Attach a runner first."
      : null
  const publishBlocked = !saved
    ? "Save a draft first."
    : !canPublish
      ? "Run Validate and clear every error first."
      : null

  return (
    <Pane
      title="Publish"
      icon={<FileCode2 className="size-4 text-ink-muted" aria-hidden />}
    >
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          className={`${ghostButton} w-full`}
          disabled={Boolean(testBlocked) || isPending}
          onClick={onTest}
        >
          <FlaskConical className="size-4" aria-hidden />
          Mark tested
        </button>
        {testBlocked ? (
          <p className="text-xs text-ink-muted">{testBlocked}</p>
        ) : null}

        <button
          type="button"
          className={`${primaryButton} w-full`}
          disabled={Boolean(publishBlocked) || isPending}
          onClick={onPublish}
        >
          <Rocket className="size-4" aria-hidden />
          Publish
        </button>
        {publishBlocked ? (
          <p className="text-xs text-ink-muted">{publishBlocked}</p>
        ) : null}
      </div>
    </Pane>
  )
}
