# Billing & Subscription — PRD

## Executive Summary

Implement ЮKassa payment integration with card and СБП (QR) payment methods to enable monetization via freemium subscription model. Users upgrade from Free (30 min/mo) to Start (120 min, 990₽/mo), Pro, or Business plans. Subscriptions auto-renew monthly, with cancellation taking effect at period end.

## Problem

- КлипМейкер has plan infrastructure (Prisma schema, plan checks, watermark rendering) but no payment gateway
- `billing.checkout` tRPC mutation returns placeholder — no actual ЮKassa API calls
- No webhook endpoint to process payment notifications
- No billing page UI for plan comparison, checkout, and subscription management
- No billing period reset mechanism (minutesUsed stays accumulated forever)
- Users cannot upgrade, downgrade, or buy extra minutes

## Solution

### 1. ЮKassa Server-Side Integration
- Server-side ЮKassa SDK (`@yookassa/sdk`) for creating payments and managing subscriptions
- Payment creation via `billing.checkout` → redirects to ЮKassa hosted page
- Webhook endpoint `/api/webhooks/yookassa` to receive payment status updates
- Support card and СБП (QR) payment methods

### 2. Subscription Lifecycle
- On successful payment: activate subscription, update `User.planId`, reset minutes
- Auto-renewal: ЮKassa handles recurring billing, notifies via webhook
- Cancellation: mark `cancelAtPeriodEnd`, downgrade to Free after period ends
- Minute overage: offer extra minutes at 15₽/min (one-time payment)

### 3. Billing Page UI
- `/dashboard/billing` — plan comparison table, current plan highlight, upgrade/downgrade CTAs
- Checkout flow: select plan → select payment method (card/СБП) → redirect to ЮKassa
- Subscription management: view current plan, next renewal date, cancel button
- Payment history (from ЮKassa API or local Payment model)

### 4. Billing Period Reset
- BullMQ scheduled job: daily scan for expired billing periods
- On period expiry: reset `minutesUsed` to 0, advance `billingPeriodStart`

## Target Users
Content creators on КлипМейкер who have exhausted free tier and want premium features.

## Success Metrics
- **Conversion rate**: Free → Start ≥ 5% within 30 days
- **Payment success rate**: ≥ 95% completed payments
- **Churn rate**: < 10% monthly
- **Checkout time**: < 60s from click to payment confirmation

## Scope

### In Scope (MVP)
- ЮKassa payment creation (card + СБП)
- Webhook processing for payment.succeeded, payment.canceled, refund.succeeded
- Subscription activation and cancellation
- Billing page with plan comparison
- Billing period reset job
- Minute overage purchase (one-time)

### Out of Scope
- Invoicing / receipts (ЮKassa handles 54-ФЗ receipts automatically)
- Promo codes / discounts
- Annual billing (monthly only for MVP)
- Multiple payment providers (ЮKassa only)
- Refund self-service UI (admin-initiated via ЮKassa dashboard)

## Plan Tiers

| Plan | Price | Minutes/mo | Clips/video | Watermark | Storage |
|------|-------|-----------|-------------|-----------|---------|
| Free | 0₽ | 30 | 3 | Yes | 3 days |
| Start | 990₽/mo | 120 | 10 | No | 30 days |
| Pro | 2,990₽/mo | 1,000 | 100 | No | 90 days |
| Business | 9,990₽/mo | Unlimited | 100 | No | 90 days |

Extra minutes: 15₽/min (any plan, one-time payment).

## Timeline Target
- API integration + webhooks: Phase 3 implementation
- Billing page UI: Phase 3 implementation
- Period reset job: Phase 3 implementation
