# STT + Subtitles — Specification

## User Stories

### US-STT-01: Automatic Transcription

**As a** content creator who uploaded a video,
**I want** the system to automatically transcribe the audio,
**So that** I get a text transcript with timed segments for subtitle generation.

**Acceptance Criteria:**

```gherkin
Feature: Automatic Transcription

  Scenario: Successful transcription of clear Russian speech
    Given a video with status "transcribing" exists in S3
    When the STT worker processes the video
    Then a transcript is created with segment-level timestamps
    And each segment has start, end (seconds), and text
    And the video status changes to "analyzing"
    And the video's durationSeconds is populated from FFmpeg probe
    And word accuracy is ≥95% for clear single-speaker audio

  Scenario: Transcription of long video (>13 min)
    Given a video longer than 13 minutes
    When the STT worker processes the video
    Then the audio is split into 10-minute chunks
    And chunks are processed in parallel (up to 3 concurrent)
    And segment timestamps are correctly offset per chunk
    And the final transcript is a seamless merge of all chunks

  Scenario: STT failure with retry
    Given a Whisper API call fails with a transient error (500, 503, timeout)
    When the STT worker catches the error
    Then it retries up to 2 times with exponential backoff
    And if all retries fail, the video status becomes "failed"
    And the error is logged with videoId and attempt number

  Scenario: STT provider selection
    Given a user with llmProviderPreference "ru"
    When the STT job is processed
    Then Cloud.ru Whisper Large-v3 is used
    And when the preference is "global"
    Then OpenAI Whisper-1 is used

  Scenario: Minutes quota enforcement
    Given a user with 5 minutes remaining and a 60-minute video
    When the STT worker starts processing
    Then only the first 5 minutes of audio are transcribed
    And the transcript covers 0:00–5:00 only
    And the user's minutesUsed is incremented by 5
    And the video status becomes "analyzing" (partial transcript)

  Scenario: Usage tracking
    Given a 60-minute video is fully transcribed
    When transcription completes
    Then a UsageRecord is created with:
      | field | value |
      | minutesConsumed | 60 |
      | sttCostKopecks | 1800 (0.30₽/min × 60) |
      | providerStrategy | "ru" or "global" |
    And user.minutesUsed is incremented by 60
```

### US-STT-02: Transcript Display

**As a** content creator,
**I want to** view the transcript of my video with timestamps,
**So that** I can review what was said and when.

**Acceptance Criteria:**

```gherkin
Feature: Transcript Display

  Scenario: View transcript on video detail page
    Given a video has a completed transcript
    When I navigate to the video detail page
    Then I see the transcript as a list of timed segments
    And each segment shows timestamp (MM:SS) and text
    And the current segment is highlighted during video playback

  Scenario: Video still processing
    Given a video has status "transcribing"
    When I navigate to the video detail page
    Then I see a progress indicator "Транскрибируем..."
    And no transcript content is shown

  Scenario: No transcript available
    Given a video has status "uploading"
    When I navigate to the video detail page
    Then the transcript section shows "Транскрипт будет доступен после обработки"
```

### US-STT-03: Subtitle Editing

**As a** content creator,
**I want to** edit subtitle text inline,
**So that** I can correct transcription errors before publishing.

**Acceptance Criteria:**

```gherkin
Feature: Subtitle Editing

  Scenario: Edit a subtitle segment
    Given I am viewing a transcript
    When I click on a segment's text
    Then it becomes an editable text field
    And I can modify the text
    And when I press Enter or click away
    Then the change is saved via tRPC mutation
    And the UI shows the updated text immediately (optimistic update)

  Scenario: Undo edit
    Given I just edited a subtitle segment
    When I press Ctrl+Z or click "Отменить"
    Then the segment reverts to its previous text

  Scenario: Batch save
    Given I have edited 5 segments
    When I click "Сохранить все"
    Then all changes are sent in a single tRPC mutation
    And a success toast appears: "Субтитры сохранены"

  Scenario: Edit validation
    Given I am editing a subtitle segment
    When I try to save an empty text
    Then I see an error: "Текст субтитра не может быть пустым"
    And the edit is not saved
```

## Non-Functional Requirements

| NFR | Requirement | Measurement |
|-----|------------|-------------|
| NFR-STT-01 | STT latency | ≤90s for 60-min video |
| NFR-STT-02 | Audio extraction | ≤10s for 2h video |
| NFR-STT-03 | Chunk processing | 3 parallel, ≤15s per 10-min chunk |
| NFR-STT-04 | Transcript save | Single DB transaction |
| NFR-STT-05 | Edit response | <200ms optimistic UI update |
| NFR-STT-06 | Temp file cleanup | All /tmp files deleted within 5s of job completion |
| NFR-STT-07 | Worker memory | <512MB per STT job (audio chunks, not full video) |

## API Endpoints

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `video.get` | query | `{ id }` | Video + transcript + clips (exists) |
| `transcript.getSegments` | query | `{ videoId }` | `{ segments, language, sttModel }` |
| `transcript.updateSegments` | mutation | `{ videoId, edits: [{index, text}] }` | `{ success }` |
| `transcript.getFullText` | query | `{ videoId }` | `{ fullText, tokenCount }` |
