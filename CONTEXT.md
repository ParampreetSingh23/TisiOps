# CONTEXT.md

## Project Name

**TisiOps**

## Project Type

AI-powered DevOps Platform-as-a-Service.

## Product Vision

TisiOps is a platform where developers can deploy and manage applications using natural language instead of manually configuring infrastructure.

The platform should act like an AI DevOps Engineer that helps with:

- Deployment
- Infrastructure provisioning
- Monitoring
- Debugging
- Scaling
- Rollbacks
- Cost optimization
- Security checks
- CI/CD automation

The long-term goal is to let developers operate production applications without needing deep DevOps knowledge.

---

## Problem

Deploying applications today requires knowledge of many tools and concepts:

- Linux
- Docker
- Kubernetes
- Terraform
- CI/CD
- Reverse proxies
- SSL certificates
- DNS
- Cloud providers
- Monitoring
- Logs
- Firewalls

Many developers spend too much time configuring infrastructure instead of building products.

---

## Solution

TisiOps allows users to describe what they want in plain English.

Examples:

```txt
Deploy my Next.js application from GitHub on the cheapest server.
```

```txt
Deploy my FastAPI application with PostgreSQL and enable HTTPS.
```

```txt
Rollback the last deployment.
```

```txt
Show me why production is failing.
```

The AI should understand the request, create a plan, execute safe steps, verify the result, and explain what happened.

---

## Current MVP Goal

The current goal is not to build the full AI DevOps system.

The current goal is to build the basic SaaS foundation tonight.

### Build Now

- Navbar
- Landing page
- Register page
- Login page
- Authentication
- Authorization
- PostgreSQL database setup
- Prisma setup
- Protected dashboard
- Basic user roles

### Success Criteria

The MVP foundation is successful when:

1. A user can register.
2. A user can login.
3. A logged-in user can access `/dashboard`.
4. A logged-out user cannot access `/dashboard`.
5. The navbar changes based on auth state.
6. The database stores users correctly.
7. The app feels like the beginning of a real SaaS product.

---

## Current Phase

**Phase 1: SaaS Foundation**

This phase should stay simple and focused.

Do not add deployment automation yet.
Do not add AI agents yet.
Do not add GitHub integration yet.
Do not add cloud provider integration yet.

---

## Target Users

TisiOps is designed for:

- Indie hackers
- Students
- Freelancers
- Startups
- SaaS founders
- Developers
- Agencies
- Small companies

These users want deployment and infrastructure management to be simple, fast, and understandable.

---

## Core Product Philosophy

Users should not need to manually:

- SSH into servers
- Write Docker commands
- Configure Nginx
- Generate SSL certificates
- Write Terraform
- Configure CI/CD
- Restart services manually
- Debug infrastructure blindly

Everything should eventually happen through conversation, but with safe approvals and visibility.

---

## MVP Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js API routes for the initial MVP

### Database

- PostgreSQL
- Prisma ORM

### Authentication

- NextAuth/Auth.js
- Credentials authentication first
- GitHub OAuth later

### Authorization

Start with two roles:

```txt
USER
ADMIN
```

Do not add complex permission systems yet.

---

## Future Tech Stack Direction

Later phases may include:

### Backend Services

- Go backend for platform APIs
- FastAPI for AI orchestration

### Infrastructure

- Docker
- Docker Compose
- Nginx or Caddy
- Terraform
- Kubernetes later only when needed

### Data/Queue

- PostgreSQL
- Redis
- Task queue system

### Cloud Providers

Future support may include:

- AWS
- Azure
- GCP
- DigitalOcean
- Hetzner
- Oracle Cloud

For the first working deployment product, start with only one provider or one VPS flow.

---

## Future Features

These are long-term features, not current MVP tasks:

- GitHub integration
- Repository scanning
- Framework detection
- Dockerfile detection
- Deployment planning
- VPS provisioning
- Docker-based deployment
- Reverse proxy setup
- HTTPS setup
- Logs viewer
- Monitoring dashboard
- Auto-healing
- Rollback system
- GitHub Actions CI/CD
- Domain management
- DNS automation
- Cost optimization
- Team collaboration
- Billing
- Usage analytics
- Kubernetes
- Multi-cloud support
- Blue/green deployment
- Canary deployment
- Preview environments
- AI incident response
- Secrets manager
- AI security auditor

---

## AI Agent Architecture Direction

In the future, the platform may use these agents:

### Planner Agent

Converts user prompts into structured execution plans.

### Deployment Agent

Deploys applications and manages deployment lifecycle.

### Infrastructure Agent

Creates and manages infrastructure.

### Docker Agent

Builds and runs containers.

### Monitoring Agent

Analyzes metrics, logs, and app health.

### Debug Agent

Investigates deployment failures.

### Security Agent

Checks secrets, open ports, SSL, and vulnerabilities.

### Cost Agent

Finds unused or expensive resources and recommends savings.

Do not implement these agents in Phase 1.

---

## Safety Model Direction

TisiOps should not blindly execute infrastructure changes.

Future execution should follow this safe flow:

```txt
Prompt
  → Intent Understanding
  → Plan Generation
  → Risk Classification
  → User Approval if Needed
  → Execution
  → Verification
  → Explanation
  → Rollback Option
```

High-risk actions should require approval, such as:

- Deleting servers
- Removing databases
- Rotating secrets
- Changing DNS
- Scaling down production
- Destroying infrastructure
- Modifying billing-related resources

---

## UI Direction

TisiOps should feel like a modern AI SaaS platform.

Inspired by:

- Vercel
- Linear
- OpenAI
- GitHub
- Notion
- Stripe

Visual characteristics:

- Dark mode first
- Clean layout
- Minimal UI
- Rounded cards
- Subtle borders
- Smooth animations
- Light glassmorphism
- Clear typography
- Command palette feel
- AI chat as a primary interaction pattern

Always follow `DESIGN.md` when it exists.

---

## Initial App Pages

Start with these pages:

```txt
/
/login
/register
/dashboard
```

Later pages can include:

```txt
/projects
/projects/[id]
/deployments
/servers
/settings
/billing
/logs
```

Do not create the later pages until the foundation is complete.

---

## Initial Database Direction

Start with a simple `User` model.

Suggested fields:

```txt
id
name
email
password
role
createdAt
updatedAt
```

Later models may include:

```txt
Organization
Project
Repository
Deployment
Server
Environment
Domain
Log
Metric
AiAction
BillingAccount
```

Do not add these later models yet unless needed.

---

## Development Principle

Build TisiOps in phases.

### Phase 1

SaaS foundation: auth, database, navbar, dashboard.

### Phase 2

GitHub connection and repository listing.

### Phase 3

Basic deployment plan generation.

### Phase 4

One-provider Docker deployment flow.

### Phase 5

Logs, monitoring, rollback, and auto-healing.

### Phase 6

AI DevOps agents and advanced infrastructure automation.

---

## Current Instruction For AI Coding Agents

When working on this project right now:

1. Keep the app name as **TisiOps**.
2. Read `AGENTS.md`, `CONTEXT.md`, and `DESIGN.md` before coding.
3. Build only the Phase 1 foundation.
4. Keep the UI clean and dark-mode-first.
5. Use PostgreSQL and Prisma.
6. Use authentication and protected routes.
7. Do not build future DevOps automation features yet.
8. Do not over-engineer the database schema.
9. Do not add unnecessary packages.
10. Make the app feel like a real SaaS foundation.

