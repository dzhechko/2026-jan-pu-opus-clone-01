# КлипМейкер

AI SaaS-сервис: вебинар → 10 промо-шортсов за 5 минут → авто-постинг в VK Клипы, Rutube, Дзен, Telegram.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure
docker compose up -d postgres redis

# 3. Run database migration
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma

# 4. Seed database (optional)
npx tsx packages/db/prisma/seed.ts

# 5. Start development
npm run dev
```

## Project Structure

```
├── apps/
│   ├── web/              — Next.js 15 (pages, API, tRPC, components)
│   └── worker/           — BullMQ workers (STT, LLM, Video, Publish, Stats)
├── packages/
│   ├── db/               — Prisma schema + client (8 tables)
│   ├── queue/            — BullMQ job definitions + queue factory
│   ├── types/            — Shared TypeScript types
│   └── config/           — Environment validation + LLM provider configs
├── docker-compose.yml    — PostgreSQL 16, Redis 7, web, 4 workers
└── docs/                 — SPARC documentation
```

## Docker Services

```bash
docker compose up -d          # All services
docker compose up -d postgres redis  # Infrastructure only
docker compose logs -f worker-stt    # Watch specific worker
```

## Документация

- [PRD](docs/PRD.md) — что строим
- [Architecture](docs/Architecture.md) — как строим
- [Specification](docs/Specification.md) — детальные требования (15 user stories)
- [Pseudocode](docs/Pseudocode.md) — алгоритмы, API, data structures
- [LLM Strategy](docs/LLM_Strategy.md) — двойная AI стратегия (Cloud.ru + Global)
- [Test Scenarios](docs/test-scenarios.md) — 45+ BDD сценариев

## Стек

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, shadcn/ui, Tailwind |
| API | tRPC + Zod validation |
| Auth | NextAuth.js (email + VK OAuth), JWT |
| Queue | BullMQ on Redis 7 |
| Database | PostgreSQL 16 + Prisma ORM |
| AI (RU) | Cloud.ru: T-Pro 2.1, GigaChat3, Qwen3, GLM-4.6, Whisper |
| AI (Global) | Gemini Flash/Lite/Pro, Claude Haiku 4.5, OpenAI Whisper |
| Video | FFmpeg 7 (subprocess) |
| Payments | ЮKassa + СБП |
| Deploy | Docker Compose |

## Команды Claude Code

| Команда | Описание |
|---------|----------|
| `/plan [feature]` | Спланировать фичу |
| `/feature [name]` | Полный 4-фазный lifecycle фичи |
| `/test [scope]` | Генерация и запуск тестов |
| `/deploy [env]` | Деплой |
| `/myinsights` | Захватить инсайт разработки |
