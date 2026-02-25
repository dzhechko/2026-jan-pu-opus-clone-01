# Refinement: Clip Editor

## 1. Edge Cases Matrix

| # | Case | Expected Behavior | Component Affected | Priority |
|---|------|-------------------|--------------------|----------|
| 1 | Clip is rendering when user opens editor | Show read-only mode: all fields disabled, "Рендеринг..." indicator with spinner. Poll status every 3s. When rendering completes, switch to editable mode automatically. | ClipEditor, ActionBar | High |
| 2 | User navigates away with unsaved changes | Trigger `beforeunload` browser warning: "У вас есть несохранённые изменения. Уйти?" Also intercept Next.js route changes via `useRouter` events. | ClipEditor (store isDirty check) | High |
| 3 | Video source file deleted from S3 | VideoPreview shows error placeholder: "Видео недоступно". Disable preview and timeline. Allow metadata-only edits (title, CTA text). Save without triggering re-render if only metadata changed. | VideoPreview, Timeline, ActionBar | Medium |
| 4 | startTime >= endTime after drag | Prevent in real-time: clamp handles to maintain minimum 5-second gap. If start handle is dragged past `endTime - 5`, stop at `endTime - 5`. Same logic for end handle. Visual snap feedback. | Timeline | High |
| 5 | Clip duration > 180s after trim | Prevent: if user drags end handle to create >180s clip, clamp to 180s. Show warning toast: "Максимальная длительность клипа — 3 минуты". | Timeline | High |
| 6 | Clip duration < 5s after trim | Prevent: minimum duration enforced at 5 seconds. Handles cannot be dragged closer than 5s apart. | Timeline | Medium |
| 7 | Subtitle text empty (user clears text) | Allow: empty subtitle segments are valid (removes subtitle from that time range during render). Show visual indicator (dimmed row) in SubtitleEditor. | SubtitleEditor | Low |
| 8 | Very long subtitle text (>200 chars) | Show character counter. Warn at 200 chars with yellow indicator. Hard limit at 500 chars (Zod validation). Truncate display in overlay preview with ellipsis. | SubtitleEditor, VideoPreview | Medium |
| 9 | Concurrent edits (two browser tabs) | Last-write-wins strategy. On save, compare `updatedAt` from server response with stored value. If mismatch, show conflict dialog: "Клип был изменён в другой вкладке. Перезагрузить?" with options to reload or force save. | ClipEditor, ActionBar | Medium |
| 10 | Network error during save | Show error toast: "Не удалось сохранить. Проверьте соединение." Keep all editor state intact. Enable retry button. Do not reset isDirty flag. | ActionBar | High |
| 11 | Clip status changes to 'failed' after save | Show error banner: "Рендеринг не удался" with details if available. Show "Повторить рендеринг" button that re-submits the same render job. Allow editing while in failed state. | ClipEditor, ActionBar | High |
| 12 | User changes format (e.g., 9:16 to 16:9) | Immediately update aspect ratio container in VideoPreview. Recalculate subtitle overlay positioning. Mark isDirty. Save will trigger full re-render. | VideoPreview, MetadataPanel | Medium |
| 13 | Video file very large (>1GB source) | Do not preload entire video. Use range requests via S3 presigned URL. Show loading indicator while buffering. Timeline remains functional during buffering. | VideoPreview | Medium |
| 14 | User on slow connection (2G/3G) | Video preview may not load — show poster frame (thumbnail) as fallback. All non-video editing features remain functional. Save works regardless of video load state. | VideoPreview | Low |
| 15 | Clip belongs to different user | Server Component returns `notFound()` (404). No data leak — query includes `userId` filter. | Editor Page (RSC) | High |
| 16 | Invalid clipId or videoId in URL | Server Component returns `notFound()`. Prisma query returns null for non-existent UUIDs. Malformed UUIDs caught by route param validation. | Editor Page (RSC) | High |
| 17 | Browser tab goes to sleep (mobile/background) | On visibility change (`visibilitychange` event), pause polling. Resume polling when tab becomes visible again. Re-fetch clip status on resume. | ClipEditor | Low |
| 18 | User rapid-clicks Save button | Disable Save button immediately on click (`isSaving = true`). Prevent duplicate mutations. Re-enable only after server response (success or error). | ActionBar, Store | High |
| 19 | Subtitle segment time overlaps | Allow overlapping subtitle segments (valid for multi-line display). Sort by startTime in editor list. Visual overlap indicator in timeline if applicable. | SubtitleEditor | Low |
| 20 | CTA text contains HTML/script tags | Sanitize with DOMPurify before display in preview overlay. Zod schema strips HTML tags on input. Stored as plain text in DB. | MetadataPanel, VideoPreview | High |

## 2. Testing Strategy

### Unit Tests (Vitest)

| Test Area | What to Test | File |
|-----------|-------------|------|
| Zustand Store | `initialize()` sets all fields from clip data | `clip-editor-store.test.ts` |
| Zustand Store | `setTrimRange()` enforces min 5s, max 180s constraints | `clip-editor-store.test.ts` |
| Zustand Store | `isDirty` correctly computed after changes | `clip-editor-store.test.ts` |
| Zustand Store | `reset()` restores original values | `clip-editor-store.test.ts` |
| Zustand Store | `getChanges()` returns only modified fields | `clip-editor-store.test.ts` |
| Format Utils | Aspect ratio calculation for each ClipFormat | `format-utils.test.ts` |
| Time Utils | `formatTime(seconds)` → "MM:SS" display | `time-utils.test.ts` |
| Time Utils | `clampDuration(start, end, min, max)` logic | `time-utils.test.ts` |
| Validation | `clipUpdateFullInput` schema rejects invalid data | `clip-validation.test.ts` |
| Validation | Subtitle segment schema edge cases (empty text, overlaps) | `clip-validation.test.ts` |

### Integration Tests (Vitest + tRPC test caller)

| Test Area | What to Test | Notes |
|-----------|-------------|-------|
| `clip.updateFull` | Updates all fields, returns updated clip | Mock Prisma, verify query args |
| `clip.updateFull` | Triggers render job when video fields change | Mock BullMQ, verify job added |
| `clip.updateFull` | Skips render for title-only change | Mock BullMQ, verify no job |
| `clip.updateFull` | Rejects if `userId` doesn't match | Expect TRPCError FORBIDDEN |
| `clip.updateFull` | Rejects `startTime >= endTime` | Expect Zod validation error |
| `clip.updateFull` | Handles `updatedAt` conflict detection | Simulate concurrent update |

### E2E Tests (Playwright)

```gherkin
Feature: Clip Editor

  Scenario: Edit clip title and save
    Given I am logged in as a user with an existing clip
    When I navigate to the clip editor for that clip
    And I change the title to "Новый заголовок"
    And I click "Сохранить"
    Then I should see a "Рендеринг..." indicator
    And the clip title in the database should be "Новый заголовок"

  Scenario: Trim clip using timeline
    Given I am on the clip editor page
    When I drag the start handle to 5 seconds
    And I drag the end handle to 30 seconds
    And I click "Сохранить"
    Then the clip startTime should be 5
    And the clip endTime should be 30
    And a render job should be queued

  Scenario: Edit subtitle text
    Given I am on the clip editor with subtitles
    When I click on the first subtitle segment
    And I change the text to "Обновлённый текст"
    And I click "Сохранить"
    Then the subtitle overlay should show "Обновлённый текст"

  Scenario: Prevent navigation with unsaved changes
    Given I have made changes in the clip editor
    When I click the browser back button
    Then I should see a confirmation dialog

  Scenario: View read-only editor during rendering
    Given a clip with status "rendering"
    When I navigate to its editor
    Then all form fields should be disabled
    And I should see a "Рендеринг..." message

  Scenario: Handle render failure
    Given I saved a clip and rendering failed
    When the editor polls and detects status "failed"
    Then I should see an error message
    And I should see a "Повторить рендеринг" button
```

### Visual Regression Tests

| Test | Viewport | What to Compare |
|------|----------|-----------------|
| Subtitle overlay position (9:16) | 390x844 | Subtitle text centered at bottom of vertical frame |
| Subtitle overlay position (16:9) | 1280x720 | Subtitle text centered at bottom of horizontal frame |
| Subtitle overlay position (1:1) | 1080x1080 | Subtitle text centered at bottom of square frame |
| Timeline handles at extremes | 1280x720 | Handles at 0s and max duration |
| Read-only rendering state | 1280x720 | Disabled fields, spinner visible |

## 3. Performance

### Rendering Performance

| Optimization | Implementation | Impact |
|-------------|----------------|--------|
| Lazy video load | `<video preload="metadata">`, do not autoplay | Saves bandwidth, faster initial paint |
| Debounced timeline drag | `requestAnimationFrame` (16ms) throttle on drag events | Smooth dragging without excessive re-renders |
| Memoized subtitle overlay | `useMemo` on subtitle segments + currentTime → visible segments | Avoids recalculating on every frame |
| Server Component prefetch | Clip data fetched server-side, passed as props (no client waterfall) | Eliminates loading spinner on initial load |
| Selective Zustand subscriptions | Components subscribe to specific slices (e.g., `useStore(s => s.title)`) | Prevents full-tree re-renders on any change |
| Thumbnail poster frame | Clip thumbnail as `<video poster>` | Immediate visual while video loads |

### Bundle Size

| Concern | Mitigation |
|---------|-----------|
| Video player code | No external player library — native HTML5 `<video>` element |
| Zustand | ~1KB gzipped, negligible impact |
| DOMPurify | ~7KB gzipped, load only in SubtitleEditor and MetadataPanel |
| Timeline drag logic | Custom implementation, no heavy drag-and-drop library |

### Network

| Request | Optimization |
|---------|-------------|
| Video source | S3 presigned URL with range request support, browser handles buffering |
| Clip data (initial) | Server-side fetch, zero client round-trips |
| Save mutation | Single tRPC call with all changes batched |
| Status polling | 3s interval, auto-stop when status resolves, pause when tab hidden |

### Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to Interactive (editor page) | < 1.5s | Lighthouse |
| First Contentful Paint | < 0.8s | Lighthouse (skeleton renders fast) |
| Save round-trip | < 500ms | tRPC mutation response time |
| Timeline drag latency | < 16ms per frame | Chrome DevTools Performance tab |
| Memory (with video loaded) | < 150MB | Chrome DevTools Memory tab |

## 4. Accessibility

### Keyboard Navigation

| Component | Keyboard Support |
|-----------|-----------------|
| Timeline start handle | `Tab` to focus, `Left/Right` arrow keys for 0.1s adjustment, `Shift+Arrow` for 1s |
| Timeline end handle | `Tab` to focus, `Left/Right` arrow keys for 0.1s adjustment, `Shift+Arrow` for 1s |
| Video preview | `Space` to play/pause, `Left/Right` for 5s skip |
| Subtitle segment list | `Tab` between rows, `Enter` to edit, `Escape` to cancel |
| Format selector | Standard radio group: `Arrow` keys to switch |
| Save button | `Ctrl+S` / `Cmd+S` global shortcut |
| Cancel button | `Escape` (when no field is focused) |

### ARIA & Semantics

| Element | ARIA |
|---------|------|
| Timeline | `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-label="Начало клипа"` / `"Конец клипа"` |
| Video preview | `aria-label="Предпросмотр клипа"` |
| Subtitle overlay | `role="status"`, `aria-live="polite"` (updates as video plays) |
| Rendering indicator | `role="status"`, `aria-live="assertive"` |
| Save button (loading) | `aria-busy="true"`, `aria-disabled="true"` |
| Error messages | `role="alert"` |

### Visual Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Color contrast | All text meets WCAG AA (4.5:1 ratio minimum) |
| Focus indicators | Visible focus ring on all interactive elements (Tailwind `ring-2`) |
| Motion sensitivity | Respect `prefers-reduced-motion`: disable timeline animations, reduce polling frequency |
| Text scaling | Editor layout responsive to 200% browser zoom without horizontal scroll |

### Localization Note

All UI text is in Russian (target audience). Labels use clear, descriptive Russian text:
- "Сохранить" (Save), "Отмена" (Cancel), "Предпросмотр" (Preview)
- "Начало" (Start), "Конец" (End), "Длительность" (Duration)
- Error messages in Russian with actionable guidance

## 5. Technical Debt & Known Limitations

### Existing Debt (to address during implementation)

| Item | Current State | Required Change | Effort |
|------|--------------|-----------------|--------|
| `clip.update` limited fields | Only handles title, startTime, endTime | Extend to `clip.updateFull` with format, subtitles, CTA, subtitleStyle | Medium |
| Publish queue jobs | TODO stub at clip.ts ~line 180 | Not blocking editor — publish is a separate feature | N/A (out of scope) |
| No `updatedAt` conflict detection | Blind overwrites | Add `updatedAt` field to update input, compare before write | Low |

### New Debt Created by This Feature

| Item | Reason | Remediation Plan |
|------|--------|-----------------|
| Polling instead of WebSocket | Simpler implementation, no WS infrastructure | Migrate to tRPC subscriptions when WebSocket support is added project-wide |
| Last-write-wins concurrency | Full OT/CRDT overkill for single-user editor | Acceptable for MVP; revisit if collaborative editing is ever needed |
| No undo/redo | Adds significant complexity to Zustand store | Phase 2: implement undo stack with Zustand middleware (zustand/middleware) |
| No keyboard shortcuts beyond basics | Time constraint | Phase 2: add `Ctrl+Z` (undo), `Ctrl+Shift+Z` (redo), `Ctrl+S` (save) |
| CSS subtitle preview != FFmpeg render | CSS overlay is approximate; burn-in may differ slightly | Acceptable trade-off: real-time preview vs accuracy. Users can re-render if needed. |

### Migration Notes

- No database migration needed (Clip model already has all required fields).
- No new environment variables.
- No breaking changes to existing API — `clip.updateFull` is a new endpoint, existing `clip.update` remains for backward compatibility.
- Feature flag: `CLIP_EDITOR_ENABLED=true` in environment to enable route (optional, can launch directly).
