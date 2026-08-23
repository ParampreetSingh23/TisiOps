# Architecture

## 1. Project Overview

**Project:** TisiOps

**Purpose:**
AI-powered DevOps Platform-as-a-Service that lets developers deploy, manage, and debug applications using natural language. The platform acts as an AI DevOps Engineer — provisioning infrastructure, deploying to AWS/Vercel, running n8n and PostgreSQL, monitoring health, diagnosing failures, and repairing deployments, all from a chat interface.

---

## 2. Tech Stack

### Frontend

* Framework: Next.js 16 (App Router)
* Language: TypeScript
* UI: Tailwind CSS v4, shadcn/ui, Radix UI
* State Management: React Server Components + client hooks (no global store)
* Authentication: Clerk (`@clerk/nextjs`)
* Charts: Recharts
* Terminal: xterm.js
* Markdown: react-markdown + remark-gfm
* Theme: next-themes (dark mode first)

### Backend

* Runtime: Node.js (Express v5)
* Framework: Express with TypeScript (tsx)
* Language: TypeScript (ESM)
* Validation: Zod v4
* SSH: ssh2
* WebSocket: ws (terminal sessions)

### Database

* Database: PostgreSQL
* ORM: Prisma v7 (`@prisma/client`)
* Queue: Redis + BullMQ (`ioredis`)
* Encryption: Custom AES encryption for secrets at rest (`server/utils/crypto.ts`)

### Infrastructure

* Containers: Docker / Docker Compose (SigNoz observability stack)
* Infrastructure-as-Code: Terraform (AWS modules)
* CI/CD: TBD
* Cloud Providers: AWS (EC2, STS), Vercel
* Observability: OpenTelemetry SDK, SigNoz (traces + metrics)

---

## 3. Repository Structure

```text
TisiOps/
├── frontend/              # Next.js 16 frontend (App Router)
│   ├── app/               #   Route pages
│   │   ├── dashboard/     #     Protected dashboard routes
│   │   ├── sign-in/       #     Clerk sign-in
│   │   ├── sign-up/       #     Clerk sign-up
│   │   ├── docs/          #     Documentation pages
│   │   ├── layout.tsx     #     Root layout (ClerkProvider, ThemeProvider)
│   │   └── page.tsx       #     Landing page
│   ├── components/        #   UI components
│   │   ├── admin/         #     Admin panels (templates, AI gateway, observability)
│   │   ├── brand/         #     Logo
│   │   ├── dashboard/     #     Deployment cards, server cards, AI gateway
│   │   ├── deployment/    #     Deployment flow components
│   │   ├── docs/          #     Documentation nav/sidebar
│   │   ├── landing/       #     Hero, navbar, sections, binary pattern
│   │   └── ui/            #     shadcn primitives (button, select)
│   ├── lib/               #   Client utilities (auth, api, features, providers)
│   ├── hooks/             #   Custom React hooks
│   ├── types/             #   TypeScript declarations
│   ├── public/            #   Static assets
│   ├── proxy.ts           #   Dev proxy to backend API
│   ├── next.config.ts     #   Next.js config (transpiles @tisiops/server)
│   └── package.json
│
├── server/                # Express API + workers + Terraform
│   ├── index.ts           #   Express app, all API routes
│   ├── auth/              #   Clerk auth helpers (Next.js + Express)
│   ├── db/                #   Prisma client singleton
│   ├── prisma/            #   Schema + migrations
│   ├── services/          #   Business logic (see §5)
│   │   ├── agents/        #     AI agent routing (github, terraform, n8n, repair, etc.)
│   │   ├── ai/            #     Usage tracking, rate limits
│   │   ├── ai-gateway/    #     AI gateway (proxy + logging)
│   │   ├── aws/           #     STS identity verification
│   │   ├── bootstrap/     #     Server SSH bootstrap
│   │   ├── deployments/   #     Deployment lifecycle + overview
│   │   ├── github/        #     Repo listing, analysis, intent detection
│   │   ├── n8n/           #     n8n deployment planning + config
│   │   ├── observability/ #     OTEL, SigNoz, traces, metrics, logs
│   │   ├── postgres/      #     Postgres deployment config + console
│   │   ├── provider-connections/  # AWS credential management
│   │   ├── servers/       #     Server health, pause/restart, terminal
│   │   ├── templates/     #     Deployment template registry + builder
│   │   ├── terraform/     #     TF agent, registry, inspection
│   │   ├── vercel/        #     Vercel deployment agent
│   │   └── redaction.ts   #     Secret redaction utilities
│   ├── workers/           #   Background job handlers
│   │   ├── deployment.worker.ts  # BullMQ worker process
│   │   └── handlers/      #     Per-job-type handlers (vercel, n8n, postgres, aws, terraform)
│   ├── queues/            #   Redis queue config + BullMQ setup
│   ├── validations/       #   Zod schemas (chat, deployment, provider, user)
│   ├── utils/             #   Crypto, response helpers
│   ├── constants/         #   Shared constants
│   ├── templates/         #   YAML deployment templates (n8n, postgres)
│   ├── infra/terraform/   #   Terraform modules + root config
│   │   ├── modules/       #     aws-n8n-server, aws-postgres-server, aws-app-server
│   │   ├── templates/     #     Root TF template (main.tf, variables.tf)
│   │   └── deployments/   #     Per-deployment TF state directories
│   └── package.json
│
├── infra/                 # Platform infrastructure
│   └── signoz/            #   Docker Compose for SigNoz observability stack
│
├── AGENTS.md              # AI agent behaviour rules
├── CONTEXT.md             # Current project state + phase goals
├── DESIGN.md              # UI design system
├── architecture.md        # This file
└── package.json           # Workspace root
```

---

## 4. High-Level Architecture

```text
Browser
  ↓
Next.js Frontend (App Router, Clerk auth)
  ↓  fetch() / WebSocket
Express API (server/index.ts)
  ↓
┌─────────────────────────────────────────┐
│  Services layer                         │
│  ├─ agents/      (intent routing)       │
│  ├─ deployments/ (lifecycle mgmt)       │
│  ├─ github/      (repo analysis)        │
│  ├─ n8n/         (n8n planning)         │
│  ├─ terraform/   (infra planning)       │
│  ├─ vercel/      (Vercel deployment)    │
│  ├─ postgres/    (Postgres deployment)  │
│  ├─ ai/          (usage + limits)       │
│  └─ observability/ (OTEL + SigNoz)     │
└─────────────────────────────────────────┘
  ↓                    ↓
PostgreSQL           Redis (BullMQ)
(Prisma ORM)        (job queue)
  ↓                    ↓
                 Deployment Worker
                 (server/workers/)
                   ↓
          ┌────────┼────────┐
          ↓        ↓        ↓
      Vercel   AWS EC2    Terraform
      API    (ssh2 + TF)  (child process)
```

---

## 5. Main Modules

### Authentication

Purpose:
Clerk handles sign-up, sign-in, and session management. The backend resolves a `User` row from the Clerk `userId` on every request. No password storage — Clerk is the identity provider.

Relevant area:

* `frontend/lib/auth.ts`
* `server/auth/index.ts`
* `server/auth/express.ts`
* `frontend/app/sign-in/`
* `frontend/app/sign-up/`

### User Management

Purpose:
One `User` row per Clerk account. Stores role (`USER` / `ADMIN`), email, and display info. Every data query is scoped by `userId`.

Relevant area:

* `server/services/user-service.ts`
* `server/prisma/schema.prisma` → `User` model

### AI Console (Chat)

Purpose:
Natural-language interface for deployments, server queries, and infrastructure questions. Classifies user intent, routes to the appropriate agent or deployment flow, and maintains per-session conversation history.

Relevant area:

* `frontend/app/dashboard/ai-console/page.tsx`
* `server/services/chat-service.ts`
* `server/services/chat-session-service.ts`
* `server/services/agents/agent-router.ts`

### Deployments

Purpose:
Manages the full deployment lifecycle: create, build, deploy, retry, stop, start, destroy. Each deployment owns its jobs, logs, attempts, environment variables, and server.

Relevant area:

* `frontend/app/dashboard/deployments/`
* `server/services/deployments/`
* `server/services/deployment-job.service.ts`
* `server/services/deployment-log.service.ts`
* `server/prisma/schema.prisma` → `Deployment`, `DeploymentJob`, `DeploymentLog` models

### Vercel Deployment Agent

Purpose:
Deploys frontend applications to Vercel. Analyzes the GitHub repository, creates a Vercel project, triggers a deployment, and reconciles the result.

Relevant area:

* `server/services/vercel/agent.ts`
* `server/services/github/analyze.ts`
* `server/workers/handlers/vercelDeployment.handler.ts`
* `frontend/app/dashboard/new-deployment/vercel/page.tsx`

### Managed n8n Server

Purpose:
Provisions an AWS EC2 instance running n8n via Terraform. Generates n8n encryption keys and database passwords, bootstraps the server over SSH, and configures domain/SSL.

Relevant area:

* `server/services/n8n/`
* `server/infra/terraform/modules/aws-n8n-server/`
* `server/templates/n8n/`
* `server/workers/handlers/n8nManagedDeployment.handler.ts`
* `frontend/app/dashboard/new-deployment/n8n/page.tsx`

### Managed PostgreSQL Server

Purpose:
Provisions an AWS EC2 instance running PostgreSQL via Terraform. Generates credentials, configures volume and access, and provides connection details.

Relevant area:

* `server/services/postgres/`
* `server/infra/terraform/modules/aws-postgres-server/`
* `server/templates/postgres/`
* `server/workers/handlers/postgresManagedDeployment.handler.ts`
* `frontend/app/dashboard/new-deployment/postgres/page.tsx`

### Terraform Agent

Purpose:
Plans, inspects, and explains Terraform-managed infrastructure. Reads deployment records and TF outputs to answer questions, generate retry/destroy plans, and detect drift.

Relevant area:

* `server/services/terraform/`
* `server/infra/terraform/`

### AI Agent Router

Purpose:
Classifies user messages into intents (github, terraform, n8n, repair, deployment lookup, out-of-scope) and routes to the correct agent handler. Each agent is a standalone module.

Relevant area:

* `server/services/agents/agent-router.ts`
* `server/services/agents/github.agent.ts`
* `server/services/agents/terraform.agent.ts`
* `server/services/agents/n8n.agent.ts`
* `server/services/agents/repair.agent.ts`
* `server/services/agents/vercel.agent.ts`
* `server/services/agents/postgres.agent.ts`
* `server/services/agents/aws.agent.ts`
* `server/services/agents/redis.agent.ts`

### Servers (BYOS)

Purpose:
Connects user-owned servers via SSH. Supports health checks, pause/restart, terminal sessions, and credential storage (encrypted at rest).

Relevant area:

* `frontend/app/dashboard/servers/`
* `server/services/servers/`
* `server/services/bootstrap/`
* `frontend/components/dashboard/connect-server-modal.tsx`

### Cloud Provider Connections

Purpose:
Manages AWS credentials (access key + secret). Tests with STS `GetCallerIdentity`, encrypts at rest, and never returns secrets to the client.

Relevant area:

* `server/services/provider-connections/`
* `server/services/aws/sts.ts`
* `frontend/components/dashboard/github-cards.tsx`

### AI Gateway

Purpose:
Unified AI proxy with per-user rate limits, usage tracking, model configuration, and request logging. Supports multiple providers and models.

Relevant area:

* `server/services/ai-gateway/`
* `server/services/ai/usage.service.ts`
* `server/services/ai/limits.ts`
* `frontend/app/dashboard/ai-gateway/page.tsx`
* `frontend/components/admin/ai-gateway-admin.tsx`

### Observability

Purpose:
OpenTelemetry tracing and metrics exported to SigNoz. Deployment logs carry `traceId` and `spanId` for distributed tracing.

Relevant area:

* `server/services/observability/`
* `infra/signoz/`
* `frontend/app/dashboard/admin/observability/page.tsx`

### Deployment Templates

Purpose:
YAML-based deployment templates (n8n, Postgres, custom) with admin management, validation, and a builder that produces deployment configs from templates.

Relevant area:

* `server/services/templates/`
* `server/templates/`
* `frontend/app/dashboard/admin/templates/page.tsx`
* `frontend/components/admin/template-creator.tsx`

---

## 6. Main Application Flow

### Chat-Triggered Deployment

1. User types a message in the AI Console (e.g. "deploy my n8n server").
2. Frontend sends `POST /api/chat/sessions/:id/messages`.
3. Backend classifies intent via `classifyIntent()` in `agent-router.ts`.
4. Agent router matches intent to a deployment flow (n8n, postgres, vercel).
5. Backend returns a structured response with a guided flow card.
6. User reviews config and clicks approve.
7. Frontend calls the appropriate deploy endpoint (`/api/deployments/n8n/deploy`, etc.).
8. Backend creates a `Deployment` row + `DeploymentJob` row, writes to Redis queue.
9. Worker picks up the job, runs Terraform / SSH bootstrap, updates status.
10. Frontend polls `/api/deployments/:id/progress` for live updates.

### Vercel Frontend Deployment

1. User selects a GitHub repository and branch.
2. Frontend calls `POST /api/deployments/vercel/analyze` → repo is inspected.
3. Backend returns a deployment plan (framework, build command, output dir).
4. User approves. Frontend calls `POST /api/deployments/vercel/approve`.
5. Backend creates a Vercel project + deployment via API, queues a job.
6. Worker reconciles Vercel build status and updates `Deployment` row.

### Server Health Check

1. User clicks a server or asks "how is my server?".
2. Frontend calls `POST /api/servers/:id/check`.
3. Backend opens an SSH connection, runs diagnostic commands.
4. Server row is updated with CPU, memory, disk, Docker status.
5. Results are returned to the frontend.

---

## 7. Database

Important models:

* `User` — Clerk-linked user account with role and profile
* `Deployment` — One deployment run (Vercel, n8n, Postgres, AWS app)
* `DeploymentJob` — Background job for a deployment (BullMQ-backed)
* `DeploymentLog` — Structured log lines with OTEL trace correlation
* `DeploymentAttempt` — One retry of a deployment
* `DeploymentEnvVar` — Encrypted environment variables per deployment
* `Server` — Connected or provisioned server (BYOS or AWS)
* `ServerCredential` — Encrypted SSH keys / passwords for a server
* `TerminalSession` — WebSocket terminal session to a server
* `N8nDeploymentConfig` — n8n-specific deployment settings + encrypted secrets
* `PostgresDeploymentConfig` — Postgres-specific deployment settings + encrypted secrets
* `AiChatSession` — One AI Console conversation with repo context
* `AiChatMessage` — Message within a chat session
* `AiUsageDaily` — Per-user per-model daily token/cost tracking
* `AiUsage` — Per-request AI usage record
* `AiGatewayRequestLog` — AI gateway request audit log
* `UserApiKey` — API keys for the AI gateway
* `AiProvider` / `AiModel` — Provider and model registry
* `CloudProviderConnection` — Encrypted AWS credentials per user
* `RepairPlan` — AI-generated repair plan for a failed deployment
* `AgentRun` — Audit trail for agent actions
* `AdminTemplate` — YAML deployment template (admin-managed)

Schema location:

`server/prisma/schema.prisma`

---

## 8. External Services

### Clerk

Used for:

* User authentication (sign-up, sign-in, session management)
* GitHub OAuth token resolution

Integration location:

* `frontend/app/layout.tsx` (ClerkProvider)
* `server/auth/index.ts` (clerkClient)
* `server/auth/express.ts` (Express middleware)

### Vercel API

Used for:

* Creating projects and triggering frontend deployments
* Reconciling deployment build status

Integration location:

* `server/services/vercel/agent.ts`

### GitHub API

Used for:

* Repository listing and analysis
* File content inspection for framework detection
* Commit status checks

Integration location:

* `server/services/github/repos.ts`
* `server/services/github/analyze.ts`
* `server/services/github/status.ts`

### AWS (EC2 + STS)

Used for:

* Server provisioning via Terraform (EC2, security groups, elastic IPs)
* Identity verification via STS `GetCallerIdentity`
* Server power management (stop/start)

Integration location:

* `server/infra/terraform/modules/` (Terraform modules)
* `server/services/aws/sts.ts`
* `server/services/servers/`

### Redis (BullMQ)

Used for:

* Deployment job queue
* Worker job locking and coordination
* AI usage burst counters

Integration location:

* `server/queues/redis.ts`
* `server/queues/deployment.queue.ts`
* `server/workers/deployment.worker.ts`

### OpenTelemetry / SigNoz

Used for:

* Distributed tracing across API and worker
* Metrics export (deployment durations, API latency)
* Structured logs with trace correlation

Integration location:

* `server/services/observability/otel.ts`
* `server/services/observability/trace.ts`
* `server/services/observability/metrics.ts`
* `infra/signoz/` (Docker Compose stack)

---

## 9. Background Workers

```text
Express API
  ↓ (writes DeploymentJob row + enqueues to Redis)
Redis (BullMQ)
  ↓ (worker polls)
Deployment Worker (server/workers/deployment.worker.ts)
  ↓
┌─────────────────────────────────────────┐
│  Handler dispatch by JobType:           │
│  ├─ vercelDeployment.handler.ts         │
│  ├─ n8nManagedDeployment.handler.ts     │
│  ├─ postgresManagedDeployment.handler.ts│
│  ├─ awsAppDeployment.handler.ts         │
│  ├─ terraformDestroy.handler.ts         │
│  ├─ retryDeployment.handler.ts          │
│  ├─ repairDeployment.handler.ts         │
│  ├─ serverPower.handler.ts              │
│  └─ vercelDelete.handler.ts             │
└─────────────────────────────────────────┘
  ↓
External service (Vercel API / AWS EC2 / Terraform)
  ↓
Deployment + DeploymentJob rows updated
```

The worker runs in-process by default (`RUN_WORKER_IN_API !== "false"`), or as a standalone process via `npm run worker`. The DeploymentJob table is the source of truth — Redis only carries the notification.

Relevant files:

* `server/workers/deployment.worker.ts`
* `server/workers/handlers/`
* `server/queues/`

---

## 10. Important Architecture Rules

* Keep business logic in `server/services/` — route handlers in `index.ts` are thin wrappers.
* Validate all API input with Zod before processing.
* Never trust client-provided `userId` — derive it from Clerk on every request.
* Encrypt all secrets at rest (env vars, SSH keys, AWS credentials, n8n passwords).
* Never return raw secrets in API responses — use `toSafeConnection()` or redacted views.
* Scope every data query by `userId` — a guessed session id returns 404, not another user's data.
* Do not run Terraform inside HTTP requests — queue a job and let the worker handle it.
* The DeploymentJob table is the source of truth for job state, not Redis.
* Keep provider-specific logic isolated in its own service directory.
* Do not duplicate shared logic — check `server/services/` and `server/utils/` first.
* Do not modify unrelated modules when implementing a feature.
* Prefer existing services/utilities before creating new ones.
* Admin-only routes must check both `user.role === "ADMIN"` and `isAdminEmail()`.

---

## 11. Key Architecture Decisions

| Decision | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) |
| Backend | Express v5 + TypeScript |
| Authentication | Clerk |
| Database | PostgreSQL |
| ORM | Prisma v7 |
| Queue | Redis + BullMQ |
| Infrastructure-as-Code | Terraform (AWS modules) |
| Deployment targets | Vercel, AWS EC2 |
| Validation | Zod v4 |
| Observability | OpenTelemetry → SigNoz |
| SSH | ssh2 (Node.js) |
| Secrets encryption | AES at rest (`server/utils/crypto.ts`) |
| AI gateway | Custom proxy with per-user rate limits |

---

## 12. Documentation Rule

This file describes **how the system is structured**.

Do not put:

* temporary implementation status here
* task progress here
* detailed UI rules here
* long code examples here

Use:

* `CONTEXT.md` for current project state and phase goals
* `DESIGN.md` for UI/design rules and visual tokens
* `AGENTS.md` for AI-agent behaviour and coding rules
