# Final Summary: Clip Editor

## Executive Summary

The Clip Editor is an interactive browser-based editing interface that enables users to visually trim clips, edit auto-generated subtitles inline, select output format (9:16, 1:1, 16:9), and configure CTA overlays — all with real-time preview before publishing to Russian platforms (VK, Rutube, Дзен, Telegram).

This feature addresses the primary user pain point: 80% of course creators mainly need to fix subtitle errors before publishing. The editor prioritizes speed and simplicity over professional editing capabilities, differentiating from competitors like Kapwing (too complex) and Vidyo.ai (too limited). No existing competitor supports Russian platform export or Cyrillic-optimized subtitle rendering.

The implementation is predominantly frontend work. Backend changes are minimal — a single new tRPC mutation and reuse of the existing FFmpeg render pipeline.

## Scope

### New Artifacts

| Type | Count | Details |
|------|-------|---------|
| Page route | 1 | `/clips/[id]/edit/page.tsx` — server component with auth check and clip data fetch |
| Client components | 6 | `ClipEditorShell`, `VideoPreview`, `SubtitleOverlay`, `TrimTimeline`, `FormatSelector`, `CtaEditor` |
| Zustand store | 1 | `useClipEditorStore` — manages trim, subtitles, format, CTA, playback state, dirty flag |
| tRPC mutation | 1 | `clip.updateFull` — validates and persists all editable fields, conditionally enqueues re-render |
| Support pages | 3 | `loading.tsx`, `error.tsx`, `not-found.tsx` for the edit route |

### Modified Artifacts

| Artifact | Change |
|----------|--------|
| `clipRouter` (tRPC) | Add `updateFull` mutation with Zod schema |
| `ClipCard` component | Add "Редактировать" button linking to edit page |
| FFmpeg worker | No changes — existing re-render job handler is reused as-is |

### Out of Scope
- Multi-clip batch editing
- Audio track editing or music overlay
- Custom font upload
- Video effects or filters
- Undo/redo history (future enhancement)

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Clip Prisma model | Exists | All required fields already in schema |
| FFmpeg worker (`apps/worker`) | Exists | Handles `clip-render` BullMQ jobs, reused for re-renders |
| tRPC router infrastructure | Exists | `clipRouter` already set up, adding one mutation |
| S3 storage | Exists | Source videos and rendered clips already stored |
| Authentication (NextAuth.js) | Exists | Editor route requires authenticated session |
| BullMQ + Redis | Exists | `clip-render` queue already configured |

No new infrastructure, services, or external dependencies required.

## Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Browser video codec incompatibility | Users cannot preview clips | Low | Standardize on H.264/MP4 (universal browser support). FFmpeg worker already outputs this format. |
| Large video files cause slow editor load | Poor UX on slow connections | Medium | Use S3 presigned URLs with range requests. Video streams progressively — no full download needed. |
| Subtitle timing drift after trim | Subtitles out of sync | Low | Subtract `trimStart` from all subtitle timestamps on save. Unit test this calculation. |
| Re-render queue saturation from frequent edits | Long wait for rendered clips | Medium | Debounce save button (disable for 2s after save). Show queue position to user. Deduplicate re-render jobs for same clipId. |
| Mobile browser limitations | Touch-based trim handles may be imprecise | Low | Set minimum handle drag distance. Not a launch blocker — 90% of users edit on desktop. |

## Estimated Complexity

**Overall: Medium**

| Area | Complexity | Rationale |
|------|-----------|-----------|
| Frontend (components) | Medium | 6 new components, but each is focused and well-scoped. Zustand store is straightforward. |
| Frontend (video playback) | Medium | HTML5 Video API is well-documented. Subtitle overlay via CSS is simpler than canvas rendering. |
| Backend (tRPC mutation) | Low | Single mutation with Zod validation. Prisma update. Conditional BullMQ enqueue. |
| Backend (FFmpeg) | None | No changes to existing worker. Re-render jobs use the same pipeline. |
| Database | None | No schema changes. No migrations. |
| Testing | Medium | Vitest for store logic and mutation. Playwright for editor interactions. MSW for tRPC mocking. |
| Infrastructure | None | No new services, containers, or configuration. |

### Estimated Effort
- Frontend: 3-4 days (components, store, preview logic, styling)
- Backend: 0.5 day (tRPC mutation, logging)
- Testing: 1-1.5 days (unit tests for store, integration test for mutation, E2E for editor flow)
- **Total: 4.5-6 days for one developer**

## Success Criteria

1. User can open any generated clip in the editor, make subtitle corrections, and save — in under 60 seconds
2. Trim changes trigger re-render via existing FFmpeg pipeline with correct output
3. Format selection (9:16, 1:1, 16:9) produces correctly sized output video
4. CTA text and URL are burned into the rendered video at the configured position
5. All UI labels and error messages are in Russian
6. No new infrastructure or database migrations required for deployment
7. Editor works in Chrome, Firefox, Safari, and Yandex Browser (latest versions)
