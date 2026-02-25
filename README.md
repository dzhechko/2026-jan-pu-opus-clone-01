# КлипМейкер

AI SaaS-сервис: вебинар → 10 промо-шортсов за 5 минут → авто-постинг в VK Клипы, Rutube, Дзен, Telegram.

## Quick Start

```bash
unzip clipmaker.zip
cd clipmaker
claude
/start
```

## Документация

- [PRD](docs/PRD.md) — что строим
- [Architecture](docs/Architecture.md) — как строим
- [Specification](docs/Specification.md) — детальные требования (15 user stories)
- [Pseudocode](docs/Pseudocode.md) — алгоритмы, API, data structures
- [LLM Strategy](docs/LLM_Strategy.md) — двойная AI стратегия (Cloud.ru + Global)
- [Test Scenarios](docs/test-scenarios.md) — 45+ BDD сценариев
- [Validation Report](docs/validation-report.md) — результаты валидации

## Стек

- **Architecture:** Distributed Monolith (Monorepo, Turborepo)
- **Frontend:** Next.js 15, React 19, TypeScript, shadcn/ui
- **Backend:** tRPC, BullMQ, PostgreSQL 16, Redis 7
- **AI (RU):** Cloud.ru — T-Pro 2.1, Whisper, GigaChat3, Qwen3, GLM-4.6
- **AI (Global):** Gemini Flash, Claude Haiku 4.5, OpenAI Whisper
- **Video:** FFmpeg 7
- **Deploy:** Docker Compose на VPS
- **Payments:** ЮKassa + СБП

## Команды Claude Code

| Команда | Описание |
|---------|----------|
| `/start` | Bootstrap проекта из документации |
| `/plan [feature]` | Спланировать фичу |
| `/test [scope]` | Тесты |
| `/deploy [env]` | Деплой |
| `/feature [name]` | Полный lifecycle фичи |
| `/myinsights` | Захватить инсайт |
