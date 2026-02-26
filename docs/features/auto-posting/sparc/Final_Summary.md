# Final Summary: Auto-Posting

## Feature Overview

Auto-posting enables one-click or scheduled publishing of rendered clips to VK Клипы, Rutube, Дзен, and Telegram. This is КлипМейкер's key differentiator — no competitor supports native Russian platform publishing.

## Architecture Summary

- **Adapter pattern** for platform APIs (VK, Rutube, Дзен, Telegram)
- **BullMQ queue** for async publish jobs with retry
- **OAuth + token-based** platform connections with encrypted token storage
- **Stats collection** via periodic cron job
- Fits Distributed Monolith pattern: tRPC in web, workers in worker app

## Scope

| Component | Count | Status |
|-----------|-------|--------|
| Platform providers | 4 | Stub → Full implementation |
| tRPC procedures | 4 | New (platform router) |
| OAuth callbacks | 2 | New (VK, Дзен) |
| Worker modifications | 2 | Existing → Enhanced |
| UI components | 2 | New (settings + publish) |
| DB schema changes | 1 | Add errorMessage to Publication |

## Key Decisions

1. **Server-side token encryption** (not client-side) — tokens needed by background workers
2. **BullMQ delay** for scheduling — simpler than separate cron scheduler
3. **Per-platform rate limiting** in BullMQ — respects API limits
4. **Streaming file upload** — handles 500MB clips without OOM
5. **Plan-based access** — Free: none, Start: VK, Pro+: all platforms

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| VK API changes | Medium | High | Pin API version, monitor changelog |
| Rutube API undocumented | High | Medium | Conservative rate limits, robust error handling |
| Token expiration | Medium | Medium | Auto-refresh, UI notification |
| Large file upload timeout | Low | Medium | Streaming, per-platform timeouts |
| Rate limit exceeded | Low | Low | BullMQ rate limiter, backoff |

## Implementation Priority

1. Token encryption module (foundation)
2. Platform connection router + OAuth callbacks
3. VK provider (most users, best documented API)
4. Publish flow (enqueue jobs from clip router)
5. Telegram provider (simplest API)
6. Rutube provider
7. Дзен provider
8. Stats collection
9. Settings UI (platform connections)
10. Publish UI (buttons on clip cards)

## Success Metrics

- 95%+ first-attempt publish success rate
- <60s publish latency (user action → published)
- 4 platforms fully supported
- Stats synced within 6 hours
