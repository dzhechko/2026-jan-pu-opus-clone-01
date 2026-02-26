# Billing — Architecture

## Architecture Overview

Billing integrates into the existing Distributed Monolith as a new vertical slice spanning:
- **tRPC router** (`billing.ts`) — checkout, cancel, reactivate, buyMinutes, checkPaymentStatus
- **Webhook endpoint** (`/api/webhooks/yookassa`) — processes ЮKassa notifications
- **ЮKassa client** (`lib/yookassa.ts`) — server-side SDK wrapper
- **BullMQ worker** (`billing-cron.ts`) — daily period reset and auto-renewal
- **Billing page** (`/dashboard/billing`) — plan comparison, checkout, management

```
┌─────────────────────────────────────────────────┐
│                    Frontend                       │
│  /dashboard/billing                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │PlanTable  │ │Checkout  │ │SubscriptionCard  │ │
│  │(compare)  │ │Modal     │ │(status, cancel)  │ │
│  └─────┬────┘ └────┬─────┘ └───────┬──────────┘ │
│        │           │               │             │
└────────┼───────────┼───────────────┼─────────────┘
         │ tRPC      │ tRPC          │ tRPC
┌────────┼───────────┼───────────────┼─────────────┐
│        ▼           ▼               ▼    Backend   │
│  billing.subscription  billing.checkout  billing.cancel
│        │           │               │              │
│        │     ┌─────▼─────┐        │              │
│        │     │ЮKassa SDK │        │              │
│        │     │(server)   │        │              │
│        │     └─────┬─────┘        │              │
│        │           │              │              │
│        │     ┌─────▼──────────────▼──┐           │
│        └────►│    PostgreSQL          │           │
│              │ Payment, Subscription, │           │
│              │ User (plan, minutes)   │           │
│              └────────────────────────┘           │
└──────────────────────────────────────────────────┘
         ▲                              │
         │ Webhook                      │ BullMQ
┌────────┴───────┐              ┌───────▼────────┐
│   ЮKassa       │              │ billing-cron   │
│   Servers      │              │ (daily reset)  │
└────────────────┘              └────────────────┘
```

## Component Breakdown

### 1. ЮKassa Client (`apps/web/lib/yookassa.ts`)

| Responsibility | Details |
|---------------|---------|
| Payment creation | `createPayment()` with card/СБП confirmation |
| Recurring charges | `createPayment()` with `payment_method_id` |
| Receipt generation | `buildReceipt()`, `buildExtraMinutesReceipt()` |
| Amount formatting | `formatRubles()` — kopecks to "990.00" |

- Credentials: `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY` from env
- Server-only — never imported in client components

### 2. Billing tRPC Router (`apps/web/lib/trpc/routers/billing.ts`)

| Procedure | Type | Purpose |
|-----------|------|---------|
| `subscription` | query | Current subscription status |
| `checkout` | mutation | Create ЮKassa payment for upgrade |
| `buyMinutes` | mutation | Create ЮKassa payment for extra minutes |
| `cancel` | mutation | Mark subscription for cancellation |
| `reactivate` | mutation | Undo pending cancellation |
| `checkPaymentStatus` | query | Poll payment status (СБП flow) |

### 3. Webhook Handler (`apps/web/app/api/webhooks/yookassa/route.ts`)

| Step | Action |
|------|--------|
| 1 | Verify source IP against ЮKassa ranges |
| 2 | Parse event type and payment object |
| 3 | Look up local Payment by externalId |
| 4 | Idempotency check (skip if already processed) |
| 5 | Dispatch to handler: succeeded / cancelled / refunded |
| 6 | Atomic transaction: update Payment + Subscription + User |
| 7 | Return 200 OK |

### 4. Billing Cron Worker (`apps/worker/workers/billing-cron.ts`)

| Task | Schedule | Details |
|------|----------|---------|
| Period reset | Daily 03:00 UTC | Find expired subscriptions, auto-renew or downgrade |
| Retry past_due | Daily 03:00 UTC | Retry failed renewals (once, then downgrade after 7d) |

### 5. Billing Page (`apps/web/app/(dashboard)/dashboard/billing/page.tsx`)

| Section | Component | Data Source |
|---------|-----------|------------|
| Plan comparison | `PlanComparisonTable` | PLAN_CONFIG constant |
| Current plan | `SubscriptionCard` | `billing.subscription` query |
| Checkout | `CheckoutModal` | `billing.checkout` mutation |
| СБП QR | `SbpQrModal` | `billing.checkPaymentStatus` polling |
| Extra minutes | `ExtraMinutesCard` | `billing.buyMinutes` mutation |

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Payment gateway | ЮKassa (@yookassa/sdk) | Only major Russian gateway with card + СБП + 54-ФЗ |
| API | tRPC (existing) | Consistent with project patterns |
| Webhook | Next.js API Route | No auth needed (IP allowlist), raw body access |
| Cron | BullMQ repeatable job | Consistent with existing worker architecture |
| DB | Prisma + PostgreSQL (existing) | New Payment model, existing Subscription model |

## Data Architecture

### New: Payment Model
- Links to User via userId
- Stores ЮKassa `externalId` for reconciliation
- Stores `idempotenceKey` for duplicate prevention
- `type`: subscription | extra_minutes
- `paymentMethodId`: saved card token for recurring charges

### Modified: Subscription Model
- `externalSubscriptionId` → stores ЮKassa `payment_method.id` for recurring
- Existing fields used: `planId`, `status`, `currentPeriodStart/End`, `cancelAtPeriodEnd`

### Unchanged: User Model
- `planId`, `minutesUsed`, `minutesLimit`, `billingPeriodStart` — already exist
- Updated atomically in webhook handler transaction

## Security Architecture

### ЮKassa Credentials
- `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY` in server env vars
- Never sent to client, never logged
- Used only in `apps/web/lib/yookassa.ts`

### Webhook Verification
- Source IP check against ЮKassa CIDR ranges
- Payment amount validation against PLAN_CONFIG
- `metadata.userId` must match payment.userId
- Idempotent processing (check Payment.status before updating)

### Payment Data
- No credit card numbers stored locally
- Payment method tokens (for recurring) stored in Subscription.externalSubscriptionId
- All amounts in kopecks (integer arithmetic, no floating point)

### Rate Limiting
- `billing.checkout`: 3 per 10 minutes per user
- `billing.buyMinutes`: 5 per hour per user
- Webhook endpoint: no rate limit (ЮKassa-initiated)

## Integration Points

| Integration | Direction | Protocol |
|-------------|-----------|----------|
| ЮKassa API | Outbound | HTTPS REST (server → ЮKassa) |
| ЮKassa Webhook | Inbound | HTTPS POST (ЮKassa → server) |
| Prisma | Internal | SQL via ORM |
| BullMQ | Internal | Redis queue |
| JWT (middleware) | Internal | x-user-plan header updated on login |

### JWT Refresh on Plan Change
When plan changes via webhook, the user's JWT still contains the old `planId`. Options:
1. **Chosen approach**: tRPC `billing.subscription` query returns authoritative planId from DB. Client-side React Query invalidation on checkout return refreshes displayed plan immediately. The stale JWT `planId` is used only for non-critical display (watermark badge). On next token refresh cycle (15 min), middleware issues JWT with correct planId from DB.
2. Alternative: Force-refresh via SSE/WebSocket (too complex for MVP)
3. Alternative: Middleware DB check on every request (not possible — Edge Runtime cannot access Prisma)

### Webhook Endpoint — Public Path
The webhook endpoint `/api/webhooks/yookassa` MUST be added to `PUBLIC_PATH_PREFIXES` in `apps/web/middleware.ts` since ЮKassa sends unauthenticated POSTs. Auth is handled via IP allowlist instead.

### Queue Registration
A new `billing-cron` queue must be registered:
1. Add `'billing-cron'` to `QueueName` type in `packages/types/src/queue.ts`
2. Add `BILLING_CRON` to `QUEUE_NAMES` in `packages/queue/src/constants.ts`
3. Import `billing-cron` worker in `apps/worker/workers/index.ts`

## Scalability Considerations

- Webhook endpoint is stateless — scales horizontally
- BullMQ cron runs on single worker (leader election via Redis)
- Payment creation is idempotent — safe to retry
- Daily cron batch size: paginate users (100 per batch) to avoid long transactions
