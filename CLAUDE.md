# Project: КлипМейкер

## Overview
AI SaaS, превращающий вебинары в промо-шортсы с русскими субтитрами и авто-постингом в VK/Rutube/Дзен/Telegram. Первый продукт на рынке, объединяющий AI clipping + нативные российские платформы + GetCourse.

## Problem & Solution
Авторы онлайн-курсов тратят 2-3 часа на ручную нарезку. Зарубежные AI-инструменты не поддерживают VK/Rutube и рубли. КлипМейкер: 5 мин → 10 шортсов → авто-постинг. Стоимость обработки 0.34₽/мин.

## Architecture
- **Pattern:** Distributed Monolith (Monorepo, Turborepo)
- **Deploy:** Docker Compose на VPS (AdminVPS/HOSTKEY)
- **Monorepo:** `apps/web` (Next.js 15) + `apps/worker` (BullMQ workers)
- **Packages:** `packages/db` (Prisma), `packages/queue`, `packages/types`, `packages/config`

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, shadcn/ui, Tailwind |
| API | Next.js API Routes + tRPC, Zod validation |
| Auth | NextAuth.js (email + VK OAuth), JWT |
| Queue | BullMQ on Redis 7 |
| Database | PostgreSQL 16 + Prisma ORM |
| Storage | S3-compatible (Yandex Object Storage) |
| Video | FFmpeg 7 (subprocess) |
| AI (RU) | Cloud.ru Evolution FM: T-Pro 2.1, GigaChat3-10B, Qwen3-235B, GLM-4.6, Whisper |
| AI (Global) | Gemini Flash/Lite/Pro, Claude Haiku 4.5, OpenAI Whisper |
| Payments | ЮKassa + СБП |
| Deploy | Docker Compose, nginx, Let's Encrypt |

## Key Algorithms
- `LLMRouter(task, context)` → selects tier0-3 model by strategy (ru/global), video length, plan
- `VideoProcessingPipeline(video, user)` → STT → moment selection → virality scoring → titles → FFmpeg render
- `AutoPostScheduler(clip, platforms)` → queue with retry, rate limiting, platform adapters
- `EncryptedKeyVault` → AES-GCM 256-bit client-side, PBKDF2 key derivation, auto-lock

## Security Rules
⚠️ **Critical — read before any implementation:**
- API keys (VK, Gemini, etc.) → encrypted client-side only (AES-GCM 256-bit, IndexedDB)
- Server NEVER stores plaintext API keys — pass-through per-request only
- JWT: 15 min access + 7d refresh, HttpOnly cookies
- Rate limiting: 100 req/min per user, 10 uploads/hour
- File upload: magic bytes validation (not just MIME)
- All user input: Zod validation + DOMPurify for text display
- 152-ФЗ: video data on Russian VPS, transcripts to Cloud.ru (RU) or Global (user choice)

## Parallel Execution Strategy
- Use `Task` tool for independent subtasks (e.g., multiple workers, test suites)
- Run tests, linting, type-checking in parallel
- For complex features: spawn specialized agents (`@planner` + `@architect` + impl agents)
- FFmpeg clip rendering: parallel per clip
- LLM calls: parallel for scoring, titles, CTAs

## Swarm Agents
| Scenario | Agents | Parallelism |
|----------|--------|-------------|
| Large feature | @planner + 2-3 impl agents | Yes |
| Refactoring | @code-reviewer + refactor agents | Yes |
| Bug fix | 1 agent | No |
| New feature | /feature command (4-phase lifecycle) | Yes |

## Git Workflow
- Commit after each logical change (NOT at end of session)
- Format: `type(scope): description` (max 50 chars subject)
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Branch: `main` ← `develop` ← `feat/xxx`, `fix/xxx`

## Available Agents
- `@planner` — Feature decomposition from SPARC docs, task breakdown
- `@code-reviewer` — Quality review with edge cases from Refinement.md
- `@architect` — System design, consistency with Architecture.md
- `@tdd-guide` — Test-first development using BDD scenarios

## Available Skills
- `project-context/` — Domain knowledge, market research, competitors
- `coding-standards/` — Next.js + Prisma + BullMQ patterns
- `testing-patterns/` — BDD scenarios, test templates
- `security-patterns/` — Encrypted client-side key storage pattern
- `sparc-prd-manual/` — Feature planning (SPARC methodology)
- `explore/` — Task exploration and clarification
- `goap-research/` — Research with GOAP methodology
- `problem-solver-enhanced/` — First principles + TRIZ problem solving
- `requirements-validator/` — INVEST/SMART validation
- `brutal-honesty-review/` — Unvarnished technical review

## Quick Commands
| Command | Description |
|---------|------------|
| `/start` | Bootstrap entire project from docs (one command) |
| `/plan [feature]` | Plan & save to `docs/plans/` (lightweight) |
| `/test [scope]` | Generate and run tests |
| `/deploy [env]` | Deploy to VPS |
| `/feature [name]` | Full feature lifecycle (4 phases) |
| `/myinsights [title]` | Capture development insight |

## 🔍 Development Insights (живая база знаний)
Index: [myinsights/1nsights.md](myinsights/1nsights.md) — check here FIRST before debugging.
⚠️ On error → grep the error string in the index → read only the matched detail file.
Capture new findings: `/myinsights [title]`

## 🔄 Feature Development Lifecycle
New features follow the 4-phase lifecycle: `/feature [name]`
1. **PLAN** — SPARC docs → `docs/features/<name>/sparc/`
2. **VALIDATE** — requirements-validator swarm → score ≥70
3. **IMPLEMENT** — parallel agents from validated docs
4. **REVIEW** — brutal-honesty-review swarm → fix all criticals

For smaller changes use `/plan [name]` — lightweight plan saved to `docs/plans/`.

| Scope | Command | Output |
|-------|---------|--------|
| Major feature (US-XX) | `/feature` | `docs/features/<name>/sparc/` (10 files) |
| Small feature, refactor, hotfix | `/plan` | `docs/plans/<name>-<date>.md` (1 file) |

Available lifecycle skills in `.claude/skills/`:
- `sparc-prd-manual` (+ explore, goap-research, problem-solver-enhanced)
- `requirements-validator`
- `brutal-honesty-review`

## Resources
- [Plans](docs/plans/) — Lightweight implementation plans (`/plan`)
- [PRD](docs/PRD.md) — What we're building
- [Architecture](docs/Architecture.md) — How we're building
- [Specification](docs/Specification.md) — Detailed requirements (15 user stories)
- [Pseudocode](docs/Pseudocode.md) — Algorithms, API contracts, data structures
- [LLM Strategy](docs/LLM_Strategy.md) — Dual AI provider architecture
- [Validation Report](docs/validation-report.md) — Quality assurance results
- [Test Scenarios](docs/test-scenarios.md) — 45+ BDD scenarios
