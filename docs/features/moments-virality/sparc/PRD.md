# PRD: Moments + Virality (US-02 + US-05)

## Executive Summary

AI-powered moment selection and virality scoring for the КлипМейкер video-to-shorts pipeline. After STT transcription completes, the LLM Router analyzes the full transcript to identify 3-10 viral-worthy moments, scores each on 4 dimensions (Hook, Engagement, Flow, Trend), generates catchy Russian titles and CTAs, then creates Clip records ready for FFmpeg rendering.

## Problem Statement

Content creators upload 30-120 minute webinars but cannot manually identify which 15-60 second segments will perform best as shorts. They need:
1. Automated moment discovery from transcripts
2. Objective virality scoring to prioritize clips
3. Attention-grabbing titles in Russian
4. Contextual CTAs for course promotion

## Target Users

- Online course creators (GetCourse platform)
- Webinar hosts
- Educational content producers
- Target: Russian-speaking market

## Core Value Proposition

Transform a 60-minute transcript into 10 ranked clip candidates with titles, scores, and CTAs in under 3 minutes. Cost: ~2.6₽ for LLM analysis (excluding STT).

## Key Features (MVP)

1. **Moment Selection** — LLM identifies 3-10 viral-worthy segments from transcript
2. **Virality Scoring** — 4-dimension score (0-100) for each moment: Hook, Engagement, Flow, Trend
3. **Title Generation** — Catchy Russian-language titles per clip
4. **CTA Suggestions** — Contextual call-to-action per clip
5. **Plan-Based Limits** — Free: 3 clips, Start: 10, Pro/Business: unlimited
6. **Score Breakdown UI** — Visual score display with improvement tips

## Success Metrics

| Metric | Target |
|--------|--------|
| Processing time (60 min video) | < 3 minutes |
| LLM cost per video (60 min, RU) | < 3₽ |
| Moments found per video | 3-10 |
| Average virality score | > 40/100 |
| User satisfaction with AI picks | > 70% keep rate |

## Out of Scope

- FFmpeg video rendering (separate `video-render` feature)
- Platform publishing (separate `auto-post` feature)
- Manual moment selection by user (future enhancement)
- Real-time streaming analysis
