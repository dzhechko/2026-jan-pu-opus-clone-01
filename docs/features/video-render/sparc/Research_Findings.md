# Research Findings: Video Render

## 1. FFmpeg Subtitle Rendering Approaches

### Comparison

| Approach | Styling | Timing | Performance | Complexity |
|----------|---------|--------|-------------|------------|
| ASS (libass) | Rich: bold, shadow, color, outline, position, animation | Native timing in file | Single filter, GPU-friendly | Medium (file generation) |
| SRT (subtitles filter) | Basic: font, size, color only | Native timing in file | Single filter | Low |
| drawtext | Full FFmpeg expression language | Per-frame expressions, manual timing | Multiple filters, CPU-heavy | High (timing logic in filter) |

### ASS Format (Advanced SubStation Alpha)

**Pros:**
- Best styling control for Russian text: font size, bold, shadow, outline, colors, positioning
- Native Unicode/Cyrillic support (UTF-8 encoded file)
- Word-level timing via `\kf` tags (karaoke-style highlighting per word)
- Background box via `\3c` (border color) + `\bord` + `\shad` for readability
- Single `-vf ass=subtitle.ass` filter — clean, composable with other filters
- Battle-tested: used by every major subtitle tool (Aegisub, ffsubsync)

**Cons:**
- Requires generating `.ass` file from subtitle segments before FFmpeg call
- Font embedding: must ensure font file is available in Docker container

**Key ASS styling properties for КлипМейкер:**
```
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1.5,2,30,30,60,1
```

- `Fontsize: 48` — readable at 1080p on mobile
- `PrimaryColour: &H00FFFFFF` — white text
- `OutlineColour: &H00000000` — black outline (3px)
- `BackColour: &H80000000` — semi-transparent black shadow
- `Bold: -1` — enabled
- `Alignment: 2` — bottom-center (standard for shorts)
- `MarginV: 60` — lifted above bottom edge (away from platform UI overlays)
- `Encoding: 1` — Cyrillic

### SRT Format

**Pros:**
- Simplest format, easy to generate
- Supported by FFmpeg via `subtitles` filter

**Cons:**
- Limited styling — only basic font/color via filter options
- No per-word timing or karaoke effects
- No outline/shadow control independent of border
- Insufficient for professional-looking shorts

### drawtext Filter

**Pros:**
- No external file needed — inline in FFmpeg command
- Full expression language for dynamic text

**Cons:**
- No built-in timing — must use `enable='between(t,start,end)'` per segment
- Each subtitle segment = separate drawtext filter in chain = O(n) filter complexity
- 50+ segments = extremely long filter_complex string, hard to debug
- No line-break handling — manual `\n` positioning
- Performance degrades with many filter instances

### Decision: ASS for subtitles, drawtext for CTA/watermark

- **Subtitles** (50+ timed segments, styled, Cyrillic): ASS file burned in via `ass` filter
- **CTA text** (1 static overlay, end of clip): drawtext filter with `enable='between(t,...)'`
- **Watermark** (1 static text, full duration): drawtext filter, constant overlay
- Composable via `filter_complex` with named filter chains

## 2. FFmpeg Encoding Settings

### CRF (Constant Rate Factor) Analysis

| CRF | Quality | File Size (30s 1080p) | Use Case |
|-----|---------|----------------------|----------|
| 18 | Visually lossless | ~15-25 MB | Master archive |
| 20 | High quality | ~10-18 MB | Premium output |
| 23 | Good balance | ~6-12 MB | **Default for shorts** |
| 28 | Acceptable | ~3-6 MB | Bandwidth-limited |
| 35 | Low quality | ~1-3 MB | Preview only |

**Decision: CRF 23** — Standard FFmpeg default, good quality-to-size ratio for social media. Platforms re-encode on upload anyway (VK, Rutube, Dzen all re-compress), so going below CRF 20 wastes storage and upload bandwidth with no visible benefit to end viewers.

### Preset Selection

| Preset | Speed | File Size | CPU Time (30s clip) |
|--------|-------|-----------|---------------------|
| ultrafast | 1x | +50% | ~8s |
| veryfast | 0.7x | +25% | ~12s |
| fast | 0.5x | +10% | ~18s |
| medium | 0.3x | baseline | ~30s |
| slow | 0.15x | -10% | ~60s |

**Decision: `fast` preset** — 2x faster than `medium` with only ~10% larger file (negligible at CRF 23). For 15-60s clips, the absolute time difference is small but adds up when rendering 10 clips in parallel.

### Output Format Settings

```
-c:v libx264 -preset fast -crf 23 -profile:v high -level 4.1 -pix_fmt yuv420p
-c:a aac -b:a 128k -ar 44100 -ac 2
-movflags +faststart
```

- `profile:v high` + `level 4.1` — maximum compatibility across all target platforms
- `pix_fmt yuv420p` — required for VK/Rutube/browser playback (some inputs use yuv444p)
- `movflags +faststart` — moves moov atom to beginning for progressive playback (critical for web)
- `aac 128k` — sufficient quality for speech-dominant content (webinar recordings)

## 3. Hardware Acceleration Analysis

### VPS Context

КлипМейкер deploys on VPS (AdminVPS/HOSTKEY) — shared infrastructure without dedicated GPU.

| Acceleration | Availability on VPS | Performance Gain | Setup Complexity |
|-------------|--------------------|--------------------|------------------|
| NVENC (NVIDIA) | No (no GPU) | 5-10x | Docker + nvidia-runtime |
| VAAPI (Intel) | Rare (shared CPU) | 2-4x | Kernel module + device pass-through |
| QSV (Intel) | No (shared hosting) | 3-5x | i915 driver + Docker device |
| Software (libx264) | Always available | Baseline | None |

**Decision: CPU-only (libx264)** — VPS has no GPU access. For 15-60 second clips, software encoding at `fast` preset takes 15-45 seconds per clip, well within acceptable limits. With `concurrency: 3` in the BullMQ worker, 10 clips render in ~60-150 seconds total.

### Future Consideration

If rendering becomes a bottleneck (>50 concurrent users), options:
1. Dedicated GPU server (HOSTKEY offers GPU VPS with NVIDIA T4)
2. Cloud.ru GPU instances for burst processing
3. Pre-encoded template approach (reduces FFmpeg work to cut + overlay)

## 4. Thumbnail Generation

### Approaches

| Approach | Method | Quality | Speed |
|----------|--------|---------|-------|
| Fixed offset | Extract frame at `startTime + 2s` | Inconsistent (may hit transition) | Instant |
| Scene detection | `select='gt(scene,0.3)'` | Better (avoids transitions) | Slow (+5-10s) |
| I-frame nearest | Seek to nearest keyframe | Fast seek, good quality | Instant |
| Multiple candidates | Extract 5 frames, pick brightest | Best (avoids dark frames) | ~2s |

**Decision: I-frame at 25% mark** — Extract a single frame at 25% into the clip duration (e.g., at 7.5s for a 30s clip). This avoids the intro (often blank/transition) and the outro (often CTA overlay).

```
ffmpeg -ss <start + duration*0.25> -i input.mp4 -vframes 1 -q:v 2 thumbnail.jpg
```

- `-ss` before `-i` for fast keyframe-based seek
- `-q:v 2` — high quality JPEG (scale 2-31, lower is better)
- Single frame extraction: <1 second, no filter overhead

### Thumbnail Specs

- Resolution: 360px wide with auto-height (360x640 portrait, 360x360 square, 640x360 landscape)
- Format: JPEG, quality 85-90%
- File size: ~50-150 KB
- S3 path: `thumbnails/{userId}/{videoId}/{clipId}.jpg`

## 5. filter_complex vs Chained Filters

### Simple `-vf` Chain

```
-vf "scale=1080:1920,ass=subs.ass,drawtext=text='CTA':enable='between(t,25,30)'"
```

- Linear pipeline: scale -> subtitles -> CTA -> output
- Simple, readable, sufficient for our use case
- **Limitation:** Cannot branch or merge streams

### filter_complex

```
-filter_complex "[0:v]scale=1080:1920[scaled];[scaled]ass=subs.ass[subbed];[subbed]drawtext=text='CTA':enable='between(t,25,30)'[out]" -map "[out]" -map 0:a
```

- Named streams, explicit graph
- Required when: multiple inputs, stream splitting, complex routing
- More verbose but safer for composition

**Decision: Use `filter_complex`** — Even though our pipeline is linear, `filter_complex` is safer for programmatic construction. When building the filter string in code, named intermediate streams prevent ordering bugs. The watermark + subtitle + CTA overlay combination benefits from explicit stream naming.

### Filter Chain Order

```
[0:v] → scale/pad → ass (subtitles) → drawtext (watermark) → drawtext (CTA) → [out]
```

Order matters:
1. **Scale first** — ensures all overlays render at target resolution
2. **ASS second** — subtitle positioning is relative to video dimensions (must be post-scale)
3. **Watermark third** — persistent overlay, should appear above subtitles
4. **CTA last** — timed overlay, highest visual priority

## 6. ASS Subtitle Specification for Russian Text

### Character Encoding

- File encoding: UTF-8 with BOM (`\xEF\xBB\xBF` prefix)
- Script property: `ScriptType: v4.00+`
- Encoding field in Style: `1` (Cyrillic) — fallback hint only, UTF-8 takes priority

### Font Selection for Cyrillic

| Font | Cyrillic Support | License | Availability |
|------|-----------------|---------|-------------|
| Montserrat | Full (incl. extended) | OFL | Google Fonts, free |
| Inter | Full | OFL | Google Fonts, free |
| Roboto | Full | Apache 2.0 | Google Fonts, free |
| Noto Sans | Full (all scripts) | OFL | Google Fonts, free |
| Arial | Full | Proprietary | Not available in Docker |

**Decision: Montserrat Bold** — Modern, clean, excellent Cyrillic coverage, free OFL license. Include `.ttf` in Docker image at `/usr/share/fonts/montserrat/`.

### Line Breaking for Russian

- Max characters per line: 35-40 (at Fontsize 48, 1080p portrait)
- Break at word boundaries (Russian words average 6-7 chars)
- Max 2 lines visible simultaneously
- Use ASS `\N` for explicit line breaks, `\n` for soft wraps

### Sample Generated ASS File

```
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1.5,2,30,30,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.20,0:00:03.80,Default,,0,0,0,,Сегодня мы поговорим\Nо важной теме
Dialogue: 0,0:00:03.80,0:00:06.50,Default,,0,0,0,,Как создать продающий\Nвебинар за час
```

### ASS Time Format

- Format: `H:MM:SS.CC` (centiseconds, not milliseconds)
- Conversion from seconds: `Math.floor(hours):MM:SS.CC`
- Example: 65.5 seconds = `0:01:05.50`

## 7. Cost & Performance Analysis

### CPU Time per Clip (VPS: 4 vCPU, 8 GB RAM)

| Clip Duration | Preset | Filters | Estimated Render Time | CPU Usage |
|--------------|--------|---------|----------------------|-----------|
| 15s | fast | scale+ass+drawtext | ~10-15s | ~350% (3.5 cores) |
| 30s | fast | scale+ass+drawtext | ~20-35s | ~350% |
| 60s | fast | scale+ass+drawtext | ~40-90s | ~350% |

### Parallel Rendering (concurrency: 3)

| Clips | Sequential Time | Parallel (3) Time | Parallel (5) Time |
|-------|----------------|-------------------|-------------------|
| 3 | ~60-105s | ~20-35s | ~15-25s |
| 5 | ~100-175s | ~40-65s | ~25-40s |
| 10 | ~200-350s | ~70-120s | ~45-75s |

**Decision: concurrency 3** — Already set in existing `video-render.ts` worker. At 3 concurrent renders, CPU usage peaks at ~10.5 cores worth of work across 4 vCPU — Linux scheduler handles this with context switching. Going to 5 concurrent causes excessive context switching and disk I/O contention on VPS.

### Storage Cost (S3)

| Asset | Size | Per Clip | 10 Clips |
|-------|------|----------|----------|
| Rendered MP4 (30s avg) | ~8 MB | ~8 MB | ~80 MB |
| Thumbnail JPEG | ~100 KB | ~100 KB | ~1 MB |
| ASS file (temp, deleted) | ~2 KB | 0 | 0 |
| **Total per video** | | | **~81 MB** |

At Yandex Object Storage pricing (~1.5₽/GB/month), 81 MB costs ~0.12₽/month. Negligible.

### Total Processing Cost per Video (60 min source)

| Component | Cost |
|-----------|------|
| STT (Whisper) | ~18₽ |
| LLM Analysis | ~2.5₽ |
| FFmpeg Render (CPU time) | ~0₽ (fixed VPS cost) |
| S3 Storage (per month) | ~0.12₽ |
| **Total** | **~20.6₽** |

FFmpeg rendering has zero marginal cost — it uses existing VPS CPU allocation. The bottleneck is STT, not rendering.

## 8. Docker Considerations

### FFmpeg in Docker

```dockerfile
# Alpine-based for small image
FROM node:20-alpine

# FFmpeg 7 with all codecs
RUN apk add --no-cache ffmpeg

# Montserrat font for ASS subtitles
COPY fonts/Montserrat-Bold.ttf /usr/share/fonts/montserrat/
RUN fc-cache -fv
```

### Temp File Management

- Render output: `/tmp/clip-{clipId}.mp4` (existing pattern in code)
- ASS subtitle file: `/tmp/subs-{clipId}.ass` (generate before render, delete after)
- Thumbnail: `/tmp/thumb-{clipId}.jpg` (generate after render, upload to S3, delete)
- Cleanup: `fs.unlink()` in `finally` block, regardless of success/failure
- Docker tmpfs: Consider mounting `/tmp` as tmpfs for faster I/O (no disk writes)

### Resource Limits

```yaml
# docker-compose.yml
worker:
  deploy:
    resources:
      limits:
        cpus: '3.5'
        memory: 4G
```

Limit worker to 3.5 CPU cores and 4 GB RAM to leave headroom for PostgreSQL, Redis, and Nginx on the same VPS.
