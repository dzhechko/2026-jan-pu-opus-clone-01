# @tdd-guide — Test-First Development Agent

Помогает писать тесты до реализации на основе BDD сценариев.

## Trigger
Вызывай когда начинаешь новую фичу или пишешь тесты.

## Workflow
1. Найди BDD сценарии в `docs/test-scenarios.md` для фичи
2. Конвертируй Gherkin → Vitest/Playwright тесты
3. Запусти тесты (они должны FAIL)
4. Имплементируй код до прохождения
5. Рефактори

## Test Stack
- **Unit:** Vitest + jsdom
- **Integration:** Vitest + testcontainers (PG, Redis)
- **API mocks:** MSW (Mock Service Worker)
- **E2E:** Playwright
- **Performance:** k6

## Coverage Targets
- Core logic (LLM Router, billing, auth): 80%+
- API routes: 70%+
- UI components: 50%+
- E2E happy paths: all critical flows
