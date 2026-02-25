# STT + Subtitles — Product Requirements Document

## Overview

**Feature Name:** STT + Subtitles (US-02 partial + US-04)
**Scope:** Speech-to-text transcription via Whisper API (Cloud.ru / OpenAI) + subtitle generation, display, and inline editing.
**Dependencies:** S3 Upload (done), Auth (done)
**Downstream:** Moment Selection (US-02 analysis part), Video Render (US-03)

## Problem

After a video is uploaded and confirmed, it sits in `status: 'transcribing'` with no worker doing actual work. The STT worker is a placeholder (`Buffer.from([])`) — no S3 download, no audio extraction, no real Whisper API call. No UI exists to view or edit the transcript/subtitles.

## Goals

1. **STT Worker**: Download video from S3 → extract audio with FFmpeg → send to Whisper API → save transcript with timed segments
2. **Transcript tRPC**: Endpoints to fetch and edit transcript segments
3. **Transcript UI**: Video detail page shows transcript with time-aligned segments
4. **Subtitle Editor**: Inline editing of subtitle text per segment, reflected in clip preview
5. **Duration Extraction**: FFmpeg probe to get `durationSeconds`, update Video record
6. **Usage Tracking**: Record minutes consumed + STT cost per video

## User Stories Covered

- **US-02** (partial): "Given a video has been uploaded and transcribed" — this feature delivers the transcription step
- **US-04**: Russian subtitles — accurate transcription, subtitle styling, subtitle editing

## Success Metrics

| Metric | Target |
|--------|--------|
| STT accuracy (clear Russian speech) | ≥95% word accuracy |
| STT processing time (60 min video) | ≤90 seconds |
| Transcript segment granularity | Sentence-level (2-15 sec per segment) |
| Subtitle edit latency | <200ms UI response |
| Audio extraction time (FFmpeg) | ≤10 seconds for 2h video |

## Out of Scope

- Moment selection / virality scoring (next feature)
- Video rendering with burned-in subtitles (video-render feature)
- Multi-language support (only `ru` for MVP, `en` as secondary)
- Custom subtitle styling (brand templates — future feature)
- Real-time transcription / streaming STT
