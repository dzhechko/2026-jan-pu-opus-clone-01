# Completion: Moments + Virality

## Environment Variables

No new env vars required. LLM analysis uses existing:

| Variable | Used By | Already Configured |
|----------|---------|-------------------|
| `CLOUDRU_API_KEY` | LLM Router (Cloud.ru strategy) | Yes (worker) |
| `OPENAI_API_KEY` | LLM Router (global strategy) | Yes (worker) |
| `REDIS_URL` | BullMQ queue | Yes |
| `DATABASE_URL` | Prisma client | Yes |

## Deployment Checklist

- [ ] Verify `CLOUDRU_API_KEY` has access to T-Pro 2.1 and GigaChat3-10B
- [ ] Verify BullMQ `LLM` queue is registered in worker startup
- [ ] Run `prisma migrate dev` if schema changes needed (none expected — Clip model exists)
- [ ] Restart worker container to pick up new `llm-analyze.ts`
- [ ] Monitor Cloud.ru API usage dashboard for cost anomalies

## Docker Compose Changes

No changes needed. The worker container already watches all files in `apps/worker/workers/`.

## Monitoring & Alerting

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| LLM analysis duration | Worker logs (`llm_analyze_complete`) | > 180s |
| LLM cost per video | UsageRecord.llmCostKopecks | > 1000 kopecks (10₽) |
| Moments found per video | Worker logs | 0 (after retry) |
| LLM API errors | Worker logs (`llm_error`) | > 5 per hour |
| Clips created per video | Worker logs | 0 |

### Log Events

| Event | Level | Fields |
|-------|-------|--------|
| `llm_analyze_start` | info | videoId, strategy, tokenCount |
| `llm_moment_selection` | info | videoId, momentsFound, tier, costKopecks, durationMs |
| `llm_scoring_complete` | info | videoId, clipIndex, score, tier |
| `llm_analyze_complete` | info | videoId, clipsCreated, totalCostKopecks, totalDurationMs |
| `llm_analyze_error` | error | videoId, error, step |
| `llm_fallback_moments` | warn | videoId, reason |
| `llm_parse_failed` | warn | videoId, task, error |

## Rollback Plan

1. **If LLM analysis produces bad results**: Revert `llm-analyze.ts` to placeholder. Videos will stay in "analyzing" state. No data loss.
2. **If costs spike**: Set `LLM_COST_LIMIT_KOPECKS=1000` env var (safety valve in worker).
3. **If API is down**: BullMQ retries handle transient failures. For prolonged outage, pause the LLM queue: `bullmq pause`.

## Handoff Checklist

### For Development
- [ ] All prompt templates in `apps/worker/lib/prompts/`
- [ ] LLM analyze worker fully implemented
- [ ] STT worker enqueues LLM jobs
- [ ] Clip router has `getByVideo` procedure
- [ ] Frontend shows virality scores

### For QA
- [ ] Test with short video (2 min) — should get 1-3 clips
- [ ] Test with long video (60+ min) — should get 3-10 clips
- [ ] Test free plan limits (max 3 clips)
- [ ] Test score breakdown display
- [ ] Verify Russian titles are grammatically correct

### For Operations
- [ ] Monitor Cloud.ru API costs
- [ ] Set up alerts for LLM errors
- [ ] Verify worker container restart picks up new code
