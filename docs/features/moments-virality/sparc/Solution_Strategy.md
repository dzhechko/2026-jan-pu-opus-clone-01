# Solution Strategy: Moments + Virality

## Problem Decomposition (First Principles)

### Fundamental Truths
1. Short-form video virality depends on hook strength, engagement value, narrative flow, and trend alignment
2. LLMs can analyze transcript text for these qualities but cannot watch video
3. Russian-language content requires Russian-optimized models (T-Pro 2.1)
4. Cost must stay under 3₽ per video for LLM analysis (business constraint)
5. Processing must complete within 3 minutes including STT

### Root Cause (5 Whys)
- Why do creators struggle with clipping? → Manual moment identification is time-consuming
- Why is it time-consuming? → 60-minute video, no automated analysis
- Why no automated analysis? → Existing tools don't support Russian + Russian platforms
- Why not adapt existing tools? → They use English-only models and don't integrate with VK/Rutube
- Why not just use English models? → Russian webinar transcripts need Russian-optimized LLMs for quality

### SCQA Framework
- **Situation**: Creator uploads 60-minute webinar, STT produces transcript
- **Complication**: Transcript is too long to read; best moments are buried; no scoring
- **Question**: How to automatically extract, rank, and title the best 15-60s clips?
- **Answer**: Pipeline: Moment Selection (tier1) → Virality Scoring (tier1, parallel) → Title+CTA Generation (tier0, parallel) → Clip records

## TRIZ Analysis

### Contradiction 1: Quality vs Cost
- **Improving**: Analysis quality (higher tier models)
- **Worsening**: Cost per video (higher tier = more expensive)
- **Resolution (Segmentation)**: Use different tiers for different tasks. Tier1 for complex analysis (moment selection, scoring), tier0 for simple generation (titles, CTAs). Saves ~80% on titles/CTAs.

### Contradiction 2: Context vs Token Limits
- **Improving**: Full context awareness (send entire transcript)
- **Worsening**: Token limits and cost (45K+ tokens for long videos)
- **Resolution (Nesting)**: For transcripts >32K tokens, use tier3 (GLM-4.6, 200K context). For shorter ones, tier1 is sufficient. LLM Router handles this automatically.

### Contradiction 3: Speed vs Thoroughness
- **Improving**: Individual attention per clip (separate scoring, titles, CTAs)
- **Worsening**: Total processing time (more LLM calls = longer)
- **Resolution (Parallelism)**: Batch parallel calls. Score 10 clips in parallel (3 concurrent), generate titles in parallel (5 concurrent). Single-threaded total: ~5 min → Parallel: ~90s.

## Solution Architecture

### Pipeline Design
```
STT Complete (video.status = 'analyzing')
    ↓
[1] Moment Selection (single LLM call, tier1/2/3)
    → 3-10 moments with timestamps
    ↓
[2] Parallel Processing (per moment):
    ├── Virality Scoring (tier1, 3 concurrent)
    ├── Title Generation (tier0, 5 concurrent)
    └── CTA Suggestion (tier0, 5 concurrent)
    ↓
[3] Create Clip Records (batch DB insert)
    → Apply plan limits (sort by score, keep top N)
    ↓
[4] Update Video Status → 'generating_clips'
    → Enqueue render jobs (separate worker)
```

### Key Design Decisions

1. **Single worker, task dispatch**: One `llm-analyze` BullMQ worker handles all 4 task types via switch/case. Simpler than 4 separate workers.

2. **STT triggers LLM**: STT worker enqueues `moment_selection` job after saving transcript. No polling needed.

3. **Moment selection triggers scoring**: After moments are found, the worker enqueues parallel scoring + title + CTA jobs. Uses `pMap` for within-job parallelism rather than separate BullMQ jobs (avoids queue overhead for 30+ sub-jobs).

4. **Cost tracking**: Each LLM call returns `costKopecks`. Aggregate and save to `UsageRecord.llmCostKopecks`.

5. **Retry with tier escalation**: If moment selection returns 0 moments or low-quality results, retry with tier+1 (documented in LLM Router fallback logic).
