import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Terminal,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  DollarSign,
  Lock,
  GitBranch,
  Layers,
  Wrench,
  HelpCircle,
} from "lucide-react"

export default function DocsPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none space-y-12">
      {/* Introduction */}
      <section id="introduction" className="scroll-mt-20">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-brand uppercase">
          <Zap className="size-4" /> Getting Started
        </div>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-ink-strong sm:text-4xl">
          TisiOps Documentation
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-default sm:text-lg">
          TisiOps is an <strong>AI DevOps Engineer</strong> for deploying,
          debugging, monitoring, retrying, repairing, and managing applications
          from one console. It combines AI agents, GitHub analysis, safe
          deployment plans, Terraform-backed infrastructure, Redis worker jobs,
          logs, and repair workflows.
        </p>

        {/* Principle Card */}
        <div className="mt-6 rounded-[8px] border border-line bg-brand-soft p-5 text-ink-strong shadow-xs">
          <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-brand">
            <ShieldCheck className="size-5" /> AI plans. Backend validates. Workers execute.
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-default">
            TisiOps does not let AI directly run random infrastructure commands.
            Every serious action follows a safe flow: the AI creates a plan, the
            backend validates it, the user approves it, and workers execute the
            approved job.
          </p>
        </div>
      </section>

      {/* Why TisiOps */}
      <section id="core-concepts" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Why TisiOps?
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <Cpu className="size-6 text-brand" />
            <h3 className="mt-3 font-heading text-sm font-semibold text-ink-strong">
              Natural language DevOps
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              Ask TisiOps to deploy, debug, retry, repair, or inspect infrastructure using normal language.
            </p>
          </div>
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <ShieldCheck className="size-6 text-brand" />
            <h3 className="mt-3 font-heading text-sm font-semibold text-ink-strong">
              Safe execution
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              AI agents create plans, but infrastructure changes only run after backend validation and user approval.
            </p>
          </div>
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <Activity className="size-6 text-brand" />
            <h3 className="mt-3 font-heading text-sm font-semibold text-ink-strong">
              Built for real operations
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              TisiOps tracks deployments, logs, workers, servers, failures, retries, monitoring, and final URLs.
            </p>
          </div>
        </div>
      </section>

      {/* Quickstart */}
      <section id="quickstart" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Quickstart
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Get your first application deployed in under 2 minutes.
        </p>

        <ol className="mt-6 space-y-3">
          {[
            "Sign in to TisiOps",
            "Connect GitHub",
            "Ask the AI Console or choose a template",
            "Review the deployment plan",
            "Approve the action",
            "Track progress in Deployments",
            "Open the final URL",
          ].map((step, idx) => (
            <li key={step} className="flex items-center gap-3 text-sm font-medium text-ink-strong">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface border border-line text-xs font-semibold text-brand">
                {idx + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
            Example Prompt Commands
          </p>
          <pre className="rounded-[6px] border border-line bg-surface p-3 font-mono text-xs text-brand">
            Deploy my frontend folder from GitHub
          </pre>
          <pre className="rounded-[6px] border border-line bg-surface p-3 font-mono text-xs text-brand">
            Start a new n8n server for me
          </pre>
          <pre className="rounded-[6px] border border-line bg-surface p-3 font-mono text-xs text-brand">
            Why did this deployment fail?
          </pre>
        </div>
      </section>

      {/* AI Console */}
      <section id="ai-console" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          AI Console
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-default">
          The AI Console is the main control center of TisiOps. Users can ask for
          deployments, debugging, infrastructure checks, retries, repairs, and
          monitoring summaries.
        </p>

        <div className="mt-4 rounded-[8px] border border-line bg-surface p-4">
          <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
            Example AI Prompts
          </h4>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 font-mono text-xs text-ink-strong">
            <li className="rounded border border-line bg-canvas p-2.5">
              &quot;Make my portfolio live&quot;
            </li>
            <li className="rounded border border-line bg-canvas p-2.5">
              &quot;Deploy my TisiOps frontend folder&quot;
            </li>
            <li className="rounded border border-line bg-canvas p-2.5">
              &quot;Start a new n8n server&quot;
            </li>
            <li className="rounded border border-line bg-canvas p-2.5">
              &quot;Check why my AWS app is not opening&quot;
            </li>
            <li className="rounded border border-line bg-canvas p-2.5">
              &quot;Retry this failed deployment&quot;
            </li>
            <li className="rounded border border-line bg-canvas p-2.5">
              &quot;Show logs for this server&quot;
            </li>
          </ul>
        </div>
      </section>

      {/* Agent Orchestration */}
      <section id="agent-orchestration" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Agent Orchestration
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          The Orchestrator Agent routes each request to the correct specialist agent.
        </p>

        <pre className="mt-4 rounded-[8px] border border-line bg-surface p-4 font-mono text-xs leading-relaxed text-ink-strong">
{`Orchestrator Agent
├── GitHub Agent
├── Vercel Agent
├── AWS Agent
├── Terraform Agent
├── n8n Agent
├── Logs Agent
├── Monitoring Agent
└── Retry / Repair Agent`}
        </pre>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          The Orchestrator decides what the user wants, which context is active,
          whether approval is required, and whether a Redis worker job should be
          created.
        </p>
      </section>

      {/* GitHub Agent */}
      <section id="github-agent" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          GitHub Agent
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          The GitHub Agent reads repository metadata and safe files to detect
          frameworks, branches, root folders, build commands, output directories,
          and deployment targets.
        </p>

        <div className="mt-4 rounded-[8px] border border-line bg-surface p-4">
          <h4 className="text-xs font-semibold text-ink-strong">Safety & Rules</h4>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-[#0f6b4f]" /> Never exposes GitHub tokens
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-[#0f6b4f]" /> Does not read .env files
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-[#0f6b4f]" /> Does not write to repositories in MVP
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-[#0f6b4f]" /> Supports monorepos like /frontend and /server
            </li>
          </ul>
        </div>
      </section>

      {/* Vercel Frontend Deployment */}
      <section id="vercel-frontend" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Vercel Frontend Deployment
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps can deploy frontend and website projects to TisiOps Managed Vercel Preview.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            "Next.js",
            "React",
            "Vite",
            "Astro",
            "HTML/CSS/JS",
            "Landing pages",
            "Portfolio websites",
            "Documentation sites",
          ].map((tag) => (
            <span
              key={tag}
              className="rounded-[4px] border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-strong"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 rounded-[6px] border border-line bg-brand-soft p-3 text-xs text-ink-strong">
          <strong>Note:</strong> Users do not need to say &quot;static&quot;. TisiOps detects website projects from natural language and repository analysis.
        </div>
      </section>

      {/* Website Deployment */}
      <section id="website-deployment" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Website Deployment
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          When a user says &quot;make my website live&quot;, &quot;publish my portfolio&quot;, or &quot;host this landing page&quot;, TisiOps treats it as a website deployment, inspects the repo, chooses the correct build settings, and prepares a deployment plan.
        </p>

        <div className="mt-4 rounded-[8px] border border-line bg-surface p-4 text-xs font-mono">
          <p className="text-brand">User: make my portfolio live</p>
          <p className="mt-2 text-ink-strong">
            TisiOps: I’ll deploy your website. I’ll check the repo and prepare a Vercel deployment plan.
          </p>
        </div>
      </section>

      {/* n8n Managed Server */}
      <section id="n8n-managed-server" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          n8n Managed Server
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          The n8n template creates a managed n8n server using the fixed <code>aws-n8n-server</code> workflow.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 rounded-[8px] border border-line bg-surface p-4 text-xs">
          <div>
            <dt className="text-ink-muted">Provider</dt>
            <dd className="font-semibold text-ink-strong">TisiOps Managed AWS</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Region</dt>
            <dd className="font-semibold text-ink-strong">ap-south-1</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Plan</dt>
            <dd className="font-semibold text-ink-strong">Starter (t3.micro)</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Access</dt>
            <dd className="font-semibold text-ink-strong">Elastic IP over HTTP</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Stack</dt>
            <dd className="font-semibold text-ink-strong">Docker + n8n + PostgreSQL + Caddy</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Final URL</dt>
            <dd className="font-semibold text-brand">http://&lt;Elastic-IP&gt;</dd>
          </div>
        </dl>

        <div className="mt-4 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] p-3 text-xs text-[#a8341f] flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            <strong>Warning:</strong> Elastic IP HTTP mode is for MVP testing. For production, use a domain with HTTPS.
          </span>
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          On first visit, n8n will ask the user to create the owner account.
        </p>
      </section>

      {/* AWS App Server */}
      <section id="aws-app-server" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          AWS App Server
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps can provision AWS infrastructure using fixed Terraform modules. AWS deployments may create paid cloud resources, so approval is always required before execution.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-line bg-surface p-4 text-xs font-mono text-ink-strong">
          <span>Plan</span> <ArrowRight className="size-3 text-ink-muted" />
          <span>Validate</span> <ArrowRight className="size-3 text-ink-muted" />
          <span>Approve</span> <ArrowRight className="size-3 text-ink-muted" />
          <span>Queue job</span> <ArrowRight className="size-3 text-ink-muted" />
          <span>Worker runs Terraform</span> <ArrowRight className="size-3 text-ink-muted" />
          <span>Bootstrap server</span> <ArrowRight className="size-3 text-ink-muted" />
          <span>Health check</span> <ArrowRight className="size-3 text-ink-muted" />
          <span className="text-brand">Final URL</span>
        </div>
      </section>

      {/* Ubuntu / Custom VPS */}
      <section id="ubuntu-vps" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Ubuntu & Custom VPS
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          Users can bring a cheap Ubuntu VPS from any provider. TisiOps connects over SSH, verifies the server, installs Docker, configures Caddy, sets up firewall rules, and prepares it for deployments.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 text-xs font-medium text-ink-strong">
          {["Light apps", "Testing", "n8n experiments", "Student projects", "Small websites", "Bots and workers"].map((item) => (
            <div key={item} className="rounded-[6px] border border-line bg-surface p-2.5">
              • {item}
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure & Terraform */}
      <section id="terraform-modules" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Terraform Modules
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps uses fixed Terraform modules. AI agents do not generate random Terraform code for execution.
        </p>

        <ul className="mt-3 space-y-1.5 font-mono text-xs text-brand">
          <li className="rounded border border-line bg-surface p-2">aws-n8n-server</li>
          <li className="rounded border border-line bg-surface p-2">aws-app-server</li>
          <li className="rounded border border-line bg-surface p-2">aws-docker-app-server</li>
          <li className="rounded border border-line bg-surface p-2">ubuntu-custom-vps</li>
        </ul>
      </section>

      {/* Redis Worker Queue */}
      <section id="redis-worker-queue" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Redis Worker Queue
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          Long-running deployment work does not run inside the frontend or API route. TisiOps creates a small Redis job and a background worker performs the real task.
        </p>

        <pre className="mt-3 rounded-[6px] border border-line bg-surface p-3 font-mono text-xs text-ink-strong">
{`deploymentJobId
deploymentId
jobType`}
        </pre>

        <div className="mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] p-3 text-xs text-[#a8341f]">
          <strong>Warning:</strong> Secrets, tokens, environment variables, and Terraform state must not be stored in Redis jobs.
        </div>
      </section>

      {/* Logs */}
      <section id="logs" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Logs
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps stores deployment logs so users can see what happened during provisioning, build, deployment, retry, and repair.
        </p>

        <pre className="mt-3 rounded-[8px] border border-line bg-surface p-4 font-mono text-xs leading-relaxed text-[#0f6b4f]">
{`[INFO] Deployment approved
[INFO] Job added to Redis queue
[INFO] Worker started
[INFO] Terraform module selected
[INFO] EC2 instance created
[INFO] Elastic IP attached
[INFO] Docker installed
[INFO] n8n started
[SUCCESS] Health check passed`}
        </pre>
      </section>

      {/* Monitoring */}
      <section id="monitoring" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Monitoring & Observability
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps monitoring starts with health checks, server status, container status, response time, and recent failures.
        </p>

        <div className="mt-4 rounded-[8px] border border-line bg-surface p-4">
          <h4 className="text-xs font-semibold text-ink-strong">Future Observability Stack</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-ink-muted">
            <li>• Prometheus for metrics</li>
            <li>• Loki for logs</li>
            <li>• Grafana for dashboards</li>
            <li>• Alertmanager for alerts</li>
          </ul>
        </div>
      </section>

      {/* Retry & Repair */}
      <section id="retry-repair-agent" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Retry and Repair
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          When a deployment fails, TisiOps does not leave the user alone. It stores logs, explains the likely cause, and offers retry or repair actions.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 text-xs font-medium text-ink-strong">
          <div className="rounded border border-line bg-surface p-2.5">Retry deployment</div>
          <div className="rounded border border-line bg-surface p-2.5">Fix Vercel output directory</div>
          <div className="rounded border border-line bg-surface p-2.5">Open port 80</div>
          <div className="rounded border border-line bg-surface p-2.5">Restart app container</div>
          <div className="rounded border border-line bg-surface p-2.5">Reconfigure Caddy</div>
          <div className="rounded border border-line bg-surface p-2.5">Run health check again</div>
        </div>

        <p className="mt-3 text-xs text-brand font-semibold">
          Repair actions always require user approval.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Pricing
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps pricing is based on AI DevOps value, not simple hosting.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="font-heading text-sm font-semibold text-ink-strong">Free</h3>
            <p className="mt-1 text-xs text-ink-muted">10 frontend deployments/month, 2 managed projects, basic logs</p>
          </div>
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="font-heading text-sm font-semibold text-ink-strong">Starter</h3>
            <p className="mt-1 text-xs text-ink-muted">More managed projects, expanded logs, basic retry</p>
          </div>
          <div className="rounded-[8px] border border-brand bg-brand-soft p-4">
            <h3 className="font-heading text-sm font-semibold text-brand">Pro</h3>
            <p className="mt-1 text-xs text-ink-muted">AWS workflows, n8n templates, Terraform, monitoring, repair agent</p>
          </div>
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="font-heading text-sm font-semibold text-ink-strong">Agency</h3>
            <p className="mt-1 text-xs text-ink-muted">More projects, client workflows, higher limits</p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-20 border-t border-line pt-10">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Security & Safety
        </h2>
        <p className="mt-2 text-sm text-ink-default">
          TisiOps is designed around safe DevOps execution.
        </p>

        <ul className="mt-4 space-y-2 text-xs font-medium text-ink-strong">
          {[
            "Clerk auth required for all user routes",
            "User-scoped deployments",
            "No secrets in frontend",
            "No secrets in logs",
            "No tokens in Redis",
            "Postgres is source of truth",
            "Infrastructure changes require approval",
            "Destructive actions require explicit confirmation",
            "AI cannot directly run arbitrary shell, Terraform, AWS, GitHub, or Vercel commands",
          ].map((rule) => (
            <li key={rule} className="flex items-center gap-2 rounded-[6px] border border-line bg-surface p-2.5">
              <ShieldCheck className="size-4 text-brand shrink-0" />
              {rule}
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line pt-10 pb-16">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          FAQ
        </h2>

        <div className="mt-6 space-y-4">
          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink-strong">
              Does TisiOps directly run AI-generated commands?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              No. AI creates plans. Backend validates. Workers execute approved actions.
            </p>
          </div>

          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink-strong">
              Can I use TisiOps without AWS?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              Yes. You can deploy frontend projects to Vercel and later connect your own Ubuntu VPS.
            </p>
          </div>

          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink-strong">
              How do I access n8n?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              In MVP Elastic IP mode, TisiOps gives you a URL like http://&lt;Elastic-IP&gt;.
            </p>
          </div>

          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink-strong">
              Are secrets visible in chat?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              No. Secrets are handled server-side and are never shown in chat, UI, or logs.
            </p>
          </div>

          <div className="rounded-[8px] border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink-strong">
              What happens if deployment fails?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              TisiOps saves logs, explains the issue, and offers retry or repair actions.
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
