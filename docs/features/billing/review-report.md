# Billing Feature — Review Report

**Date:** 2026-02-26
**Feature:** US-09 Billing & Subscription
**Review type:** Brutal honesty (Linus mode), 5 parallel agents

## Review Agents

| Agent | Focus | Issues Found |
|-------|-------|-------------|
| Code Quality | Clean code, patterns, DRY, type safety | 5C, 8M, 9m |
| Architecture | Distributed Monolith consistency, DB design | 3C, 6M, 6m |
| Security | Vulnerabilities, input validation, auth | 2C, 6M, 7m |
| Performance | DB queries, polling, scaling, N+1 | 2C, 5M, 6m |
| Edge Cases | Race conditions, missing tests, business logic | 6C, 8M, 6m |

## Deduplicated Issues (15 unique critical + major)

### Fixed (all critical + major)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | `Date.now()` in idempotence key = double-click double-charge | Deterministic key: `sub-{userId}-{planId}-{date}` |
| 2 | CRITICAL | PLANS vs PLAN_CONFIG price conflict (Pro 199k vs 299k) | Aligned PLANS to match PLAN_CONFIG |
| 3 | CRITICAL | Webhook swallows errors, returns 200 = user pays, gets nothing | Return 500 for transient errors |
| 4 | CRITICAL | Webhook IP via spoofable X-Forwarded-For | Prefer x-real-ip, add body size limit |
| 5 | CRITICAL | Refund handler doesn't reverse subscription/minutes | Full reversal in $transaction |
| 6 | CRITICAL | Webhook-before-checkout race condition | Create local record BEFORE calling YooKassa |
| 7 | CRITICAL | No pending payment guard in checkout | Check for existing pending payments |
| 8 | CRITICAL | Missing DB index on Subscription(status, currentPeriodEnd) | Added composite `@@index` |
| 9 | MAJOR | N+1: useless `include: { user: true }` in cron | Removed, updated type |
| 10 | MAJOR | `window.location.reload()` during render = infinite loop | Moved to useEffect with hasRedirected ref |
| 11 | MAJOR | SBP polling forever (no timeout) | 10-min timeout + refetchIntervalInBackground: false |
| 12 | MAJOR | returnUrl not validated (open redirect) | Validate against NEXTAUTH_URL |
| 13 | MAJOR | Missing confirmation_url = empty string redirect | Throw TRPCError |
| 14 | MAJOR | Amount validation uses floating-point | Integer-only parsing (split on '.') |
| 15 | MAJOR | setMonth overflow (Jan 31 → Mar 3) | Use +30 days |

### Additional fixes

| Issue | Fix |
|-------|-----|
| No downgrade guard in checkout | Reject if targetIdx <= currentIdx |
| Comprehensive idempotency check | Block all terminal states, not just succeeded |
| planId runtime validation in webhook | `isValidPlanId()` type guard |
| Currency validation in webhook | Check `currency === 'RUB'` |
| Magic number 99999 in UI | Use UNLIMITED_MINUTES constant |
| Hardcoded queue name in cron | Use QUEUE_NAMES.BILLING_CRON |
| Unused RETRY_AFTER_DAYS constant | Removed |
| Subscription query over-fetching | Use select instead of include |
| checkPaymentStatus uses findFirst | Use findUnique + userId assert |

### Not fixed (acknowledged, low risk or design-level)

| Issue | Reason |
|-------|--------|
| Rate limiting fails open when Redis down | Architectural decision — fail-closed would block all billing if Redis crashes. Acceptable trade-off for MVP. |
| No proration on mid-period upgrade | Documented as intentional. Users get a fresh 30-day period. |
| Extra minutes lost on downgrade | Requires schema change (separate `extraMinutesPurchased` field). Logged as future improvement. |
| buyMinutes allowed on free plan | Intentional — allows monetization of free users. |
| No auto-renewal in cron worker | Stubbed — requires YooKassa credentials in worker environment. Deferred to infrastructure setup. |
| No billing tests | Deferred to dedicated testing phase. 26 test scenarios documented by edge-case reviewer. |

## Positive Findings

- Clean Distributed Monolith boundaries (web/worker/packages)
- Transaction-safe subscription upsert
- Amount validation on webhook (security best practice)
- 54-FZ receipt compliance
- Rate limiting on payment endpoints
- Proper authorization scoping (no IDOR)
- No XSS, no raw SQL, no credential exposure
- Cursor-based pagination in cron
- Graceful cancellation (cancelAtPeriodEnd)

## Metrics

- **Files changed:** 7
- **Lines changed:** +265, -88
- **Issues fixed:** 15 critical/major + 9 additional improvements
- **Pre-existing errors:** 2 (transcript-viewer.tsx, video.ts) — unchanged
- **New errors introduced:** 0
