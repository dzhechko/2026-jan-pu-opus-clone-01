# STT + Subtitles — BDD Test Scenarios

Generated: 2026-02-25
Source documents: Specification.md, Refinement.md, Pseudocode.md

Total scenarios: 25 (7 happy path, 7 error handling, 5 edge cases, 3 security, 3 performance)

---

## Feature: STT Worker — Happy Path

```gherkin
Feature: Automatic Speech-to-Text Transcription

  Background:
    Given the STT worker is running
    And FFmpeg and FFprobe are available in PATH
    And the S3 bucket is accessible

  @happy-path @stt-worker @smoke
  Scenario: Successful transcription of clear Russian speech
    Given a video with id "vid-001" and status "transcribing" exists in S3
    And the video file contains clear single-speaker Russian audio, duration 10 minutes
    And the user has llmProviderPreference "ru"
    And the user has 60 minutes remaining
    When the STT worker picks up the job for "vid-001"
    Then FFprobe determines the video duration as 600 seconds
    And FFmpeg extracts a WAV audio file at 16kHz mono PCM
    And Cloud.ru Whisper Large-v3 is called with the audio file
    And a Transcript record is created in the database with non-empty segments
    And each segment contains "start", "end" (in seconds), "text", and "confidence" fields
    And the video status changes to "analyzing"
    And the video's "durationSeconds" field is set to 600
    And a UsageRecord is created with minutesConsumed = 10 and providerStrategy = "ru"
    And the user's minutesUsed is incremented by 10
    And the /tmp working directory is deleted after job completion

  @happy-path @stt-worker
  Scenario: Provider selection routes to Global OpenAI Whisper
    Given a video with status "transcribing" exists in S3, duration 5 minutes
    And the user has llmProviderPreference "global"
    And the user has 100 minutes remaining
    When the STT worker picks up the job
    Then OpenAI Whisper-1 is called (not Cloud.ru)
    And the Transcript record has sttProvider = "openai" and sttModel = "whisper-1"
    And the UsageRecord has providerStrategy = "global"
    And the cost is calculated at ~0.55₽/min (global pricing)

  @happy-path @stt-worker
  Scenario: Usage cost calculation for RU provider
    Given a fully transcribed 60-minute video using the "ru" provider
    When the STT transaction is committed
    Then a UsageRecord is created with:
      | field            | value                          |
      | minutesConsumed  | 60                             |
      | sttCostKopecks   | 1800  (0.30₽/min × 60 × 100)  |
      | providerStrategy | ru                             |
    And the user's minutesUsed is incremented by exactly 60
    And the video status is "analyzing"

  @happy-path @transcript-api
  Scenario: View transcript via tRPC getSegments
    Given a video with id "vid-002" has a completed Transcript in the database
    And I am authenticated as the owner of "vid-002"
    When I call "transcript.getSegments" with { videoId: "vid-002" }
    Then the response contains a "segments" array with at least 1 item
    And each segment has "start", "end", "text", and "confidence"
    And the response includes "language", "sttModel", and "sttProvider"

  @happy-path @transcript-ui
  Scenario: Transcript displayed on video detail page with current segment highlighted
    Given I am logged in as the owner of video "vid-003"
    And video "vid-003" has a completed transcript with 20 segments
    When I navigate to the video detail page for "vid-003"
    Then I see the transcript as a list of 20 timed segments
    And each segment shows a timestamp in MM:SS format and the segment text
    And as I play the video, the segment matching the current playback time is highlighted

  @happy-path @subtitle-editor
  Scenario: Inline edit of a subtitle segment with optimistic UI update
    Given I am viewing the transcript for video "vid-004"
    And segment index 3 has text "Привет всем"
    When I click on the text of segment 3
    Then the segment text becomes an editable input field
    When I change the text to "Привет, всем участникам"
    And I press Enter
    Then the UI immediately shows "Привет, всем участникам" (optimistic update, <200ms)
    And a tRPC mutation "transcript.updateSegments" is called with { index: 3, text: "Привет, всем участникам" }
    And the database persists the updated text for segment index 3
    And the transcript's fullText and tokenCount are recomputed

  @happy-path @subtitle-editor
  Scenario: Batch save of multiple segment edits
    Given I am viewing the transcript for video "vid-005"
    And I edit segments at indices 0, 2, and 4 with new text values
    When I click "Сохранить все"
    Then a single tRPC mutation "transcript.updateSegments" is called with all 3 edits
    And a success toast "Субтитры сохранены" appears
    And the database reflects all 3 changes in one update
    And the transcript's fullText is rebuilt from the merged segment texts
```

---

## Feature: STT Worker — Error Handling

```gherkin
Feature: STT Error Handling and Retry Logic

  Background:
    Given the STT worker is running
    And FFmpeg is available in PATH

  @error-handling @stt-worker @retry
  Scenario: Transient Whisper API failure triggers exponential backoff retry
    Given a video with status "transcribing" exists and audio extraction succeeds
    And the Whisper API returns HTTP 503 on the first call
    And the Whisper API returns HTTP 503 on the second call
    And the Whisper API returns HTTP 200 with a valid transcript on the third call
    When the STT worker processes the job
    Then the worker retries up to 2 times with backoff delays (2s, then 8s)
    And on the third attempt the transcript is saved successfully
    And the video status becomes "analyzing"
    And each retry attempt is logged with { videoId, attempt }

  @error-handling @stt-worker
  Scenario: Non-retryable Whisper API error (4xx) fails immediately
    Given a video with status "transcribing" exists and audio extraction succeeds
    And the Whisper API returns HTTP 400 (bad request) on the first call
    When the STT worker processes the job
    Then the worker does NOT retry
    And the video status becomes "failed"
    And the error is logged with { videoId, step: "whisper", error }
    And the /tmp working directory is deleted in the finally block

  @error-handling @stt-worker
  Scenario: FFmpeg audio extraction failure marks video as failed
    Given a video with status "transcribing" exists in S3
    And the downloaded video file has a corrupted audio stream
    When the STT worker attempts to extract audio via FFmpeg
    Then FFmpeg exits with a non-zero exit code
    And the video status becomes "failed"
    And the error is logged with { videoId, step: "ffmpeg-extract" }
    And the /tmp working directory is deleted

  @error-handling @stt-worker
  Scenario: S3 download failure marks video as failed after retries
    Given a video with status "transcribing" exists in S3
    And the S3 download times out on all attempts (up to 2 retries)
    When the STT worker processes the job
    Then the video status becomes "failed"
    And the error is logged with { videoId, step: "s3-download" }
    And no /tmp files are left behind

  @error-handling @quota
  Scenario: User has zero minutes remaining — video fails immediately
    Given a video with status "transcribing" exists (duration: 30 minutes)
    And the user has minutesLimit = 100 and minutesUsed = 100 (0 remaining)
    When the STT worker starts processing
    Then the worker does NOT download the video or call Whisper
    And the video status becomes "failed"
    And no UsageRecord is created
    And no quota is deducted

  @error-handling @transcript-api
  Scenario: getSegments returns 404 when transcript not yet ready
    Given a video with status "transcribing" (no Transcript record in DB)
    And I am authenticated as the owner
    When I call "transcript.getSegments" with the videoId
    Then the response is a NOT_FOUND error: "Транскрипт ещё не готов"

  @error-handling @subtitle-editor
  Scenario: Edit validation rejects empty segment text
    Given I am viewing the transcript for a video with 10 segments
    When I call "transcript.updateSegments" with { index: 2, text: "" }
    Then the tRPC mutation returns a BAD_REQUEST error
    And the database record is NOT updated
    And the UI shows the error: "Текст субтитра не может быть пустым"
```

---

## Feature: STT Worker — Edge Cases

```gherkin
Feature: STT Edge Cases

  Background:
    Given the STT worker is running
    And FFmpeg and FFprobe are available

  @edge-case @audio
  Scenario: Video longer than 13 minutes is processed in parallel chunks
    Given a video with status "transcribing" and duration 65 minutes (3900 seconds)
    And the user has 200 minutes remaining
    When the STT worker processes the video
    Then FFmpeg splits the audio into 7 chunks of 10 minutes each (last chunk is shorter)
    And all chunks are transcribed with at most 3 concurrent Whisper API calls
    And each chunk's segment timestamps are offset by the chunk's start position in seconds
    And the final transcript segments are sorted by start time
    And the resulting transcript is a seamless merge with no timestamp gaps or overlaps

  @edge-case @audio
  Scenario: Very short video (under 10 seconds) is processed as a single chunk
    Given a video with status "transcribing" and duration 8 seconds
    And the user has 10 minutes remaining
    When the STT worker processes the video
    Then no audio splitting is performed (single chunk)
    And the transcript contains at least 1 segment (if speech is present)
    And the video status becomes "analyzing"
    And 1 minute is deducted from the user's quota (minimum billable unit: ceil)

  @edge-case @audio
  Scenario: Audio is complete silence — transcript created with empty segments
    Given a video with status "transcribing" and duration 5 minutes
    And the audio contains only silence (no speech)
    When Whisper returns an empty segments array
    Then the STT worker creates a Transcript record with segments = []
    And fullText = "" and tokenCount = 0
    And the video status becomes "analyzing" (not "failed")
    And the user's quota is still deducted for the duration processed

  @edge-case @audio
  Scenario: Video has no audio stream — video status set to failed with user-facing message
    Given a video with status "transcribing"
    And the video file contains no audio stream
    When FFmpeg attempts to extract audio
    Then FFmpeg exits with a non-zero code (no audio stream found)
    And the video status becomes "failed"
    And the error message stored is "Видео не содержит аудио"
    And the user sees "Видео не содержит аудио" on the video detail page

  @edge-case @audio
  Scenario: High background noise segments are filtered before saving
    Given a video with status "transcribing" and duration 5 minutes
    And Whisper returns 10 segments, of which 4 have no_speech_prob > 0.8
    When the STT worker processes the Whisper response
    Then the 4 high-noise segments are filtered out
    And only the 6 valid segments are stored in the Transcript
    And the fullText is built from the 6 remaining segments only
```

---

## Feature: STT Subtitles — Security

```gherkin
Feature: STT and Transcript Security

  @security @authorization
  Scenario: Unauthorized user cannot read another user's transcript
    Given user "alice" owns video "vid-alice-001" with a completed transcript
    And I am authenticated as user "bob" (not the video owner)
    When I call "transcript.getSegments" with { videoId: "vid-alice-001" }
    Then the response is a NOT_FOUND error (ownership check fails)
    And no transcript data is returned to "bob"
    And the attempted access is not logged as an error (treated as not found, not forbidden)

  @security @xss
  Scenario: XSS payload in subtitle edit is stored safely without execution
    Given I am authenticated as the owner of video "vid-xss-001"
    And the video has a transcript with at least 1 segment
    When I call "transcript.updateSegments" with { index: 0, text: "<script>alert('xss')</script>" }
    Then the tRPC mutation succeeds (text passes Zod validation — it is non-empty and under 1000 chars)
    And the text is stored as a plain string in the segments JSON column
    And when the TranscriptViewer renders the segment, React renders it as escaped text
    And no script execution occurs in the browser

  @security @path-traversal
  Scenario: FFmpeg is invoked with execFile to prevent shell injection
    Given the STT worker receives a job with a videoId whose S3 key contains special characters
    And the local temp path is constructed with mkdtemp and path.join
    When FFmpeg and FFprobe are invoked
    Then execFile (array arguments) is used — NOT exec (string interpolation)
    And the shell does not interpret any special characters from the file path
    And no command injection occurs
```

---

## Feature: STT Subtitles — Performance

```gherkin
Feature: STT Performance and Resource Management

  @performance @parallel-processing
  Scenario: Parallel chunk transcription completes within 90 seconds for 60-minute video
    Given a video with duration 60 minutes (6 chunks of 10 minutes)
    And each Whisper API call takes approximately 12-15 seconds per chunk
    When the STT worker processes the video with concurrency 3
    Then chunks are processed in 2 batches (3 + 3 concurrent)
    And total Whisper API time is ≤35 seconds (2 batches × ~15s + overhead)
    And total STT job duration (including download and extraction) is ≤90 seconds
    And the worker memory usage stays below 512MB (audio chunks only, not full video in RAM)

  @performance @resource-management
  Scenario: S3 download streams to disk without loading entire file into memory
    Given a video file of 4GB in S3
    And the worker has 512MB RAM limit
    When the STT worker downloads the video
    Then the download uses stream.pipeline to pipe S3 ReadableStream to a local file
    And at no point is the full file content held in memory
    And the download completes without an out-of-memory error
    And after download, audio extraction begins immediately

  @performance @cleanup
  Scenario: Temporary files are cleaned up within 5 seconds of job completion
    Given a successful STT job that created a /tmp/stt-xxxxxx directory
    And the directory contains source video, extracted audio WAV, and 6 chunk WAV files
    When the STT worker job completes (success or failure)
    Then the /tmp/stt-xxxxxx directory and all its contents are deleted within 5 seconds
    And the cleanup runs in a finally block (guaranteed even on exception)
    And no orphaned files remain in /tmp after normal job completion
```

---

## Coverage Gap Analysis and Existing Scenario Validation

### Validation of Existing Gherkin in Specification.md

The 13 scenarios in Specification.md are structurally well-formed with correct Given/When/Then grammar. The following issues and gaps were identified:

**Minor issues (formatting/clarity):**

1. **US-STT-01 — "STT provider selection" (Scenario lines 40-46)**: The single `Scenario` block mixes two separate cases using inline `And when ... Then` inside a Then clause. This is not valid Gherkin — the second case (`global`) should be a separate `Scenario` or use a `Scenario Outline` with Examples table. The current form will not parse correctly in Cucumber/Vitest-Gherkin.

   Recommended fix:
   ```gherkin
   Scenario Outline: STT provider selection routes to correct Whisper endpoint
     Given a user with llmProviderPreference "<preference>"
     When the STT job is processed
     Then "<model>" is used for transcription
     And the sttProvider stored is "<provider>"

     Examples:
       | preference | model               | provider |
       | ru         | whisper-large-v3    | cloudru  |
       | global     | whisper-1           | openai   |
   ```

2. **US-STT-01 — "Minutes quota enforcement" (Scenario lines 47-53)**: The scenario correctly describes partial transcription but does not assert that the user's minutesUsed is incremented by 5 (the partial amount). It should add: `And the user's minutesUsed is incremented by 5`.

3. **US-STT-01 — "Usage tracking" (Scenario lines 55-63)**: The table-based assertion `Then a UsageRecord is created with:` is valid Cucumber table syntax but uses an inline comment `(0.30₽/min × 60)` in the value column. These comments should be in the description or removed from the table cell to avoid parse errors.

**Missing coverage in existing Specification.md scenarios:**

| Gap | Area | Severity |
|-----|------|----------|
| No scenario for `transcript.getSegments` ownership check | Security / API | High |
| No scenario for `transcript.updateSegments` with out-of-bounds index | Error handling | Medium |
| No scenario for `transcript.updateSegments` text exceeding 1000 characters | Validation | Medium |
| No scenario for video status "uploading" showing the correct no-transcript UI copy | UI display | Low |
| No scenario for audio-only input (mp3/wav/m4a) skipping the FFmpeg extraction step | Edge case / optimization | Medium |
| No scenario for the `transcript.getFullText` tRPC endpoint | API coverage | Medium |
| No scenario for the STT worker receiving a job for a video NOT in "transcribing" status | Invalid state guard | Medium |
| No scenario for segment confidence stored from Whisper avg_logprob (logprob conversion formula) | Data integrity | Low |
| No scenario for fullText and tokenCount recomputation after updateSegments | Data integrity | Medium |
| No scenario verifying 4h video (24 chunks) completes within ~2 minutes | Performance NFR | Low |

**Well-covered by existing scenarios:**
- Basic STT happy path (clear speech, single speaker)
- Chunk splitting for >13 minute videos
- Whisper retry with exponential backoff
- Quota enforcement (partial transcription)
- Usage record creation with cost
- Transcript display states (ready, processing, not started)
- Inline edit, undo, batch save
- Empty text validation on edit
```
