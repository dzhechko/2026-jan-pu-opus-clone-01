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

  Scenario: Plan-based clip limits
    Given a free plan user with a completed transcript
    When moment selection finds 8 candidate moments
    Then only the top 3 clips (by virality score) are saved
    And the remaining 5 are discarded

  Scenario: Start plan clip limits
    Given a start plan user with a completed transcript
    When moment selection finds 12 candidate moments
    Then only the top 10 clips are saved

  Scenario: Pro/Business unlimited clips
    Given a pro plan user with a completed transcript
    When moment selection finds 10 candidate moments
    Then all 10 clips are saved

  Scenario: No good moments found
    Given a transcript with low-quality content
    When moment selection returns 0 moments
    Then the system retries with a higher LLM tier (tier+1)
    And if still 0 after retry, creates minimum 3 clips from evenly-spaced segments

  Scenario: Long transcript (>100K tokens)
    Given a transcript with tokenCount > 100000
    When moment selection runs
    Then tier3 model (GLM-4.6 200K context) is used automatically

  Scenario: Processing time SLA
    Given a 60-minute video transcript
    When the full LLM pipeline runs (selection + scoring + titles + CTAs)
    Then total processing completes within 180 seconds
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
    Then the clip has a non-empty title
    And the title is under 60 characters
    And the title is in Russian

  Scenario: Unique titles across clips
    Given a video with 10 generated clips
    When all titles are generated
    Then no two clips have identical titles
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
    And cta.text is 3-8 words in Russian
    And cta.position is "end" or "overlay"
    And cta.duration is 3-5 seconds
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
    Then I see "Анализируем моменты..." with a spinner
    And the clips section shows a placeholder

  Scenario: Video in generating_clips state
    Given a video has status "generating_clips"
    When I view the video detail page
    Then I see "Генерируем клипы..." with a spinner
    And clip cards appear as they become ready

  Scenario: Processing complete
    Given a video has status "completed"
    When I view the video detail page
    Then I see all clips sorted by virality score
    And the spinner is gone
```

## Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-MV-01 | LLM analysis for 60-min video | < 180s |
| NFR-MV-02 | LLM cost per video (RU, 60 min) | < 3₽ |
| NFR-MV-03 | Moment selection retry on failure | Max 2 attempts (tier escalation) |
| NFR-MV-04 | Parallel scoring concurrency | 3 concurrent LLM calls |
| NFR-MV-05 | Parallel title/CTA concurrency | 5 concurrent LLM calls |
| NFR-MV-06 | Clip card render time (10 clips) | < 100ms |
| NFR-MV-07 | JSON response validation | Zod schema on every LLM response |

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
