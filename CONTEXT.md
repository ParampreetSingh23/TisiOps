# CONTEXT.md

## Project Name

**TisiOps**

## Project Type

AI-powered DevOps Platform-as-a-Service (PaaS).

## Product Vision

TisiOps is an AI-powered DevOps platform where developers deploy, manage, monitor, debug, and optimize applications through structured workflows and natural language automation instead of wrestling with manual infrastructure.

The platform acts like an AI DevOps Engineer that handles:

- Application deployment (GitHub repos, custom Dockerfiles, pre-built templates, n8n workflows)
- Server & VPS provisioning (BYO-Server over SSH, AWS EC2 automation)
- AI Gateway & proxy routing (Gemini, Grok, Mistral, OpenCode, OpenAI, Claude with usage tracking & token auditing)
- Interactive web SSH terminal with encrypted credentials (AES-256-GCM)
- Live server monitoring, diagnostics, and AI-assisted repair planning
- Container management and reverse proxy routing
- Rollbacks, auto-healing, and infrastructure health monitoring

---

## What Is Built & Operational (Current State)

### 1. SaaS Foundation & Architecture
- **Monorepo Architecture**: Clean separation between `frontend/` (Next.js 16, React 19, Tailwind CSS, Motion, Lenis) and `server/` (Express, TypeScript, BullMQ, Redis, Prisma ORM, WebSocket SSH server).
- **Authentication & Authorization**: Session-based auth with credential management and role-based permissions (`USER`, `ADMIN`).
- **Database Layer**: PostgreSQL managed via Prisma with migrations for Users, Deployments, Servers, Credentials, AI Usage, API Keys, and Monitoring Signals.

### 2. Deployment Engine
- **GitHub Integration**: Connect repositories, list branches, detect project frameworks, Dockerfiles, and runtime environments.
- **Pre-configured Templates & Workflows**: Instant deployment flows for Next.js, Node.js, Go, Python, and automated n8n workflows.
- **Deployment Lifecycle**: Build tracking, stage progression, build log streaming, rollback support, and port mapping.

### 3. Server Management & Web Terminal
- **Server Lifecycle**: Connect custom Ubuntu/Debian VPS servers or provision AWS EC2 instances.
- **Live State Transitions**: Realtime status tracking (`CONNECTED`, `STARTING`, `STOPPING`, `PROVISIONING`, `VERIFYING`, `NEEDS_ATTENTION`) with animated brand progress bars and polling.
- **SSH Web Terminal**: Interactive browser terminal powered by `xterm.js` and WebSocket streaming, authenticated with AES-256-GCM encrypted SSH keys or passwords.
- **System Telemetry**: Automated detection of OS, CPU cores, RAM, Disk storage, Docker daemon status, and sudo permissions.

### 4. TisiOps AI Gateway (`/dashboard/ai-gateway`)
- **Unified LLM Proxy Endpoint**: `POST /api/v1/ai/chat` proxying requests to Gemini, Grok, Mistral, OpenCode, and OpenAI-compatible endpoints with a single Bearer API key.
- **API Key Management**: Generate scoped keys (`tisiops_sk_live_...`), prefix masking, last used tracking, one-time secret reveals, and revocation.
- **Telemetry & Spend Metering**: Realtime request counts, prompt/completion token tracking, daily plan limits, and estimated USD spend per model.
- **Official Model Catalog**: Dense pricing and context window reference with official provider vector logos and 1-click model ID copy.
- **Multi-language Integration**: Ready-to-use cURL, Node.js (fetch), and Python integration snippets matching the backend `chatSchema`.

### 5. Monitoring & Diagnostics
- **Health Verification**: Background probing of server ports, HTTP endpoints, container health, and latency.
- **BullMQ Background Workers**: Dedicated queue workers for periodic monitoring context, health probes, and log parsing.
- **AI Diagnostics**: Failure diagnosis and repair plan recommendation based on live container signals and error logs.

---

## Active Tech Stack

### Frontend (`frontend/`)
- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, custom design tokens in `DESIGN.md` (warm canvas `#F9F7F6` / `#121212`, `#FF4400` brand accent, 1px crisp borders)
- **UI Components**: shadcn/ui primitives, Lucide React icons, `@icons-pack/react-simple-icons`, custom official brand SVGs
- **Animation & Polish**: `motion/react`, `lenis` for smooth scrolling
- **Terminal**: `xterm`, `xterm-addon-fit`, `xterm-addon-web-links`

### Backend (`server/`)
- **Runtime**: Node.js, Express, TypeScript
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Async Processing**: BullMQ queues with Redis
- **SSH & WebSockets**: `ssh2` library, `ws` WebSocket server for bidirectional terminal streaming
- **Security**: AES-256-GCM encryption for stored server credentials and private keys, SHA-256 key hashing for API Gateway tokens
- **Cloud SDKs**: AWS SDK v3 (`@aws-sdk/client-ec2`)

---

## Core Product Principles

1. **Safety First**: Destructive actions (deleting servers, stopping instances, disconnecting infrastructure) always require explicit confirmation.
2. **Deterministic Infrastructure**: Prefer clear, reproducible execution steps and explicit plans over unconstrained AI agent actions.
3. **No AI Slop / Fake UI**: No arbitrary decorative charts, fake numbers, or meaningless animations. Every badge, metric, and token count maps to live data.
4. **Design Discipline**: Follow `DESIGN.md` strictly. Use monospace exclusively for IDs, keys, IP addresses, ports, commands, and code snippets. Maintain full light and dark mode parity.

---

## Next Roadmap Phases

- **Phase 7: Automated Server Preparation**: One-click server hardening and automated installation of Docker, Nginx, UFW firewalls, and SSL certificates via SSH runners.
- **Phase 8: Multi-Cloud Provisioning**: Expanding native provisioning beyond AWS EC2 to Hetzner, DigitalOcean, and GCP.
- **Phase 9: Custom Domain & DNS Automation**: Automated CNAME/A-record verification and Let's Encrypt SSL certificate issuance.
- **Phase 10: Advanced AI Incident Response**: Automated pull-request generation and container auto-restart based on verified diagnosis plans.

