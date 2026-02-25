# Refinement: Moments + Virality

## Edge Cases Matrix

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Transcript is very short (<100 words) | Moment selection may find 0-1 moments. Fallback: create 1 clip from entire transcript |
| 2 | Transcript is very long (>100K tokens) | LLM Router selects tier3 (GLM-4.6, 200K context). If still too long, truncate to 200K tokens |
| 3 | Video is exactly 2 minutes (minimum) | At most 2-3 clips of 15-30 seconds each. Allow clips down to 15s |
| 4 | Video is 3+ hours | May produce 15+ candidates. Plan limits cap output. Processing time may exceed 3 min — acceptable for very long videos |
| 5 | All moments score <30 | Still show clips. Don't hide — let user decide. Sort by score DESC |
| 6 | LLM returns duplicate timestamps | Deduplicate: if two moments overlap >50%, keep the one with higher hookStrength |
| 7 | LLM returns timestamps beyond video duration | Clamp to [0, videoDurationSeconds] |
| 8 | LLM returns clips shorter than 15s or longer than 60s | Clamp duration to [15, 60] range |
| 9 | User plan changes during processing | Use plan at time of job creation. Don't retroactively adjust |
| 10 | Concurrent LLM jobs for same video | Idempotency guard: check video.status === 'analyzing' before processing |
| 11 | LLM API rate limit (429) | retryWithBackoff handles this. BullMQ retry as safety net |
| 12 | Cloud.ru API down | BullMQ retry with exponential backoff. After 3 failures, video marked 'failed' |
| 13 | Free plan user uploads second video while first is processing | Each video gets independent processing. Plan limits apply per video |
| 14 | Transcript has no speech (all silence filtered) | fullText is empty. Fallback moments from video duration only |
| 15 | LLM returns non-JSON despite jsonMode | Catch parse error, retry once. If still fails, use fallback |

## Testing Strategy

### Unit Tests

| Test | Description |
|------|-------------|
| `getMaxClipsForPlan()` | Returns correct limits for each plan |
| `generateFallbackMoments()` | Creates evenly-spaced moments for given duration |
| `validateMoments()` | Clamps timestamps, enforces duration bounds |
| `Zod schema parsing` | MomentResponseSchema, ViralityResponseSchema, TitleResponseSchema, CtaResponseSchema validate correctly |
| `deduplicateMoments()` | Removes overlapping moments |

### Integration Tests (with mocked LLM)

| Test | Description |
|------|-------------|
| Full pipeline (happy path) | Mock LLM → verify clips created with correct fields |
| Tier escalation on empty moments | Mock empty response → verify retry with higher tier |
| Fallback moments | Mock 2 empty responses → verify evenly-spaced clips |
| Plan limits enforced | Mock 10 moments → verify free plan gets 3 clips |
| Cost tracking | Verify UsageRecord.llmCostKopecks accumulated correctly |
| Subtitle segment extraction | Verify clip subtitleSegments contain correct relative timestamps |

### E2E Tests

| Test | Description |
|------|-------------|
| View clips after processing | Upload video → wait → see clips on detail page |
| Score breakdown display | Click score badge → see 4-dimension breakdown |
| Clips sorted by score | Verify descending order in UI |

## Performance Optimizations

1. **Parallel scoring**: 3 concurrent LLM calls per moment (scoring + title + CTA in Promise.all)
2. **Batch DB insert**: All clips + video update + usage record in single transaction
3. **Prompt efficiency**: System prompts cached in module constants. User messages minimal.
4. **Early termination**: If video status changed from 'analyzing' (e.g., deleted), skip remaining work

## Security Hardening

1. **LLM response validation**: Every JSON response parsed with Zod before DB write
2. **Timestamp clamping**: Prevents clips referencing non-existent video positions
3. **Plan limit enforcement**: Server-side, cannot be bypassed by client
4. **No user input in prompts**: Only transcript text (already sanitized) and video metadata
5. **Cost capping**: If LLM cost exceeds 10₽ per video, abort and mark failed (safety valve)

## Technical Debt Items

| Item | Priority | Notes |
|------|----------|-------|
| Real trend data from platform APIs | Low | Currently LLM estimates trend score without real data |
| Prompt versioning | Medium | Prompts are hardcoded constants. Should have version tracking for A/B testing |
| Streaming LLM responses | Low | Currently waits for full response. Streaming could improve perceived speed |
| Clip deduplication | Medium | Basic overlap check. Could use semantic similarity |
