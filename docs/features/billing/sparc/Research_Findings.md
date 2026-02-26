# Billing — Research Findings

## 1. ЮKassa API Research

### API Overview
- REST API v3: `https://api.yookassa.ru/v3/`
- Auth: Basic HTTP (shopId:secretKey)
- Idempotency: `Idempotence-Key` header required for POST requests
- Official Node.js SDK: `@yookassa/sdk` (npm)

### Payment Creation
```
POST /v3/payments
{
  "amount": { "value": "990.00", "currency": "RUB" },
  "confirmation": {
    "type": "redirect",  // Card
    "return_url": "https://clipmaker.ru/dashboard/billing?status=success"
  },
  "capture": true,  // Auto-capture
  "description": "КлипМейкер: тариф Start (1 мес)",
  "metadata": { "userId": "uuid", "planId": "start", "type": "subscription" },
  "save_payment_method": true  // For recurring
}
```

### СБП Payment
```
"confirmation": {
  "type": "qr"  // Returns QR code URL
}
```
Returns `confirmation.confirmation_data` with QR code image URL.

### Recurring Payments (Auto-Renewal)
1. First payment: `save_payment_method: true`
2. ЮKassa returns `payment_method.id` on success
3. Subsequent payments: use `payment_method_id` instead of `confirmation`
```
POST /v3/payments
{
  "amount": { "value": "990.00", "currency": "RUB" },
  "payment_method_id": "saved-method-uuid",
  "capture": true,
  "description": "Авто-продление: КлипМейкер Start"
}
```

### Webhook Notifications
- Event types: `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`, `refund.succeeded`
- Delivery: POST to configured URL with JSON body
- Verification: check `event` field + validate IP (185.71.76.0/27, 185.71.77.0/27)
- Retry: ЮKassa retries failed webhooks for up to 24 hours

### Refunds
```
POST /v3/refunds
{
  "payment_id": "original-payment-uuid",
  "amount": { "value": "990.00", "currency": "RUB" }
}
```

### 54-ФЗ Receipt (Fiscal)
ЮKassa generates receipts automatically when `receipt` object is included:
```
"receipt": {
  "customer": { "email": "user@example.com" },
  "items": [{
    "description": "Подписка КлипМейкер Start (1 мес)",
    "quantity": "1.00",
    "amount": { "value": "990.00", "currency": "RUB" },
    "vat_code": 1,  // НДС не облагается (for digital services)
    "payment_subject": "service",
    "payment_mode": "full_payment"
  }]
}
```

## 2. Existing Infrastructure

### Already Implemented
- **Prisma schema**: `User.planId`, `minutesUsed`, `minutesLimit`, `Subscription` model, `UsageRecord`, `PaymentMethod` enum (card/sbp)
- **tRPC router**: `billing.subscription` (query), `billing.checkout` (placeholder), `billing.cancel`
- **Middleware**: `x-user-plan` header propagated from JWT
- **Plan limits**: `MAX_CLIPS_PER_PLAN` in worker, minute check in video upload
- **Watermark**: FFmpeg `buildWatermarkDrawtext()` + UI badge on ClipCard
- **Dashboard**: `MinutesCard`, `PlanBadge`, `StatsGrid` components

### Gaps to Fill
- `billing.checkout` → real ЮKassa API call
- Webhook endpoint → `/api/webhooks/yookassa`
- Payment model → store local record of each payment
- Billing page → `/dashboard/billing` with plan comparison
- Period reset → BullMQ cron job
- Extra minutes → one-time payment flow

## 3. Security Considerations

### ЮKassa Credentials
- `shopId` + `secretKey` → server-side env vars (`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`)
- NEVER exposed to client (server-only API calls)
- Webhook verification: IP allowlist + event validation

### Idempotency
- Every payment creation must include `Idempotence-Key` header
- Use deterministic key: `${userId}-${planId}-${timestamp}` to prevent duplicate charges
- Store key in Payment record for audit

### Webhook Security
- Verify source IP against ЮKassa ranges
- Validate payment amount matches expected plan price
- Check `metadata.userId` matches subscription owner
- Process in transaction: update Payment + Subscription + User atomically

## 4. Competitors Analysis

| Feature | КлипМейкер | Opus Clip | Vizard.ai |
|---------|-----------|-----------|-----------|
| Payment methods | Card + СБП | Card only | Card only |
| Currency | RUB | USD | USD |
| Receipt (54-ФЗ) | Auto via ЮKassa | N/A | N/A |
| Free tier | 30 min/mo | 60 min/mo | 120 min/mo |
| Cheapest paid | 990₽ (~$11) | $15/mo | $20/mo |

## 5. СБП (Система быстрых платежей)

- Instant bank-to-bank transfers via QR code
- Commission: 0.4% (vs 2.5% for cards) — significantly cheaper
- Growing adoption in Russia: 70%+ smartphone users have access
- UX: user scans QR → approves in bank app → instant confirmation
- ЮKassa handles full flow, returns QR code URL
