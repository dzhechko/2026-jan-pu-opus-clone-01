# Download Clips — Specification

## User Stories

### US-DC-01: Download Single Clip

**As a** content creator with a ready clip,
**I want to** click a download button,
**So that** I get the MP4 file on my device.

**Acceptance Criteria:**

```gherkin
Feature: Download Single Clip

  Scenario: Download ready clip from clip list
    Given I have a clip with status "ready"
    When I click "Скачать" on the clip card
    Then the browser starts downloading an MP4 file
    And the filename contains the clip title

  Scenario: Download from clip editor
    Given I am editing a clip with status "ready"
    When I click "Скачать" in the action bar
    Then the browser starts downloading an MP4 file

  Scenario: Clip not ready
    Given I have a clip with status "rendering"
    Then the download button is disabled
    And shows tooltip "Клип ещё не готов"

  Scenario: Download error (S3 failure)
    Given the presigned URL generation fails
    When I click "Скачать"
    Then I see an error notification: "Ошибка скачивания. Попробуйте ещё раз"
```

### US-DC-02: Download All Clips (ZIP)

**As a** content creator with multiple ready clips,
**I want to** download all clips from a video at once,
**So that** I save time instead of downloading one by one.

**Acceptance Criteria:**

```gherkin
Feature: Download All Clips

  Scenario: Download all ready clips as ZIP
    Given I have a video with 5 clips, 4 with status "ready"
    When I click "Скачать все" on the video detail page
    Then the browser downloads a ZIP file containing 4 MP4 files
    And the ZIP filename is based on the video title

  Scenario: No ready clips
    Given I have a video with all clips still rendering
    Then the "Скачать все" button is disabled
    And shows tooltip "Нет готовых клипов для скачивания"

  Scenario: Some clips not ready
    Given I have 5 clips, 3 ready and 2 rendering
    When I click "Скачать все"
    Then the ZIP contains only the 3 ready clips
    And I see a note: "Скачано 3 из 5 клипов. 2 клипа ещё рендерятся"

  Scenario: ZIP generation with progress
    Given I have 10 clips totaling up to 500 MB
    When I click "Скачать все"
    Then I see a spinner with text "Подготовка архива..."
    And the button is disabled during generation
    And the download completes within 30 seconds

  Scenario: ZIP generation error
    Given the server fails to stream a clip from S3 mid-archive
    When I am downloading a ZIP
    Then I see an error notification: "Ошибка создания архива. Попробуйте ещё раз"
```

### US-DC-03: Free Tier Watermark Indicator

**As a** free-tier user,
**I want to** see that my clips have a watermark before downloading,
**So that** I know what to expect and can upgrade if needed.

**Acceptance Criteria:**

```gherkin
Feature: Watermark Indicator

  Scenario: Free user sees watermark badge
    Given I am on the Free plan
    When I view my clip list
    Then each clip card shows a "Водяной знак" badge
    And the download button tooltip includes "с водяным знаком"

  Scenario: Paid user no watermark badge
    Given I am on the Start or Pro plan
    When I view my clip list
    Then no watermark badge is shown

  Scenario: Upgrade prompt on watermark badge click
    Given I am on the Free plan
    When I click the watermark badge
    Then I see a tooltip: "Уберите водяной знак на тарифе Start (990₽/мес)"
    And the tooltip contains a link to /dashboard/billing
```

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Single download start | < 2s |
| ZIP generation (10 clips) | < 30s |
| Memory usage during ZIP | Streaming, no full buffering |
| Rate limit (single) | 30/60s per user (existing) |
| Rate limit (batch) | 5/60s per user |
| Max clips per ZIP | 50 |
