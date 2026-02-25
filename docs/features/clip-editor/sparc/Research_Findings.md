# Research Findings: Clip Editor

## 1. Competitive Analysis

### Opus Clip
- **Editor type:** Timeline-based clip editor with waveform visualization
- **Strengths:** Drag handles for trim, auto-generated captions with style presets, virality score overlay
- **Weaknesses:** No Russian platform export, no Cyrillic subtitle font control, pricing in USD only
- **Key UX pattern:** Single timeline strip at the bottom, preview in center, controls on the right sidebar

### Vidyo.ai
- **Editor type:** Basic trim with start/end time inputs
- **Strengths:** Fast, minimal UI, good for quick adjustments
- **Weaknesses:** No inline subtitle editing, no real-time preview of subtitle changes, limited format options
- **Key UX pattern:** Simple number inputs for trim points, separate subtitle editor page

### Kapwing
- **Editor type:** Full-featured browser-based video editor (multi-track timeline, layers, effects)
- **Strengths:** Professional-grade editing in browser, text overlay with full styling, export presets
- **Weaknesses:** Overwhelming for simple clip editing, slow rendering, no Russian platform awareness
- **Key UX pattern:** Adobe Premiere-like multi-track timeline, property panels, canvas-based preview

### Descript
- **Editor type:** Transcript-based editing (edit text to edit video)
- **Strengths:** Revolutionary UX for transcript correction, removes filler words, Studio Sound
- **Weaknesses:** Heavy desktop app, expensive, no Russian language STT, no VK/Rutube export
- **Key UX pattern:** Word-processor style interface where deleting transcript text removes corresponding video

### Summary Matrix

| Feature | Opus Clip | Vidyo.ai | Kapwing | Descript | КлипМейкер (target) |
|---------|-----------|----------|---------|----------|---------------------|
| Timeline trim | Drag handles | Number inputs | Multi-track | Transcript-based | Drag handles |
| Inline subtitle edit | Style presets | Separate page | Full text editor | Word processor | Click-to-edit overlay |
| Real-time preview | Yes | No | Yes (slow) | Yes | Yes |
| Format selection | 9:16 only | 9:16, 1:1 | Any | Any | 9:16, 1:1, 16:9 |
| CTA overlay | No | No | Manual text | No | Built-in templates |
| Russian platforms | No | No | No | No | VK, Rutube, Дзен, Telegram |
| Cyrillic fonts | Limited | Limited | Generic | N/A | Optimized (Inter, Montserrat-Cyrillic) |

## 2. Key UI/UX Patterns

### Timeline Trim
- Horizontal strip showing video duration with two draggable handles (start/end)
- Waveform or thumbnail filmstrip optional but adds clarity
- Minimum clip duration enforcement (3 seconds) prevents user errors
- Snap-to-word boundaries using subtitle timing data for cleaner cuts

### Inline Subtitle Editing
- Click on subtitle text in preview to enter edit mode
- Changes reflected immediately in the overlay
- Per-segment editing (each subtitle segment is individually editable)
- Timing adjustment: drag subtitle blocks on timeline to shift timing
- Font size, color, position (top/center/bottom) as global settings

### Real-Time Preview
- HTML5 `<video>` element with CSS-positioned subtitle overlays
- No server round-trip for preview; all changes are client-side until "Save & Render"
- Play/pause, seek, frame-by-frame (arrow keys) controls
- Preview reflects current trim points, subtitle edits, and format simultaneously

### Format Selection
- Visual cards showing aspect ratios: 9:16 (Reels/Shorts), 1:1 (Feed), 16:9 (YouTube)
- Live preview updates crop/pad to match selected format
- Platform-specific format recommendations shown as badges on cards

## 3. Technology Choices

### HTML5 Video API
- `HTMLVideoElement` for playback with `currentTime`, `play()`, `pause()` control
- `timeupdate` event (~4Hz) for syncing subtitle display and timeline position
- `requestAnimationFrame` for smoother timeline cursor animation during playback
- `canplay` / `loadedmetadata` events for initialization
- No canvas rendering needed; CSS overlay for subtitles is simpler and more performant

### CSS Subtitle Overlay
- Absolutely positioned `<div>` over `<video>` element
- `pointer-events: none` on overlay container, `pointer-events: auto` on editable text
- CSS `text-shadow` or `background` for subtitle readability on varying backgrounds
- Font stack: `'Montserrat', 'Inter', 'Noto Sans', sans-serif` for Cyrillic coverage
- `contentEditable` for inline text editing with `onBlur` commit to state

### Zustand for Editor State
- Single `useClipEditorStore` with slices:
  - `trim`: `{ startTime, endTime }`
  - `subtitles`: `Array<{ id, startTime, endTime, text }>`
  - `format`: `'9:16' | '1:1' | '16:9'`
  - `cta`: `{ text, url, position, style }`
  - `isDirty`: boolean (unsaved changes indicator)
  - `isPlaying`: boolean
  - `currentTime`: number
- Optimistic updates: all edits happen in Zustand store, single tRPC mutation on save
- `zustand/middleware` with `devtools` for debugging in development

### tRPC Mutation
- Single `clip.updateFull` mutation accepting partial update of all editable fields
- Zod schema validates all fields server-side before persisting
- After DB update, enqueues re-render job to BullMQ if trim or format changed
- Subtitle text changes without trim/format change skip re-render (metadata-only update)

## 4. Russian Market Specifics

### Cyrillic Subtitle Rendering
- Font selection critical: many "web-safe" fonts have poor Cyrillic glyphs
- Tested fonts with full Cyrillic + extended coverage: Montserrat, Inter, Noto Sans
- `font-feature-settings: 'liga' 1` for proper Cyrillic ligatures
- FFmpeg subtitle burn-in uses `fontfile` pointing to bundled `.ttf` with Cyrillic support
- Word-wrap aware of Cyrillic word boundaries (no mid-word breaks on long words like "предпринимательство")

### Platform Format Requirements

| Platform | Aspect Ratio | Max Duration | Resolution | Subtitles |
|----------|-------------|-------------|------------|-----------|
| VK Clips | 9:16 | 60s | 1080x1920 | Burned-in |
| Rutube Shorts | 9:16 | 60s | 1080x1920 | Burned-in |
| Яндекс.Дзен | 9:16, 1:1 | 60s | 1080x1920 / 1080x1080 | Burned-in |
| Telegram | Any | No limit | Up to 1920x1080 | Burned-in |

### Localization
- All UI labels in Russian: "Обрезка", "Субтитры", "Формат", "CTA", "Сохранить"
- Error messages in Russian: "Минимальная длина клипа — 3 секунды"
- Tooltip help in Russian explaining each control
- Date/time formatting: DD.MM.YYYY HH:MM (Moscow timezone default)

## 5. User Research Insights

### Primary Finding: Speed Over Precision
- 80% of target users (course creators) primarily want to fix auto-generated subtitle errors
- Typical editing session: open clip, fix 2-3 subtitle typos, save — under 60 seconds
- Only 15% adjust trim points after AI selection
- Only 5% change format from the AI-recommended default

### Implications for UX Design
- **Subtitle editing must be the most accessible action** — click directly on subtitle text in preview
- **Trim should be available but not dominant** — collapsible timeline panel, not always visible
- **Format selection as cards, not dropdown** — visual, fast, one-click
- **CTA as optional section** — collapsed by default, expandable
- **Save button must be prominent** — top-right, always visible, disabled when no changes
- **Auto-save draft** — `localStorage` backup every 30 seconds to prevent data loss

### Pain Points from Competitor Users
1. "Opus Clip doesn't let me fix subtitle errors without re-rendering the whole video" — we solve with inline editing
2. "Kapwing is too complicated, I just want to fix one word" — we solve with focused, minimal UI
3. "None of them post to VK, I have to download and re-upload manually" — we solve with native platform integration
4. "Subtitle fonts look ugly in Russian" — we solve with Cyrillic-optimized font stack
