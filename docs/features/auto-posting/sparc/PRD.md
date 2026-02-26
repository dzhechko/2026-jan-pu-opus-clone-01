# PRD: Auto-Posting (US-08)

## Executive Summary

Auto-posting enables КлипМейкер users to publish rendered clips directly to VK Клипы, Rutube, Дзен, and Telegram without manual upload. This is the product's key differentiator — no competing AI clipping tool supports native Russian platform publishing.

## Problem

Content creators spend 15-30 minutes per clip manually uploading to each platform. With 10 clips per video across 4 platforms, that's 2.5-5 hours of repetitive work. Foreign tools (Opus Clip, Vidyo.ai) don't support Russian platforms at all.

## Solution

One-click or scheduled multi-platform publishing from the КлипМейкер dashboard. Users connect platforms via OAuth/token, select clips, choose platforms, and the system handles upload, metadata, and retry logic automatically.

## Target Users

- Online course creators (GetCourse ecosystem)
- SMM managers managing multiple platforms
- Content agencies producing short-form video

## Core Features (MVP)

1. **Platform Connection** — OAuth for VK and Дзен; token-based for Rutube and Telegram
2. **Instant Publish** — One-click publish to 1-4 platforms simultaneously
3. **Scheduled Publish** — Set date/time for future publication (min 5 min ahead)
4. **Auto-Retry** — 3 retries with exponential backoff (5/15/60 min) on API errors
5. **Publication Status** — Status tracking: scheduled → publishing → published/failed/cancelled
6. **Stats Sync** — Views/likes/shares collection every 6 hours (VK, Rutube, Дзен; not Telegram)

## Plan-Based Access

| Plan | Platforms |
|------|-----------|
| Free | None |
| Start | VK only |
| Pro | VK, Rutube, Дзен, Telegram |
| Business | VK, Rutube, Дзен, Telegram |

## Success Criteria

- Publish to VK within 60s of user action (excluding large file upload time)
- 95%+ success rate on first publish attempt
- Per-platform file limits: VK 256MB, Telegram 50MB, Дзен 4GB, Rutube 10GB
- Stats sync within 6 hours of publication (VK, Rutube, Дзен)

## Technical Context

- Platform: Web (Next.js 15)
- Queue: BullMQ on Redis
- Workers: apps/worker (publish, stats-collector)
- Storage: S3-compatible (clip files)
- Auth: OAuth 2.0 (VK, Дзен via Yandex ID), API tokens (Rutube, Telegram)
- Encryption: AES-GCM for stored tokens (passed through server, never stored plaintext)

## Constraints

- VK API rate limit: 5 req/sec
- Rutube upload size limit: 10GB
- Telegram Bot API video limit: 50MB
- Platform OAuth tokens expire and need refresh
- 152-ФЗ: video data stays on Russian VPS
