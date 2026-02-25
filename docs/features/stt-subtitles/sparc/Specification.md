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

  Scenario: Transcription of long video (>10 min)
    Given a video longer than 10 minutes
    When the STT worker processes the video
    Then the audio is split into 10-minute WAV chunks (~19.2MB each, under 25MB API limit)
    And chunks are processed in parallel (up to 3 concurrent)
    And segment timestamps are correctly offset per chunk (chunk_index × 600s)
    And the final transcript is a sorted merge of all chunks

  Scenario: STT failure with per-chunk retry
    Given a Whisper API call fails with a transient error (500, 503, timeout)
    When the STT worker catches the error
    Then it retries the failed chunk up to 2 times with exponential backoff (2s, 8s)
    And if all retries fail, the video status becomes "failed"
    And the error is logged with videoId, chunkIndex, and attempt number

  Scenario: STT provider selection (RU strategy)
    Given a user with llmProviderPreference "ru"
    When the STT job is processed
    Then Cloud.ru Whisper Large-v3 is used
    And sttProvider is "cloudru"

  Scenario: STT provider selection (Global strategy)
    Given a user with llmProviderPreference "global"
    When the STT job is processed
    Then OpenAI Whisper-1 is used
    And sttProvider is "openai"

  Scenario: Zero minutes remaining
    Given a user with 0 minutes remaining
    When the STT worker starts processing
    Then the video status becomes "failed"
    And no audio is downloaded or processed
    And no UsageRecord is created

  Scenario: Minutes quota enforcement (partial)
    Given a user with 5 minutes remaining and a 60-minute video
    When the STT worker starts processing
    Then only the first 5 minutes of audio are transcribed
    And the transcript covers 0:00–5:00 only
    And the user's minutesUsed is incremented by 5
    And the video status becomes "analyzing" (partial transcript)

  Scenario: Usage tracking
    Given a 60-minute video is fully transcribed with RU strategy
    When transcription completes
    Then a UsageRecord is created with:
      | field | value |
      | minutesConsumed | 60 |
      | sttCostKopecks | 1800 |
      | providerStrategy | ru |
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

  Scenario: Current segment highlighted during playback
    Given a video has a completed transcript with segments
    And the video player is at position 00:30
    When the segment spanning 00:28–00:35 exists
    Then that segment row has CSS class "active" and is scrolled into view
    And all other segments do not have the "active" class
    And the highlight updates within 500ms of the player timeupdate event

  Scenario: Video still processing
    Given a video has status "transcribing"
    When I navigate to the video detail page
    Then I see a progress indicator "Транскрибируем..."
    And no transcript content is shown

  Scenario: Video transcription failed
    Given a video has status "failed"
    When I navigate to the video detail page
    Then the transcript section shows "Ошибка транскрибирования"

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

  Scenario: Undo edit (session-level, per segment)
    Given I just edited segment #3 from "старый текст" to "новый текст"
    When I press Ctrl+Z or click "Отменить"
    Then segment #3 reverts to "старый текст" (text before current editing session)
    And only the most recently edited segment is affected

  Scenario: Batch save
    Given I have edited 5 segments
    When I click "Сохранить все"
    Then all changes are sent in a single tRPC mutation
    And the button shows "Сохранение..." until the API resolves
    And a success toast appears: "Субтитры сохранены"

  Scenario: Edit validation — empty text
    Given I am editing a subtitle segment
    When I try to save an empty text
    Then I see an error: "Текст субтитра не может быть пустым"
    And the edit is not saved

  Scenario: Edit validation — text too long
    Given I am editing a subtitle segment
    When I enter text longer than 1000 characters
    Then I see an error: "Текст субтитра превышает 1000 символов"
    And the edit is not saved

  Scenario: Unauthorized edit attempt
    Given user "bob" tries to edit the transcript of user "alice"'s video
    When the updateSegments mutation is called
    Then a NOT_FOUND error is returned
    And no transcript is modified
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
| NFR-STT-08 | Transcript list render | <100ms for up to 200 segments |

## API Endpoints

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `video.get` | query | `{ id }` | Video + transcript + clips (exists) |
| `transcript.getSegments` | query | `{ videoId }` | `{ segments, language, sttModel, sttProvider }` |
| `transcript.updateSegments` | mutation | `{ videoId, edits: [{index, text}] }` | `{ success }` |
| `transcript.getFullText` | query | `{ videoId }` | `{ fullText, tokenCount, language }` |
