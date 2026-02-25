# КлипМейкер — Refinement

## Edge Cases Matrix

| # | Scenario | Input | Expected | Handling |
|---|----------|-------|----------|----------|
| E01 | Empty/silent video | No speech detected | No clips | Show: "В видео не обнаружена речь. Загрузите видео с разговором" |
| E02 | Video < 2 min | Short video | Reject | Show: "Минимальная длительность: 2 минуты" |
| E03 | Video > 4 hours | Very long video | Process with limits | Split transcript, use GLM-4.6 (200K ctx) or chunked processing |
| E04 | Non-Russian speech | English/other language | Transcribe, lower quality | Detect language, warn: "Обнаружен английский. Качество анализа может быть ниже" |
| E05 | Multiple speakers overlap | Crosstalk | Degraded STT | Flag segments with low confidence; user can edit subtitles |
| E06 | Screen recording (no face) | No face for reframe | Skip face tracking | Use center crop or split-view (slides + audio waveform) |
| E07 | File upload interrupted | Network drop mid-upload | Partial file | Resumable uploads (tus protocol); resume from last chunk |
| E08 | LLM returns invalid JSON | Malformed response | No clips | Retry with stricter prompt; fallback to tier2; max 3 retries |
| E09 | LLM hallucinates timestamps | Timestamps outside video range | Invalid clips | Validate all timestamps against video duration; clamp to valid range |
| E10 | Platform API key expired | VK token expires | Publish fails | Refresh token flow; if fail → notify: "Переподключите VK в Настройках" |
| E11 | Concurrent processing limit | 3 videos queued simultaneously | Queue overflow | Respect per-plan concurrency limits (free=1, paid=3); queue excess |
| E12 | Payment webhook duplicate | ЮKassa sends same event 2x | Double charge | Idempotency key on webhook handler; dedup by payment_id |
| E13 | User cancels during processing | Close browser mid-process | Zombie job | Job continues in background; results available on return |
| E14 | S3 storage quota | Clip storage fills up | No new renders | Enforce retention policy; auto-cleanup old free tier clips |
| E15 | VK rate limit (5 req/sec) | Bulk publish 20 clips | Throttled | Queue with rate limiter (2 req/sec with burst) |
| E16 | BYOK invalid API key (Global) | User enters wrong key | LLM fails | Validate key on save: test call to model → show error immediately |
| E17 | Provider switch mid-processing | User changes ru→global during video processing | Inconsistent | Lock provider for duration of video processing; show: "Настройка применится к следующему видео" |
| E18 | Free tier minute gaming | User creates multiple accounts | Abuse | Rate limit by IP + email domain; phone verification for free tier (v2) |

---

## Testing Strategy

### Unit Tests (target: 80% coverage on core logic)

| Module | Critical Paths | Framework |
|--------|---------------|-----------|
| LLM Router | Tier selection, fallback logic, cost calculation | Vitest |
| Video Processor | Timestamp validation, FFmpeg command builder | Vitest |
| Billing | Plan limits, minute tracking, overage calculation | Vitest |
| Auth | JWT validation, token refresh, VK OAuth parsing | Vitest |
| Encrypted KeyVault | Encrypt/decrypt roundtrip, auto-lock timer | Vitest + jsdom |
| Prompt Manager | Template rendering, JSON schema validation | Vitest |

### Integration Tests (target: critical flows)

| Flow | What's Tested | Framework |
|------|--------------|-----------|
| Upload → Process → Clips | Full pipeline with mock LLM/STT | Vitest + testcontainers |
| Publish → Platform | VK API contract (mocked) | Vitest + MSW |
| Billing → Plan change | ЮKassa webhook → DB update → limits change | Vitest + testcontainers |
| Auth → Protected routes | JWT flow, expired tokens, VK OAuth | Vitest + supertest |
| LLM Provider switch | RU → Global → RU, verify correct APIs called | Vitest + MSW |

### E2E Tests (target: happy paths)

| Journey | Steps | Framework |
|---------|-------|-----------|
| New user → first clip | Register → Upload → Wait → View clips → Download | Playwright |
| Free → Paid upgrade | Hit limit → Upgrade → ЮKassa mock → Verify limits | Playwright |
| Auto-post to VK | Connect VK → Process video → Publish → Verify | Playwright |
| Settings → Provider switch | Settings → Change to Global → Upload → Verify provider used | Playwright |

### Performance Tests

| Test | Target | Tool |
|------|--------|------|
| Video upload (1GB) | < 60 sec on 100 Mbps | k6 |
| API response (p99) | < 500ms | k6 |
| Concurrent processing (10 videos) | All complete < 5 min | k6 |
| WebSocket connections (1000) | Stable, no drops | Artillery |
| FFmpeg rendering (60s clip) | < 30 sec per clip | Benchmark script |

---

## Test Cases (BDD)

### Feature: Dual LLM Provider Strategy

```gherkin
Scenario: Default provider is RU for new users
  Given I register a new account
  Then my llm_provider_preference is "ru"
  And my videos are processed via Cloud.ru APIs

Scenario: Switch to Global provider
  Given I am logged in with provider "ru"
  When I go to Settings > AI Provider
  And I select "Global (Gemini, Claude)"
  Then I see a warning: "Данные видео будут обрабатываться серверами за пределами РФ"
  When I confirm
  Then my provider preference changes to "global"

Scenario: BYOK — user provides own Gemini key
  Given my provider preference is "global"
  And I go to Settings > Integrations > Gemini API
  When I enter a valid API key
  Then the key is encrypted with AES-GCM 256-bit in IndexedDB
  And a test API call validates the key
  And I see: "Ключ Gemini подключен ✓"

Scenario: BYOK — invalid key
  Given I enter an invalid Gemini API key
  Then I see: "Ключ невалидный. Проверьте и попробуйте снова"
  And the key is NOT stored

Scenario: Fallback on LLM error (RU)
  Given my provider is "ru"
  And T-Pro 2.1 returns an error for moment selection
  Then the system retries with Qwen3-235B (tier2)
  And if that fails, retries with GLM-4.6 (tier3)
  And if all fail, shows: "Ошибка AI. Попробуйте позже"

Scenario: Long video routes to correct model
  Given I upload a 3-hour video (token_count > 100K)
  And my provider is "ru"
  Then moment selection uses GLM-4.6 (200K context)
  And not T-Pro 2.1 (32K context)

Scenario: Provider locked during processing
  Given a video is being processed with provider "ru"
  When I switch provider to "global" in settings
  Then the current video continues processing with "ru"
  And new videos will use "global"
```

### Feature: Cost Tracking

```gherkin
Scenario: Track processing cost per video
  Given I process a 60-minute video with provider "ru"
  When processing completes
  Then a UsageRecord is created with:
    | field | value |
    | stt_cost | ~1800 kopecks (Whisper 0.005₽/sec × 3600) |
    | llm_cost | ~200 kopecks (T-Pro + GigaChat) |
    | provider_strategy | "ru" |
  And I can see total cost in Dashboard > Usage

Scenario: Global provider shows different costs
  Given I process the same video with provider "global"
  Then UsageRecord shows higher costs:
    | field | value |
    | stt_cost | ~5500 kopecks (OpenAI Whisper) |
    | llm_cost | ~800 kopecks (Gemini Flash) |
    | provider_strategy | "global" |
```

---

## Performance Optimizations

### Video Processing Pipeline

| Optimization | Impact | Implementation |
|-------------|--------|----------------|
| **Parallel FFmpeg** | 3-5x faster clip rendering | Worker spawns N parallel FFmpeg processes per video |
| **Audio-only STT** | 10x less upload bandwidth to STT API | Extract audio track before sending to Whisper |
| **Presigned S3 upload** | Bypass API server for large files | Client uploads directly to S3, API gets notified |
| **Thumbnail generation** | Avoid loading full clip for preview | FFmpeg single-frame extract at clip midpoint |
| **Transcript caching** | Avoid re-STT on reprocess | Cache transcript in DB; reprocess = skip STT |

### LLM Optimizations

| Optimization | Impact | Implementation |
|-------------|--------|----------------|
| **Batch scoring** | 1 LLM call instead of N | Score all moments in single JSON request |
| **Prompt caching** | Lower token count | System prompt reuse across calls (Cloud.ru / Gemini support) |
| **Streaming response** | Faster perceived speed | Stream LLM output, parse JSON incrementally |
| **Token estimation** | Accurate routing | Pre-estimate token count before LLM call (tiktoken for Qwen/T-Pro) |

### Database Optimizations

| Optimization | Impact | Implementation |
|-------------|--------|----------------|
| **Composite indexes** | Fast dashboard queries | `(user_id, created_at DESC)` on videos, clips |
| **JSONB indexes** | Fast status queries | GIN index on `virality_score` for sorting |
| **Connection pooling** | Handle 100+ concurrent | PgBouncer in transaction mode |
| **Materialized views** | Fast analytics | Daily refresh for dashboard metrics |

---

## Security Hardening

| Measure | Implementation | Priority |
|---------|---------------|----------|
| Input validation | Zod schemas on all API inputs | P0 |
| File type validation | Magic bytes check (not just MIME) | P0 |
| Rate limiting | Redis-backed per-user + per-IP | P0 |
| CORS | Strict origin whitelist | P0 |
| CSP headers | Content-Security-Policy | P1 |
| SQL injection | Prisma ORM (parameterized queries) | P0 |
| XSS | React (auto-escaped), DOMPurify for user text | P0 |
| CSRF | SameSite cookies + CSRF token | P1 |
| API key rotation | Server-side keys rotatable without downtime | P1 |
| Audit log | Log all admin/billing actions | P2 |

---

## Accessibility (a11y)

| Requirement | Implementation |
|-------------|---------------|
| Keyboard navigation | All interactive elements focusable, tab order logical |
| Screen reader | ARIA labels on video editor, progress indicators |
| Color contrast | WCAG AA (4.5:1 ratio minimum) |
| Motion reduction | `prefers-reduced-motion` respected |
| Russian locale | All error messages, labels, tooltips in Russian |

---

## Technical Debt Items (Known Shortcuts in MVP)

| # | Shortcut | Impact | Future Fix |
|---|----------|--------|------------|
| TD01 | Single Redis instance | SPOF for queues | Redis Cluster in v2 |
| TD02 | Single PG instance | SPOF for data | Read replicas + automated backups |
| TD03 | No CDN for clips | Slow downloads in regions | Yandex CDN / CloudFlare in v1 |
| TD04 | FFmpeg subprocess (not containerized) | Resource isolation | Docker-in-Docker or sidecar pattern |
| TD05 | No A/B testing framework | Can't experiment with prompts | PostHog / custom feature flags |
| TD06 | Hardcoded prompts | Prompt changes require deploy | Prompt versioning in DB (v2) |
| TD07 | No multi-language | Russian only | i18n extraction, English in v2 |
| TD08 | No mobile-responsive editor | Poor mobile editing UX | Responsive editor redesign in v2 |
