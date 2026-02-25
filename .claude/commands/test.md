---
description: Generate and run tests from BDD scenarios.
  $ARGUMENTS: scope (feature name, module, or "all")
---

# /test $ARGUMENTS

## Steps
1. Find Gherkin scenarios in `docs/test-scenarios.md` for [scope]
2. Find edge cases in `docs/Refinement.md`
3. Convert to Vitest/Playwright tests
4. Run in parallel:
   - `npm run test:unit` (Vitest)
   - `npm run test:integration` (Vitest + testcontainers)
   - `npm run lint` (ESLint)
   - `npm run typecheck` (tsc --noEmit)
5. Show results

## Coverage Targets
- Core logic: 80%+, API routes: 70%+, UI: 50%+
