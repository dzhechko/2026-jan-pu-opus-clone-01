# Research Findings: Auto-Posting

## Platform API Research

### VK API (Clips / Video)

**Auth:** OAuth 2.0 with `video` + `wall` scopes
**Upload Flow:**
1. `video.save()` → returns `upload_url`, `owner_id`, `video_id`
2. POST file to `upload_url` (multipart/form-data)
3. Video processing is async (VK side)
4. `video.get()` to check processing status

**Clips:** VK Клипы are regular VK videos with `is_short=1` parameter
**Rate Limits:** 5 requests/sec, 100,000 requests/day
**Max File:** 256MB for clips
**Stats:** `video.get()` returns `views`, `likes`, `reposts`, `comments`
**Token Refresh:** VK tokens have configurable expiry (up to "offline" = no expiry)

### Rutube API

**Auth:** OAuth 2.0 or API token
**Upload Flow:**
1. POST `/api/video/` with metadata → returns `video_id`
2. PUT `/api/video/{video_id}/upload/` with file (resumable upload supported)
3. Video processing is async
4. GET `/api/video/{video_id}/` to check status

**Shorts:** `is_short=true` parameter in metadata
**Rate Limits:** Not documented publicly, conservative 2 req/sec recommended
**Max File:** 10GB
**Stats:** GET `/api/video/{video_id}/` returns `hits` (views), no likes API
**Token:** Long-lived API tokens, manual rotation

### Яндекс Дзен API

**Auth:** OAuth 2.0 via Yandex ID
**Upload Flow:**
1. Дзен uses the Yandex WebDAV-like upload for publisher accounts
2. POST to Zen Studio API with video metadata
3. Upload via multipart or resumable upload
4. Publishing requires explicit `publish` call after upload

**Shorts:** Дзен Shorts (vertical video ≤60s) via same API
**Rate Limits:** Undocumented, 1 req/sec safe
**Stats:** Publisher API returns views, likes, comments, watch_time
**Token:** Yandex OAuth tokens, refresh supported

### Telegram Bot API

**Auth:** Bot token (from @BotFather)
**Upload Flow:**
1. `sendVideo` method with `chat_id` (channel) + video file
2. Max 50MB via Bot API (or 2GB via local Bot API server)
3. Returns `message_id` as `platformPostId`

**Rate Limits:** 30 messages/sec to same chat, 20 messages/min to same group
**Stats:** No direct video stats API. `getChat` → member count only.
**Token:** Bot tokens don't expire, but user must add bot as channel admin

## Competitor Analysis

| Feature | КлипМейкер | Opus Clip | Vidyo.ai | Pictory |
|---------|-----------|-----------|----------|---------|
| VK Клипы | ✅ | ❌ | ❌ | ❌ |
| Rutube | ✅ | ❌ | ❌ | ❌ |
| Дзен | ✅ | ❌ | ❌ | ❌ |
| Telegram | ✅ | ❌ | ❌ | ❌ |
| YouTube | ❌ (future) | ✅ | ✅ | ✅ |
| TikTok | ❌ (future) | ✅ | ✅ | ✅ |
| Scheduling | ✅ | ✅ | ❌ | ❌ |
| Multi-platform | ✅ | ❌ | ❌ | ❌ |

## Token Storage Research

Per project security rules:
- API keys encrypted client-side (AES-GCM, IndexedDB)
- Server pass-through only (never stores plaintext)
- For auto-posting: tokens are passed encrypted in job data
- Worker decrypts in-memory before API call

**Decision:** For OAuth tokens (VK, Дзен), server stores encrypted tokens in `PlatformConnection.accessTokenEncrypted`. Encryption key derived from server-side secret (not user password), since tokens need to be used by background workers without user presence.

**Important distinction:** Platform OAuth tokens (for publishing) differ from user-provided API keys (for LLM BYOK). Platform tokens are obtained via OAuth flow managed by the server, so server-side encryption is appropriate. User API keys follow the client-side encryption pattern.

## Rate Limiting Strategy

| Platform | API Limit | Our Limit | Rationale |
|----------|-----------|-----------|-----------|
| VK | 5 req/s | 2 req/s | Safety margin, shared across users |
| Rutube | ~2 req/s | 1 req/s | Conservative, undocumented |
| Дзен | ~1 req/s | 0.5 req/s | Most restrictive |
| Telegram | 30 msg/s | 5 msg/s | Per-channel, not per-bot |

Worker concurrency: 2 (already configured in publish worker)
Per-platform rate limiter in BullMQ: `{ max: 2, duration: 1000 }` (2 req/sec)
