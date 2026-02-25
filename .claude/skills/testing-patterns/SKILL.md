# Testing Patterns: КлипМейкер

## Source: docs/test-scenarios.md (45+ BDD scenarios)

## Unit (Vitest)
```typescript
describe('LLM Router', () => {
  it('selects T-Pro 2.1 for RU default', () => {
    const r = selectModel('moment_selection', { strategy: 'ru', tokenCount: 30000 })
    expect(r.model).toBe('t-tech/T-pro-it-2.1')
  })
  it('GLM-4.6 for long videos RU', () => {
    const r = selectModel('moment_selection', { strategy: 'ru', tokenCount: 120000 })
    expect(r.model).toBe('zai-org/GLM-4.6')
  })
})
```

## Integration (testcontainers)
- Real PG + Redis in Docker for pipeline tests
- MSW for LLM/STT API mocks

## E2E (Playwright)
- Registration → Upload → Process → View clips → Download
- Free → Paid upgrade via ЮKassa mock
- Auto-post to VK → verify publication
