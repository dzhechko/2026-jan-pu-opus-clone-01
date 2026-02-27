# ClipMaker User and Admin Flows

## Contents

### User Flows
1. [Registration and First Login](#1-registration-and-first-login)
2. [Video Upload, Processing, and Download](#2-video-upload-processing-and-download)
3. [Platform Connection and Clip Publishing](#3-platform-connection-and-clip-publishing)
4. [Plan Upgrade via YooKassa](#4-plan-upgrade-via-yookassa)
5. [Extra Minutes Purchase](#5-extra-minutes-purchase)
6. [BYOK Key Setup](#6-byok-key-setup)
7. [AI Provider Switching](#7-ai-provider-switching)
8. [Team Invite Acceptance](#8-team-invite-acceptance)

### Admin Flows
9. [Team Creation and Member Management](#9-team-creation-and-member-management)
10. [Analytics Monitoring](#10-analytics-monitoring)
11. [Subscription Management](#11-subscription-management)
12. [Platform OAuth Configuration](#12-platform-oauth-configuration)
13. [Billing Lifecycle](#13-billing-lifecycle)

---

## User Flows

### 1. Registration and First Login

```
Start
  |
  v
/register page
  |
  +-- Enter email + password (min 8 chars)
  |   OR
  +-- Click "Login with VK" (OAuth)
  |
  v
[Email path]                        [VK OAuth path]
  |                                    |
  v                                    v
Server creates User                  VK OAuth callback
  (planId: free,                       |
   emailVerified: false,               v
   minutesLimit: 30)                 Create/link User
  |                                  (emailVerified: true,
  v                                   authProvider: vk)
Send verification email                |
  |                                    v
  v                                  Issue JWT tokens
User clicks link in email           (access: 15 min,
  |                                   refresh: 7 days)
  v                                    |
/verify-email?token=...                v
  |                                  Redirect to /dashboard
  v                                    |
Mark emailVerified = true              v
  |                                  DONE
  v
Redirect to /login
  |
  v
Enter email + password
  |
  v
bcrypt verify --> Issue JWT tokens
  |
  v
Redirect to /dashboard
  |
  v
DONE (Free plan: 30 min, 3 clips/video, watermark)
```

### Forgot Password Flow

```
/forgot-password --> Enter email --> Send reset email
     |
     v
User clicks reset link --> /reset-password?token=...
     |
     v
Enter new password (min 8 chars) --> Update passwordHash
     |
     v
Redirect to /login
```

---

### 2. Video Upload, Processing, and Download

```
/dashboard/upload
  |
  +-- [File mode]                           +-- [URL mode]
  |   Drag & drop or click "Choose file"    |   Paste video URL
  |                                         |   Click "Upload"
  v                                         v
Client-side validation:                   tRPC: video.createFromUrl
  - MIME type check                         |
  - File size <= 4 GB                       v
  - Magic bytes verification              Server downloads video
  |                                       to S3 (worker: download)
  v                                         |
tRPC: video.createFromUpload                |
  - Create Video record (status: uploading) |
  - Generate S3 presigned URLs              |
  - Return upload metadata                  |
  |                                         |
  v                                         |
Browser uploads to S3:                      |
  - Small files: single PUT                 |
  - Large files: multipart (3 concurrent)   |
  - Progress bar with speed + ETA           |
  - Cancel button available                 |
  |                                         |
  v                                         |
tRPC: video.confirmUpload                   |
  |                                         |
  +--------------------+--------------------+
                       |
                       v
            Redirect to /dashboard/videos/:id
                       |
                       v
            Processing begins (background workers)
                       |
          +------------+------------+
          |            |            |
          v            v            v
     [STT Worker]  [LLM Worker]  [Render Worker]
     Whisper API   Moment select  FFmpeg for
     --> transcript --> scoring    each clip
                   --> titles      (parallel)
                   --> CTAs
          |            |            |
          +------------+------------+
                       |
                       v
            Video status: completed
            Clips available in card grid
                       |
                       v
            User reviews clips:
              - Play inline preview
              - Check virality scores
              - Edit in clip editor
                       |
                       v
            Click "Download" on a clip
              - Browser downloads MP4
              - Free plan: includes watermark
```

### Real-Time Status Polling

While processing is in progress, the video detail page polls for status updates. The UI shows the current stage (transcribing, analyzing, generating clips) with appropriate loading indicators. When processing completes, the page refreshes to show the generated clips.

---

### 3. Platform Connection and Clip Publishing

```
/dashboard/settings/platforms
  |
  v
Choose platform to connect:
  |
  +-- [VK / Dzen: OAuth]               +-- [Rutube / Telegram: Token]
  |   Click "Connect"                   |   Click "Connect"
  |   Redirect to platform OAuth        |   Inline form appears:
  |   User authorizes ClipMaker         |     - Enter API token
  |   Callback saves tokens             |     - (Telegram: + channel ID)
  |                                     |   Click "Connect"
  v                                     v
Platform connection saved               Token encrypted and saved
(access_token_encrypted in DB)          in DB
  |                                     |
  +----------+--------------------------+
             |
             v
   "Connected" badge appears
   Optional: Click "Test" to verify
             |
             v
   Go to /dashboard/videos/:id
             |
             v
   Click "Publish" on a ready clip
             |
             v
   Publish Dialog opens:
     - Select target platforms (checkboxes)
     - Only connected platforms are available
     - Platforms not in current plan are grayed out
     - Click "Publish"
             |
             v
   tRPC: publish.publish
     - Creates Publication records (status: scheduled)
     - Enqueues BullMQ jobs in "publish" queue
             |
             v
   Worker picks up publish job:
     - Downloads clip from S3
     - Calls platform API (VK/Rutube/Dzen/Telegram)
     - Updates Publication status:
         scheduled --> publishing --> published (or failed)
             |
             v
   Publication badges appear on clip card:
     - Yellow: scheduled
     - Blue: publishing
     - Green + checkmark: published (links to post)
     - Red + cross: failed
             |
             v
   Stats Collector (cron, every 6 hours):
     - Fetches views, likes, shares from platform APIs
     - Updates Publication records
     - Data appears on Analytics page
```

---

### 4. Plan Upgrade via YooKassa

```
/dashboard/billing
  |
  v
View plan comparison table
(Free / Start / Pro / Business)
  |
  v
Click "Upgrade to [Plan]"
  |
  v
Checkout modal opens:
  |
  +-- Select payment method:
  |     [Bank Card]  or  [SBP]
  |
  v
Click "Pay X RUB"
  |
  +-- [Card path]                        +-- [SBP path]
  |   tRPC: billing.checkout             |   tRPC: billing.checkout
  |   (paymentMethod: card)              |   (paymentMethod: sbp)
  |     |                                |     |
  |     v                                |     v
  |   Create Payment record              |   Create Payment record
  |   Call YooKassa API                  |   Call YooKassa API
  |   Get confirmation URL               |   Get QR code URL
  |     |                                |     |
  |     v                                |     v
  |   Redirect to YooKassa               |   Display QR code in modal
  |   hosted payment page                |   User scans with bank app
  |   User enters card details           |     |
  |     |                                |     v
  |     v                                |   Poll payment status
  |   YooKassa processes                 |   (every 3 sec, max 10 min)
  |   Redirect back to                   |     |
  |   /dashboard/billing?status=success  |     v
  |     |                                |   Status = succeeded
  |     +--------------------------------+   Redirect to billing page
  |                                      |
  +--------------------------------------+
                     |
                     v
   YooKassa webhook --> POST /api/billing/webhook
                     |
                     v
   Webhook handler:
     - Validate signature
     - Update Payment status to "succeeded"
     - Create/update Subscription:
         planId, status: active,
         currentPeriodStart, currentPeriodEnd (+30 days)
     - Update User: planId, minutesLimit, minutesUsed = 0
     - Save payment method ID (for auto-renewal)
                     |
                     v
   User sees updated plan on billing page
   New limits take effect immediately
```

---

### 5. Extra Minutes Purchase

```
/dashboard/billing
  |
  v
User has < 10 minutes remaining
  |
  v
"Minutes running low" card appears (amber)
  - Shows remaining minutes
  - Quick-buy buttons: 30 / 60 / 120 min
  |
  v
Click a quick-buy button
  |
  v
Checkout flow (same as plan upgrade):
  - Payment type: extra_minutes
  - Amount: minutes * price_per_minute
  |
  v
On payment success (webhook):
  - minutesLimit += purchased minutes
  - Payment recorded with type: extra_minutes
  |
  v
User can continue processing videos
```

---

### 6. BYOK Key Setup

```
/dashboard/settings --> Select "Global" AI provider
  |
  v
Click "Manage keys" --> /dashboard/settings/api-keys
  |
  v
BYOK Keys Panel shows provider list:
  - Gemini (Google)
  - OpenAI
  - Anthropic (Claude)
  - OpenRouter
  |
  v
Click "Add key" for a provider
  |
  v
Enter API key in masked input field
  |
  v
Browser-side encryption:
  1. Prompt for user password
  2. PBKDF2(password, salt, 100K iterations) --> Master Key
  3. AES-GCM encrypt(Master Key, API key) --> Encrypted blob
  4. Store encrypted blob in IndexedDB
  |
  v
Key appears as "****XXXX" (last 4 chars visible)
  |
  v
Click "Test" to verify:
  - Browser decrypts key in memory
  - Sends to server in request header
  - Server makes test API call to provider
  - Immediate success/failure feedback
  - Server discards key from memory after call
  |
  v
Key is now active for video processing
  |
  v
During video processing:
  1. Browser decrypts key before each request
  2. Key sent in header to backend
  3. LLM Router uses key for AI API calls
  4. If key is rejected (401/403), falls back to server key
  |
  v
Auto-lock after 30 min inactivity:
  - Master Key cleared from memory
  - Must re-enter password to unlock
  |
  v
Click "Remove" to delete:
  - Encrypted key removed from IndexedDB
  - Future processing uses server keys
```

---

### 7. AI Provider Switching

```
/dashboard/settings
  |
  v
AI Provider section:
  - Cloud.ru (Russia): all data in RF, ~21 RUB/60 min
  - Global (Gemini, Claude, OpenAI): transcripts in US/EU, ~55 RUB/60 min
  |
  v
Select "Global"
  |
  v
Confirmation dialog:
  "When using Global strategy, transcripts will be
   processed outside Russia. Continue?"
  |
  +-- [Cancel] --> stay on Cloud.ru
  |
  +-- [Confirm]
        |
        v
   tRPC: user.updateSettings
   (llmProviderPreference: "global")
        |
        v
   User preference saved
   BYOK keys section becomes active
   All future video processing uses Global models:
     - Gemini Flash (Tier 1)
     - Claude Haiku 4.5 (Tier 2)
     - OpenAI Whisper (STT)
        |
        v
   Switch back to "Cloud.ru":
     - No confirmation needed
     - BYOK keys section becomes inactive
     - Future processing uses Cloud.ru models:
         - T-Pro 2.1 (Tier 1)
         - Qwen3-235B (Tier 2)
         - Cloud.ru Whisper (STT)
```

---

### 8. Team Invite Acceptance

```
Team admin sends invite to user@example.com
  |
  v
Email sent with unique invite link:
  /invite?token=abc123...
  |
  v
Recipient clicks link
  |
  +-- [Already logged in]              +-- [Not logged in]
  |   Token validated                   |   Redirect to /login
  |   User added to team               |   with returnUrl=/invite?token=...
  |   TeamMember created               |     |
  |   (role from invite)               |     v
  |                                    |   Log in or register
  v                                    |     |
Redirect to /dashboard/team            |     v
  |                                    |   After auth, redirect back to
  v                                    |   /invite?token=...
Team page shows updated                |     |
member list                            |     v
                                       |   Token validated
                                       |   User added to team
                                       |     |
                                       |     v
                                       |   Redirect to /dashboard/team
                                       |
                                       v
                                     DONE
```

**Invite constraints:**
- Invites expire after a configured period.
- Only one invite per email per team.
- Users can only belong to one team at a time.
- Roles: owner (creator), admin (can invite), member (basic access).

---

## Admin Flows

### 9. Team Creation and Member Management

```
/dashboard/team (no existing team)
  |
  v
Create Team Form:
  - Enter team name
  - Click "Create"
  - Available on Pro and Business plans
  |
  v
tRPC: team.create
  - Team created with user as owner
  - TeamMember record: role = owner
  |
  v
Team page shows:
  - Team name as heading
  - Member list (just the owner)
  - Invite form
  |
  v
Invite a member:
  |
  v
Enter email + select role (admin/member)
  |
  v
tRPC: team.invite
  - TeamInvite record created
  - Email sent with invite link
  |
  v
Invite appears as "Pending" in member list
  |
  v
After recipient accepts:
  - Invite status: accepted
  - New member appears in list
  |
  v
Manage members (owner/admin only):
  +-- Change role: admin <--> member
  +-- Remove member from team
  |
  v
Delete team (owner only):
  - Confirmation: "Delete team? This is irreversible."
  - All TeamMember and TeamInvite records deleted
  - Members' teamId set to null
  |
  v
Leave team (non-owner):
  - Confirmation: "Are you sure you want to leave?"
  - TeamMember record deleted
  - User's teamId set to null
```

---

### 10. Analytics Monitoring

```
/dashboard/analytics
  |
  v
Select date range: 7 / 14 / 30 / 60 / 90 days
  |
  v
Dashboard loads 4 parallel queries:
  +-- analytics.overview      (total views, likes, shares, published count)
  +-- analytics.byPlatform    (breakdown by VK, Rutube, Dzen, Telegram)
  +-- analytics.topClips      (top 10 clips by views)
  +-- analytics.timeline      (daily data for selected range)
  |
  v
Review performance:
  |
  +-- Overview Cards: total metrics at a glance
  +-- Platform Table: which platforms perform best
  +-- Top Clips: identify highest-performing content
  +-- Timeline: spot trends over time
  |
  v
Click "Refresh" to reload all data
  |
  v
Adjust date range to compare different periods
```

---

### 11. Subscription Management

```
/dashboard/billing
  |
  v
Current subscription card shows:
  - Plan name, status, payment method, next billing date
  |
  +-- [Upgrade]
  |   Select higher plan --> Checkout flow (see Flow 4)
  |   New plan takes effect immediately after payment
  |
  +-- [Cancel]
  |   Click "Cancel subscription"
  |   Confirmation: "Active until [date]. Confirm cancellation?"
  |   |
  |   v
  |   tRPC: billing.cancel
  |   Subscription: cancelAtPeriodEnd = true
  |   User keeps access until period end
  |   |
  |   v
  |   At period end (billing-cron):
  |     - Downgrade to Free plan
  |     - minutesUsed = 0
  |     - minutesLimit = 30 (free plan default)
  |
  +-- [Reactivate] (shown after cancellation)
  |   Click "Reactivate subscription"
  |   tRPC: billing.reactivate
  |   cancelAtPeriodEnd = false
  |   Auto-renewal resumes at period end
  |
  +-- [Past Due]
      Payment failed notification (red banner)
      User has 7-day grace period:
        - Day 1-6: reminder emails sent
        - Day 7: downgrade to Free plan
      User can manually pay to resolve
```

---

### 12. Platform OAuth Configuration

```
Setting up platform OAuth (production environment):

1. VK:
   - Create VK Mini App at https://vk.com/apps
   - Set redirect URL to https://yourdomain.com/api/auth/vk/callback
   - Copy VK_PUBLISH_CLIENT_ID and VK_PUBLISH_CLIENT_SECRET to .env
   - Requested scopes: video, wall

2. Yandex Dzen:
   - Register application at https://oauth.yandex.ru
   - Set redirect URL to https://yourdomain.com/api/auth/dzen/callback
   - Copy YANDEX_CLIENT_ID and YANDEX_CLIENT_SECRET to .env

3. Rutube:
   - No OAuth needed -- users enter API tokens directly
   - Token obtained from Rutube Studio settings

4. Telegram:
   - No OAuth needed -- users enter bot tokens directly
   - Bot created via @BotFather
   - Optional: channel ID for publishing destination

Testing connections:
  /dashboard/settings/platforms --> Click "Test" on connected platform
  - Server makes a lightweight API call to verify credentials
  - Returns account name on success
  - Returns "Token invalid" on failure
```

---

### 13. Billing Lifecycle

The complete billing lifecycle from subscription to renewal or cancellation:

```
+------------------------------------------------------------------+
|                    BILLING LIFECYCLE                               |
+------------------------------------------------------------------+

Phase 1: ACQUISITION
  User on Free plan --> Views billing page --> Selects paid plan
  --> YooKassa checkout --> Payment succeeds
  --> Subscription created (active, 30-day period)
  --> Card payment method ID saved for auto-renewal

Phase 2: ACTIVE PERIOD
  User has full plan features for 30 days
  Minutes usage tracked in usage_records
  Minutes counter shown on dashboard

Phase 3: PERIOD END (billing-cron worker runs)
  |
  +-- [User cancelled]
  |   cancelAtPeriodEnd = true
  |   --> Downgrade to Free immediately
  |   --> Send "downgraded" email
  |   --> END
  |
  +-- [Has saved card]
  |   --> Attempt auto-renewal via YooKassa
  |   |
  |   +-- [Payment succeeds]
  |   |   Webhook confirms --> New 30-day period
  |   |   minutesUsed reset to 0
  |   |   --> Back to Phase 2
  |   |
  |   +-- [Payment fails]
  |       --> Mark subscription as past_due
  |       --> Send "payment failed" email
  |       --> Enter Grace Period
  |
  +-- [No saved card (SBP or first-time)]
      --> Mark subscription as past_due
      --> Send "subscription expired" email
      --> Enter Grace Period

Phase 4: GRACE PERIOD (7 days)
  Day 1-6:
    - User retains paid plan features
    - Reminder emails sent daily
    - User can manually pay to resolve
    - If user pays: back to Phase 2
  Day 7:
    - Downgrade to Free plan
    - Send "downgraded" email
    - minutesUsed = 0, minutesLimit = 30
    - END

+------------------------------------------------------------------+

Timeline Example:

Day 0:  User subscribes to Pro (2,990 RUB/mo)
Day 30: Period ends, auto-renewal succeeds --> new period starts
Day 60: Period ends, auto-renewal fails (card expired)
Day 60: Status: past_due, "payment failed" email sent
Day 61: Reminder: "6 days to fix payment"
Day 62: Reminder: "5 days to fix payment"
Day 63: User updates card and pays manually --> back to active
  OR
Day 67: Grace period expires --> downgrade to Free

+------------------------------------------------------------------+

Email Timeline:

  period_end ------> "payment failed" (Day 0 of grace)
  period_end + 1d -> "renew in 6 days"
  period_end + 2d -> "renew in 5 days"
  ...
  period_end + 6d -> "renew in 1 day"
  period_end + 7d -> "downgraded to Free"
```

---

## Dev vs Production Environment Differences

This section describes how the key user and admin flows differ between development and production environments.

### Flow Comparison

| Flow | Development | Production |
|------|-------------|------------|
| **Registration** | Email auto-verified -- user skips verification step entirely | User must click the verification link in their email |
| **Email Verification** | `NODE_ENV === 'development'` triggers auto-verification on registration | Real email with token link; account is inactive until verified |
| **OAuth (VK, Dzen)** | Simulated connections -- clicking "Connect" creates a fake connection with "(dev)" badge | Real OAuth redirect to VK ID / Yandex OAuth consent screen |
| **Payments** | Non-functional without YooKassa credentials; checkout returns an error | Full YooKassa checkout (card redirect or SBP QR code) |
| **Billing Lifecycle** | Auto-renewal cannot be tested without YooKassa test shop credentials | Complete lifecycle: active, past_due, grace period, downgrade |
| **Emails (all types)** | Captured by Ethereal Mail -- preview URLs in console, no real delivery | Real SMTP delivery to user inboxes |
| **Worker Emails** | Billing-cron and other workers log emails via `console.log` | Workers send emails via configured SMTP |
| **Team Invites** | Invite link displayed in the UI (since email is not delivered) | Invite link sent by email only |
| **Clip Downloads** | Served via API proxy (`/api/clips/` routes) | Served via presigned S3 URLs |

### Registration Flow in Dev

In development, the registration flow is shortened:

```
/register --> Enter email + password --> Server creates User
  --> emailVerified = true (auto-verified)
  --> Redirect to /login
  --> Login with credentials
  --> Dashboard
```

The email verification step (send email, click link, verify token) is skipped entirely. The user record is created with `emailVerified: true` when `NODE_ENV === 'development'`.

In production, the full flow applies: the user must check their inbox and click the verification link before they can log in.

### OAuth Flow in Dev

In development, OAuth platforms (VK and Dzen) use simulated connections:

```
/dashboard/settings/platforms --> Click "Connect VK"
  --> No redirect to VK OAuth
  --> Fake connection record created immediately
  --> "(dev)" badge displayed on the connection card
```

In production:

```
Click "Connect VK"
  --> Redirect to https://oauth.vk.com/authorize?...
  --> User authorizes on VK
  --> Callback saves real access/refresh tokens
  --> "Connected" badge (no dev indicator)
```

Token-based platforms (Rutube and Telegram) work the same in both environments -- users enter real API tokens.

### Payment Flow in Dev

In development, the YooKassa integration is non-functional unless test credentials are configured:

```
/dashboard/billing --> Click "Upgrade to Pro"
  --> Checkout modal opens
  --> Click "Pay 2,990 RUB"
  --> ERROR: YooKassa credentials not configured
```

To test payments in development, set `YOOKASSA_SHOP_ID` and `YOOKASSA_SECRET_KEY` in `.env` using YooKassa test shop credentials. With test credentials, the full checkout flow (card or SBP) works with test card numbers.

### Email Flow in Dev

All emails in development are routed to Ethereal Mail:

```
System sends email (verification, reset, billing, invite)
  --> Ethereal captures the email
  --> Preview URL logged to console:
      "Email sent (dev mode): https://ethereal.email/message/..."
  --> Open URL in browser to view email content
  --> No real delivery occurs
```

For billing-cron worker emails specifically, the worker logs the email content to stdout via `console.log` instead of using the SMTP transport.
