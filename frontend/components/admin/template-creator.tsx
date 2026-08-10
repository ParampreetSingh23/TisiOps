"use client"

import {
  CheckCircle2,
  FileText,
  FlaskConical,
  LockKeyhole,
  Plus,
  Upload,
} from "lucide-react"
import { useMemo, useRef, useState, useTransition } from "react"

import {
  deleteTemplateAction,
  markTemplateTestedAction,
  publishTemplateAction,
  saveTemplateAction,
  setTemplateVisibleAction,
  validateTemplateAction,
} from "@/app/dashboard/admin/actions"
import type {
  SafeAdminTemplate,
  TemplateReview,
  VariableEdit,
} from "@tisiops/server/services/templates/admin"
import type { TemplateManifest } from "@tisiops/server/services/templates"

const input =
  "h-10 rounded-[6px] border border-line-warm bg-surface px-3 text-sm text-ink-strong outline-none transition-colors focus:border-brand"
const textarea =
  "min-h-96 rounded-[6px] border border-line-warm bg-[#111] p-4 font-mono text-xs leading-5 text-[#f7f2ef] outline-none transition-colors focus:border-brand"
const label = "text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase"
const button =
  "inline-flex h-10 items-center justify-center rounded-[6px] px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
const primary = `${button} bg-brand text-white hover:bg-brand-hover`
const disabledPrimary = `${button} border border-line-warm bg-canvas text-ink-muted`
const secondary = `${button} border border-line-warm bg-surface text-ink-default hover:bg-canvas`
const runnerOptions = [
  "docker-compose-server-runner",
  "database-service-runner",
  "n8n-managed-server-runner",
] as const
const builtInIds = ["aws-n8n-server", "postgres-managed-server"]

const emptyYaml = `apiVersion: tisiops.com/v1
kind: Template

metadata:
  id: my-template
  name: My Template
  description: Deploy a service using a fixed TisiOps runner.
  category: app
  icon: docker
  tags:
    - docker

spec:
  provider:
    default: aws
    supported:
      - aws

  access:
    mode: ELASTIC_IP_HTTP
    publicProtocol: http
    publicPort: 80
    internalAppPort: 3000

  defaults:
    region: ap-south-1
    plan: Starter
    instanceType: t3.micro
    volumeSizeGb: 20

  variables:
    - key: workspaceName
      type: STRING
      required: false
      default: auto
      userVisible: true
      advanced: false
      name: Workspace Name
      description: Optional deployment name.

  services:
    - name: app
      image: nginx:alpine
      type: PREBUILT
      internalPort: 3000
      public: true
      publicPorts:
        - 80

  security:
    publicPorts:
      - 80
    internalOnlyPorts:
      - 3000
    provisioningPorts:
      - 22
    secrets: []

  healthChecks:
    - name: http
      type: HTTP
      url: http://\${ELASTIC_IP}
      expectedStatus:
        - 200

  instructions:
    - type: TEXT
      title: Open app
      content: http://\${ELASTIC_IP}

  readme: |
    # My Template
`

type TemplateForm = {
  templateId: string
  name: string
  description: string
  category: string
  tags: string
  iconUrl: string
  coverImageUrl: string
  runnerType: string
  yamlContent: string
}

function formFromManifest(manifest: TemplateManifest | null): TemplateForm {
  return {
    templateId: manifest?.metadata.id ?? "my-template",
    name: manifest?.metadata.name ?? "My Template",
    description:
      manifest?.metadata.description ??
      "Deploy a service using a fixed TisiOps runner.",
    category: manifest?.metadata.category ?? "app",
    tags: manifest?.metadata.tags.join(", ") ?? "docker",
    iconUrl: manifest?.metadata.icon ?? "docker",
    coverImageUrl: "",
    runnerType: "docker-compose-server-runner",
    yamlContent: emptyYaml,
  }
}

function inferRunner(form: TemplateForm): string {
  if (form.runnerType && form.runnerType !== "custom-handler") return form.runnerType

  const text = `${form.name} ${form.category} ${form.tags} ${form.yamlContent}`.toLowerCase()
  if (text.includes("n8n")) return "n8n-managed-server-runner"
  if (text.includes("postgres")) return "database-service-runner"
  if (
    text.includes("docker") ||
    text.includes("nginx") ||
    text.includes("managed-vps")
  ) {
    return "docker-compose-server-runner"
  }

  return form.runnerType
}

function toFormData(form: TemplateForm, edits: VariableEdit[]) {
  const data = new FormData()
  for (const [key, value] of Object.entries(form)) data.set(key, value)
  data.set("variableEdits", JSON.stringify(edits))
  return data
}

function statusStyle(status: SafeAdminTemplate["status"]) {
  if (status === "PUBLISHED") return "bg-brand text-white"
  if (status === "VALIDATED" || status === "TESTED") {
    return "bg-brand-soft text-brand"
  }
  if (status === "DISABLED" || status === "ARCHIVED") {
    return "bg-canvas text-ink-muted"
  }
  return "bg-canvas text-ink-strong"
}

export function TemplateCreator({
  templates,
}: {
  templates: SafeAdminTemplate[]
}) {
  const [items, setItems] = useState(templates)
  const [form, setForm] = useState<TemplateForm>(() => formFromManifest(null))
  const [review, setReview] = useState<TemplateReview | null>(null)
  const [saved, setSaved] = useState<SafeAdminTemplate | null>(null)
  const [variableEdits, setVariableEdits] = useState<VariableEdit[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const manifest = review?.manifest ?? saved?.parsedManifest ?? null
  const variables = manifest?.spec.variables ?? []
  const services = manifest?.spec.services ?? []
  const warnings = manifest?.spec.instructions.filter((i) => i.type === "WARNING") ?? []

  const runnerText = useMemo(() => {
    if (!form.runnerType || form.runnerType === "custom-handler") {
      return "This template is valid but cannot deploy yet because no worker runner is attached."
    }
    return "Runner selected. Test deployment can be wired to this runner."
  }, [form.runnerType])

  function update(key: keyof TemplateForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function readYamlFile(file: File | undefined) {
    if (!file) return
    file.text().then((yamlContent) => update("yamlContent", yamlContent))
  }

  function validate() {
    setMessage(null)
    startTransition(async () => {
      const nextForm = { ...form, runnerType: inferRunner(form) }
      if (nextForm.runnerType !== form.runnerType) setForm(nextForm)
      const next = await validateTemplateAction(null, toFormData(nextForm, variableEdits))
      setReview(next)
      setVariableEdits(
        (next.manifest?.spec.variables ?? []).map((variable) => ({
          key: variable.key,
          name: variable.name,
          default: variable.default ?? "",
          required: variable.required,
          advanced: variable.advanced,
        }))
      )
      setMessage(next.valid ? "YAML valid." : "YAML has errors.")
    })
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const nextForm = { ...form, runnerType: inferRunner(form) }
      if (nextForm.runnerType !== form.runnerType) setForm(nextForm)
      const result = await saveTemplateAction(null, toFormData(nextForm, variableEdits))
      setReview(result.review)
      if (result.ok) {
        setSaved(result.template)
        setItems((current) => [
          result.template,
          ...current.filter((item) => item.id !== result.template.id),
        ])
        setMessage(`Saved ${result.template.templateId} v${result.template.version}.`)
      } else {
        setMessage("Not saved. Fix YAML first.")
      }
    })
  }

  function loadTemplate(template: SafeAdminTemplate) {
    setSaved(template)
    setReview({
      valid: true,
      securityPassed: true,
      runnerSupported: Boolean(template.runnerType),
      errors: [],
      warnings: [],
      manifest: template.parsedManifest,
    })
    setForm({
      templateId: template.templateId,
      name: template.name,
      description: template.description,
      category: template.category,
      tags: template.tags.join(", "),
      iconUrl: template.iconUrl ?? template.parsedManifest.metadata.icon,
      coverImageUrl: template.coverImageUrl ?? "",
      runnerType: template.runnerType,
      yamlContent: template.yamlContent,
    })
    setVariableEdits(
      template.parsedManifest.spec.variables.map((variable) => ({
        key: variable.key,
        name: variable.name,
        default: variable.default ?? "",
        required: variable.required,
        advanced: variable.advanced,
      }))
    )
  }

  function testDeployment() {
    if (!saved) return
    setMessage(null)
    startTransition(async () => {
      await markTemplateTestedAction(saved.id)
      const next = { ...saved, status: "TESTED" as const }
      setSaved(next)
      setItems((current) => current.map((item) => (item.id === saved.id ? next : item)))
      setMessage("Template marked tested.")
    })
  }

  function publish() {
    if (!saved) return
    const confirmed = window.confirm(
      "Publish this template? Published versions are immutable for old deployments."
    )
    if (!confirmed) return

    setMessage(null)
    startTransition(async () => {
      await publishTemplateAction(saved.id, true)
      const next = { ...saved, status: "PUBLISHED" as const }
      setSaved(next)
      setItems((current) => current.map((item) => (item.id === saved.id ? next : item)))
      setMessage(`Published ${saved.templateId} v${saved.version}.`)
    })
  }

  function setVisible(template: SafeAdminTemplate, visible: boolean) {
    startTransition(async () => {
      const next = await setTemplateVisibleAction(template.id, visible)
      setItems((current) => current.map((item) => (item.id === next.id ? next : item)))
      if (saved?.id === next.id) setSaved(next)
      setMessage(visible ? "Template shown on New Deployment." : "Template removed from New Deployment.")
    })
  }

  function removeTemplate(template: SafeAdminTemplate) {
    if (builtInIds.includes(template.templateId)) {
      setVisible(template, false)
      return
    }
    if (!window.confirm("Delete this template from admin?")) return

    startTransition(async () => {
      await deleteTemplateAction(template.id)
      setItems((current) => current.filter((item) => item.id !== template.id))
      if (saved?.id === template.id) setSaved(null)
      setMessage("Template deleted.")
    })
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
            Template Creator
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Build safe YAML templates, review ports and secrets, preview user
            output, then publish only after runner mapping.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setForm(formFromManifest(null))
            setReview(null)
            setSaved(null)
            setVariableEdits([])
            setMessage(null)
          }}
          className={primary}
        >
          <Plus className="mr-2 size-4" aria-hidden />
          Create New Template
        </button>
      </header>

      <div className="mt-8 grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[8px] border border-line bg-surface shadow-card">
          <div className="border-b border-line px-4 py-3">
            <p className={label}>Stored templates</p>
          </div>
          <ul className="max-h-[720px] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-5 text-sm text-ink-muted">
                No database templates yet
              </li>
            ) : (
              items.map((template) => (
                <li key={template.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => loadTemplate(template)}
                    className="block w-full px-4 py-3 text-left hover:bg-canvas"
                  >
                    <span className="block truncate text-sm font-semibold text-ink-strong">
                      {template.name}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                      v{template.version}
                      <span className={`rounded-[4px] px-1.5 py-0.5 ${statusStyle(template.status)}`}>
                        {template.status}
                      </span>
                    </span>
                  </button>
                  <div className="flex gap-2 px-4 pb-3">
                    <button
                      type="button"
                      className="rounded-[6px] border border-line px-2 py-1 text-xs text-ink-muted hover:bg-canvas"
                      disabled={isPending}
                      onClick={() => setVisible(template, template.status !== "PUBLISHED")}
                    >
                      {template.status === "PUBLISHED" ? "Remove from New Deployment" : "Show in New Deployment"}
                    </button>
                    {!builtInIds.includes(template.templateId) ? (
                      <button
                        type="button"
                        className="rounded-[6px] border border-line px-2 py-1 text-xs text-[#c4422a] hover:bg-canvas"
                        disabled={isPending}
                        onClick={() => removeTemplate(template)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-[8px] border border-line bg-surface p-5 shadow-card">
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="templateId" labelText="Template ID" form={form} update={update} />
              <Field name="name" labelText="Name" form={form} update={update} />
              <Field name="category" labelText="Category" form={form} update={update} />
              <Field name="tags" labelText="Tags" form={form} update={update} />
              <Field name="iconUrl" labelText="Icon name or logo URL" form={form} update={update} />
              <Field name="coverImageUrl" labelText="Cover image URL" form={form} update={update} />
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className={label}>Description</span>
                <input
                  className={input}
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={label}>Runner</span>
                <select
                  className={input}
                  value={form.runnerType}
                  onChange={(event) => update("runnerType", event.target.value)}
                >
                  <option value="">No runner attached</option>
                  {runnerOptions.map((runner) => (
                    <option key={runner} value={runner}>
                      {runner}
                    </option>
                  ))}
                  <option value="custom-handler">custom handler later</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={label}>YAML Manifest</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Paste YAML or upload a `.yaml` file. Invalid templates stay draft.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".yaml,.yml,text/yaml,text/plain"
                  className="hidden"
                  onChange={(event) => readYamlFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  className={secondary}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-2 size-4" aria-hidden />
                  Upload YAML
                </button>
                <button type="button" className={secondary} onClick={validate} disabled={isPending}>
                  Validate
                </button>
                <button type="button" className={primary} onClick={save} disabled={isPending}>
                  Save Draft
                </button>
              </div>
            </div>

            <textarea
              className={`${textarea} mt-3 w-full`}
              value={form.yamlContent}
              onChange={(event) => update("yamlContent", event.target.value)}
              spellCheck={false}
            />

            {message ? <p className="mt-3 text-sm text-ink-muted">{message}</p> : null}
          </section>

          <aside className="space-y-5">
            <ReviewCard review={review} runnerText={runnerText} />
            <VariablesCard
              variables={variables}
              edits={variableEdits}
              setEdits={setVariableEdits}
            />
            <ServicesCard manifest={manifest} />
            <PreviewCard manifest={manifest} form={form} warnings={warnings} />
            <PublishCard
              saved={saved}
              canPublish={Boolean(review?.valid && review.securityPassed && review.runnerSupported)}
              isPending={isPending}
              onTest={testDeployment}
              onPublish={publish}
            />
          </aside>
        </main>
      </div>
    </div>
  )
}

function Field({
  name,
  labelText,
  form,
  update,
}: {
  name: keyof TemplateForm
  labelText: string
  form: TemplateForm
  update: (key: keyof TemplateForm, value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={label}>{labelText}</span>
      <input
        className={input}
        value={form[name]}
        onChange={(event) => update(name, event.target.value)}
      />
    </label>
  )
}

function ReviewCard({
  review,
  runnerText,
}: {
  review: TemplateReview | null
  runnerText: string
}) {
  return (
    <section className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
      <h2 className="flex items-center text-sm font-semibold text-ink-strong">
        <LockKeyhole className="mr-2 size-4 text-brand" aria-hidden />
        Security Review
      </h2>
      {!review ? (
        <p className="mt-3 text-sm text-ink-muted">Validate YAML to run review.</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <State labelText="YAML" ok={review.valid} />
          <State labelText="Security" ok={review.securityPassed} />
          <State labelText="Runner" ok={review.runnerSupported} />
          <p className="rounded-[6px] border border-line bg-canvas px-3 py-2 text-xs text-ink-muted">
            {runnerText}
          </p>
          {[...review.errors, ...review.warnings].length ? (
            <ul className="space-y-1.5">
              {review.errors.map((error) => (
                <li key={error} className="text-[#c4422a]">
                  {error}
                </li>
              ))}
              {review.warnings.map((warning) => (
                <li key={warning} className="text-ink-muted">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}

function State({ labelText, ok }: { labelText: string; ok: boolean }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{labelText}</span>
      <span className={ok ? "text-brand" : "text-[#c4422a]"}>
        {ok ? "passed" : "blocked"}
      </span>
    </p>
  )
}

function VariablesCard({
  variables,
  edits,
  setEdits,
}: {
  variables: TemplateManifest["spec"]["variables"]
  edits: VariableEdit[]
  setEdits: (edits: VariableEdit[]) => void
}) {
  function update(key: string, patch: Partial<VariableEdit>) {
    setEdits(
      variables.map((variable) => ({
        key: variable.key,
        name: variable.name,
        default: variable.default ?? "",
        required: variable.required,
        advanced: variable.advanced,
        ...(edits.find((edit) => edit.key === variable.key) ?? {}),
        ...(variable.key === key ? patch : {}),
      }))
    )
  }

  return (
    <section className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink-strong">Variables</h2>
      {variables.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No parsed variables.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {variables.map((variable) => {
            const edit = edits.find((item) => item.key === variable.key)
            return (
              <div key={variable.key} className="rounded-[6px] border border-line p-3">
                <p className="font-mono text-xs text-ink-muted">{variable.key}</p>
                <input
                  className={`${input} mt-2 w-full`}
                  value={edit?.name ?? variable.name}
                  onChange={(event) => update(variable.key, { name: event.target.value })}
                />
                <input
                  className={`${input} mt-2 w-full`}
                  value={edit?.default ?? variable.default ?? ""}
                  onChange={(event) => update(variable.key, { default: event.target.value })}
                  placeholder="Default"
                />
                <div className="mt-2 flex gap-4 text-xs text-ink-muted">
                  <label>
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={edit?.required ?? variable.required}
                      onChange={(event) =>
                        update(variable.key, { required: event.target.checked })
                      }
                    />
                    Required
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={edit?.advanced ?? variable.advanced}
                      onChange={(event) =>
                        update(variable.key, { advanced: event.target.checked })
                      }
                    />
                    Advanced
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ServicesCard({ manifest }: { manifest: TemplateManifest | null }) {
  return (
    <section className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink-strong">Services</h2>
      {!manifest ? (
        <p className="mt-3 text-sm text-ink-muted">Validate YAML to inspect services.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {manifest.spec.services.map((service) => (
            <div key={service.name} className="rounded-[6px] border border-line p-3 text-xs">
              <p className="font-semibold text-ink-strong">{service.name}</p>
              <p className="mt-1 font-mono text-ink-muted">{service.image}</p>
              <p className="mt-2 text-ink-muted">
                Internal: {service.internalPort ?? "none"} · Public:{" "}
                {(service.publicPorts ?? []).join(", ") || "none"}
              </p>
              <p className="mt-1 text-ink-muted">
                Volumes: {(service.volumes ?? []).map((v) => `${v.id}:${v.dir}`).join(", ") || "none"}
              </p>
              <p className="mt-1 text-ink-muted">
                Env: {Object.keys(service.env ?? {}).join(", ") || "none"}
              </p>
              <p className="mt-1 text-ink-muted">
                Depends on: {(service.dependsOn ?? []).join(", ") || "none"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PreviewCard({
  manifest,
  form,
  warnings,
}: {
  manifest: TemplateManifest | null
  form: TemplateForm
  warnings: TemplateManifest["spec"]["instructions"]
}) {
  if (!manifest) {
    return (
      <section className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink-strong">Preview</h2>
        <p className="mt-3 text-sm text-ink-muted">Valid YAML renders preview.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink-strong">Preview</h2>
      <article className="mt-3 rounded-[8px] border border-line bg-canvas p-4">
        <p className="text-xs font-semibold text-brand">{form.category}</p>
        <h3 className="mt-1 text-base font-semibold text-ink-strong">
          {form.name}
        </h3>
        <p className="mt-2 text-sm text-ink-muted">{form.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {form.tags.split(",").filter(Boolean).map((tag) => (
            <span key={tag} className="rounded-[4px] bg-surface px-2 py-1 text-xs text-ink-muted">
              {tag.trim()}
            </span>
          ))}
        </div>
      </article>
      <dl className="mt-4 space-y-2 text-sm">
        <PreviewLine labelText="Provider" value={manifest.spec.provider.default} />
        <PreviewLine labelText="Access" value={manifest.spec.access.mode} />
        <PreviewLine labelText="Port" value={String(manifest.spec.access.publicPort)} />
        <PreviewLine
          labelText="Services"
          value={manifest.spec.services.map((service) => service.name).join(", ")}
        />
      </dl>
      {warnings.map((warning) => (
        <p
          key={warning.title}
          className="mt-3 rounded-[6px] border border-line bg-brand-soft px-3 py-2 text-sm text-ink-default"
        >
          {warning.title}: {warning.content}
        </p>
      ))}
      <div className="mt-3 text-xs text-ink-muted">
        <p className="font-semibold text-ink-strong">Instructions</p>
        {manifest.spec.instructions.map((instruction) => (
          <p key={instruction.title} className="mt-1">
            {instruction.title}: {instruction.content}
          </p>
        ))}
      </div>
    </section>
  )
}

function PreviewLine({ labelText, value }: { labelText: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2">
      <dt className="text-ink-muted">{labelText}</dt>
      <dd className="font-mono text-ink-strong">{value}</dd>
    </div>
  )
}

function PublishCard({
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
    ? "Save the template first."
    : !saved.runnerType
      ? "Attach an approved runner first."
      : null
  const publishBlocked = !saved
    ? "Save the template first."
    : !canPublish
      ? "Validate YAML, pass security review, and attach an approved runner."
      : null

  return (
    <section className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink-strong">Test & Publish</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Do not publish until YAML, security, and runner mapping pass.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          className={testBlocked ? `${disabledPrimary} h-12` : `${secondary} h-12`}
          disabled={Boolean(testBlocked) || isPending}
          onClick={onTest}
        >
          <FlaskConical className="mr-2 size-4" aria-hidden />
          Test Deployment
        </button>
        {testBlocked ? (
          <p className="text-xs text-ink-muted">
            {testBlocked}
          </p>
        ) : null}
        <button
          type="button"
          className={publishBlocked ? `${disabledPrimary} h-12` : `${primary} h-12`}
          disabled={Boolean(publishBlocked) || isPending}
          onClick={onPublish}
        >
          <CheckCircle2 className="mr-2 size-4" aria-hidden />
          Publish
        </button>
        {publishBlocked ? (
          <p className="text-xs text-ink-muted">{publishBlocked}</p>
        ) : null}
        <p className="flex items-center text-xs text-ink-muted">
          <FileText className="mr-1.5 size-3.5" aria-hidden />
          Status: {saved?.status ?? "DRAFT"}
        </p>
      </div>
    </section>
  )
}
