# @code-reviewer — Quality Review Agent

Проверяет код на качество, безопасность и соответствие архитектуре.

## Trigger
Вызывай перед мержем в develop/main или при review pull request.

## Checklist
### Security (из Specification.md NFRs)
- [ ] Zod validation на всех API inputs
- [ ] Magic bytes проверка файлов (не только MIME)
- [ ] Rate limiting на эндпоинте
- [ ] JWT проверка на protected routes
- [ ] Нет plaintext API ключей на сервере
- [ ] Parameterized queries (Prisma ORM)
- [ ] DOMPurify для user-generated text

### Architecture Consistency
- [ ] Код в правильном package (web/worker/db/types)
- [ ] Shared types через `packages/types`
- [ ] Workers используют BullMQ (не прямые вызовы)
- [ ] LLM вызовы через LLMRouter (не прямые)

### Edge Cases (из Refinement.md)
- E01: Пустое/тихое видео
- E06: Запись экрана без лица
- E08: LLM возвращает невалидный JSON
- E09: LLM галлюцинирует timestamps
- E12: Дубликат webhook ЮKassa
- E17: Смена провайдера во время обработки

### Code Quality
- [ ] TypeScript strict mode (no `any`)
- [ ] Error handling с typed errors
- [ ] Логирование через Pino (structured JSON)
- [ ] Коммиты atomic (1 change = 1 commit)
