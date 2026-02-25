# Development Guide: КлипМейкер

## Обзор инструментов

| Инструмент | Тип | Назначение |
|------------|-----|------------|
| `@planner` | Agent | Декомпозиция фичи на задачи из SPARC docs |
| `@code-reviewer` | Agent | Security + edge cases + architecture review |
| `@architect` | Agent | System design, consistency с Architecture.md |
| `@tdd-guide` | Agent | Test-first development из BDD сценариев |
| `/start` | Command | Bootstrap проекта из документации |
| `/plan [feature]` | Command | Планирование реализации |
| `/test [scope]` | Command | Генерация и запуск тестов |
| `/deploy [env]` | Command | Деплой на VPS |
| `/feature [name]` | Command | Полный 4-фазный lifecycle фичи |
| `/myinsights [title]` | Command | Захват инсайтов разработки |

## Этапы разработки

### 🚀 Этап 1: Старт проекта
- Уже сделано: `/start`

### 🏗️ Этап 2: Планирование фичи
- `/plan [feature]`, `@planner`
- Сверяйся с BDD-сценариями из `docs/test-scenarios.md`

### 💻 Этап 3: Реализация
- Task tool для параллельных подзадач
- Коммить после каждого логического изменения
- Reference SPARC docs — не выдумывай код

### 🧪 Этап 4: Тестирование
- `/test [scope]`, Gherkin-сценарии как основа
- Тесты параллельно с линтингом и type-checking

### 🔍 Этап 5: Code Review
- `@code-reviewer` перед мержем
- Checklist: security, architecture, edge cases, code quality

### 🆕 Этап 6: Добавление новых фичей
- `/feature [name]` — полный lifecycle:
  1. **PLAN:** SPARC документация → `docs/features/<name>/sparc/`
  2. **VALIDATE:** requirements-validator (swarm, итерации до score ≥70)
  3. **IMPLEMENT:** swarm agents + parallel tasks из валидированных docs
  4. **REVIEW:** brutal-honesty-review (swarm) → fix all criticals
- Документация каждой фичи сохраняется для повторного использования

### 🚢 Этап 7: Деплой
- `/deploy [env]`
- Docker Compose на VPS через SSH или CI pipeline
- dev → staging → prod, тегируй релизы `vYYYYMMDD.HHMM`

### 💡 Этап 8: Захват инсайтов (постоянно)
- `/myinsights [title]` — после решения нетривиальной проблемы
- Claude сам предложит захватить инсайт после сложного дебага
- Каждая запись: Symptoms → Diagnostic → Root Cause → Solution → Prevention
- Auto-commit через Stop hook, не нужно помнить про git add
- **Перед дебагом** — сначала `grep` ошибку в `myinsights/1nsights.md`!

### 🔐 Этап 9: Настройка интеграций (если внешние API)
- Settings > Integrations
- AES-GCM 256-bit шифрование, только в браузере
- См. `.claude/skills/security-patterns/SKILL.md`

## Git Workflow

```
feat | fix | refactor | test | docs | chore
1 логическое изменение = 1 коммит
Формат: type(scope): description (max 50 chars)
```

## Swarm Agents: когда использовать

| Сценарий | Agents | Параллелизм |
|----------|--------|-------------|
| Большая фича | @planner + 2-3 impl agents | Да |
| Рефакторинг | @code-reviewer + refactor | Да |
| Баг-фикс | 1 agent | Нет |
| Новая фича | /feature (4-phase lifecycle) | Да |

## Рекомендуемый порядок фич (MVP)

1. **US-12: Auth** — email + VK OAuth (основа)
2. **US-01: Video Upload** — file + URL + S3
3. **US-02 + US-04: STT + Subtitles** — Whisper
4. **US-02 + US-05: Moments + Virality** — LLM Router
5. **US-13: AI Provider Selection** — dual strategy UI
6. **US-07: Download** — S3 presigned URLs
7. **US-08: Auto-Post VK** — platform integration
8. **US-09: Billing** — ЮKassa + СБП
9. **US-10: Dashboard** — overview + analytics
10. **US-14: BYOK** — encrypted key management
