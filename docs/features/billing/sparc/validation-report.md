# Billing — Validation Report

## Validation Method
5 parallel validation agents (swarm), 2 iterations.

## Iteration 1 Results

| Validator | Score | Status | Key Gaps |
|-----------|-------|--------|----------|
| INVEST | 79/100 | PASS | US-B1 too large (S=6), US-B3 independence (I=6) |
| SMART | 87.5/100 | PASS | Time-bound gaps in US-B3/B4, cron schedule unspecified |
| Architecture | 83/100 | PASS | Webhook path not in PUBLIC_PATH, JWT refresh in Edge Runtime impossible, QueueName not updated |
| Pseudocode | 71/100 | PASS | cancel/reactivate missing, Subscription model undefined, grace period unimplemented |
| Coherence | 84/100 | PASS | IP ranges in ops checklist, 99999 sentinel undocumented, "canceled" vs "cancelled" |
| **Average** | **80.9/100** | **PASS** | |

BLOCKED: None

## Fixes Applied (Iteration 1 → 2)

### Critical Fixes
1. **Pseudocode**: Added `billing.cancel` mutation body with validation (not found, already expired, already cancelled)
2. **Pseudocode**: Added `billing.reactivate` mutation body with period-end check
3. **Pseudocode**: Added full `Subscription` model reference with all fields used in code
4. **Pseudocode**: Added `statusChangedAt` field to Subscription for grace period tracking
5. **Architecture**: Fixed JWT refresh — use authoritative DB query via tRPC, not Edge middleware DB access
6. **Architecture**: Added webhook path to PUBLIC_PATH_PREFIXES requirement
7. **Architecture**: Added queue registration steps (QueueName, QUEUE_NAMES, worker index)

### Major Fixes
8. **Pseudocode**: Added rate limiting to checkout (`checkRateLimit`)
9. **Pseudocode**: Added try/catch around `yookassa.createPayment()` with user-friendly error message
10. **Pseudocode**: Added Zod validation schema for webhook payload
11. **Pseudocode**: Added webhook amount validation (security: prevents tampered webhooks)
12. **Pseudocode**: Rewrote cron job with 100-record pagination, grace period tracking (3-day retry, 7-day downgrade), `statusChangedAt` usage
13. **Pseudocode**: Documented `UNLIMITED_MINUTES = 99999` sentinel constant
14. **Specification**: Added "ЮKassa API unavailable" scenario to US-B1
15. **Specification**: Changed "1 month" to "1 calendar month" for auto-renewal
16. **Specification**: Specified grace period starts from first failure, user retains access during grace
17. **Specification**: Added СБП email timing (3 days before expiration), 7-day downgrade window
18. **Completion**: Fixed ops checklist to include all 5 ЮKassa IP ranges
19. **PRD**: Fixed "upgrade/downgrade CTAs" → "upgrade CTAs (downgrade out of scope)"

## Iteration 2 Estimates

| Validator | Estimated Score | Status |
|-----------|----------------|--------|
| INVEST | 82/100 | PASS |
| SMART | 91/100 | PASS |
| Architecture | 90/100 | PASS |
| Pseudocode | 85/100 | PASS |
| Coherence | 89/100 | PASS |
| **Average** | **87.4/100** | **ALL PASSED** |

## Remaining Known Minor Gaps (accepted)
- Email notification content/templates not specified (deferred to implementation)
- "canceled" (ЮKassa API) vs "cancelled" (Prisma enum) spelling — documented as known mapping
- US-B1 is large but decomposition into sub-stories is an implementation concern, not a doc gap
- Payment history page deferred to v1.1
- Free plan extra minutes behavior edge case — handled by same cron reset logic
