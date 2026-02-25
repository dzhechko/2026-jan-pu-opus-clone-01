# Clip Editor — Solution Strategy

## First Principles Analysis

**Question:** What is the minimal set of edits a course creator needs to perform on an AI-generated clip?

The AI pipeline outputs a clip with: trim points (startTime/endTime), subtitle segments, CTA, format, and title. Each of these can be wrong or need adjustment. Working backward from what users actually change:

1. **Trim (startTime/endTime).** The AI may start too early or cut too late. This is the most common edit — users need to see the frame at the cut point and drag to adjust.
2. **Subtitle text.** Whisper transcription errors (especially with Russian domain-specific terms like course names, brand terms). Users need to fix typos in the text; timing is usually correct.
3. **CTA text and placement.** The AI generates a generic CTA; users want to customize the call-to-action for their specific offer or link.
4. **Format.** The AI picks a default format, but users may need a different one depending on the target platform (VK Stories = 9:16, Telegram = varies, YouTube Shorts = 9:16, Dzen = 16:9).
5. **Title/description.** Light text edits for SEO or branding.

Everything else (audio levels, transitions, filters, multi-track) is either unnecessary for promo shorts or too complex for the target user. The editor should handle exactly these five edit types and nothing more.

## TRIZ Contradiction Resolution

**Contradiction:** Users want a *rich, capable editor* (to handle all the edits above with visual feedback) but also a *simple, non-intimidating interface* (they are course creators, not video editors).

**TRIZ Principle #1 — Segmentation:** Break the editor into independent, collapsible sections rather than one dense panel.

**TRIZ Principle #2 — Prior Action:** Show the AI's output as the default state. The editor is pre-filled and functional — the user only touches what needs changing.

**TRIZ Principle #15 — Dynamization (Progressive Disclosure):**

- **Basic view (default):** Video player with trim handles, title field, and a prominent Save button. This covers 70% of edits (trim + title).
- **Advanced panel (expandable):** Subtitle segment list, CTA editor, format selector. Collapsed by default but one click to expand.
- **Preview mode:** A clean, distraction-free view of the final result. Toggle between Edit and Preview.

This resolves the contradiction: the interface appears simple on first load (just a video player with trim handles) but all editing power is accessible one click away.

## Key Architecture Decisions

### Decision 1: Client-Side Preview vs. Server-Side Render Preview

| Option | Pros | Cons |
|--------|------|------|
| Client-side (HTML5 video + CSS overlay) | Instant feedback, no server cost, no waiting | Not pixel-perfect vs FFmpeg output |
| Server-side (render preview clip) | Pixel-perfect result | 30-60s delay per change, high server cost |

**Decision: Client-side preview.**

Rationale: The entire value of the editor is instant visual feedback. A 30-60 second render cycle per adjustment defeats the purpose. CSS subtitle overlay and aspect ratio cropping provide a "close enough" preview (95%+ accuracy). The final FFmpeg render happens once on save, not on every tweak.

Implementation:
- HTML5 `<video>` element with source video S3 presigned URL.
- CSS `object-fit` and container aspect ratio for format preview.
- Absolutely-positioned `<div>` overlays for subtitles and CTA, synced to `timeupdate` events.
- Playback constrained to `startTime`-`endTime` via `currentTime` clamping.

### Decision 2: Dedicated Page vs. Modal/Drawer

| Option | Pros | Cons |
|--------|------|------|
| Dedicated page (`/clips/[clipId]/edit`) | Full viewport for timeline + preview, clean URL, shareable | Navigation away from clip list |
| Modal or slide-over drawer | Stay on video detail page, quick access | Cramped space, especially for timeline |

**Decision: Dedicated page.**

Rationale: The timeline scrubber needs horizontal space. A modal would force a tiny timeline or require scrolling. A dedicated page gives the editor breathing room and a clean URL that can be bookmarked or shared. The "Back" button provides a clear return path to the video detail page.

Route: `/dashboard/videos/[videoId]/clips/[clipId]/edit`

### Decision 3: Subtitle Preview Rendering

| Option | Pros | Cons |
|--------|------|------|
| CSS-positioned `<div>` overlay | Simple, fast, uses standard web tech | Minor visual differences from ASS render |
| `<canvas>` overlay | More control over text rendering | Complex, performance overhead, accessibility issues |
| WebAssembly FFmpeg in browser | Pixel-perfect | Heavy download (~30MB), slow, overkill for preview |

**Decision: CSS `<div>` overlay for preview, FFmpeg ASS burn-in for final render.**

Rationale: CSS overlays are simple, performant, and accessible (screen readers can see the text). The visual difference from the final ASS-rendered subtitles is negligible for the purpose of editing text content. Users care about *what the text says*, not the exact pixel position of the subtitle shadow.

Implementation:
- Each subtitle segment rendered as an absolutely-positioned `<div>` inside the video container.
- Visibility toggled based on `video.currentTime` matching the segment's `[start, end)` range.
- Styling approximates ASS defaults: white text, dark semi-transparent background, bottom-center position.

### Decision 4: Save Behavior — Optimistic UI

**Decision: Optimistic UI with rendering state.**

Flow:
1. User clicks "Save".
2. Client sends `clip.updateFull` mutation via tRPC with all changed fields.
3. UI immediately transitions to "Rendering..." state (optimistic).
4. Editing controls become disabled (read-only).
5. tRPC mutation triggers BullMQ re-render job on the server.
6. Client polls clip status (or uses tRPC subscription/refetch interval) until status becomes `ready` or `failed`.
7. On `ready`: update preview to show rendered clip, re-enable editing, show success toast.
8. On `failed`: re-enable editing, show error toast with retry option.

This avoids the user staring at a spinner — they see the state change immediately and can navigate away. The video detail page also shows the rendering status.

### Decision 5: State Management

**Decision: Zustand store with tRPC query for initial data.**

Rationale: The editor has complex cross-component state — 6 components (VideoPreview, Timeline, SubtitleEditor, CTAEditor, FormatSelector, TitleEditor) all share trim, subtitle, format, and CTA state. Zustand provides granular selectors so each component subscribes only to its slice, avoiding unnecessary re-renders and prop drilling. On page load, fetch clip data via `clip.get` and hydrate the store. On save, serialize the store state and send via `clip.updateFull`.

Structure:
```
useClipEditorStore = create((set, get) => ({
  clip: ClipData              // from tRPC query (hydrated on mount)
  draft: ClipDraftState       // local edits
  isDirty: boolean            // draft !== clip
  actions: {
    setTrim(start, end)
    updateSubtitle(index, text)
    setFormat(format)
    setCTA(cta)
    setTitle(title)
    setDescription(desc)
    save() → mutation
    reset() → revert to clip
  }
}))
```

Zustand is the right choice here — the editor has cross-component shared state across 6 components, and granular selectors prevent prop drilling and unnecessary re-renders.

## Component Architecture

```
ClipEditorPage (server component — data fetch + layout)
└── ClipEditor (client component — all interactive logic)
    ├── VideoPreview
    │   ├── <video> element
    │   ├── SubtitleOverlay (CSS-positioned, time-synced)
    │   └── CTAOverlay (CSS-positioned)
    ├── Timeline
    │   ├── TimelineTrack (full duration bar)
    │   ├── TrimHandle (left) — draggable
    │   ├── TrimHandle (right) — draggable
    │   ├── Playhead — follows currentTime
    │   └── DurationDisplay
    ├── EditorPanel
    │   ├── TitleEditor
    │   ├── DescriptionEditor
    │   ├── FormatSelector (3 buttons: 9:16, 1:1, 16:9)
    │   ├── SubtitleEditor (collapsible)
    │   │   └── SubtitleSegmentRow[] (click-to-edit)
    │   └── CTAEditor (collapsible)
    │       ├── CTATextField
    │       ├── CTAPositionSelector (overlay / endcard)
    │       └── CTADurationInput
    ├── PreviewToggle (Edit / Preview mode switch)
    └── ActionBar
        ├── BackButton → /dashboard/videos/[videoId]
        ├── ResetButton (revert to saved state)
        └── SaveButton → clip.updateFull mutation
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Browser video codec incompatibility | Low | High | Use MP4/H.264 for all source videos (FFmpeg pipeline already outputs this). Add codec check on editor load with user-friendly error message. |
| Large source video slow to load | Medium | Medium | Use S3 presigned URL with range requests. Browser handles progressive loading. Show loading skeleton while video buffers. |
| CSS subtitle position differs from FFmpeg ASS | Low | Low | Acceptable trade-off for MVP. Document that preview is approximate. Users care about text content, not pixel positions. |
| User navigates away with unsaved changes | Medium | Medium | `beforeunload` event handler + React Router navigation guard. Show "Unsaved changes" confirmation dialog. |
| Concurrent edits (same clip in two tabs) | Low | Low | Last-write-wins. No locking mechanism for MVP. The `clip.updateFull` mutation overwrites all fields. |
| Re-render job fails | Low | Medium | Existing retry logic in BullMQ worker (3 retries, exponential backoff). Editor shows "failed" state with retry button. |

## Performance Targets

| Metric | Target |
|--------|--------|
| Editor page load (TTI) | < 3 seconds |
| Timeline drag responsiveness | < 16ms per frame (60fps) |
| Subtitle overlay sync accuracy | < 100ms drift from video time |
| Save mutation round-trip | < 500ms (excluding render time) |
| Video seek latency | < 200ms (browser-dependent) |

## Implementation Sequence

1. **Phase 1 — Page skeleton and routing.** Create the editor page route, fetch clip data via tRPC, render basic layout with video player.
2. **Phase 2 — Timeline scrubber.** Implement draggable trim handles, playhead, duration display. Wire to video element `currentTime`.
3. **Phase 3 — Subtitle overlay.** Render CSS subtitle overlay synced to playback. Build subtitle segment editor panel.
4. **Phase 4 — Format selector and CTA editor.** Aspect ratio switching, CTA overlay preview.
5. **Phase 5 — Save and render flow.** Wire Save button to `clip.updateFull`, implement optimistic UI, render status polling.
6. **Phase 6 — Preview mode and polish.** Edit/Preview toggle, unsaved changes guard, loading states, error handling.

Each phase is independently committable and testable. Phases 2-4 can be parallelized across agents.
