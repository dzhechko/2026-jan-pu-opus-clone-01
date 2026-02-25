---
description: Bootstrap entire КлипМейкер project from documentation.
  Generates monorepo skeleton, all packages, Docker configs, database schema,
  core modules, and basic tests. $ARGUMENTS: optional flags --skip-tests, --skip-seed, --dry-run.
---

# /start $ARGUMENTS

## Purpose

One-command project generation from documentation → working monorepo with `docker compose up`.

## Prerequisites

- Documentation in `docs/` directory (SPARC output)
- CC toolkit in project root (CLAUDE.md, .claude/, .mcp.json)
- Node.js 20+, Docker + Docker Compose installed
- Git initialized

## Process

### Phase 1: Foundation (sequential — everything depends on this)

1. **Read all project docs** to build full context:
   - `CLAUDE.md` — главный контекст проекта
   - `DEVELOPMENT_GUIDE.md` — этапы разработки
   - `docs/Architecture.md` → monorepo structure, Docker Compose, tech stack
   - `docs/Specification.md` → data model, API endpoints, NFRs
   - `docs/Pseudocode.md` → core algorithms, LLM Router, video pipeline
   - `docs/Completion.md` → env config, deployment setup
   - `docs/PRD.md` → features, user personas (for README)
   - `docs/Refinement.md` → edge cases, testing strategy
   - `docs/LLM_Strategy.md` → dual provider config, model tiers, cost optimization
   - `docs/validation-report.md` → ограничения и решения
   - `docs/test-scenarios.md` → 45+ BDD scenarios

2. If `myinsights/1nsights.md` exists — scan for known issues and solutions

3. **Generate root configs:**
   - `package.json` with Turborepo workspaces (apps/web, apps/worker, packages/*)
   - `turbo.json`, `tsconfig.base.json`, `.eslintrc.js`, `.prettierrc`
   - `docker-compose.yml` (enrich scaffold: web, 4 workers, postgres, redis)
   - `.env.example` from docs/Completion.md env vars
   - Copy `.env.example` → `.env`

4. **Git commit:** `chore: project root configuration`

### Phase 2: Packages (parallel via Task tool ⚡)

Launch 4 parallel tasks:

#### ⚡ Task A: packages/db

Read and use as source:
- `docs/Specification.md` → data model tables → Prisma schema
- `docs/Architecture.md` → database design → config

Generate:
- `packages/db/prisma/schema.prisma` — full schema (users, videos, clips, plans, subscriptions, platform_connections)
- `packages/db/src/client.ts` — Prisma client export
- `packages/db/package.json`

**Commits:** `feat(db): Prisma schema from Specification data model`

#### ⚡ Task B: packages/types + packages/queue + packages/config

Read and use as source:
- `docs/Pseudocode.md` → data structures, enums, interfaces
- `docs/Architecture.md` → queue definitions, config structure

Generate:
- `packages/types/src/` — VideoStatus, ClipStatus, Plan, LLMStrategy, etc.
- `packages/queue/src/` — BullMQ job types (stt, llm-analyze, llm-score, video-render, publish, stats-collect)
- `packages/config/src/` — env validation, LLM provider configs

**Commits:** `feat(packages): shared types, queue definitions, config`

#### ⚡ Task C: apps/web

Read and use as source:
- `docs/Architecture.md` → API endpoints, route structure
- `docs/Specification.md` → user stories → pages/components
- `docs/Pseudocode.md` → API contracts → tRPC routers
- `docs/Completion.md` → auth config, environment

Generate:
- `apps/web/app/` — App Router: `(auth)/login`, `(auth)/register`, `(dashboard)/`, `(dashboard)/videos/[id]`, `(settings)/`
- `apps/web/lib/trpc/routers/` — video.ts, clip.ts, billing.ts, platform.ts, user.ts, ai-provider.ts
- `apps/web/components/` — VideoUploader, ClipCard, SubtitleEditor, PlatformConnect, PricingTable
- `apps/web/lib/` — auth (NextAuth.js), encrypted-storage (Web Crypto), trpc client
- `apps/web/package.json`

**Commits:** `feat(web): Next.js app with tRPC routes and components`

#### ⚡ Task D: apps/worker

Read and use as source:
- `docs/Pseudocode.md` → algorithms → worker implementations
- `docs/Architecture.md` → worker architecture, LLM Router
- `docs/LLM_Strategy.md` → dual provider config, model tiers, cost optimization

Generate:
- `apps/worker/lib/llm-router.ts` — LLMRouter from Pseudocode (tier selection, Cloud.ru + Global)
- `apps/worker/workers/stt.ts` — Whisper STT worker
- `apps/worker/workers/llm-analyze.ts` — moment selection + virality scoring
- `apps/worker/workers/video-render.ts` — FFmpeg clip generation
- `apps/worker/workers/publish.ts` — VK/Rutube/Дзен/Telegram auto-post
- `apps/worker/workers/stats-collector.ts` — platform stats via API
- `apps/worker/package.json`

**Commits:** `feat(worker): BullMQ workers with LLM Router`

### Phase 3: Integration (sequential)

1. **Verify cross-package imports** (shared types used correctly)
2. **Docker build:** `docker compose build`
3. **Start services:** `docker compose up -d postgres redis`
4. **Database setup:**
   - `cd packages/db && npx prisma migrate dev --name init`
   - `npx prisma db seed` (unless `--skip-seed`)
5. **Start app + workers:** `docker compose up -d`
6. **Health check:** `curl -f http://localhost:3000/api/health || echo "⚠️ Check logs"`
7. **Run tests:** `npm run typecheck && npm run lint` (unless `--skip-tests`)
8. **Git commit:** `chore: verify docker integration`

### Phase 4: Finalize

1. Generate/update `README.md` with quick start instructions
2. Final git tag: `git tag v0.1.0-scaffold`
3. Report summary:

```
✅ КлипМейкер project initialized!

📁 Structure:
├── apps/web/          — Next.js 15 (pages, API, components)
├── apps/worker/       — BullMQ workers (STT, LLM, Video, Publish, Stats)
├── packages/db/       — Prisma schema + client
├── packages/queue/    — Job definitions
├── packages/types/    — Shared TypeScript types
├── packages/config/   — Environment + LLM provider config

🐳 Docker: postgres, redis, web, 4 workers
📊 Schema: users, videos, clips, plans, subscriptions, platform_connections
🤖 LLM Router: Cloud.ru (T-Pro, GigaChat, Qwen, GLM) + Global (Gemini, Claude, OpenAI)

🛠 Commands: /plan, /test, /deploy, /feature, /myinsights
🤖 Agents: @planner, @code-reviewer, @architect, @tdd-guide

🚀 Recommended first feature: US-12 Authentication (email + VK OAuth)
```

4. Ask: "Готов начать? Какую фичу реализуем первой?"

## Flags

- `--skip-tests` — skip typecheck/lint in Phase 4
- `--skip-seed` — skip database seeding in Phase 3
- `--dry-run` — show plan without executing

## Error Recovery

If a task fails mid-generation:
- All completed phases are committed to git
- Re-run `/start` — it detects existing files and skips completed phases
- Or fix the issue manually and continue

## Swarm Agents Used

| Phase | Agents | Parallelism |
|-------|--------|-------------|
| Phase 1 | Main | Sequential |
| Phase 2 | 4 Task tools | ⚡ Parallel |
| Phase 3 | Main | Sequential |
| Phase 4 | Main | Sequential |
