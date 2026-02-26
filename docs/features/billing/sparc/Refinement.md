# Billing — Refinement

## Edge Cases Matrix

| # | Edge Case | Handling |
|---|-----------|----------|
| E1 | Duplicate webhook for same payment | Idempotency: check Payment.status before processing |
| E2 | User pays twice (double-click) | Idempotence-key prevents duplicate ЮKassa payments |
| E3 | Webhook arrives before Payment record created | 200 OK (ignore — payment not ours). ЮKassa retries later |
| E4 | User upgrades mid-billing-period | Reset minutesUsed, new period starts from upgrade date |
| E5 | User on Pro downgrades to Start | Not in MVP — only upgrade and cancel supported |
| E6 | СБП user's auto-renewal | СБП doesn't support recurring — mark past_due, send reminder |
| E7 | ЮKassa API downtime during checkout | Return error to user: "Платёжная система недоступна. Попробуйте позже" |
| E8 | Webhook endpoint returns 5xx | ЮKassa retries for 24h. Our handler is idempotent, safe to retry |
| E9 | User deleted while payment pending | Payment.userId cascade delete — no orphan records |
| E10 | Negative minutesUsed after reset | minutesUsed always set to 0, never decremented below 0 |
| E11 | Extra minutes purchased, then billing resets | minutesLimit resets to plan base — extra minutes lost (documented behavior) |
| E12 | Multiple concurrent webhook requests | Prisma transaction with unique constraint on Payment.externalId |
| E13 | ЮKassa sends unknown event type | Ignore and return 200 (don't block ЮKassa retries) |
| E14 | JWT contains stale planId after upgrade | Middleware detects mismatch on next request, refreshes JWT |

## Testing Strategy

### Unit Tests (Vitest)

| Test | Module | Description |
|------|--------|-------------|
| T1 | `yookassa.ts` | `formatRubles()` — 99000 → "990.00", 0 → "0.00" |
| T2 | `yookassa.ts` | `buildReceipt()` — correct structure with email, amount |
| T3 | Webhook handler | `isYookassaIp()` — valid/invalid IPs, edge cases (localhost, IPv6) |
| T4 | Webhook handler | `ipToInt()` — correct conversion of IP octets |
| T5 | Billing router | `checkout` — validates same-plan rejection |
| T6 | Billing router | `cancel` — throws NOT_FOUND if no subscription |
| T7 | PLAN_CONFIG | All plans have required fields, prices are positive integers |

### Integration Tests (Vitest + testcontainers)

| Test | Scope | Description |
|------|-------|-------------|
| T8 | Webhook → DB | `payment.succeeded` creates Payment + Subscription + updates User atomically |
| T9 | Webhook → DB | `payment.canceled` only updates Payment.status |
| T10 | Webhook → DB | Duplicate webhook (same externalId) — no double update |
| T11 | Webhook → DB | Extra minutes payment — User.minutesLimit incremented |
| T12 | Cron → DB | Expired + cancelAtPeriodEnd → downgrade to free |
| T13 | Cron → DB | Expired + active → auto-renewal payment created |
| T14 | Cron → DB | Past_due + expired grace period → downgrade |
| T15 | Checkout → ЮKassa | Mock ЮKassa SDK, verify payment creation params |

### E2E Tests (Playwright)

| Test | Flow | Description |
|------|------|-------------|
| T16 | Billing page | Load page, see plan comparison, current plan highlighted |
| T17 | Checkout (card) | Click upgrade → redirect to mock ЮKassa page |
| T18 | Checkout (СБП) | Click upgrade with СБП → QR modal appears |
| T19 | Cancel subscription | Click cancel → confirmation → button state changes |
| T20 | Extra minutes | See prompt when minutes exhausted → select → checkout |

## Performance Optimizations

| Optimization | Rationale |
|-------------|-----------|
| Webhook handler < 500ms | ЮKassa expects fast responses. Single Prisma transaction. |
| Plan comparison table as static data | PLAN_CONFIG is a constant — no DB query needed |
| СБП polling interval: 3s | Balance between responsiveness and server load |
| Cron pagination: 100 users/batch | Prevent long-running transactions |
| Index on Payment.externalId | Fast webhook lookup (already unique) |
| Index on Subscription.currentPeriodEnd | Fast expired subscription query in cron |

## Security Hardening

| Measure | Details |
|---------|---------|
| IP allowlist | ЮKassa webhook IPs hardcoded + validated on every request |
| Amount validation | Webhook payment amount must match PLAN_CONFIG[planId].price |
| No client-side payment data | All ЮKassa API calls server-side only |
| Idempotence keys | Deterministic, stored, prevent duplicate charges |
| Integer arithmetic | All amounts in kopecks (no floating point errors) |
| Rate limit checkout | 3 per 10min per user — prevent abuse |
| CSRF on cancel | tRPC mutation via POST with auth cookie |

## Accessibility (a11y)

| Component | Requirements |
|-----------|-------------|
| Plan table | Semantic `<table>`, `aria-label` on current plan column |
| Checkout modal | Focus trap, ESC to close, `aria-modal="true"` |
| QR modal | Alt text for QR image, timeout notice for screen readers |
| Cancel dialog | `role="alertdialog"`, clear confirmation text |
| Error messages | `role="alert"`, focus moved to error on appear |

## Technical Debt Items

| Item | Priority | Description |
|------|----------|-------------|
| TD1 | Low | Payment history page (v1.1) |
| TD2 | Low | Annual billing option (v1.1) |
| TD3 | Low | Promo codes system (v1.1) |
| TD4 | Medium | Email notifications for payment events |
| TD5 | Low | Refund self-service UI |
| TD6 | Medium | Plan downgrade flow (Start → Free manually) |
