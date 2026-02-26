# Billing — Specification

## User Stories & Acceptance Criteria

---

### US-B1: Plan Comparison & Upgrade

**As a** free user,
**I want to** see a comparison of available plans and upgrade,
**So that** I can access premium features.

**Acceptance Criteria:**

```gherkin
Feature: Plan Comparison & Upgrade

  Scenario: View billing page
    Given I am logged in on any plan
    When I navigate to /dashboard/billing
    Then I see a plan comparison table with Free, Start, Pro, Business
    And my current plan is highlighted
    And each plan shows: price, minutes/month, clips/video, watermark status, storage retention
    And upgrade buttons are shown for plans above my current

  Scenario: Initiate upgrade to Start (card)
    Given I am on the Free plan on /dashboard/billing
    When I click "Перейти на Start" and select "Банковская карта"
    Then the system creates a ЮKassa payment for 990₽
    And I am redirected to ЮKassa checkout page
    And on completion I return to /dashboard/billing?status=success

  Scenario: Initiate upgrade to Start (СБП)
    Given I am on the Free plan on /dashboard/billing
    When I click "Перейти на Start" and select "СБП"
    Then a modal shows a QR code from ЮKassa
    And the text reads: "Отсканируйте QR-код в приложении банка"
    And the modal polls for payment confirmation every 3 seconds (max 5 min)
    And on confirmation the modal closes and plan activates

  Scenario: Payment succeeds (webhook)
    Given I completed payment on ЮKassa
    When the webhook `payment.succeeded` arrives
    Then the server creates a Payment record with externalId
    And creates/updates Subscription (planId, currentPeriodStart, currentPeriodEnd)
    And updates User.planId and User.minutesLimit
    And resets User.minutesUsed to 0
    And sets User.billingPeriodStart to now

  Scenario: Payment fails or is cancelled
    Given I started checkout but abandoned or payment was declined
    When the webhook `payment.canceled` arrives (or no webhook within 30 min)
    Then no plan change occurs
    And the Payment record is marked as 'cancelled'
    And the billing page shows: "Оплата не прошла. Попробуйте снова"

  Scenario: Already on the same plan
    Given I am on the Start plan
    When I view the billing page
    Then the Start column shows "Текущий план" instead of an upgrade button
    And higher plans show upgrade buttons
    And Free shows "Текущие возможности" label (no downgrade button)

  Scenario: ЮKassa API unavailable during checkout
    Given I am upgrading to Start
    When I click pay and the ЮKassa API returns an error or times out
    Then I see: "Платёжная система недоступна. Попробуйте позже"
    And no Payment record is created
    And my plan remains unchanged
```

---

### US-B2: Subscription Management

**As a** paid user,
**I want to** manage my subscription (view status, cancel),
**So that** I have full control over my billing.

**Acceptance Criteria:**

```gherkin
Feature: Subscription Management

  Scenario: View active subscription
    Given I am on the Start plan
    When I open /dashboard/billing
    Then I see: "Тариф: Стартовый", "Следующее списание: DD.MM.YYYY", "Способ оплаты: Карта **** 1234"
    And a "Отменить подписку" button

  Scenario: Cancel subscription
    Given I have an active Start subscription
    When I click "Отменить подписку"
    Then a confirmation dialog asks: "Ваш план будет активен до DD.MM.YYYY. Подтвердить отмену?"
    And on confirm: subscription.cancelAtPeriodEnd is set to true
    And the button changes to "Подписка отменена (активна до DD.MM.YYYY)"
    And I receive a confirmation email

  Scenario: Reactivate cancelled subscription
    Given I cancelled my subscription but the period hasn't ended
    When I click "Возобновить подписку" on the billing page
    Then cancelAtPeriodEnd is set back to false
    And auto-renewal resumes

  Scenario: Subscription expires
    Given my subscription was cancelled and currentPeriodEnd has passed
    When the daily billing cron job runs
    Then User.planId changes to 'free'
    And User.minutesLimit changes to 30
    And User.minutesUsed resets to 0
    And Subscription.status changes to 'expired'
```

---

### US-B3: Auto-Renewal

**As a** paid subscriber,
**I want** my plan to auto-renew monthly,
**So that** my service isn't interrupted.

**Acceptance Criteria:**

```gherkin
Feature: Auto-Renewal

  Scenario: Successful auto-renewal
    Given my billing period ends today and cancelAtPeriodEnd is false
    When the daily billing cron job runs (03:00 UTC)
    Then the server creates a ЮKassa payment using saved payment_method_id
    And on success: extend currentPeriodEnd by 1 calendar month (e.g., Jan 15 → Feb 15)
    And reset User.minutesUsed to 0

  Scenario: Auto-renewal payment fails
    Given my auto-renewal payment is declined
    When the webhook payment.canceled arrives
    Then Subscription.status changes to 'past_due' and statusChangedAt is recorded
    And the user sees a banner: "Оплата не прошла. Обновите способ оплаты"
    And the system retries once more after 3 days (on the next cron run ≥72h after first failure)
    And during the grace period the user retains full plan access
    And if retry also fails: downgrade to free 7 days after the first failure date

  Scenario: СБП auto-renewal not supported
    Given I originally paid with СБП
    When auto-renewal is due (period expired, no saved payment method)
    Then Subscription.status changes to 'past_due'
    And the system sends an email 3 days before expiration: "Оплатите подписку вручную"
    And shows a banner on dashboard: "Подписка истекает DD.MM.YYYY. Продлите вручную"
    And provides a direct payment link to /dashboard/billing
    And if not renewed within 7 days of expiration: downgrade to free
```

---

### US-B4: Extra Minutes Purchase

**As a** user who has exhausted monthly minutes,
**I want to** buy extra minutes without changing my plan,
**So that** I can continue processing videos.

**Acceptance Criteria:**

```gherkin
Feature: Extra Minutes

  Scenario: Buy extra minutes
    Given I have 0 minutes remaining on the Start plan
    When I try to upload a video
    Then I see: "Минуты исчерпаны. Докупите минуты по 15₽/мин"
    And a selector to choose minutes (30, 60, 120)
    And a "Оплатить X₽" button

  Scenario: Extra minutes payment
    Given I selected 60 extra minutes (900₽)
    When I complete payment via ЮKassa
    Then User.minutesLimit increases by 60
    And a Payment record is created with type 'extra_minutes'
    And I can immediately upload the video

  Scenario: Extra minutes don't roll over
    Given I bought 60 extra minutes this month
    When my billing period resets
    Then minutesLimit resets to my plan's base limit (e.g., 120 for Start)
    And the extra minutes are lost
```

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Webhook processing time | < 500ms per webhook |
| Payment creation latency | < 2s (ЮKassa API call) |
| Idempotency | Same payment processed exactly once |
| Data consistency | Atomic: Payment + Subscription + User in one transaction |
| Billing page load time | < 1s |
| 54-ФЗ compliance | Receipt in every payment via ЮKassa receipt object |
| Webhook retry tolerance | Handle duplicate webhooks gracefully |

## Feature Matrix

| Feature | MVP | v1.1 |
|---------|-----|------|
| Card payment | ✅ | ✅ |
| СБП payment | ✅ | ✅ |
| Plan upgrade | ✅ | ✅ |
| Plan downgrade | — | ✅ |
| Subscription cancel | ✅ | ✅ |
| Auto-renewal (card) | ✅ | ✅ |
| Manual renewal (СБП) | ✅ | ✅ |
| Extra minutes | ✅ | ✅ |
| Payment history | — | ✅ |
| Promo codes | — | ✅ |
| Annual billing | — | ✅ |
| Refund self-service | — | ✅ |
