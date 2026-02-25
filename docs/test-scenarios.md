# КлипМейкер — BDD Test Scenarios

## Feature: Video Processing Pipeline (End-to-End)

### Happy Path

```gherkin
Scenario: Complete pipeline — upload to clips (RU provider)
  Given I am on the Pro plan with provider "ru"
  And I have 200 minutes remaining
  When I upload a 60-minute MP4 video (1.2 GB)
  Then the upload completes with progress bar
  And status changes to "Распознаём речь..."
  And within 90 seconds, status changes to "Анализируем моменты..."
  And within 30 seconds, status changes to "Генерируем клипы..."
  And within 120 seconds, status changes to "Готово ✓"
  And I see 5-10 clips sorted by Virality Score
  And 140 minutes remaining (60 consumed)

Scenario: Complete pipeline — URL paste (Global provider)
  Given I am on the Start plan with provider "global"
  When I paste a YouTube URL for a 30-minute video
  Then the system downloads the video
  And processes via OpenAI Whisper + Gemini Flash
  And I see 3-8 clips within 3 minutes total
```

### Error Handling

```gherkin
Scenario: LLM error with automatic fallback
  Given I upload a video for processing with provider "ru"
  And T-Pro 2.1 (tier1) is temporarily unavailable
  When moment selection fails on tier1
  Then the system automatically retries with Qwen3-235B (tier2)
  And processing completes successfully
  And I see a note: "Использована альтернативная модель"

Scenario: All AI providers fail
  Given I upload a video for processing
  And all LLM tiers return errors
  Then after 3 retry attempts across tiers
  I see: "Ошибка AI-анализа. Попробуйте позже или измените AI провайдер в Настройках"
  And the video status is "failed"
  And I can click "Повторить" to retry

Scenario: STT returns poor quality transcript
  Given I upload a video with heavy background noise
  When Whisper completes transcription
  And >30% of segments have confidence <0.5
  Then I see a warning: "Качество распознавания низкое. Рекомендуем видео с чистым звуком"
  And clips are still generated but with lower Virality Scores

Scenario: Upload network interruption
  Given I am uploading a 2GB video file
  When the network drops at 60% progress
  Then the upload pauses with message: "Соединение потеряно"
  When the network recovers
  Then upload resumes from 60% (not from 0%)
```

### Edge Cases

```gherkin
Scenario: Video exactly at minute limit
  Given I am on the Free plan with exactly 30 minutes remaining
  When I upload a 30-minute video
  Then the video processes fully (30 minutes consumed)
  And minutes remaining shows 0
  And next upload shows: "Минуты исчерпаны"

Scenario: Very long video (>2.5 hours, RU provider)
  Given I upload a 3-hour webinar with provider "ru"
  When the transcript exceeds 100K tokens
  Then LLM Router selects GLM-4.6 (200K context, tier3)
  And processing completes with all moments from full video

Scenario: Mixed language video
  Given I upload a video with Russian speech containing English terms ("machine learning", "ROI")
  When subtitles are generated
  Then English terms are preserved as-is in subtitles
  And surrounding Russian text is correctly transcribed
```

---

## Feature: Dual AI Provider Strategy

```gherkin
Scenario: New user defaults to RU
  Given I complete registration
  When I check Settings > AI Provider
  Then "RU (Cloud.ru)" is selected
  And I see: "Все данные обрабатываются на серверах в РФ"

Scenario: Switch to Global with data warning
  Given I am on Settings > AI Provider with "ru" selected
  When I select "Global (Gemini, Claude)"
  Then a modal appears: "При выборе Global транскрипт вашего видео будет отправлен на серверы за пределами РФ. Видеофайлы остаются в РФ."
  And two buttons: "Подтвердить" and "Отмена"
  When I click "Подтвердить"
  Then provider changes to "global"

Scenario: Global with BYOK key
  Given my provider is "global"
  When I go to Settings > Integrations > "Свой ключ Gemini"
  And I enter my Gemini API key
  Then the system makes a test call (simple completion)
  And shows: "Ключ валиден ✓ — ваши видео будут обрабатываться через ваш аккаунт Gemini"
  And the key is encrypted (AES-GCM) in browser storage

Scenario: Global without BYOK — uses shared keys
  Given my provider is "global"
  And I have NOT entered my own API key
  When I process a video
  Then the system uses КлипМейкер's shared Gemini API key
  And processing cost is included in my subscription

Scenario: Cost comparison visible in settings
  Given I am on Settings > AI Provider
  Then I see a comparison:
    | | RU (Cloud.ru) | Global |
    | Стоимость 60 мин видео | ~21₽ | ~55₽ |
    | Данные | Россия | США/ЕС |
    | Качество русского | ★★★★★ | ★★★★ |
```

---

## Feature: Auto-Post VK Клипы

### Happy Path

```gherkin
Scenario: Immediate publish to VK
  Given my VK account is connected
  And I have a ready clip on Pro plan
  When I click "Опубликовать" > "VK Клипы" > "Сейчас"
  Then the clip uploads to VK within 30 seconds
  And I see: "Опубликовано ✓" with a direct link to VK

Scenario: Scheduled publish
  Given my VK account is connected
  When I select a clip and choose "Запланировать на 10:00 завтра"
  Then publication status shows "Запланировано на 01.03.2026, 10:00 МСК"
  And at 10:00 the clip is published
  And I receive a notification: "Клип опубликован в VK"
```

### Error Handling

```gherkin
Scenario: VK token expired
  Given my VK access token has expired
  When I try to publish a clip
  Then I see: "VK отключён. Переподключите в Настройки > Интеграции"
  And a "Переподключить" button that initiates VK OAuth refresh

Scenario: VK API rate limit
  Given I try to publish 10 clips simultaneously
  When VK returns 429 (rate limit)
  Then clips are queued with 5-second intervals
  And I see progress: "Публикация 3 из 10..."
```

### Security

```gherkin
Scenario: VK OAuth scope minimal
  Given I click "Подключить VK"
  When VK OAuth dialog appears
  Then only "video" and "wall" permissions are requested
  And NOT "friends", "messages", or other unnecessary scopes
```

---

## Feature: Billing & Subscription

### Happy Path

```gherkin
Scenario: Upgrade Free to Start via card
  Given I am on Free plan
  When I click "Перейти на Start (990₽/мес)"
  And select "Банковская карта" and complete ЮKassa payment
  Then my plan changes to Start immediately
  And I see: "Тариф Start активирован до 24.03.2026"
  And minutes reset to 120

Scenario: Upgrade via СБП
  Given I click upgrade
  When I select "Система быстрых платежей"
  Then I see a QR code
  When I scan with my bank app and confirm
  Then plan activates within 10 seconds

Scenario: Cancel subscription — no dark patterns
  Given I am on Pro plan
  When I go to Settings > Подписка > "Отменить подписку"
  Then I see exactly 2 options: "Отменить" and "Остаться"
  And NO "special offers", counter-offers, or guilt-trip messages
  When I click "Отменить"
  Then plan stays active until period end
  And I see: "Подписка отменена. Pro доступен до 24.03.2026"
```

### Edge Cases

```gherkin
Scenario: Overage minutes purchase
  Given I am on Start plan with 5 minutes remaining
  When I upload a 30-minute video
  Then I see: "Осталось 5 минут из 120. Варианты:"
  And option A: "Обработать первые 5 минут (бесплатно)"
  And option B: "Докупить 25 минут за 375₽ (15₽/мин)"
  And option C: "Перейти на Pro — 300 минут за 1990₽/мес"

Scenario: Payment webhook idempotency
  Given ЮKassa sends payment.succeeded webhook
  When the same webhook arrives again (duplicate)
  Then the second event is ignored (dedup by payment_id)
  And subscription is NOT double-activated
```

---

## Feature: Encrypted Key Storage (Client-Side)

```gherkin
Scenario: Encrypt and store platform API key
  Given I am on Settings > Integrations
  When I enter my VK API key and click "Сохранить"
  Then the key is encrypted using AES-GCM 256-bit
  And stored in IndexedDB (browser only)
  And the server receives NO plaintext key
  And I see: "Ключ сохранён и зашифрован ✓"

Scenario: Auto-lock after inactivity
  Given I have stored encrypted keys
  And my session has been idle for 30 minutes
  When I try to publish a clip (requiring platform key)
  Then I see: "Введите пароль для доступа к ключам"
  And keys remain encrypted until password re-entered

Scenario: Key validation on save
  Given I enter a VK API key
  When I click "Проверить"
  Then the system makes a test API call to VK
  And shows: "Ключ работает ✓" or "Ключ невалидный — проверьте права доступа"
```

---

## Feature: Authentication

```gherkin
Scenario: Registration + immediate onboarding
  Given I am on the landing page
  When I click "Попробовать бесплатно"
  And register with email
  And verify email
  Then I land on Dashboard with onboarding:
    Step 1: "Загрузите первое видео"
    Step 2: "AI создаст клипы за 5 минут"
    Step 3: "Опубликуйте в VK одним кликом"

Scenario: VK OAuth quick start
  Given I click "Войти через VK"
  When VK OAuth completes
  Then I am logged in
  And my VK account is pre-connected for auto-posting
  And I land on Dashboard
```

---

## Non-Functional: Performance

```gherkin
Scenario: Processing speed benchmark
  Given a 60-minute MP4 video (720p, clear Russian speech)
  When I upload and process with provider "ru"
  Then total processing time is ≤3 minutes:
    | Stage | Max Time |
    | Upload | 60 sec (depends on network) |
    | STT (Whisper) | 90 sec |
    | LLM analysis | 20 sec |
    | FFmpeg rendering (8 clips) | 60 sec |

Scenario: Concurrent processing
  Given 10 users upload videos simultaneously
  When all videos enter the processing queue
  Then all 10 complete within 10 minutes
  And no video fails due to resource contention
```

## Non-Functional: Security

```gherkin
Scenario: File upload validation
  Given I try to upload a file named "video.mp4"
  But the file is actually a PHP script with renamed extension
  When the server checks magic bytes
  Then upload is rejected: "Неподдерживаемый формат файла"

Scenario: Rate limiting
  Given I send 150 API requests within 1 minute
  Then after request #100, I receive 429 Too Many Requests
  And subsequent requests are blocked for 60 seconds
```
