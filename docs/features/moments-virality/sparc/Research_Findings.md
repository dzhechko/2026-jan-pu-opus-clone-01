# Research Findings: Moments + Virality

## 1. LLM Provider Capabilities

### Cloud.ru Evolution Foundation Models (RU Strategy)

| Model | Tier | Context | Cost (₽/1M tokens) | Best For |
|-------|------|---------|---------------------|----------|
| GigaChat3-10B | 0 | 8K | 10/10 | Titles, CTAs (fast, cheap) |
| T-Pro 2.1 | 1 | 32K | 35/70 | Moment selection, scoring (Russian-optimized) |
| Qwen3-235B | 2 | 32K | 17/70 | Complex analysis, retry fallback |
| GLM-4.6 | 3 | 200K | 55/220 | Very long transcripts (>100K tokens) |

### Global Strategy

| Model | Tier | Context | Cost ($/1M tokens) | Best For |
|-------|------|---------|---------------------|----------|
| Gemini Flash Lite | 0 | 1M | 0.075/0.30 | Titles, CTAs |
| Gemini Flash | 1 | 1M | 0.10/0.40 | Moment selection |
| Claude Haiku 4.5 | 2 | 200K | 0.80/4.00 | Scoring |
| Gemini Pro | 3 | 1M | 1.25/10.00 | Long context analysis |

### Key Finding: T-Pro 2.1 Performance

T-Pro 2.1 is optimized for Russian language tasks. For moment selection from Russian webinar transcripts, it outperforms Qwen and GLM on relevance and Russian text quality. Default tier for moment selection and virality scoring.

## 2. Virality Scoring Research

### Industry Approaches

- **Opus Clip**: Uses AI to score "hook strength" and "engagement potential"
- **Vidyo.ai**: Scores based on "visual variety", "audio energy", "topic relevance"
- **Descript**: No automated scoring, manual selection only

### Chosen 4-Dimension Model

Based on short-form content research (TikTok, VK Clips, YouTube Shorts):

1. **Hook (0-25)**: First 3 seconds must stop the scroll. Measured by: opening question, surprising statement, emotional trigger, visual cue
2. **Engagement (0-25)**: Will viewers interact? Measured by: controversial take, actionable advice, emotional resonance, share-worthy insight
3. **Flow (0-25)**: Standalone narrative completeness. Measured by: clear beginning/middle/end, no dangling references, satisfying conclusion
4. **Trend (0-25)**: Alignment with current topics. Measured by: trending keywords, seasonal relevance, platform-specific trends

### Why Not 5+ Dimensions?

More dimensions = more LLM calls = higher cost + latency. 4 dimensions at 25 points each sum to 100, giving clean UX. Each dimension is independently actionable (user can improve specific areas).

## 3. Prompt Engineering Findings

### JSON Mode Reliability

- Cloud.ru models support `response_format: { type: "json_object" }` via OpenAI-compatible API
- Always include JSON schema in system prompt for reliability
- Validate response with Zod before using

### Moment Selection Strategy

- Single LLM call on full transcript is more coherent than segment-by-segment analysis
- For transcripts >32K tokens: summarize first, then select moments from summary + original timestamps
- Include video duration in prompt so LLM respects 15-60 second clip constraints

### Title Generation Quality

- Tier 0 models (GigaChat3-10B, Gemini Flash Lite) produce acceptable titles
- Key: provide moment context + avoid duplicates across clips
- Russian-specific: lowercase convention for social media titles

## 4. Cost Analysis (60-Minute Video, RU Strategy)

| Task | Model | Input Tokens | Output Tokens | Cost |
|------|-------|-------------|---------------|------|
| Moment Selection | T-Pro 2.1 (tier1) | ~45,000 | ~5,000 | ~1.93₽ |
| Virality Scoring (x10) | T-Pro 2.1 (tier1) | ~10,000 | ~2,000 | ~0.49₽ |
| Title Generation (x10) | GigaChat3-10B (tier0) | ~5,000 | ~1,000 | ~0.06₽ |
| CTA Suggestion (x10) | GigaChat3-10B (tier0) | ~3,000 | ~1,000 | ~0.04₽ |
| **Total LLM** | | | | **~2.52₽** |

Combined with STT (~18₽ for 60 min), total processing: ~20.5₽ (0.34₽/min).

## 5. Timing Analysis

| Step | Estimated Duration | Parallelism |
|------|-------------------|-------------|
| Moment Selection | 10-20s | Sequential (single call) |
| Virality Scoring (x10) | 5-10s each | Parallel (3 concurrent) |
| Title + CTA (x10 each) | 2-5s each | Parallel (5 concurrent) |
| DB writes | <1s | Batch |
| **Total** | **~45-90s** | |

Well within the 3-minute SLA (STT is the bottleneck at ~60s).
