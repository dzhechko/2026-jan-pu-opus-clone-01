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
- AC2: Clicking initiates Yandex OAuth with publishing scopes
- AC3: Token stored encrypted in PlatformConnection
- AC4: UI shows connected account

### US-AP-04: Connect Telegram Channel
**As a** content creator on Pro/Business plan,
**I want to** connect my Telegram channel,
**So that** I can publish clips to Telegram.

**Acceptance Criteria:**
- AC1: "Подключить Telegram" button visible for Pro/Business plans
- AC2: User enters bot token and channel ID
- AC3: System validates by calling `getChat` API
- AC4: Bot token stored encrypted in PlatformConnection
- AC5: Channel name displayed in UI

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
- AC1: Publication status visible on clip card (scheduled/publishing/published/failed)
- AC2: Published clips show platform link (clickable)
- AC3: Failed clips show error message and retry button
- AC4: Stats (views, likes, shares) shown for published clips

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

- **Latency:** Clip published within 60s of user action (network + upload time)
- **Reliability:** 95%+ first-attempt success rate
- **File Size:** Support clips up to 500MB
- **Concurrency:** Process 10+ concurrent publish jobs
- **Rate Limits:** Respect per-platform API limits
- **Security:** Tokens encrypted at rest, decrypted only in worker memory

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
