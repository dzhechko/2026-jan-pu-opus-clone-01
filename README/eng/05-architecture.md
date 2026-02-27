# ClipMaker Architecture Overview

## Contents

1. [System Architecture](#1-system-architecture)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Request Flow](#3-request-flow)
4. [Video Processing Pipeline](#4-video-processing-pipeline)
5. [Auto-Posting Pipeline](#5-auto-posting-pipeline)
6. [Authentication](#6-authentication)
7. [Payment Flow](#7-payment-flow)
8. [Auto-Renewal and Billing Lifecycle](#8-auto-renewal-and-billing-lifecycle)
9. [LLM Router](#9-llm-router)
10. [Security and Encrypted API Keys](#10-security-and-encrypted-api-keys)
11. [Queue System](#11-queue-system)

---

## 1. System Architecture

ClipMaker uses a **Distributed Monolith** pattern inside a **Turborepo monorepo**:

- All code lives in a single repository managed by Turborepo.
- Services share a common codebase but run as separate Docker containers.
- Inter-service communication happens through a shared PostgreSQL database and Redis queues (no HTTP calls between services).
- Shared types and utilities are extracted into `packages/`.

```
+-------------------+        +--------------------+
|    Browser        |        |  VK / Rutube /     |
|                   |        |  Dzen / Telegram   |
|  Next.js SPA      |        |  (platforms)       |
|  Encrypted Vault  |        +---------^----------+
+--------+----------+                  |
         |                             |
         | HTTPS                       |
         v                             |
+--------+----------+       +----------+-----------+
|                   |       |                      |
|   Next.js API     |       |   worker-publish     |
|   (tRPC + REST)   |       |   (BullMQ)           |
|                   |       |                      |
+----+-------+------+       +-----------^----------+
     |       |                          |
     |       |               +----------+-----------+
     |       |               |                      |
     |       +--------+----->|       Redis 7        |
     |                |      |    (BullMQ queues)   |
     |                |      |                      |
     |                |      +---+------+------+----+
     |                |          |      |      |
     v                |          v      v      v
+----+-------+  +-----+--+  +---+-+ +--+-+ +--+---+
|            |  |        |  | STT | | LLM| |Video |
| PostgreSQL |  |   S3   |  |     | |    | |Render|
|    16      |  |Storage |  +--+--+ +-+--+ +--+---+
|            |  |        |     |      |       |
+------------+  +--------+     v      v       v
                            +--+------+-------+---+
                            |                     |
                            |   Cloud.ru AI /     |
                            |   Global AI APIs    |
                            |                     |
                            +---------------------+
```

**Why not microservices:**

- Small team (1--2 developers) -- microservices would be overkill.
- A shared database and shared types are simpler to maintain.
- Docker Compose is sufficient for deployment (no Kubernetes required).
- Workers can be moved to dedicated servers later if needed.

---

## 2. Monorepo Structure

```
clipmaker/
+-- apps/
|   +-- web/                         # Next.js 15 (frontend + API)
|   |   +-- app/                     # App Router
|   |   |   +-- (auth)/              # Auth: login, register,
|   |   |   |                        #   forgot-password, verify-email
|   |   |   +-- (dashboard)/         # Dashboard: videos, clips,
|   |   |   |                        #   analytics, settings, team
|   |   |   +-- api/                 # API routes + tRPC
|   |   |   +-- invite/              # Team invite acceptance
|   |   +-- components/              # React components
|   |   |   +-- analytics/           # Charts, overview, tables
|   |   |   +-- clip-editor/         # Clip editor (timeline, subtitles)
|   |   |   +-- clips/               # Clip cards, publish dialog
|   |   |   +-- dashboard/           # Dashboard widgets, stat cards
|   |   |   +-- layout/              # Navigation
|   |   |   +-- settings/            # BYOK key management
|   |   |   +-- team/                # Team management
|   |   |   +-- transcript/          # Transcript viewer
|   |   |   +-- upload/              # Video uploader
|   |   |   +-- video/               # Video detail page
|   |   |   +-- ui/                  # shadcn/ui (button, card, badge...)
|   |   +-- lib/                     # Utilities (auth, s3, trpc, etc.)
|   |
|   +-- worker/                      # BullMQ workers
|       +-- workers/
|       |   +-- stt.ts               # Transcription (Whisper)
|       |   +-- llm-analyze.ts       # AI moment analysis
|       |   +-- video-render.ts      # FFmpeg rendering
|       |   +-- publish.ts           # Platform publishing
|       |   +-- stats-collector.ts   # Platform stats collection
|       |   +-- billing-cron.ts      # Billing period management
|       |   +-- download.ts          # Video download by URL
|       +-- lib/
|           +-- llm-router.ts        # LLM model routing
|           +-- providers/           # AI provider adapters
|           +-- yookassa.ts          # YooKassa payment API
|           +-- email.ts             # Email notifications
|
+-- packages/
|   +-- db/                          # Prisma ORM
|   |   +-- prisma/
|   |       +-- schema.prisma        # Database schema
|   |       +-- migrations/          # Migrations
|   +-- queue/                       # BullMQ queue definitions
|   +-- types/                       # Shared TypeScript types
|   |   +-- src/
|   |       +-- user.ts              # Plans, PlanId, PLANS
|   |       +-- billing.ts           # PLAN_CONFIG, prices
|   +-- config/                      # Shared configuration
|   +-- crypto/                      # Encryption utilities
|   +-- s3/                          # S3 client and helpers
|
+-- docker-compose.yml               # Local development
+-- Dockerfile                       # Unified image (Node.js + FFmpeg)
+-- turbo.json                       # Turborepo configuration
+-- package.json                     # Root package.json (workspaces)
```

---

## 3. Request Flow

All client-server communication uses tRPC -- a type-safe RPC framework that shares types between the React frontend and the Next.js backend.

```
Browser (React)
     |
     | tRPC call (HTTP POST)
     v
Next.js API Route (/api/trpc)
     |
     +-- Zod input validation
     +-- JWT authentication (HttpOnly cookie)
     +-- Rate limiting check
     |
     v
tRPC Router (procedure handler)
     |
     +-- Prisma ORM --> PostgreSQL 16
     +-- BullMQ     --> Redis 7 (enqueue background jobs)
     +-- S3 Client  --> Yandex Object Storage (presigned URLs)
     |
     v
JSON response --> Browser
```

### tRPC Routers

| Router | Procedures | Purpose |
|--------|-----------|---------|
| `video` | upload, list, get, delete | Video management |
| `clip` | list, get, update, download | Clip management |
| `user` | me, updateProfile, updateSettings | User profile |
| `billing` | plans, checkout, cancel, reactivate, subscription, checkPaymentStatus | Billing and subscriptions |
| `publish` | publish, status | Auto-posting to platforms |
| `analytics` | overview, byPlatform, topClips, timeline | Analytics dashboard |
| `team` | create, get, invite, members, leave, delete | Team collaboration |
| `platform` | list, connect, disconnect, testConnection | Platform connections |

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| All API routes | 100 requests/min per user |
| Video upload | 10 uploads/hour |
| Authentication | 5 attempts/min |

---

## 4. Video Processing Pipeline

The complete lifecycle of a video from upload to ready clips:

```
1. UPLOAD
   User --> File or URL --> S3 (multipart upload with concurrent parts)
                |
                v
2. TRANSCRIPTION (worker: stt.ts)
   S3 --> extract audio --> Whisper API --> transcript with timestamps
                                            |
                                            v
                                    Save to PostgreSQL (segments JSON)
                |
                v
3. AI ANALYSIS (worker: llm-analyze.ts)
   Transcript --> LLM Router -->
     +-- Moment selection (find best short-form segments)
     +-- Virality scoring (hook, engagement, flow, trend)
     +-- Title generation
     +-- CTA suggestion
                                            |
                                            v
                                    Save clips to PostgreSQL
                |
                v
4. RENDERING (worker: video-render.ts)
   For each clip (in parallel):
     S3 --> download source --> FFmpeg:
       - Trim by timestamps
       - Resize 16:9 --> 9:16 (portrait mode)
       - Overlay Russian subtitles (.srt)
       - Add watermark (Free plan only)
     --> Upload rendered clip to S3
                |
                v
5. COMPLETE
   Video status --> completed
   Clips available for download and publishing
```

### Video Status Lifecycle

```
uploading --> downloading --> transcribing --> analyzing --> generating_clips --> completed
                                                                              |
                                                                         (on error)
                                                                              v
                                                                            failed
```

### Clip Status Lifecycle

```
pending --> rendering --> ready --> published
                           |
                      (on error)
                           v
                         failed
```

### FFmpeg Rendering (example command)

```bash
ffmpeg -i input.mp4 \
  -ss 120.5 -to 165.0 \
  -vf "crop=ih*9/16:ih,scale=1080:1920,
       subtitles=subs.srt:force_style='FontSize=24,
       PrimaryColour=&Hffffff,Bold=1,Shadow=1'" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output.mp4
```

---

## 5. Auto-Posting Pipeline

```
User clicks "Publish" on a clip
     |
     v
tRPC publish.publish()
     |
     v
BullMQ: enqueue job in "publish" queue
     |
     v
worker-publish picks up the job
     |
     +-- VK API       --> upload clip --> publish to VK Clips
     +-- Rutube API    --> upload clip --> publish to Rutube
     +-- Dzen API      --> upload clip --> publish to Yandex Dzen
     +-- Telegram Bot  --> send video to channel
     |
     v
Update publication status in PostgreSQL
     |
     v
Stats Collector (cron, every 6 hours)
     |
     v
Fetch views/likes/shares from each platform API
     |
     v
Update publication stats in PostgreSQL
```

### Platform Adapters

Each platform is implemented as a separate adapter with a unified interface:

```typescript
interface PlatformAdapter {
  uploadVideo(clip: Clip, credentials: PlatformCredentials): Promise<PublishResult>;
  getStats(publicationId: string): Promise<PlatformStats>;
}
```

### Platform Rate Limits

| Platform | Rate Limit | Strategy |
|----------|-----------|----------|
| VK | 5 req/sec | Queue-level throttle |
| Rutube | Undocumented | 1 req/sec (conservative) |
| Dzen | Undocumented | 1 req/sec (conservative) |
| Telegram | 30 msg/sec | Queue-level throttle |

---

## 6. Authentication

ClipMaker uses NextAuth.js with two authentication providers:

```
User --> Email + Password --> bcrypt verify --> JWT (access 15 min + refresh 7 days)
User --> VK OAuth         --> callback --> create/link user --> JWT
```

| Parameter | Value |
|-----------|-------|
| Access token | JWT, HttpOnly cookie, 15 min TTL |
| Refresh token | Secure cookie, 7 day TTL |
| Password | bcrypt hash, minimum 8 characters |
| Email | Mandatory verification required |
| Rate limit | 5 login attempts/min |

### Security Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### File Upload Validation

Files are validated by two methods:

1. **MIME type** -- Content-Type header check.
2. **Magic bytes** -- first bytes of the file are inspected to verify the actual format (prevents disguised uploads).

---

## 7. Payment Flow

ClipMaker integrates with YooKassa (formerly Yandex.Kassa) for payments in Russian rubles.

### Subscription Checkout

```
User selects a plan (Start / Pro / Business)
     |
     v
Choose payment method: Bank Card or SBP (fast payment system)
     |
     +-- Card: redirect to YooKassa hosted payment page
     |         --> user enters card details
     |         --> YooKassa processes payment
     |         --> redirect back to /dashboard/billing?status=success
     |
     +-- SBP:  generate QR code via YooKassa API
               --> display QR code in modal
               --> poll payment status every 3 seconds
               --> on success, redirect to billing page
     |
     v
YooKassa sends webhook --> POST /api/billing/webhook
     |
     v
Webhook handler:
  +-- Validate YooKassa signature
  +-- Find Payment record by externalId
  +-- Update Payment status to "succeeded"
  +-- Create/update Subscription (active, new period)
  +-- Update User: planId, minutesLimit, minutesUsed = 0
  +-- Save payment method ID for auto-renewal (card only)
```

### Plan Configuration

| Plan | Price | Minutes/Month | Max Clips/Video | Watermark | Storage |
|------|-------|--------------|----------------|-----------|---------|
| Free | 0 | 30 | 3 | Yes | 3 days |
| Start | 990 RUB/mo | 120 | 10 | No | 30 days |
| Pro | 2,990 RUB/mo | 1,000 | 100 | No | 90 days |
| Business | 9,990 RUB/mo | Unlimited | 100 | No | 90 days |

Prices are stored in kopecks (1 RUB = 100 kopecks). Extra minutes can be purchased at a per-minute rate.

### Extra Minutes Purchase

Users running low on minutes (fewer than 10 remaining) are shown a prompt on the billing page. They can purchase 30, 60, or 120 extra minutes as a one-time payment.

---

## 8. Auto-Renewal and Billing Lifecycle

The `billing-cron` worker runs on a recurring schedule and processes all expired subscriptions in batches of 100.

```
billing-cron job fires (scheduled via BullMQ repeatable)
     |
     v
Query: subscriptions WHERE currentPeriodEnd <= NOW and status IN (active, past_due)
     |
     v
For each expired subscription:
     |
     +-- Case 1: cancelAtPeriodEnd = true
     |     --> Downgrade to Free plan (reset minutes, update planId)
     |     --> Send "subscription downgraded" email
     |
     +-- Case 2: status = past_due (already failed before)
     |     |
     |     +-- Grace period expired (>= 7 days since past_due)?
     |     |     --> Downgrade to Free plan
     |     |     --> Send "subscription downgraded" email
     |     |
     |     +-- Within grace period?
     |           --> Send "renewal reminder" email (X days remaining)
     |
     +-- Case 3: Active subscription, period ended normally
           |
           +-- No saved payment method (SBP or first-time)?
           |     --> Mark as past_due
           |     --> Send "subscription expired" email
           |
           +-- Has saved card (payment method ID)?
                 |
                 v
           Attempt auto-renewal via YooKassa:
                 |
                 +-- Create local Payment record (idempotence key: renewal-{userId}-{planId}-{date})
                 +-- Call YooKassa recurring payment API
                 +-- Update Payment with real YooKassa ID
                 |
                 +-- Success? --> Webhook confirms --> renew subscription (new period)
                 +-- Failure? --> Mark past_due, send "payment failed" email
```

### Billing Lifecycle Diagram

```
+--------+     checkout      +---------+     period ends     +-----------+
|  Free  | ----------------> | Active  | ------------------> | Auto-     |
|  Plan  |                   |  Sub    |                     | Renewal   |
+--------+                   +---------+                     +-----+-----+
    ^                             |                                |
    |                        cancel (at                    +-------+------+
    |                        period end)                   |              |
    |                             |                   success         failure
    |                             v                        |              |
    |                      +-----------+              +----+----+   +-----+-----+
    |                      | Cancelling|              | Active  |   | Past Due  |
    |                      | (active   |              | (new    |   | (grace    |
    |                      |  until    |              |  period)|   |  7 days)  |
    |                      |  period   |              +---------+   +-----+-----+
    |                      |  end)     |                                  |
    |                      +-----+-----+                          grace period
    |                            |                                 expires
    |                       period ends                               |
    |                            |                                    v
    +----------------------------+-------------------+----------+-----+
                                                     | Expired  |
                                                     | (free)   |
                                                     +----------+
```

### Email Notifications

The billing system sends the following email notifications:

| Event | Email |
|-------|-------|
| Auto-renewal reminder | "Your subscription renews in X days" |
| Subscription expired (no payment method) | "Your subscription has expired" |
| Payment failed (auto-renewal error) | "Payment failed for your subscription" |
| Downgraded to Free | "Your subscription has been downgraded" |

---

## 9. LLM Router

The LLM Router is the central component that routes AI tasks to the optimal model based on task type, video length, subscription plan, and provider strategy (RU or Global).

### Four-Tier System

```
+---------------------------------------------------------------+
|                        LLM ROUTER                              |
|                                                                |
|  Input: task, video duration, plan, strategy (RU/Global)       |
|                                                                |
|  +-- TIER 0: MICRO (simple tasks) ---------+                  |
|  |   RU:     GigaChat3-10B (10 RUB/1M)     |                  |
|  |   Global: Gemini Flash Lite              |                  |
|  |   Tasks:  title generation, CTA          |                  |
|  +------------------------------------------+                  |
|                                                                |
|  +-- TIER 1: DEFAULT (primary) -------------+                  |
|  |   RU:     T-Pro 2.1 (35 RUB/1M)         |                  |
|  |   Global: Gemini 2.0 Flash              |                  |
|  |   Tasks:  moment selection, scoring      |                  |
|  +------------------------------------------+                  |
|                                                                |
|  +-- TIER 2: QUALITY (premium/retry) -------+                  |
|  |   RU:     Qwen3-235B (17-70 RUB/1M)     |                  |
|  |   Global: Claude Haiku 4.5              |                  |
|  |   Tasks:  business plan, quality retry   |                  |
|  +------------------------------------------+                  |
|                                                                |
|  +-- TIER 3: LONG CONTEXT (long videos) ----+                  |
|  |   RU:     GLM-4.6 (55 RUB/1M, 200K ctx) |                  |
|  |   Global: Gemini 2.5 Pro                |                  |
|  |   Tasks:  webinars > 2.5 hours           |                  |
|  +------------------------------------------+                  |
+---------------------------------------------------------------+
```

### Routing Logic

```
function selectTier(task, tokenCount, planId, previousScore):

  if task == "title_generation" or task == "cta_suggestion":
    return TIER_0                     // Micro: cheapest model

  if tokenCount > 100,000:
    return TIER_3                     // Long context model

  if planId == "business" or previousScore < 50:
    return TIER_2                     // Quality model

  return TIER_1                       // Default
```

### Fallback Chain

```
TIER_1 (T-Pro) --> error --> TIER_2 (Qwen3-235B) --> error --> throw (retry via BullMQ)
```

### BYOK Key Resolution

When a user provides their own API keys (BYOK), the router resolves keys in priority order:

1. Native BYOK key (e.g., user's Gemini key for Google provider).
2. OpenRouter BYOK key as fallback (routes any model through OpenRouter).
3. If BYOK key is rejected (401/403), falls back to server key automatically.

### Cost Tracking

- When using server keys: cost is calculated per token (input/output rates per model) and stored in kopecks.
- When using BYOK keys: cost is recorded as 0 (user pays the provider directly).
- Costs are tracked per video in the `usage_records` table.

---

## 10. Security and Encrypted API Keys

### Client-Side Encryption (BYOK)

The server never stores plaintext API keys. All user-provided keys are encrypted client-side using the Web Crypto API.

```
1. User enters API key in the browser

2. Browser:
   - Prompts for user password
   - PBKDF2(password, salt, 100K+ iterations) --> Master Key
   - AES-GCM 256-bit encrypt(Master Key, API key) --> Encrypted key
   - Stores encrypted key in IndexedDB

3. During video processing:
   - Browser decrypts key in memory
   - Sends key to backend in encrypted header
   - Backend: uses key for a single API call --> discards from memory

4. Auto-lock:
   - After 30 min of inactivity, Master Key is cleared from memory
   - Re-entering password is required to use keys again
```

### Encryption Technologies

| Component | Technology |
|-----------|-----------|
| Encryption | Web Crypto API (AES-GCM 256-bit) |
| Key derivation | PBKDF2 from user password (100K+ iterations) |
| Client storage | IndexedDB (browser) |
| Transport | HTTPS (TLS 1.3) |
| Auto-lock TTL | 30 minutes |

### Data Residency

| Strategy | Video Data | Transcripts | AI Processing |
|----------|-----------|-------------|--------------|
| RU (Cloud.ru) | Russian VPS | Russian VPS | Cloud.ru (within Russia) |
| Global | Russian VPS | US/EU (user consent) | Gemini/Claude/OpenAI |

### What the Server Never Does

- Stores plaintext API keys.
- Logs keys (even partially).
- Saves keys in localStorage or sessionStorage.
- Includes keys in error reports or analytics.

---

## 11. Queue System

All background work runs through BullMQ queues backed by Redis 7.

### Queue Architecture

```
             Redis 7 (BullMQ)
                   |
       +-----------+-----------+-----------+-----------+
       |           |           |           |           |
   [stt]       [llm-       [video-     [publish]   [billing-
               analyze]     render]                  cron]
       |           |           |           |           |
       v           v           v           v           v
   Whisper      LLM        FFmpeg      VK/Rutube/   Cron job
    API        Router      render      Dzen/TG     (scheduled)
```

### Worker Details

| Worker | File | Queue | Purpose |
|--------|------|-------|---------|
| STT | `stt.ts` | `stt` | Send audio to Whisper, save transcript |
| LLM Analyze | `llm-analyze.ts` | `llm-analyze` | Moment selection, virality scoring, titles |
| Video Render | `video-render.ts` | `video-render` | FFmpeg: trim, subtitles, resize |
| Publish | `publish.ts` | `publish` | Upload clips to platforms |
| Stats Collector | `stats-collector.ts` | cron (every 6h) | Collect views/likes from platforms |
| Billing Cron | `billing-cron.ts` | cron (scheduled) | Subscription renewal and period management |
| Download | `download.ts` | `download` | Download video from URL |

### Retry Policy

All workers share the same retry configuration:

```
attempts: 3
backoff:
  type: exponential
  delay: 30000  (30 sec, 1 min, 2 min)
```

### Job Priorities

| Priority | Jobs |
|----------|------|
| 1 (high) | Paid users (Start, Pro, Business plans) |
| 2 (medium) | Free plan users |
| 3 (low) | Stats collection, billing cron |

### Data Model Overview

```
User (1) ----< (N) Video
User (1) ----< (N) Clip
User (1) ----> (0..1) Subscription
User (1) ----< (N) Payment
User (1) ----< (N) PlatformConnection
User (N) >---- (0..1) Team
Team (1) ----< (N) TeamMember
Team (1) ----< (N) TeamInvite

Video (1) ----> (0..1) Transcript
Video (1) ----< (N) Clip

Clip (1) ----< (N) Publication
```

### Key Database Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | User accounts | email, plan_id, minutes_used, llm_provider_preference |
| `videos` | Uploaded videos | user_id, status, duration_seconds, file_path |
| `transcripts` | Transcripts | video_id, segments (JSON), full_text, stt_model |
| `clips` | Generated clips | video_id, virality_score (JSON), file_path, status |
| `publications` | Platform posts | clip_id, platform, status, platform_url, views, likes |
| `subscriptions` | Subscriptions | user_id, plan_id, status, current_period_end |
| `payments` | Payment records | user_id, amount, status, payment_method, external_id |
| `platform_connections` | Connected platforms | user_id, platform, access_token_encrypted |
| `teams` | Teams | name, owner_id |
| `team_members` | Team members | team_id, user_id, role |
| `team_invites` | Pending invites | team_id, email, token, role, expires_at |
| `usage_records` | Usage tracking | user_id, minutes_consumed, llm_cost_kopecks |

---

## Dev vs Production Environment Differences

This section documents the architectural differences between development and production environments.

### Architecture Comparison

| Layer | Development | Production |
|-------|-------------|------------|
| **S3 Access** | Proxy layer via `/api/clips/` routes -- Next.js API fetches from MinIO and streams to browser | Direct presigned URLs -- browser downloads from S3 without touching the app server |
| **Email Adapter** | Ethereal Mail -- fake SMTP that captures emails and provides preview URLs | Real SMTP transport -- emails delivered to actual inboxes |
| **Prisma Client** | Cached on `globalThis` to survive Next.js hot-reload without exhausting DB connections | Fresh instance per request -- standard production lifecycle |
| **Cookie Security** | `secure: false` (HTTP on localhost), `secure: true` in Codespaces (HTTPS) | `secure: true` always (HTTPS enforced via nginx + Let's Encrypt) |
| **Logging Pipeline** | `pino-pretty` formatter -- colorized, human-readable console output | JSON format -- structured logs for aggregation (Loki, ELK, Datadog) |
| **DB Log Level** | `query` + `error` + `warn` -- all SQL queries visible for debugging | `error` only -- minimal logging for performance |
| **Platform OAuth** | Dev-mode simulation -- fake connections without real OAuth redirects | Real OAuth flows with VK and Yandex |
| **Email Verification** | Auto-verified on registration | Real verification via emailed link |
| **Payments** | Non-functional without YooKassa credentials | Full YooKassa integration |

### S3 Proxy Layer (Development Only)

In development, MinIO is not accessible from the browser (it runs inside the Docker network). To serve clip files, an API proxy layer intercepts requests:

```
Browser --> GET /api/clips/:clipId/stream
              |
              v
         Next.js API Route
              |
              v
         S3 Client --> MinIO (http://minio:9000)
              |
              v
         Stream response back to browser
```

In production, this proxy is bypassed. The tRPC procedure generates a presigned S3 URL and the browser downloads directly:

```
Browser --> tRPC: clip.getDownloadUrl
              |
              v
         S3 Client generates presigned URL
              |
              v
         Browser --> GET https://s3.cloud.ru/clipmaker/clips/.../clip.mp4
                     (direct download, no app server involvement)
```

The `NEXT_PUBLIC_USE_S3_PROXY` environment variable controls which path is used.

### Ethereal Email Adapter

In development, the email module detects `NODE_ENV === 'development'` and uses Ethereal Mail:

```
Worker (billing-cron, etc.)
  |
  v
email.send({ to, subject, html })
  |
  +-- [development] --> Ethereal transport --> console.log(previewUrl)
  |
  +-- [production]  --> SMTP transport --> real delivery
```

Ethereal credentials are auto-generated at startup. No SMTP configuration is needed.

### globalThis Prisma Caching

In development, Next.js hot-reload destroys and recreates modules. Without caching, every reload would create a new Prisma client and open a new connection pool, quickly exhausting database connections. The workaround:

```typescript
// Development: reuse client across hot-reloads
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ['query', 'error', 'warn'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

In production, a fresh `PrismaClient` is instantiated with `log: ['error']` only.

### Cookie Security

| Setting | Development (localhost) | Development (Codespaces) | Production |
|---------|------------------------|--------------------------|------------|
| `secure` | `false` | `true` | `true` |
| `sameSite` | `lax` | `lax` | `lax` |
| `httpOnly` | `true` | `true` | `true` |
| Protocol | HTTP | HTTPS (Codespaces proxy) | HTTPS (nginx + Let's Encrypt) |

The `secure` flag is set based on whether the environment uses HTTPS. Codespaces provides HTTPS via its port-forwarding proxy, so cookies are marked secure there as well.
