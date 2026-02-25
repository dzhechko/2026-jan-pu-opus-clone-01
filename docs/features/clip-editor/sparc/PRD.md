# Clip Editor — Product Requirements Document

## Problem Statement

After КлипМейкер's AI pipeline generates clips from a webinar, course creators need to review and refine them before publishing. Today, the only editing path is updating fields via the clip card (title, start/end times as raw numbers) and waiting for a full re-render to see the result. This workflow is slow, unintuitive, and error-prone:

- **No visual trimming.** Users type seconds manually without seeing the video frame at that timestamp. Off-by-one errors are common, leading to repeated re-renders.
- **No subtitle preview.** Subtitle text can only be read as JSON; there is no way to see how subtitles look on the video before the FFmpeg render completes.
- **No CTA preview.** Call-to-action overlays and endcards are invisible until after rendering.
- **No format preview.** Switching between 9:16, 1:1, and 16:9 requires a render to see the crop.

The result: editing a single clip takes 5-10 minutes of trial-and-error instead of under 2 minutes with a proper visual editor.

## Target Users

**Primary:** Online course creators (primarily Russian-speaking) who use КлипМейкер to turn webinars into promotional shorts. They are not professional video editors. They want fast, simple controls that let them approve or lightly adjust AI-generated output.

**Secondary:** Virtual assistants or marketing staff who manage clip publishing on behalf of course authors. They need a clear, self-explanatory interface that does not require video editing expertise.

## Core Value Proposition

A visual, in-browser clip editor with real-time preview that lets users trim, edit subtitles, adjust CTA, and change format — then see the result instantly before committing to a server-side render. This reduces editing time from 5-10 minutes to under 2 minutes and cuts unnecessary re-renders by over 70%.

## Key Features (MVP)

### 1. Timeline Scrubber with Trim Handles

- Horizontal timeline bar representing the source video duration.
- Draggable left/right handles to set `startTime` and `endTime`.
- Current playback position indicator (playhead).
- Snap-to-second precision (sub-second precision not needed for shorts).
- Clip duration display updates in real-time as handles move.
- Minimum clip duration: 5 seconds. Maximum: 180 seconds (3 minutes).

### 2. Video Preview Player

- HTML5 `<video>` element playing the source video file.
- Playback constrained to the selected trim region (startTime to endTime).
- Standard controls: play/pause, current time display, playback rate (0.5x, 1x, 1.5x, 2x).
- Looping within the trimmed region.
- Frame displayed updates when trim handles are dragged (seek to handle position).

### 3. Subtitle Overlay & Editor

- CSS-positioned subtitle overlay on the video preview, time-synced to playback.
- Subtitle segments listed in a side panel, each showing timestamp range and text.
- Click any segment to edit its text inline; the preview updates immediately.
- Visual highlight on the currently active subtitle segment during playback.
- Subtitle style inherited from project defaults (font, size, color, background); style editing is out of scope for MVP.

### 4. Format Selector

- Three format options: Portrait (9:16), Square (1:1), Landscape (16:9).
- Selecting a format updates the preview container's aspect ratio immediately.
- Visual crop guide overlay showing what area of the source frame will be included.
- Current format highlighted; default is the AI-selected format.

### 5. CTA Editor

- Fields: CTA text, position (overlay during video / endcard after video), duration (seconds).
- Live preview of the CTA on the video player (overlay) or as a separate endcard frame.
- Character limit: 100 characters for CTA text.
- Default CTA pre-filled from AI pipeline output.

### 6. Title & Description Editor

- Editable title field (max 200 characters) with character counter.
- Editable description field (max 500 characters) with character counter.
- Both pre-filled from AI-generated content.

### 7. Save & Re-render

- "Save" button triggers `clip.updateFull` tRPC mutation with all changed fields.
- Optimistic UI: immediately show "Rendering..." status on the clip.
- Disable editing controls while render is in progress.
- On render completion, update the preview to show the final rendered clip.
- "Back" button returns to `/dashboard/videos/[videoId]` (video detail page).

### 8. Preview Mode

- Toggle between "Edit" and "Preview" modes.
- Preview mode hides all editing controls and shows the video at the selected format with subtitle overlay and CTA — a close approximation of the final rendered output.
- Useful for a final check before saving.

## User Flow

1. User navigates to video detail page, sees list of AI-generated clips.
2. User clicks "Edit" on a clip card.
3. Route: `/dashboard/videos/[videoId]/clips/[clipId]/edit`.
4. Editor loads with current clip data (trim points, subtitles, CTA, format, title).
5. User adjusts trim, edits a subtitle typo, confirms CTA text.
6. User toggles Preview mode to review.
7. User clicks Save. UI shows rendering state.
8. Render completes. User can download or publish from the video detail page.

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to edit a clip | < 2 minutes (median) | Client-side timer from editor open to save |
| Re-render rate | < 30% of clips need manual edits | Clips published without opening editor / total published |
| Editor load time | < 3 seconds on 50 Mbps connection | Performance monitoring |
| User satisfaction | > 4/5 in post-edit micro-survey | Optional 1-question survey after first 5 edits |
| Editor adoption | > 60% of users use editor at least once | Analytics event tracking |

## Out of Scope (MVP)

- **Multi-track editing.** Single video track only; no picture-in-picture or B-roll insertion.
- **Audio editing.** No volume adjustment, music overlay, or audio effects.
- **Transitions.** No fade, dissolve, or other transition effects between segments.
- **Video filters.** No color grading, brightness/contrast, or visual effects.
- **Subtitle style editing.** Font, size, color, and positioning use project defaults. Custom styling is a future feature.
- **Batch editing.** One clip at a time. Bulk operations are a separate feature.
- **Undo/redo history.** Changes are applied directly. The user can reload to revert to last saved state.
- **Collaborative editing.** Single-user editing only.
- **Mobile-optimized editor.** Desktop-first; mobile users get a read-only preview.

## Technical Constraints

- Source video served via S3 presigned URL (same as `clip.download` pattern).
- Browser must support HTML5 `<video>` with MP4/H.264 (universal in modern browsers).
- Subtitle overlay is CSS-based for preview; FFmpeg ASS burn-in for final render.
- All mutations go through the tRPC `clip.updateFull` endpoint (extended mutation supporting trim, subtitles, CTA, format, and title/description fields).
- Re-render triggered by BullMQ job via existing FFmpeg pipeline (13-step).
- Page requires authentication (NextAuth.js session); clip must belong to the authenticated user.

## Localization

- All UI labels, tooltips, and error messages in Russian.
- Future: English localization via next-intl (out of scope for MVP).
