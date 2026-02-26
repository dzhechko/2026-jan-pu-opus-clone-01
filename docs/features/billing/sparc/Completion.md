# Billing — Completion

## Deployment Plan

### Prerequisites
1. ЮKassa shop account created and approved
2. Environment variables set:
   - `YOOKASSA_SHOP_ID` — shop identifier
   - `YOOKASSA_SECRET_KEY` — API secret key
3. ЮKassa webhook URL configured in dashboard: `https://clipmaker.ru/api/webhooks/yookassa`
4. ЮKassa webhook events enabled: `payment.succeeded`, `payment.canceled`, `refund.succeeded`

### Deployment Sequence

1. **Database migration** — Add Payment model
   ```bash
   npx prisma migrate dev --name add-payment-model
   ```
2. **Install dependencies** — `@yookassa/sdk` in apps/web
3. **Deploy backend** — New tRPC routes, webhook endpoint, ЮKassa client
4. **Deploy worker** — Billing cron job
5. **Deploy frontend** — Billing page
6. **Configure ЮKassa** — Set webhook URL in ЮKassa dashboard
7. **Smoke test** — Create test payment (ЮKassa test mode)

### Rollback Plan
1. If webhook processing fails: payments still visible in ЮKassa dashboard for manual activation
2. If billing page fails: users still on their current plan (no regression)
3. If cron fails: manual period reset via admin SQL (temporary)
4. Feature flag: `BILLING_ENABLED` env var to disable checkout while keeping existing subscriptions

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YOOKASSA_SHOP_ID` | Yes | ЮKassa shop identifier |
| `YOOKASSA_SECRET_KEY` | Yes | ЮKassa API secret key |
| `BILLING_ENABLED` | No | Set to "false" to disable checkout (default: true) |

## Monitoring & Alerting

| Metric | Alert Threshold | Channel |
|--------|----------------|---------|
| Webhook response time | > 500ms p95 | Logs |
| Payment creation errors | > 5 in 10 min | Logs + Admin notification |
| Webhook 4xx/5xx rate | > 5% | Logs |
| Auto-renewal failure rate | > 10% daily | Logs + Admin notification |
| Past_due subscriptions count | > 20 | Daily report |

### Log Events (Pino)

```typescript
// Successful payment
logger.info({ paymentId, userId, planId, amount }, 'payment.succeeded');

// Failed payment
logger.warn({ paymentId, userId, error }, 'payment.failed');

// Auto-renewal
logger.info({ userId, planId }, 'subscription.renewed');

// Downgrade
logger.info({ userId, fromPlan, toPlan: 'free' }, 'subscription.expired');

// Webhook received
logger.info({ event, paymentId }, 'webhook.received');

// Webhook IP rejected
logger.warn({ ip }, 'webhook.ip_rejected');
```

## Handoff Checklists

### Dev Checklist
- [ ] Payment model migration applied
- [ ] `@yookassa/sdk` installed
- [ ] ЮKassa client with receipt generation
- [ ] billing router: checkout, buyMinutes, cancel, reactivate, checkPaymentStatus
- [ ] Webhook handler with IP validation and idempotency
- [ ] Billing cron worker (period reset + auto-renewal)
- [ ] Billing page with plan comparison table
- [ ] Checkout modal (card redirect + СБП QR)
- [ ] Subscription management card
- [ ] JWT refresh on plan change (middleware)
- [ ] All unit + integration tests passing
- [ ] TypeScript strict — no errors

### QA Checklist
- [ ] Test card payment flow (ЮKassa test mode)
- [ ] Test СБП QR flow (ЮKassa test mode)
- [ ] Test subscription cancellation
- [ ] Test auto-renewal (simulate period end)
- [ ] Test extra minutes purchase
- [ ] Test webhook idempotency (send same webhook twice)
- [ ] Test billing page responsive design (mobile)
- [ ] Test plan limits update after upgrade (minutesLimit, watermark)
- [ ] Test error states (ЮKassa down, payment declined)

### Ops Checklist
- [ ] `YOOKASSA_SHOP_ID` and `YOOKASSA_SECRET_KEY` in production env
- [ ] Webhook URL configured in ЮKassa dashboard
- [ ] Firewall allows ЮKassa IPs (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.156.11, 77.75.156.35)
- [ ] Billing cron job running (check BullMQ dashboard)
- [ ] Log aggregation includes billing events
- [ ] Backup includes payments table
