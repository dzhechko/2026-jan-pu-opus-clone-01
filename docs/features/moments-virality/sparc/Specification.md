# Specification: Moments + Virality

## User Stories

### US-MV-01: Moment Selection

**As a** content creator,
**I want** the AI to automatically find the best moments from my video transcript,
**So that** I get engaging short clips without manual searching.

**Acceptance Criteria:**

```gherkin
Feature: Moment Selection

  Scenario: Successful moment detection
    Given a video has status "analyzing" with a completed transcript
    When the LLM analysis completes
    Then 3-10 clip records are created in the database
    And each clip has startTime and endTime within the source video duration
    And each clip duration is between 15 and 60 seconds
    And clips are sorted by viralityScore.total descending
    And overlapping moments (>50% overlap) are deduplicated, keeping higher hookStrength

  Scenario: Plan-based clip limits
    Given a free plan user with a completed transcript
    When moment selection finds 8 candidate moments
    Then only the top 3 clips (by virality score) are saved to the database
    And the remaining 5 candidates are not persisted

  Scenario: Start plan clip limits
    Given a start plan user with a completed transcript
    When moment selection finds 12 candidate moments
    Then only the top 10 clips are saved

  Scenario: Pro/Business unlimited clips
    Given a pro plan user with a completed transcript
    When moment selection finds 10 candidate moments
    Then all 10 clips are saved

  Scenario: No good moments found
    Given a transcript where the LLM returns 0 candidate moments
    When moment selection completes with empty results
    Then the system retries with a higher LLM tier (tier+1, max 1 retry)
    And if still 0 after retry, creates 3 clips from evenly-spaced 30-second segments

  Scenario: Empty or very short transcript
    Given a transcript with fullText shorter than 100 words
    When moment selection runs
    Then the system skips LLM analysis
    And creates 1 clip spanning the full video duration (capped at 60 seconds from the middle)

  Scenario: Long transcript (>32K tokens)
    Given a transcript with tokenCount > 32000
    When moment selection runs
    Then LLM Router selects tier3 model (GLM-4.6, 200K context) automatically
    And if tokenCount > 200000, the transcript is truncated to 200K tokens before sending

  Scenario: LLM returns non-JSON response
    Given the LLM returns a non-parseable response despite JSON mode
    When Zod validation fails on the response
    Then the system retries the same LLM call once
    And if retry also fails to parse, the job is retried by BullMQ with exponential backoff

  Scenario: LLM cost cap exceeded
    Given the accumulated LLM cost for a video exceeds 1000 kopecks (10₽)
    When the next LLM call would be made
    Then the system aborts processing
    And the video status is set to "failed"
    And the error is logged with event "llm_cost_cap_exceeded"

  Scenario: Unauthorized access attempt
    Given user A owns video "video-123"
    And user B is authenticated
    When user B attempts to trigger moment selection on "video-123"
    Then the API returns HTTP 403 Forbidden
    And no analysis job is enqueued
```

### US-MV-02: Virality Scoring

**As a** content creator,
**I want** each clip scored for viral potential on 4 dimensions,
**So that** I can prioritize the best clips for publishing.

**Acceptance Criteria:**

```gherkin
Feature: Virality Scoring

  Scenario: Score structure
    Given a clip has been created from moment selection
    When virality scoring completes
    Then the clip has viralityScore with fields: hook, engagement, flow, trend, total, tips
    And hook is 0-25, engagement is 0-25, flow is 0-25, trend is 0-25
    And total equals hook + engagement + flow + trend
    And tips is an array of 1-3 improvement suggestions in Russian

  Scenario: Score display on clip card
    Given a clip with viralityScore.total = 78
    When I view the clips list on the video detail page
    Then I see "78/100" displayed on the clip card
    And the score badge is green (>=70), yellow (40-69), or gray (<40)

  Scenario: Score breakdown view
    Given a clip with viralityScore = {hook: 22, engagement: 20, flow: 18, trend: 18}
    When I click on the score badge
    Then I see a breakdown showing each dimension with a progress bar
    And I see tips for improvement (e.g., "Усильте хук в первые 3 секунды")

  Scenario: Scoring LLM returns invalid response
    Given a clip is ready for virality scoring
    When the LLM returns JSON failing Zod validation
    Then the system uses a fallback score derived from moment.hookStrength
    And fallback: total = hookStrength * 4, each dimension = hookStrength, tips = []
    And the failure is logged at WARN level

  Scenario: Score color boundary values
    Given clips with viralityScore.total values of 39, 40, 69, 70
    When displayed on the clips list
    Then score 39 shows gray badge, 40 shows yellow badge
    And score 69 shows yellow badge, 70 shows green badge
```

### US-MV-03: Title Generation

**As a** content creator,
**I want** each clip to have an AI-generated catchy title,
**So that** I can use it directly or as inspiration for platform publishing.

**Acceptance Criteria:**

```gherkin
Feature: Title Generation

  Scenario: Title created for each clip
    Given a clip has been created from moment selection
    When title generation completes
    Then the clip has a non-empty title between 10 and 60 characters
    And the title is in Russian (enforced by LLM system prompt)

  Scenario: Unique titles across clips
    Given a video with 10 generated clips
    When all titles are generated
    Then no two clips have identical titles
    And if duplicate detected, system appends a distinguishing suffix (e.g., " — Ч.2")

  Scenario: Title LLM returns invalid response
    Given a clip is ready for title generation
    When the LLM returns empty or non-parseable response
    Then the system falls back to the preliminary title from moment selection
    And the failure is logged at WARN level

  Scenario: Title exceeds character limit
    Given the LLM returns a title longer than 60 characters
    When Zod validation fails on the title length
    Then the system truncates to 57 characters and appends "..."
```

### US-MV-04: CTA Suggestion

**As a** content creator,
**I want** each clip to have a suggested call-to-action,
**So that** I can drive viewers to my course.

**Acceptance Criteria:**

```gherkin
Feature: CTA Suggestion

  Scenario: CTA generated for each clip
    Given a clip has been created from moment selection
    When CTA generation completes
    Then the clip has a cta field with text, position, and duration
    And cta.text is 3-8 space-separated tokens in Russian
    And cta.text is at most 50 characters
    And cta.position is "end" or "overlay"
    And cta.duration is an integer of 3, 4, or 5 seconds

  Scenario: CTA generation LLM failure
    Given a clip is ready for CTA generation
    When the LLM call fails or returns invalid response
    Then the clip receives cta = null (no CTA)
    And the failure is logged at WARN level

  Scenario: CTA word count out of range
    Given the LLM returns cta.text with 10 words
    When Zod validation fails on word count
    Then the system retries CTA generation once
    And if retry also fails, cta is set to null
```

### US-MV-05: Processing Status

**As a** content creator,
**I want** to see the processing progress on the video detail page,
**So that** I know when my clips will be ready.

**Acceptance Criteria:**

```gherkin
Feature: Processing Status

  Scenario: Video in analyzing state
    Given a video has status "analyzing"
    When I view the video detail page
    Then I see "Анализируем моменты..." with a spinner [data-testid="processing-spinner"]
    And the clips section shows a skeleton placeholder [data-testid="clips-placeholder"]

  Scenario: Video in generating_clips state
    Given a video has status "generating_clips"
    When I view the video detail page
    Then I see "Генерируем клипы..." with a spinner
    And the page polls clip.getByVideo every 5 seconds
    And clip cards appear within 10 seconds of being created in the database

  Scenario: Processing complete
    Given a video has status "completed"
    When I view the video detail page
    Then I see all clips sorted by virality score
    And the spinner is not displayed

  Scenario: Processing failed
    Given a video has status "failed"
    When I view the video detail page
    Then I see "Ошибка обработки" with an error icon
    And a "Повторить" (retry) button is displayed
    And no clip cards are shown
```

## Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-MV-01 | LLM analysis for 60-min video (LLM pipeline only, excluding STT) | < 180s |
| NFR-MV-02 | LLM cost per video (RU, 60 min) | < 3₽ (alert); abort at 10₽ |
| NFR-MV-03 | Moment selection retry on failure | Max 2 attempts (tier escalation) |
| NFR-MV-04 | Peak concurrent LLM calls (3 moments × 3 tasks via pMap + Promise.all) | Up to 9 concurrent |
| NFR-MV-05 | Parallel title/CTA concurrency (within Promise.all per moment) | 3 per moment |
| NFR-MV-06 | Clip card render time (10 clips) | < 100ms |
| NFR-MV-07 | JSON response validation | Zod schema on every LLM response |
| NFR-MV-08 | Real-time clip status polling interval | Every 5 seconds while generating_clips |

## Feature Matrix

| Capability | MVP | v1.1 | v2 |
|-----------|-----|------|-----|
| Moment selection from transcript | X | | |
| Virality scoring (4 dimensions) | X | | |
| Title generation | X | | |
| CTA suggestions | X | | |
| Score breakdown UI | X | | |
| Manual moment adjustment | | X | |
| Trend data from platform APIs | | | X |
| A/B title testing | | | X |
