# Billing — Final Summary

## Feature Overview

US-09 Billing & Subscription integrates ЮKassa payment gateway to enable freemium monetization for КлипМейкер. Users can upgrade from Free to Start/Pro/Business plans using bank card or СБП (QR), with auto-renewal, cancellation, and extra minutes purchase.

## Key Deliverables

| # | Deliverable | Type |
|---|------------|------|
| 1 | Payment Prisma model + migration | Schema |
| 2 | ЮKassa server-side client (`lib/yookassa.ts`) | Backend |
| 3 | Billing tRPC router (6 procedures) | Backend |
| 4 | Webhook endpoint (`/api/webhooks/yookassa`) | Backend |
| 5 | Billing cron worker (period reset + auto-renewal) | Worker |
| 6 | Billing page (`/dashboard/billing`) | Frontend |
| 7 | Plan comparison table component | Frontend |
| 8 | Checkout modal (card + СБП QR) | Frontend |
| 9 | Subscription management card | Frontend |
| 10 | JWT middleware refresh on plan change | Auth |
| 11 | PLAN_CONFIG constants in packages/types | Shared |

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Payment gateway | ЮKassa | Only major Russian gateway with card + СБП + 54-ФЗ |
| Recurring billing | ЮKassa saved payment methods | No subscription API needed — we manage renewal ourselves |
| Webhook verification | IP allowlist | Simple, reliable, recommended by ЮKassa |
| Amount storage | Kopecks (integer) | No floating point errors |
| Cron schedule | Daily 03:00 UTC | Low-traffic period, single run per day sufficient |
| JWT plan refresh | Middleware DB check | Simple, no WebSocket needed for MVP |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| ЮKassa API downtime | Low | Medium | Show user-friendly error, retry on next attempt |
| Webhook delivery failure | Low | High | ЮKassa retries 24h, our handler is idempotent |
| Double charge | Low | High | Idempotence-key on every payment creation |
| Stale JWT planId | Medium | Low | Middleware refreshes on mismatch |
| СБП no auto-renewal | Certain | Medium | Manual renewal reminder (email + dashboard banner) |

## Success Criteria

- Payment flow completes in < 60s
- Webhook processing < 500ms
- Zero duplicate charges (idempotency)
- Billing page loads in < 1s
- All edge cases from Refinement.md covered by tests

## Implementation Priority

1. Schema + ЮKassa client + PLAN_CONFIG (foundation)
2. Billing router + webhook handler (core payment flow)
3. Billing page + checkout modal (user-facing)
4. Billing cron worker (auto-renewal + period reset)
5. JWT middleware refresh (consistency)
