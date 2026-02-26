# Specification: Auto-Posting

## User Stories

### US-AP-01: Connect VK Account
**As a** content creator on Start/Pro/Business plan,
**I want to** connect my VK account for publishing,
**So that** I can publish clips directly to VK Клипы.

**Acceptance Criteria:**
- AC1: "Подключить VK" button visible in Settings > Integrations
- AC2: Clicking initiates VK OAuth with `video` and `wall` scopes
- AC3: On success, PlatformConnection record created with encrypted token
- AC4: UI shows connected VK account name and avatar
- AC5: Free plan users see upgrade prompt instead of connect button

### US-AP-02: Connect Rutube Account
**As a** content creator on Pro/Business plan,
**I want to** connect my Rutube account,
**So that** I can publish clips to Rutube.

**Acceptance Criteria:**
- AC1: "Подключить Rutube" button visible for Pro/Business plans
- AC2: User enters API token (manual input, not OAuth)
- AC3: System validates token by calling Rutube API
- AC4: Token stored encrypted in PlatformConnection
- AC5: UI shows connection status

### US-AP-03: Connect Дзен Account
**As a** content creator on Pro/Business plan,
**I want to** connect my Дзен (Yandex) account,
**So that** I can publish clips to Дзен.

**Acceptance Criteria:**
- AC1: "Подключить Дзен" button visible for Pro/Business plans
- AC2: Clicking initiates Yandex OAuth with `zen:write` and `zen:read` scopes
- AC3: Access token and refresh token stored encrypted in PlatformConnection
- AC4: UI shows connected publisher name from Yandex API
- AC5: Token auto-refreshed via refresh_token when expired

### US-AP-04: Connect Telegram Channel
**As a** content creator on Pro/Business plan,
**I want to** connect my Telegram channel,
**So that** I can publish clips to Telegram.

**Acceptance Criteria:**
- AC1: "Подключить Telegram" button visible for Pro/Business plans
- AC2: User enters bot token (from @BotFather) and channel ID (format: `@channelname` or `-100XXXXXXXXXX` for private channels)
- AC3: System validates bot via `getMe` and channel access via `getChat` API; shows error "Бот не является админом канала" if bot has no admin rights
- AC4: Bot token stored encrypted in PlatformConnection
- AC5: Channel name and username displayed in UI
- AC6: Helper text explains how to get bot token and channel ID

### US-AP-05: Publish Clip Instantly
**As a** content creator with connected platforms,
**I want to** publish a clip to selected platforms with one click,
**So that** I save time on manual uploads.

**Acceptance Criteria:**
- AC1: "Опубликовать" button on clip card shows connected platforms
- AC2: User selects 1-4 platforms and clicks publish
- AC3: Publication records created, jobs enqueued
- AC4: Status shows "Публикация..." → "Опубликовано" with platform links
- AC5: On failure after 3 retries, status shows "Ошибка" with retry button
- AC6: Cannot publish if clip status is not "ready"

### US-AP-06: Schedule Publication
**As a** content creator,
**I want to** schedule clip publication for a future date/time,
**So that** I can plan my content calendar.

**Acceptance Criteria:**
- AC1: "Запланировать" option in publish flow
- AC2: Date/time picker in user's timezone
- AC3: Minimum 5 minutes in the future
- AC4: Status shows "Запланировано на DD.MM.YYYY HH:MM"
- AC5: User can cancel scheduled publication before it fires
- AC6: Publication fires within 1 minute of scheduled time

### US-AP-07: View Publication Status
**As a** content creator,
**I want to** see the status of my publications,
**So that** I know which clips were published successfully.

**Acceptance Criteria:**
- AC1: Publication status visible on clip card (scheduled/publishing/published/failed/cancelled)
- AC2: Published clips show platform link (clickable, opens in new tab)
- AC3: Failed clips show error message and retry button
- AC4: Stats shown per platform where available: VK (views, likes, shares), Rutube (views only), Дзен (views, likes, shares). Telegram shows "Статистика недоступна" — Telegram Bot API does not provide post-level stats
- AC5: Stats refresh every 6 hours for published clips (up to 30 days after publish)

### US-AP-08: Disconnect Platform
**As a** content creator,
**I want to** disconnect a platform,
**So that** I can revoke access or switch accounts.

**Acceptance Criteria:**
- AC1: "Отключить" button on each connected platform
- AC2: Confirmation dialog before disconnect
- AC3: PlatformConnection deleted, token removed
- AC4: Pending/scheduled publications for that platform cancelled

## Non-Functional Requirements

- **Latency:** Clip published within 60s of user action (excluding upload time for large files)
- **Reliability:** 95%+ first-attempt success rate
- **File Size:** Per-platform limits: VK 256MB, Telegram 50MB, Дзен 4GB, Rutube 10GB
- **Concurrency:** Worker concurrency 2 (rate-limited to respect API limits; 10+ concurrent only across multiple worker replicas)
- **Rate Limits:** Per-platform BullMQ rate limiter: VK 2 req/s, Rutube 1 req/s, Дзен 0.5 req/s, Telegram 5 msg/s
- **Security:** Tokens encrypted at rest (AES-GCM), decrypted only in worker memory; tokens never in Redis job data
- **Scheduling:** User's timezone detected from browser; minimum 5 minutes in future; cancel allowed up to job processing start
- **Stats:** Sync every 6 hours for 30 days after publish; Telegram excluded (no stats API)

## Feature Matrix

| Feature | MVP | v1.1 | v2 |
|---------|-----|------|-----|
| VK Publish | ✅ | | |
| Rutube Publish | ✅ | | |
| Дзен Publish | ✅ | | |
| Telegram Publish | ✅ | | |
| Scheduling | ✅ | | |
| Stats Collection | ✅ | | |
| Bulk Publish (all clips) | | ✅ | |
| Auto-post on render complete | | ✅ | |
| YouTube support | | | ✅ |
| TikTok support | | | ✅ |
| Content calendar view | | | ✅ |
