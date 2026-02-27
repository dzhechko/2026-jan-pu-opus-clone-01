# ClipMaker Administration Guide

## Table of Contents

1. [Administration Overview](#1-administration-overview)
2. [System Monitoring](#2-system-monitoring)
3. [User Management](#3-user-management)
4. [Plan Management](#4-plan-management)
5. [Subscription Lifecycle](#5-subscription-lifecycle)
6. [Auto-Renewal Flow](#6-auto-renewal-flow)
7. [Queue Management](#7-queue-management)
8. [Platform OAuth Setup](#8-platform-oauth-setup)
9. [Email Notifications](#9-email-notifications)
10. [S3 Storage Management](#10-s3-storage-management)
11. [Backup Strategy](#11-backup-strategy)
12. [Troubleshooting Common Issues](#12-troubleshooting-common-issues)

---

## 1. Administration Overview

ClipMaker does not include a built-in admin panel in the MVP. All administrative tasks are performed through command-line tools:

| Tool | Purpose |
|------|---------|
| `psql` / Prisma Studio | Database queries and data management |
| Docker Compose CLI | Container lifecycle management |
| Redis CLI | Queue monitoring and management |
| BullMQ Bull Board | Visual queue dashboard (at `/admin/queues` if enabled) |
| nginx logs | Traffic analysis and debugging |
| System utilities | CPU, RAM, disk monitoring |

### Quick Start

```bash
cd /opt/clipmaker

# Check status of all services
docker compose -f docker-compose.prod.yml ps

# View recent logs across all services
docker compose -f docker-compose.prod.yml logs --tail 20

# Connect to the database
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U clipmaker clipmaker
```

---

## 2. System Monitoring

### 2.1. Container Resource Usage

```bash
# Snapshot of resource consumption
docker stats --no-stream

# Example output:
# CONTAINER      CPU%   MEM USAGE / LIMIT   NET I/O
# web            2.5%   450MiB / 2GiB       5MB / 2MB
# worker-video   45%    1.2GiB / 4GiB       100MB / 50MB
# postgres       1.0%   300MiB / 2GiB       1MB / 500KB
# redis          0.5%   50MiB / 512MiB      200KB / 100KB
```

### 2.2. PostgreSQL Monitoring

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U clipmaker clipmaker
```

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Database size
SELECT pg_size_pretty(pg_database_size('clipmaker'));

-- Largest tables
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

-- Long-running queries (> 5 seconds)
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
AND state != 'idle';

-- Videos by status
SELECT status, count(*) FROM videos GROUP BY status;

-- Clips by status
SELECT status, count(*) FROM clips GROUP BY status;
```

### 2.3. Redis and Queue Monitoring

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli
```

```
# General info
INFO memory
INFO clients
INFO stats

# Waiting jobs per queue
LLEN bull:stt:wait
LLEN bull:llm-analyze:wait
LLEN bull:video-render:wait
LLEN bull:publish:wait
LLEN bull:billing-cron:wait

# Active jobs
LLEN bull:stt:active
LLEN bull:video-render:active

# Failed jobs
ZCARD bull:stt:failed
ZCARD bull:video-render:failed
```

### 2.4. Disk Space

```bash
# Overall disk usage
df -h /

# Docker volume sizes
docker system df
docker system df -v | head -30

# Clean up unused Docker data
docker system prune -f
```

### 2.5. Recommended Alerts

Set up monitoring notifications (via cron scripts to email or Telegram) for:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| CPU > 80% | 5 minutes sustained | Investigate worker-video load |
| RAM > 90% | Immediate | Increase RAM or container limits |
| Disk > 85% | Immediate | Clean S3 / old backups |
| Container crash | Immediate | Check logs, restart |
| Queue > 100 jobs | 10 minutes | Scale up workers |
| 5xx errors > 10/min | 5 minutes | Check web application logs |

---

## 3. User Management

### 3.1. Viewing Users

```sql
-- Recent users
SELECT id, email, plan_id, minutes_used, minutes_limit,
       llm_provider_preference, created_at
FROM users ORDER BY created_at DESC LIMIT 20;

-- Users by plan
SELECT plan_id, count(*) as user_count
FROM users GROUP BY plan_id;

-- Active users (uploaded a video in the last 30 days)
SELECT u.email, u.plan_id, count(v.id) as videos_count
FROM users u
JOIN videos v ON v.user_id = u.id
WHERE v.created_at > now() - interval '30 days'
GROUP BY u.email, u.plan_id
ORDER BY videos_count DESC;
```

### 3.2. Manually Changing a User's Plan

```sql
-- Upgrade to Pro plan
UPDATE users
SET plan_id = 'pro',
    minutes_limit = 1000,
    minutes_used = 0,
    billing_period_start = now()
WHERE email = 'user@example.com';
```

### 3.3. Resetting Used Minutes

```sql
-- Reset minutes for a specific user
UPDATE users SET minutes_used = 0 WHERE email = 'user@example.com';
```

**Note:** Do not manually perform bulk resets if the `billing-cron` worker is running -- it handles periodic resets automatically.

### 3.4. Blocking a User

In the current version, blocking is achieved by setting the minute limit to zero:

```sql
UPDATE users
SET minutes_limit = 0, plan_id = 'free'
WHERE email = 'abuser@example.com';
```

### 3.5. Deleting a User

```sql
-- WARNING: cascading delete (videos, clips, subscriptions, publications)
DELETE FROM users WHERE email = 'user@example.com';
```

Files in S3 must be deleted separately (see Section 10).

---

## 4. Plan Management

### Pricing Tiers

| Plan | Price (RUB/mo) | Minutes/Month | Clips/Video | Watermark | Auto-posting | Storage |
|------|----------------|---------------|-------------|-----------|--------------|---------|
| Free | 0 | 30 | 3 | Yes | None | 3 days |
| Start | 990 | 120 | 10 | No | VK | 30 days |
| Pro | 2,990 | 1,000 | 100 | No | VK, Rutube, Dzen, Telegram | 90 days |
| Business | 9,990 | Unlimited | 100 | No | VK, Rutube, Dzen, Telegram | 90 days |

Extra minutes: 15 RUB/min (available on Start and above).

### Plan Configuration in Code

Plans are defined in `packages/types/src/billing.ts` as the `PLAN_CONFIG` constant. To change plan parameters (price, limits, features), update this file and redeploy.

```typescript
// packages/types/src/billing.ts
export const PLAN_CONFIG: Record<PlanId, PlanDefinition> = {
  free:     { price: 0,      minutesLimit: 30,    maxClips: 3,   watermark: true,  storageDays: 3  },
  start:    { price: 99000,  minutesLimit: 120,   maxClips: 10,  watermark: false, storageDays: 30 },
  pro:      { price: 299000, minutesLimit: 1000,  maxClips: 100, watermark: false, storageDays: 90 },
  business: { price: 999000, minutesLimit: 99999, maxClips: 100, watermark: false, storageDays: 90 },
};
```

Prices are in kopecks (99000 = 990 RUB).

---

## 5. Subscription Lifecycle

Subscriptions follow a defined state machine:

```
active --> past_due --> expired --> (user on free plan)
active --> cancelled (at period end) --> expired --> (user on free plan)
```

### Status Definitions

| Status | Meaning |
|--------|---------|
| `active` | Subscription is current and paid. User has full plan benefits. |
| `past_due` | Billing period has ended but payment has not been received. Grace period begins (7 days). |
| `expired` | Grace period exhausted or subscription cancelled. User is downgraded to free plan. |
| `cancelled` | User requested cancellation. Remains active until the end of the current billing period, then transitions to expired. |

### Viewing Subscriptions

```sql
-- Active subscriptions
SELECT u.email, s.plan_id, s.status,
       s.current_period_start, s.current_period_end,
       s.cancel_at_period_end
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.status = 'active'
ORDER BY s.current_period_end;

-- Subscriptions expiring within 7 days
SELECT u.email, s.plan_id, s.current_period_end
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.status = 'active'
AND s.current_period_end < now() + interval '7 days';
```

### Viewing Payments

```sql
-- Recent payments
SELECT p.id, u.email, p.amount / 100 as amount_rub, p.status,
       p.payment_method, p.type, p.created_at
FROM payments p
JOIN users u ON u.id = p.user_id
ORDER BY p.created_at DESC LIMIT 20;

-- Monthly revenue
SELECT sum(amount) / 100 as revenue_rub,
       count(*) as payments_count
FROM payments
WHERE status = 'succeeded'
AND created_at >= date_trunc('month', now());
```

### Manual Refund Process

Refunds are processed through the YooKassa dashboard or API. After issuing a refund:

```sql
-- Cancel the subscription
UPDATE subscriptions
SET status = 'cancelled'
WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');

-- Downgrade to free plan
UPDATE users
SET plan_id = 'free', minutes_limit = 30, minutes_used = 0
WHERE email = 'user@example.com';
```

---

## 6. Auto-Renewal Flow

The `billing-cron` worker runs daily (as a repeatable BullMQ job) and handles the complete subscription renewal lifecycle.

### How It Works

1. **Active subscriptions past their period end** are processed in batches of 100.
2. For each expired subscription, the worker determines the next action:

| Scenario | Action |
|----------|--------|
| User cancelled (`cancel_at_period_end = true`) | Downgrade to free plan. Send "subscription ended" email. |
| No saved payment method | Mark as `past_due`. Send "subscription expired" email. |
| Has saved payment method | Attempt auto-renewal via YooKassa API. |
| Auto-renewal succeeds | YooKassa webhook updates subscription (new period). |
| Auto-renewal fails | Mark as `past_due`. Send "payment failed" email. |
| Already `past_due` within 7-day grace | Send renewal reminder email with days remaining. |
| Grace period expired (7+ days in `past_due`) | Downgrade to free plan. Send "downgraded" email. |

### Grace Period

The grace period is **7 days**. During this time:
- The user retains their paid plan features.
- Daily reminder emails are sent with the number of days remaining.
- If payment is received (manual or retry), the subscription returns to `active`.

### Monitoring the Billing Worker

```bash
# Check billing-cron logs
docker compose -f docker-compose.prod.yml logs worker-billing-cron --tail 50

# Look for specific events
docker compose -f docker-compose.prod.yml logs worker-billing-cron 2>&1 | \
  grep "billing_cron\|auto_renewal\|past_due\|downgrade"
```

---

## 7. Queue Management

### Architecture

```
                     Redis (BullMQ)
                          |
      +-------------------+-------------------+
      |                   |                   |
 stt queue          llm-analyze         video-render
 (transcription)    (AI analysis)       (FFmpeg)
                                              |
                                        publish queue
                                        (auto-posting)
```

### Retrying Failed Jobs

```bash
# The simplest approach is to restart the relevant worker
docker compose -f docker-compose.prod.yml restart worker-stt
```

### Clearing Stuck Active Jobs

If jobs are stuck in `active` state (usually after a worker crash):

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli
DEL bull:stt:active
DEL bull:video-render:active

# Restart workers to pick up stalled jobs
docker compose -f docker-compose.prod.yml restart worker-stt worker-video
```

### Flushing All Queues (Emergency Only)

```bash
# WARNING: This deletes ALL pending jobs across all queues
docker compose -f docker-compose.prod.yml exec redis redis-cli FLUSHDB
```

---

## 8. Platform OAuth Setup

### VK OAuth (VK ID)

1. Go to [VK Developer](https://dev.vk.com/) and create an application.
2. Set the application type to "Website".
3. Configure the redirect URI: `https://clipmaker.example.com/api/auth/callback/vk`
4. Obtain the Client ID and Client Secret.
5. Set in `.env`:

```bash
VK_CLIENT_ID=12345678
VK_CLIENT_SECRET=your_vk_client_secret
```

**Required VK scopes:** `video`, `wall`, `offline`

### VK Publishing (User Connections)

Users connect their own VK accounts for auto-posting through Settings > Platforms. The OAuth flow:

1. User clicks "Connect VK" in the platform settings.
2. Redirected to VK OAuth consent screen.
3. Upon approval, access and refresh tokens are encrypted server-side and stored in the `platform_connections` table.
4. Tokens are used by the `worker-publish` to upload clips to VK Clips.

### Yandex / Dzen (Zen) Publishing

Dzen publishing uses the Yandex Publisher API. Users authenticate through Yandex OAuth:

1. Register an application at [Yandex OAuth](https://oauth.yandex.ru/).
2. Configure the redirect URI.
3. Users connect through the platform settings page.

### Telegram Publishing

Telegram publishing uses the Bot API:

1. Create a bot via [@BotFather](https://t.me/BotFather).
2. Users provide their bot token and channel ID in Settings > Platforms.
3. The bot must be an administrator in the target channel.

---

## 9. Email Notifications

### Email Templates

ClipMaker sends the following transactional emails:

| Email | Trigger | Template |
|-------|---------|----------|
| Email verification | User registers | Verification link (valid 24 hours) |
| Password reset | User requests reset | Reset link (valid 1 hour) |
| Subscription renewal reminder | Billing period approaching end | Days remaining, renewal link |
| Subscription expired | Billing period ended, no payment | Plan details, payment link |
| Subscription downgraded | Grace period expired | Notification of free plan |
| Payment failed | Auto-renewal attempt failed | Retry instructions |
| Team invite | Team owner invites a member | Invite link with team name |

### SMTP vs Ethereal (Development Mode)

| Environment | Transport | Behavior |
|-------------|-----------|----------|
| `NODE_ENV=production` | SMTP (configured in `.env`) | Emails are delivered to real inboxes |
| `NODE_ENV=development` | Ethereal Mail | Emails are captured but not delivered. View at the Ethereal URL logged to console |

### Email Implementation

Emails are sent from the worker process (`apps/worker/lib/email.ts`). The billing-cron worker wraps all email calls in a safe wrapper -- email failures never break the billing flow.

### Verifying Email Delivery

```bash
# Check for email-related events in logs
docker compose -f docker-compose.prod.yml logs web 2>&1 | grep "email"
docker compose -f docker-compose.prod.yml logs worker-billing-cron 2>&1 | grep "email"
```

---

## 10. S3 Storage Management

### Retention Policy

| Data Type | Free Plan | Start Plan | Pro / Business |
|-----------|-----------|------------|----------------|
| Source videos | 3 days | 30 days | 90 days |
| Rendered clips | 3 days | 30 days | 90 days |
| Thumbnails | With clips | With clips | With clips |

### Monitoring Storage Usage

```sql
-- Storage consumption by user
SELECT u.email, u.plan_id,
       count(v.id) as videos,
       pg_size_pretty(coalesce(sum(v.file_size), 0)::bigint) as total_size
FROM users u
LEFT JOIN videos v ON v.user_id = u.id
GROUP BY u.email, u.plan_id
ORDER BY coalesce(sum(v.file_size), 0) DESC
LIMIT 20;
```

### Cleanup Script

Create `/opt/clipmaker/scripts/cleanup-storage.sh` to remove expired files:

```bash
#!/bin/bash

# Find videos from free-plan users older than 3 days
docker compose -f /opt/clipmaker/docker-compose.prod.yml exec -T postgres \
  psql -U clipmaker clipmaker -c "
    SELECT v.file_path, v.id
    FROM videos v
    JOIN users u ON u.id = v.user_id
    WHERE u.plan_id = 'free'
    AND v.created_at < now() - interval '3 days';
  "

# Delete via S3 CLI (using aws cli or s3cmd)
# aws s3 rm s3://clipmaker/videos/<video-id>/ --recursive
```

Alternatively, configure S3 Lifecycle Rules on the bucket to automatically expire objects based on age.

---

## 11. Backup Strategy

### Daily Automated Backups

- **What:** Full PostgreSQL dump (compressed with gzip).
- **When:** Daily at 03:00 server time (via cron).
- **Retention:** 30 days of daily backups.
- **Storage:** Local disk and optionally copied to a separate S3 bucket.

### Backup Verification

Monthly (at minimum), test restoring from a backup on a separate environment:

```bash
# Create a test database
docker compose -f docker-compose.prod.yml exec postgres \
  createdb -U clipmaker clipmaker_test

# Restore backup
gunzip < backups/clipmaker_LATEST.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U clipmaker clipmaker_test

# Verify
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U clipmaker clipmaker_test -c "SELECT count(*) FROM users;"

# Clean up
docker compose -f docker-compose.prod.yml exec postgres \
  dropdb -U clipmaker clipmaker_test
```

### What Is NOT Backed Up

- S3 video and clip files (rely on S3 durability; enable versioning for critical data).
- Redis data (transient by design -- queues are rebuilt on restart).

---

## 12. Troubleshooting Common Issues

### Video Stuck in "Processing" State

```sql
-- Find stuck videos (status not completed/failed for > 15 minutes)
SELECT id, title, status, updated_at
FROM videos
WHERE status NOT IN ('completed', 'failed')
AND updated_at < now() - interval '15 minutes';

-- Manually reset to failed (user can retry)
UPDATE videos SET status = 'failed' WHERE id = '<video-id>';
```

### Subscription Not Activating After Payment

```bash
# Check webhook logs
docker compose -f docker-compose.prod.yml logs web 2>&1 | grep "webhook\|yookassa"

# Verify the payment status in the database
```
```sql
SELECT p.external_id, p.status, p.amount, p.created_at
FROM payments p
WHERE p.user_id = (SELECT id FROM users WHERE email = 'user@example.com')
ORDER BY p.created_at DESC LIMIT 5;
```

Common causes: webhook URL misconfigured in YooKassa dashboard, or the webhook endpoint is not publicly accessible.

### High CPU Usage from worker-video

FFmpeg rendering is CPU-intensive. If CPU is consistently above 80%:

1. Scale video workers: `docker compose up -d --scale worker-video=N`
2. Increase VPS CPU allocation.
3. Check for stuck rendering jobs that never complete.

### Redis Out of Memory

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO memory

# If used_memory approaches maxmemory:
# 1. Increase maxmemory in Redis configuration
# 2. Check for abnormally large queue backlogs
# 3. As a last resort: FLUSHDB (loses all pending jobs)
```

### VK Publishing Fails Repeatedly

```sql
-- Check recent failed publications
SELECT p.id, p.platform, p.status, p.error_message, p.created_at
FROM publications p
WHERE p.platform = 'vk' AND p.status = 'failed'
ORDER BY p.created_at DESC LIMIT 10;
```

Common causes:
- VK access token expired (user needs to reconnect).
- VK rate limit (5 requests/second).
- Video format not accepted by VK.

### API Key Check

```bash
# Verify Cloud.ru API connectivity
curl -s https://foundation-models.api.cloud.ru/v1/models \
  -H "Authorization: Bearer $CLOUDRU_API_KEY" | head -50

# Check environment variables in containers (masked)
docker compose -f docker-compose.prod.yml exec web \
  printenv | grep -E "CLOUDRU|GEMINI|ANTHROPIC|OPENAI|YOOKASSA" | sed 's/=.*/=***/'
```

---

## Dev vs Production Environment Differences

The following differences are relevant for administrators monitoring and debugging ClipMaker.

### Admin-Relevant Comparison

| Area | Development | Production |
|------|-------------|------------|
| **Log Format** | `pino-pretty` -- colorized, human-readable output in the terminal | JSON -- structured logs designed for aggregation tools (Loki, ELK, Datadog) |
| **DB Logging** | `query` + `error` + `warn` -- every SQL query is logged, useful for debugging slow queries and ORM issues | `error` only -- minimal logging to reduce noise and disk usage |
| **Email Transport** | Ethereal Mail (fake SMTP) -- no real delivery; preview URLs are printed to the console | Real SMTP delivery via configured `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` |
| **Worker Emails** | `console.log` output only -- billing-cron and other workers log email content instead of sending | Full SMTP delivery -- emails are sent to real inboxes |
| **Payments (YooKassa)** | Non-functional without `YOOKASSA_SHOP_ID` and `YOOKASSA_SECRET_KEY` -- checkout calls will fail or return errors | Full payment processing through YooKassa with real money |
| **Prisma Client** | Cached on `globalThis` to survive Next.js hot-reload -- prevents connection pool exhaustion during development | Fresh instance per request -- standard production behavior |
| **NODE_ENV** | `development` | `production` |

### Monitoring Logs in Dev vs Prod

**Development (pino-pretty):**

Logs are colorized and formatted for human reading. You will see output like:

```
[12:34:56] INFO: Video uploaded { videoId: "abc-123", userId: "user-1" }
[12:34:57] WARN: Rate limit approaching { userId: "user-1", remaining: 5 }
[12:34:58] INFO: SELECT "users".* FROM "users" WHERE "id" = $1
```

All SQL queries appear in the log stream when `DB_LOG_LEVEL` includes `query`.

**Production (JSON):**

Logs are structured JSON, one object per line, suitable for log aggregation:

```json
{"level":30,"time":1706000000000,"msg":"Video uploaded","videoId":"abc-123","userId":"user-1"}
{"level":40,"time":1706000001000,"msg":"Rate limit approaching","userId":"user-1","remaining":5}
```

SQL queries are not logged in production (only errors).

### Email Testing with Ethereal

In development, every email the system attempts to send is captured by Ethereal Mail. The worker logs include a preview URL:

```
Email sent (dev mode): https://ethereal.email/message/AbCdEf123456
```

Open this URL in a browser to inspect the email content, HTML layout, and headers. This is useful for verifying:
- Verification emails and their token links.
- Password reset email formatting.
- Billing notification emails (renewal reminders, payment failures, downgrade notices).

No SMTP configuration is required in development -- Ethereal credentials are generated automatically.

### Payment Testing

In development, YooKassa is non-functional unless you explicitly set `YOOKASSA_SHOP_ID` and `YOOKASSA_SECRET_KEY` in `.env`. Without these values:
- Clicking "Upgrade" on the billing page will return an error.
- Webhook processing will fail (no shop ID to validate against).
- Subscription lifecycle testing requires a YooKassa test shop.

To test payments in development, create a YooKassa test shop at [yookassa.ru](https://yookassa.ru/) and use test card numbers provided in their documentation.

### Database Debugging

In development, verbose SQL logging makes it easy to identify:
- N+1 query patterns (repeated identical queries in sequence).
- Slow queries (compare timestamps between log entries).
- Incorrect Prisma queries (see the exact SQL being generated).

In production, enable temporary SQL logging by setting `DATABASE_LOG_LEVELS=query,error,warn` in `.env` and restarting the web container. Remember to revert this change after debugging to avoid performance impact.
