# AGENTS.md

## App Name

**TisiOps**

## Mandatory Skill Usage

For every TisiOps task, first read the project context files and load the required skills: `ponytail`, `caveman`, and `frontend-design`. Use `ponytail` for structured execution, `caveman` for preserving compressed project context and constraints, and `frontend-design` for any frontend, UI, dashboard, component, spacing, layout, or visual polish work. These skills must be applied before coding so the implementation stays consistent with TisiOps architecture, safety rules, and design system.
At the beginning of every new session, DO NOT explore the repository.

You must first read ONLY these files:

1. AGENTS.md
2. architecture.md
3. CONTEXT.md
4. DESIGN.md


## App Description

TisiOps is an AI-powered DevOps Platform-as-a-Service that helps developers deploy, manage, monitor, debug, and optimize applications using natural language.

The long-term goal is to act like an AI DevOps Engineer. A user should be able to say things like:

- "Deploy my Next.js app from GitHub."
- "Restart production."
- "Show me the logs."
- "Add Redis to this project."
- "Rollback the last deployment."
- "Reduce my monthly cloud cost."

The platform should eventually handle infrastructure provisioning, Docker setup, reverse proxy configuration, HTTPS, CI/CD, monitoring, auto-healing, and cost optimization.





---

## Mandatory Files To Read Before Making Changes

Before editing or generating code, always check these files first:

1. `CONTEXT.md`
2. `DESIGN.md`
3. `AGENTS.md`

These files are the source of truth for project direction, design decisions, architecture rules, and implementation boundaries.

If `DESIGN.md` exists, follow it strictly for:

- Colors
- Typography
- Spacing
- Layout style
- Component style
- Border radius
- Shadows
- Dark mode behavior
- UI tone

If `CONTEXT.md` exists, follow it strictly for:

- Product scope
- Current MVP goal
- Tech stack
- Architecture decisions
- What to build now
- What not to build yet

---



Do not start GitHub integration, deployment automation, AI agents, billing, monitoring, cloud provisioning, or Kubernetes until the foundation is stable.

---

## Recommended Tech Stack

Use the following stack unless the user explicitly changes it:

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js API routes for the initial MVP
- Later: Go backend and FastAPI AI orchestration if needed

### Database

- PostgreSQL
- Prisma ORM

### Auth

- NextAuth/Auth.js
- Credentials login first
- GitHub OAuth later

### Styling

- Dark mode first
- Clean AI SaaS layout
- Minimal cards
- Rounded corners
- Subtle borders
- Smooth transitions
- Modern dashboard feel

---

## Coding Rules

### General Rules

- Write clean, production-minded code.
- Keep the MVP simple.
- Do not over-engineer.
- Prefer readable code over clever code.
- Use TypeScript wherever possible.
- Keep components small and reusable.
- Use clear file names.
- Use consistent import aliases.
- Avoid unnecessary dependencies.

### Safety Rules

- Do not delete important files without explicit instruction.
- Do not overwrite existing project structure without checking first.
- Do not remove authentication, authorization, environment handling, or database logic unless asked.
- Do not expose secrets in code.
- Do not hardcode database credentials, API keys, tokens, or private URLs.
- Do not commit `.env` values into generated code.

### UI Rules

- Always follow `DESIGN.md` when available.
- Keep UI consistent with a modern AI SaaS product.
- Use dark mode as the default visual direction.
- Use clean spacing and clear hierarchy.
- Do not create random colors if a palette exists in `DESIGN.md`.
- Use reusable UI components where practical.

### Auth Rules

- Protect private routes.
- Never trust client-side authorization alone.
- Check session/role on the server for sensitive pages or actions.
- Keep roles simple for now: `USER` and `ADMIN`.
- Do not add complex organization/team permissions until later.

### Database Rules

- Use Prisma migrations for schema changes.
- Keep the first schema simple.
- Start with `User` and basic auth fields.
- Add deployment/project/server tables only when the user asks to move to the deployment module.

---

## Implementation Boundaries

### Build Now

- SaaS layout
- Navbar
- Auth pages
- Register/login flow
- Protected dashboard
- PostgreSQL connection
- Prisma schema
- Basic role authorization

### Do Not Build Yet

- GitHub repository import
- AI deployment planner
- Server provisioning
- Docker deployment engine
- Terraform generation
- Kubernetes
- Multi-cloud support
- Billing
- Usage analytics
- Auto-healing
- Monitoring dashboards
- Cost optimization engine
- Domain/DNS automation

These will be added in later phases.

---

## Product Direction

TisiOps should eventually feel like an experienced DevOps engineer inside a chat interface.

The user should not need to manually:

- SSH into servers
- Write Docker commands
- Configure Nginx
- Generate SSL certificates
- Write Terraform
- Configure CI/CD
- Restart services manually

However, the system must always be safe, visible, and controlled.

The ideal execution flow is:

```txt
User Prompt
  → Intent Detection
  → Execution Plan
  → Safety Check
  → User Approval When Needed
  → Tool Execution
  → Verification
  → Logs/Explanation
  → Rollback Option
```

---

## AI Agent Behavior Rules

When acting as an AI coding agent inside this repository:

1. Read `CONTEXT.md`, `DESIGN.md`, and `AGENTS.md` first.
2. Understand the current phase before coding.
3. Make the smallest correct change.
4. Do not build future features early.
5. Explain important changes clearly.
6. Keep code aligned with the MVP goal.
7. Preserve existing structure unless there is a strong reason to change it.
8. Prefer working, testable foundations over incomplete advanced features.
9. When unsure, choose the simpler implementation.
10. Keep TisiOps visually polished and technically clean.

---

## Current Phase

**Phase 1: SaaS Foundation**

Goal:

Create a working TisiOps app where users can register, login, and access a protected dashboard.

Success condition:

A user can create an account, login, see the navbar, and access the dashboard only when authenticated.

