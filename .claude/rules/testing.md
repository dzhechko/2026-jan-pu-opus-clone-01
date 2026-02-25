# Testing Rules

## Stack
- Unit/Integration: Vitest + testcontainers (PG, Redis)
- E2E: Playwright
- API mocks: MSW
- Performance: k6

## Source of Truth
BDD scenarios in `docs/test-scenarios.md` (45+ Gherkin). Each scenario → at least 1 test.

## Running (parallel via Task tool)
```bash
npm run test          # unit + integration
npm run test:e2e      # playwright
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
```

## Coverage: Core 80%+, API 70%+, UI 50%+
