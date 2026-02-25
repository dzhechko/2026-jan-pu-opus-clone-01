# КлипМейкер — Specification

## User Stories & Acceptance Criteria

---

### US-01: Video Upload

**As a** content creator,
**I want to** upload a video file or paste a YouTube/VK URL,
**So that** I can start the AI clipping process.

**Acceptance Criteria:**

```gherkin
Feature: Video Upload

  Scenario: Upload video file
    Given I am logged in
    When I drag-and-drop a video file (mp4, webm, mov) up to 4GB
    Then the file uploads with a progress bar
    And processing starts automatically upon completion

  Scenario: Paste video URL
    Given I am logged in
    When I paste a YouTube or VK video URL
    Then the system downloads the video in the background
    And processing starts when download completes

  Scenario: Invalid file format
    Given I am logged in
    When I upload a non-video file (e.g., .doc, .png)
    Then I see an error: "Поддерживаемые форматы: MP4, WebM, MOV, AVI"
    And the upload is rejected

  Scenario: File exceeds size limit
    Given I am logged in
    When I upload a file larger than 4GB
    Then I see an error: "Максимальный размер файла: 4 ГБ"

  Scenario: Free tier minute limit exceeded
    Given I am on the Free plan with 5 minutes remaining
    When I upload a 60-minute video
    Then I see: "Недостаточно минут. Обработаем первые 5 минут или перейдите на тариф Start"
    And I see upgrade CTA
```

---

### US-02: AI Moment Selection

**As a** content creator,
**I want** the AI to automatically find the best moments from my long video,
**So that** I get engaging short clips without manual searching.

**Acceptance Criteria:**

```gherkin
Feature: AI Moment Selection

  Scenario: Successful moment detection
    Given a video has been uploaded and transcribed
    When the AI analysis completes
    Then I see 3-10 suggested clips ranked by Virality Score
    And each clip has a title, duration (15-60 sec), and score (0-100)

  Scenario: Video too short
    Given I upload a video shorter than 2 minutes
    Then I see: "Видео слишком короткое для нарезки. Минимум: 2 минуты"

  Scenario: No good moments found
    Given a video has monotone content with no highlights
    When AI analysis completes
    Then I see at least 3 clips (minimum guarantee) with low scores
    And a tip: "Совет: видео с эмоциональными моментами дают лучшие клипы"

  Scenario: Processing progress
    Given a 60-minute video is being processed
    Then I see a progress indicator with estimated time
    And the progress updates every 10 seconds
    And processing completes within 3 minutes

  Scenario: Plan limits clip count
    Given I am on the Free plan (max 3 clips per video)
    When AI generates 8 candidate clips
    Then I see only top 3 clips sorted by Virality Score
    And a prompt: "Получите до 10 клипов на тарифе Start"

  Scenario: Clip quality threshold
    Given AI generates 10 candidate clips
    When 4 clips have Virality Score < 30
    Then those 4 clips are hidden by default
    And I can expand "Показать ещё 4 клипа (низкий рейтинг)"
```

---

### US-03: Auto-Reframe

**As a** content creator,
**I want** my horizontal video clips automatically converted to vertical (9:16),
**So that** they're ready for VK Clips, YouTube Shorts, and Reels.

```gherkin
Feature: Auto-Reframe

  Scenario: Standard reframe with speaker
    Given a clip contains a single speaker
    When auto-reframe is applied
    Then the speaker's face is visible and centered in ≥90% of frames in the 9:16 output
    And no text overlays from the source are cut off

  Scenario: Screencast/slides content
    Given a clip contains screen sharing or slides
    When auto-reframe is applied
    Then the system uses a split view (speaker + content)
    Or zooms into the most relevant area with readable text

  Scenario: Slides-only video (no face detected)
    Given a clip contains only screen sharing without a visible speaker
    When auto-reframe is applied
    Then the system uses center-crop with smart zoom on text/diagram areas
    And subtitles are positioned below the content area
    And no text in slides is cut off at frame boundaries

  Scenario: Multiple output formats
    Given I have a reframed clip
    When I select export format
    Then I can choose: 9:16 (Shorts), 1:1 (Feed), 16:9 (Original)
```

---

### US-04: Russian Subtitles

**As a** Russian-speaking creator,
**I want** accurate auto-generated Russian subtitles on my clips,
**So that** viewers can watch without sound.

```gherkin
Feature: Russian Subtitles

  Scenario: Accurate transcription
    Given a video with clear Russian speech
    When subtitles are generated
    Then the word accuracy is ≥95% for standard speech
    And proper names are recognized with ≥90% accuracy

  Scenario: Subtitle styling
    Given subtitles are generated
    Then they display with a readable font (bold, shadow)
    And use the brand template colors if configured
    And are positioned at the bottom third of the frame

  Scenario: Subtitle editing
    Given I view a generated clip with subtitles
    When I click on a subtitle segment
    Then I can edit the text inline
    And the change is reflected in the preview in real-time
```

---

### US-05: Virality Score

**As a** content creator,
**I want** each clip scored for potential viral performance,
**So that** I can prioritize the best clips for publishing.

```gherkin
Feature: Virality Score

  Scenario: Score display
    Given AI has generated clips from my video
    Then each clip shows a Virality Score (0-100)
    And clips are sorted by score (highest first)
    And the score breakdown shows: Hook (0-25), Engagement (0-25), Flow (0-25), Trend (0-25)

  Scenario: Score explanation
    Given I see a clip with score 78
    When I click on the score
    Then I see a breakdown: "Hook: 22/25, Engagement: 20/25, Flow: 18/25, Trend: 18/25"
    And tips for improvement: "Совет: добавьте CTA в конце для повышения Engagement"
```

---

### US-06: Clip Editor

**As a** content creator,
**I want to** fine-tune my clips (trim, edit subtitles, adjust),
**So that** the final result matches my brand and message.

```gherkin
Feature: Clip Editor

  Scenario: Trim clip
    Given I am viewing a clip in the editor
    When I drag the start/end handles on the timeline
    Then the clip duration updates in real-time
    And the preview reflects the new boundaries

  Scenario: Edit subtitle text
    Given a clip has generated subtitles
    When I click on a subtitle segment
    Then I can edit the text
    And see the updated subtitle in the preview

  Scenario: Preview before export
    Given I have made edits to a clip
    When I click "Предпросмотр"
    Then I see the final clip with all edits applied
    And playback includes subtitles and reframe
```

---

### US-07: Download Clips

**As a** content creator,
**I want to** download my finished clips,
**So that** I can use them wherever I want.

```gherkin
Feature: Download Clips

  Scenario: Download single clip
    Given I have a finished clip
    When I click "Скачать"
    Then the clip downloads as MP4 (H.264, 1080p)

  Scenario: Download all clips
    Given I have 5 finished clips from one video
    When I click "Скачать все"
    Then all clips download as a ZIP archive

  Scenario: Free tier watermark
    Given I am on the Free plan
    When I download a clip
    Then the clip includes a "КлипМейкер.ру" watermark in the corner
```

---

### US-08: Auto-Post VK Клипы

**As a** content creator,
**I want** my clips automatically published to VK Клипы,
**So that** I don't have to manually upload to each platform.

```gherkin
Feature: Auto-Post VK

  Scenario: Connect VK account
    Given I am on Settings > Integrations
    When I click "Подключить VK"
    Then I go through VK OAuth flow
    And my VK account is connected with publishing permissions

  Scenario: Publish clip to VK
    Given my VK account is connected
    And I have a finished clip
    When I click "Опубликовать в VK Клипы"
    Then the clip is uploaded to VK Клипы
    And I see a success message with a link to the published clip

  Scenario: Schedule publication
    Given my VK account is connected
    When I select a clip and choose "Запланировать"
    Then I can set date and time for publication
    And the clip is published at the scheduled time

  Scenario: VK API error
    Given my VK account is connected
    When publishing fails due to API error
    Then I see: "Ошибка публикации. Повторим автоматически через 5 минут"
    And the system retries up to 3 times
```

---

### US-09: Billing & Subscription

**As a** user,
**I want to** subscribe to a paid plan using Russian payment methods,
**So that** I can access premium features.

```gherkin
Feature: Billing

  Scenario: Upgrade to Start plan
    Given I am on the Free plan
    When I click "Перейти на Start" and complete payment via ЮKassa
    Then my plan changes to Start immediately
    And I get 120 minutes per month
    And watermark is removed from new clips

  Scenario: Payment via СБП
    Given I am upgrading
    When I choose СБП as payment method
    Then I see a QR code for my bank app
    And upon successful scan and confirmation, plan activates

  Scenario: Cancel subscription
    Given I am on a paid plan
    When I go to Settings > Subscription > "Отменить подписку"
    Then I see a clear cancellation flow (no dark patterns)
    And my plan remains active until the end of the billing period
    And I receive a confirmation email

  Scenario: Minute overage
    Given I am on Start plan with 10 minutes remaining
    When I upload a 30-minute video
    Then I see: "У вас осталось 10 минут. Обработаем 10 минут или докупите минуты по 15₽/мин"
```

---

### US-10a: Dashboard Overview

**As a** content creator,
**I want to** see a summary of my usage and recent activity,
**So that** I can track my content production at a glance.

```gherkin
Feature: Dashboard Overview

  Scenario: Dashboard loads quickly
    Given I am logged in and have 50+ videos
    When I open the Dashboard
    Then the page loads in <2 seconds (p95)
    And I see: total clips created, minutes used/remaining, billing period end date
    And a paginated list of recent videos (10 per page) with thumbnails and status

  Scenario: Dashboard empty state
    Given I am a new user with no videos
    When I open the Dashboard
    Then I see an onboarding prompt: "Загрузите первое видео"
    And a drag-and-drop upload area
```

---

### US-10b: Clip Performance Analytics

**As a** content creator,
**I want to** see views, likes, and shares for my published clips,
**So that** I know which clips perform best and can optimize my content.

```gherkin
Feature: Clip Analytics

  Scenario: View clip performance
    Given I have published clips to VK
    When I click on a published clip
    Then I see: views, likes, shares from VK API
    And the Virality Score prediction vs actual view count
    And a note: "Статистика обновляется каждые 6 часов"

  Scenario: Stats not yet available
    Given I published a clip less than 6 hours ago
    When I view the clip details
    Then I see: "Статистика пока недоступна. Обновится в течение 6 часов"
    And the Virality Score is still shown

  Scenario: Clip not published
    Given I have a clip that was not published
    When I view the clip details
    Then I see Virality Score and clip details
    And no platform stats section (only publish CTA)
```

---

### US-11: Free Tier with Watermark

**As a** free user,
**I want to** try the service with limited features,
**So that** I can evaluate it before paying.

```gherkin
Feature: Free Tier

  Scenario: Free user limits
    Given I am on the Free plan
    Then I can process up to 30 minutes of video per month
    And generate maximum 3 clips per video
    And all clips have a "КлипМейкер.ру" watermark
    And clips are stored for 3 days

  Scenario: Upgrade prompt
    Given I am on the Free plan and have used all 30 minutes
    When I try to upload a new video
    Then I see: "Бесплатные минуты исчерпаны. Обновление до Start — 990₽/мес"
    And a comparison table: Free vs Start vs Pro
```

---

### US-12: Authentication

**As a** visitor,
**I want to** sign up and log in quickly,
**So that** I can start using the service.

```gherkin
Feature: Authentication

  Scenario: Sign up with email
    Given I am on the registration page
    When I enter email and password
    Then I receive a verification email
    And after verification, I am logged in on the Free plan

  Scenario: Sign up with VK OAuth
    Given I am on the registration page
    When I click "Войти через VK"
    Then I go through VK OAuth flow
    And I am logged in on the Free plan

  Scenario: Log in
    Given I have an account
    When I enter my credentials
    Then I am logged in and see my Dashboard

  Scenario: Password reset
    Given I forgot my password
    When I click "Забыли пароль?" and enter my email
    Then I receive a password reset link valid for 1 hour
```

---

### US-13: AI Provider Selection

**As a** user,
**I want to** choose whether my videos are processed by Russian (Cloud.ru) or Global (Gemini/Claude) AI models,
**So that** I can control data residency and processing quality.

```gherkin
Feature: AI Provider Selection

  Scenario: Default provider is RU
    Given I register a new account
    Then my AI provider preference is "ru" (Cloud.ru)

  Scenario: Switch to Global provider
    Given I am logged in with provider "ru"
    When I go to Settings > AI Provider
    And I select "Global (Gemini, Claude)"
    Then I see a warning: "Данные видео (транскрипт) будут обрабатываться серверами за пределами РФ"
    When I confirm the switch
    Then my provider preference changes to "global"
    And new videos will use Global AI models

  Scenario: Switch back to RU
    Given my provider is "global"
    When I switch to "RU (Cloud.ru)"
    Then the switch applies immediately
    And no warning is shown (data stays in RF)

  Scenario: Provider locked during processing
    Given a video is being processed with provider "ru"
    When I switch provider to "global"
    Then the current video continues with "ru"
    And I see: "Настройка применится к следующему видео"
```

---

### US-14: BYOK API Key Management (Global Provider)

**As a** user on the Global AI provider,
**I want to** optionally provide my own Gemini/Claude API keys,
**So that** I can reduce processing costs or use my existing API credits.

```gherkin
Feature: BYOK Key Management

  Scenario: Enter own Gemini API key
    Given my provider preference is "global"
    When I go to Settings > Integrations > Gemini API Key
    And I enter a valid API key
    Then the key is encrypted with AES-GCM 256-bit
    And stored in browser IndexedDB (never sent to server for storage)
    And a test API call validates the key
    And I see: "Ключ Gemini подключен ✓"

  Scenario: Invalid API key rejected
    Given I enter an invalid Gemini API key
    Then I see: "Ключ невалидный. Проверьте и попробуйте снова"
    And the key is NOT stored

  Scenario: Remove stored key
    Given I have a stored Gemini API key
    When I click "Удалить ключ"
    Then the encrypted key is removed from IndexedDB
    And processing falls back to КлипМейкер's shared API keys

  Scenario: Auto-lock after inactivity
    Given I have entered my password to unlock keys
    When 30 minutes pass with no activity
    Then the master key is cleared from memory
    And I must re-enter my password to use the stored keys
```

---

## Non-Functional Specifications

### NFR-01: Performance

| Metric | Requirement | Measurement |
|--------|-------------|-------------|
| Video processing speed | ≤ 3 min for 60 min source | Automated benchmark |
| Page load (FCP) | ≤ 1.5 sec | Lighthouse |
| API response (p99) | ≤ 500ms | APM monitoring |
| Upload speed | ≥ 10 MB/s | Network test |
| Concurrent jobs | ≥ 10 simultaneous | Load test |

### NFR-02: Security

| Requirement | Implementation |
|-------------|---------------|
| HTTPS | TLS 1.3, HSTS |
| Auth | JWT (15 min access, 7d refresh) + OAuth 2.0 |
| Rate limiting | 100 req/min per user, 10 uploads/hour |
| File validation | MIME type + magic bytes check |
| Platform API keys | AES-GCM 256-bit, client-side only (IndexedDB) |
| Data residency | Russian VPS, 152-ФЗ compliance |
| Input sanitization | All user inputs sanitized (XSS, SQL injection) |

### NFR-03: Scalability

| Dimension | Strategy |
|-----------|----------|
| Compute | GPU workers via Docker Compose (horizontal) |
| Storage | S3-compatible object storage (auto-scaling) |
| Database | PostgreSQL with connection pooling (PgBouncer) |
| Queue | Redis + BullMQ (job queue) |
| CDN | Yandex CDN for clip delivery |

### NFR-04: Reliability

| Requirement | Target |
|-------------|--------|
| Uptime | 99.5% |
| Job retry | 3 attempts, exponential backoff |
| Data backup | Daily PostgreSQL dumps, S3 versioning |
| Graceful degradation | If GPU unavailable → queue, not fail |
| Recovery | Auto-restart via Docker restart policy |
