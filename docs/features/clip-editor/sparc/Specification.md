# Clip Editor — Specification

## Overview

The Clip Editor is the interactive UI for editing AI-generated clips within the dashboard. Users navigate from a video detail page to a specific clip, then into a full editor view where they can trim boundaries, edit subtitles, change format, configure CTAs, preview changes, and save — triggering a re-render when structural changes are made.

## Target Route

`/dashboard/videos/[videoId]/clips/[clipId]/edit`

---

## User Stories

### US-CE-01: View Clip in Editor

**Priority:** P0

**Description:** As a course author, I want to open an AI-generated clip in an editor so that I can review and adjust it before publishing.

**Acceptance Criteria:**
- Editor page loads clip data including video source, subtitles, CTA, metadata, and virality score
- Video preview renders with the correct aspect ratio for the clip's current format
- Timeline shows the clip segment boundaries within the full video duration
- Subtitle list displays all subtitle segments with timestamps
- Metadata panel shows title, format, CTA settings, and read-only virality score
- Breadcrumb navigation: Dashboard > Video > Clips > Edit
- Page displays a loading skeleton while data fetches
- 404 page shown if clip or video does not exist
- Access denied if clip does not belong to the authenticated user

**BDD Scenarios:**

```gherkin
Feature: View clip in editor

  Scenario: Successfully open clip editor from video detail page
    Given I am logged in and viewing video "Вебинар: Продажи 2026"
    And the video has a clip "Топ-3 ошибки продавцов" with status "ready"
    When I click "Редактировать" on the clip card
    Then I am navigated to "/dashboard/videos/{videoId}/clips/{clipId}/edit"
    And I see the video preview with the clip playing from startTime
    And I see the timeline with start and end handles at the clip boundaries
    And I see the subtitle list with all subtitle segments
    And I see the metadata panel with title "Топ-3 ошибки продавцов"
    And I see the virality score breakdown

  Scenario: Clip not found
    Given I am logged in
    When I navigate to "/dashboard/videos/{videoId}/clips/nonexistent-id/edit"
    Then I see a "Клип не найден" error page with a link back to the video

  Scenario: Clip belongs to another user
    Given I am logged in as user "alice@example.com"
    And clip "clip-123" belongs to user "bob@example.com"
    When I navigate to the edit page for "clip-123"
    Then I see a 404 error page

  Scenario: Clip is currently rendering
    Given I am logged in and viewing clip editor for a clip with status "rendering"
    Then the "Сохранить" button is disabled
    And I see a rendering progress indicator
    And the subtitle list and metadata panel are still viewable but read-only
```

---

### US-CE-02: Trim Clip via Timeline

**Priority:** P0

**Description:** As a course author, I want to adjust the start and end times of a clip by dragging timeline handles so that I can select the best segment.

**Acceptance Criteria:**
- Timeline displays a horizontal bar representing the full source video duration
- Clip boundaries shown as draggable start and end handles
- Dragging a handle updates startTime/endTime in the editor store
- Minimum clip duration: 5 seconds; maximum: 180 seconds
- Video preview jumps to the new boundary position when a handle is released
- Timeline visually highlights the selected clip segment
- Changes mark the editor as dirty (unsaved changes)
- Duration display updates in real-time as handles move

**BDD Scenarios:**

```gherkin
Feature: Trim clip via timeline

  Scenario: Drag start handle to later position
    Given I am in the clip editor with startTime 30s and endTime 60s
    When I drag the start handle from 30s to 35s
    Then the startTime updates to 35s
    And the duration display shows "25 сек"
    And the video preview seeks to 35s
    And the editor shows unsaved changes indicator

  Scenario: Drag end handle to earlier position
    Given I am in the clip editor with startTime 30s and endTime 60s
    When I drag the end handle from 60s to 50s
    Then the endTime updates to 50s
    And the duration display shows "20 сек"
    And the video preview seeks to 50s

  Scenario: Prevent clip shorter than 5 seconds
    Given I am in the clip editor with startTime 30s and endTime 35s
    When I drag the end handle to 34s
    Then the end handle snaps back to 35s
    And I see a tooltip "Минимальная длительность: 5 сек"

  Scenario: Prevent clip longer than 180 seconds
    Given I am in the clip editor with startTime 0s and endTime 60s
    When I drag the end handle to 200s
    Then the end handle snaps to 180s
    And I see a tooltip "Максимальная длительность: 180 сек"

  Scenario: Save trimmed clip triggers re-render
    Given I have changed startTime from 30s to 35s
    When I click "Сохранить"
    Then the clip is saved with startTime 35s
    And a re-render job is queued
    And the clip status changes to "rendering"
    And the "Сохранить" button becomes disabled
```

---

### US-CE-03: Edit Subtitle Text

**Priority:** P0

**Description:** As a course author, I want to edit the text of subtitle segments so that I can fix transcription errors or improve phrasing.

**Acceptance Criteria:**
- Subtitle list shows each segment with start time, end time, and text
- Clicking a segment activates inline text editing
- Text changes reflect immediately in the video preview overlay
- Clicking a segment also seeks the video to that segment's start time
- Active segment is visually highlighted in both the list and the preview
- Empty subtitle text IS allowed — it removes the subtitle segment from that time range during render. Show a visual indicator (dimmed row) but don't block.
- Changes mark the editor as dirty
- Save persists subtitle changes via a new `clip.updateFull` tRPC mutation

**BDD Scenarios:**

```gherkin
Feature: Edit subtitle text

  Scenario: Edit subtitle segment text inline
    Given I am in the clip editor with 5 subtitle segments
    When I click on subtitle segment #3 with text "Привет мир"
    Then the segment becomes an editable text input
    And the video seeks to the start time of segment #3
    And segment #3 is highlighted in the subtitle list

  Scenario: Preview updates in real-time as I type
    Given I am editing subtitle segment #3
    When I change the text from "Привет мир" to "Привет, мир!"
    Then the video preview overlay shows "Привет, мир!" at the segment position

  Scenario: Empty subtitle text removes segment from render
    Given I am editing subtitle segment #3
    When I clear the text field completely
    Then the segment row appears dimmed in the subtitle list
    And the video preview no longer shows a subtitle for that time range
    And the "Сохранить" button remains enabled
    And saving will exclude this segment from the rendered video

  Scenario: Save edited subtitles
    Given I have edited subtitle segment #3 text
    When I click "Сохранить"
    Then the subtitleSegments are updated in the database
    And a re-render job is queued
    And the clip status changes to "rendering"
```

---

### US-CE-04: Change Clip Format

**Priority:** P1

**Description:** As a course author, I want to change the output format (portrait, square, landscape) so that I can optimize for different platforms.

**Acceptance Criteria:**
- Format selector shows three options: portrait (9:16), square (1:1), landscape (16:9)
- Each option displays a visual aspect ratio preview icon
- Selecting a format updates the video preview container aspect ratio immediately
- Current format is visually indicated (active state)
- Format change marks the editor as dirty
- Save with format change triggers re-render (FFmpeg re-encodes)

**BDD Scenarios:**

```gherkin
Feature: Change clip format

  Scenario: Switch from portrait to square
    Given I am in the clip editor with format "portrait" (1080x1920)
    When I select the "square" format option
    Then the video preview container changes to 1:1 aspect ratio
    And the format selector shows "square" as active
    And the editor shows unsaved changes indicator

  Scenario: Switch to landscape
    Given I am in the clip editor with format "portrait"
    When I select the "landscape" format option
    Then the video preview container changes to 16:9 aspect ratio

  Scenario: Save format change triggers re-render
    Given I have changed the format from "portrait" to "square"
    When I click "Сохранить"
    Then the clip format is updated to "square" in the database
    And a re-render job is queued with the new format dimensions (1080x1080)
    And the clip status changes to "rendering"
```

---

### US-CE-05: Edit CTA

**Priority:** P1

**Description:** As a course author, I want to configure the call-to-action overlay or end card so that I can drive viewers to my course.

**Acceptance Criteria:**
- CTA editor section in the metadata panel
- Text input for CTA message (max 100 characters)
- Position toggle: "В конце" (end card) or "Наложение" (overlay)
- Duration slider: 3-10 seconds (for end card) or 3-clip_duration seconds (for overlay)
- Preview shows CTA at the configured position when playing the corresponding time range
- Empty CTA text removes the CTA from the clip
- Changes mark the editor as dirty
- Save with CTA changes triggers re-render

**BDD Scenarios:**

```gherkin
Feature: Edit CTA

  Scenario: Set CTA text and position
    Given I am in the clip editor with no CTA configured
    When I enter CTA text "Записаться на курс со скидкой 50%"
    And I select position "В конце"
    And I set duration to 5 seconds
    Then the preview shows the CTA end card in the last 5 seconds of the clip

  Scenario: Switch CTA to overlay
    Given I have a CTA with position "end"
    When I switch position to "Наложение"
    Then the preview shows the CTA as a semi-transparent overlay
    And the duration slider maximum adjusts to the clip duration

  Scenario: Remove CTA by clearing text
    Given I have a CTA with text "Записаться на курс"
    When I clear the CTA text field
    Then the CTA section shows "CTA не задан"
    And the preview no longer shows any CTA

  Scenario: CTA text exceeds maximum length
    Given I am editing the CTA text
    When I type more than 100 characters
    Then the input stops accepting characters at 100
    And I see a character counter "100/100"

  Scenario: Save CTA changes
    Given I have configured a new CTA
    When I click "Сохранить"
    Then the CTA is persisted to the database
    And a re-render job is queued
```

---

### US-CE-06: Preview and Save

**Priority:** P0

**Description:** As a course author, I want to preview the clip with all my edits applied and save changes that trigger a re-render when needed.

**Acceptance Criteria:**
- "Предпросмотр" button plays the clip from startTime to endTime with subtitles and CTA overlaid
- Playback stops automatically at endTime
- "Сохранить" button saves all dirty fields in a single mutation
- Save determines if re-render is needed (time, format, subtitle, or CTA changes)
- "Сохранить" is disabled when: no unsaved changes, save in progress, or clip is rendering
- "Отмена" button resets all edits to the last saved state
- Rendering progress indicator shown when clip status is "rendering"
- After rendering completes, editor re-fetches clip data and enables editing
- If save fails, error toast is shown and editor remains in dirty state
- Unsaved changes warning on navigation away (beforeunload)

**BDD Scenarios:**

```gherkin
Feature: Preview and save

  Scenario: Preview clip with all edits
    Given I have edited the title, trimmed the timeline, and changed a subtitle
    When I click "Предпросмотр"
    Then the video plays from the new startTime
    And subtitles display with the edited text
    And playback stops automatically at the new endTime

  Scenario: Save all changes
    Given I have unsaved changes to title, startTime, and subtitle text
    When I click "Сохранить"
    Then a single tRPC mutation `clip.updateFull` is called with all changed fields
    And I see a "Сохранение..." loading indicator on the button
    And after success I see a toast "Клип сохранён. Рендеринг запущен."
    And the editor state resets isDirty to false

  Scenario: Save with only title change (no re-render)
    Given I have changed only the clip title
    When I click "Сохранить"
    Then the mutation is called with only the title change
    And no re-render job is queued
    And I see a toast "Клип сохранён"

  Scenario: Cancel unsaved changes
    Given I have edited the title from "Original" to "Modified"
    When I click "Отмена"
    Then the title reverts to "Original"
    And the editor is no longer in dirty state
    And the "Сохранить" button is disabled

  Scenario: Prevent save while rendering
    Given the clip status is "rendering"
    Then the "Сохранить" button is disabled
    And I see a spinner with text "Рендеринг..."

  Scenario: Warn on navigation with unsaved changes
    Given I have unsaved changes in the editor
    When I click the browser back button
    Then I see a browser confirmation dialog "Есть несохранённые изменения. Покинуть страницу?"

  Scenario: Save fails with server error
    Given I have unsaved changes
    And the server returns a 500 error on save
    When I click "Сохранить"
    Then I see an error toast "Ошибка сохранения. Попробуйте ещё раз."
    And the editor remains in dirty state
    And the "Сохранить" button is re-enabled

  Scenario: Rendering completes while editor is open
    Given the clip status is "rendering"
    When the rendering job completes
    Then the editor re-fetches the clip data
    And the clip status updates to "ready"
    And editing controls are re-enabled
    And the video preview shows the newly rendered clip
```

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Editor page load time (TTFB) | < 500ms |
| Video preview seek latency | < 200ms |
| Subtitle overlay render | < 16ms (60fps) |
| Timeline drag responsiveness | < 16ms (60fps) |
| Save mutation response time | < 500ms (excluding render) |
| Max subtitle segments per clip | 500 |
| Max CTA text length | 100 characters |
| Min clip duration | 5 seconds |
| Max clip duration | 180 seconds |
| Supported formats | portrait (1080x1920), square (1080x1080), landscape (1920x1080) |

## Dependencies

- Existing tRPC procedures: `clip.get`, `clip.update`, `clip.download`
- New tRPC mutation: `clip.updateFull` (consolidates all editable fields)
- BullMQ render job queue (existing `apps/worker/workers/`)
- S3 presigned URLs for video source playback
- Zustand for client-side editor state management

## Out of Scope

- Subtitle style editing (font, color, size) — future iteration
- Subtitle timing adjustment (only text editing in this version)
- Multi-clip batch editing
- Undo/redo history
- Real-time collaboration
- Audio waveform visualization on timeline
