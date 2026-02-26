# Billing — Solution Strategy

## First Principles Decomposition

### Fundamental Truths
1. Users must pay money → service must accept money → need payment gateway
2. ЮKassa is the standard Russian payment gateway (card + СБП)
3. Subscription = recurring payment + plan status + usage limits
4. Server creates payment → user completes on ЮKassa → webhook confirms → activate

### 5 Whys: Why is billing complex?
1. **Why can't we just charge?** → Need a payment gateway (ЮKassa)
2. **Why ЮKassa?** → Only major gateway supporting RUB + СБП + 54-ФЗ receipts
3. **Why webhooks?** → Payment completion is async (user pays on external page)
4. **Why store payments locally?** → Need audit trail, reconciliation, plan activation logic
5. **Why period reset?** → Minutes are per-month; must reset on billing cycle

## SCQA Framework

- **Situation**: КлипМейкер has plan infrastructure but no payment gateway
- **Complication**: Without payments, can't monetize; users stuck on free tier forever
- **Question**: How to integrate ЮKassa with minimal complexity while supporting card + СБП?
- **Answer**: Server-side ЮKassa SDK, webhook processing, and a clean billing page

## Game Theory: Stakeholder Analysis

| Stakeholder | Interest | Strategy |
|-------------|----------|----------|
| User | Low price, easy payment | Competitive pricing, СБП (low friction) |
| Business | Revenue, low churn | Fair limits, easy upgrade, no dark patterns |
| ЮKassa | Transaction volume | Standard integration, auto-receipts |
| Regulators | 54-ФЗ compliance | ЮKassa receipt objects in every payment |

### Nash Equilibrium
- Price at 990₽/mo for Start: affordable for creators, profitable for business (margin ~50% at scale)
- СБП preferred: lower commission (0.4% vs 2.5%), faster for users

## TRIZ Contradictions

### Contradiction 1: Security vs Simplicity
- Need to verify webhooks (security) but keep code simple
- **Resolution (Principle: Self-service)**: ЮKassa IP allowlist + idempotent payment processing. The webhook handler is a simple state machine.

### Contradiction 2: Recurring vs Flexibility
- Auto-renewal (convenient) vs user control (cancel anytime)
- **Resolution (Principle: Dynamics)**: Save payment method on first charge, auto-renew monthly, cancel marks `cancelAtPeriodEnd: true` — user keeps access until period ends.

### Contradiction 3: Minutes Reset vs Fairness
- Must reset monthly but shouldn't penalize mid-cycle upgraders
- **Resolution (Principle: Partial action)**: On upgrade, immediately grant new plan's minute limit. Period start = upgrade date. Cron resets only when period expires.

## Solution Architecture

### Payment Flow
```
User clicks "Upgrade" → billing.checkout mutation
→ Server creates ЮKassa payment (card/СБП)
→ Returns confirmationUrl (or QR data)
→ User completes payment on ЮKassa
→ ЮKassa sends webhook to /api/webhooks/yookassa
→ Server: validate → create Payment record → activate Subscription → update User.planId
→ User returns to billing page → sees active plan
```

### Auto-Renewal Flow
```
ЮKassa scheduled renewal → charges saved payment method
→ Webhook: payment.succeeded
→ Server: create Payment record → extend currentPeriodEnd → reset minutesUsed
```

### Cancellation Flow
```
User clicks "Cancel" → billing.cancel mutation
→ Set cancelAtPeriodEnd: true
→ User keeps access until currentPeriodEnd
→ Cron job at period end: downgrade to free, reset limits
```

### Minute Overage Flow
```
User uploads video, minutes insufficient
→ UI shows: "Докупите X минут за Y₽"
→ One-time payment via billing.buyMinutes
→ On success: add minutes to user.minutesLimit (no subscription change)
```

## Key Design Decisions

1. **Server-side ЮKassa only** — credentials never leave server
2. **Webhook-driven activation** — never trust client-side confirmation
3. **Idempotent processing** — same webhook processed once (check Payment.externalId)
4. **Atomic transactions** — Payment + Subscription + User updated in single Prisma transaction
5. **No Payment model in schema yet** — need to add it for audit trail
6. **BullMQ cron for period reset** — runs daily, checks all users with expired periods
