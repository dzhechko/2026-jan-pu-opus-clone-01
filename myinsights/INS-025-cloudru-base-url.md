# INS-025: Cloud.ru Wrong Base URL for Foundation Models

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-27

## Error Signatures
- `api.cloud.ru`
- `foundation-models.api.cloud.ru`
- `CLOUDRU_BASE_URL`
- `STT failed`
- `Cloud.ru 404`

## Symptom
Video processing with RU strategy fails at STT stage. Video stays in `transcribing` or `failed` status. Cloud.ru API returns 404 or connection error.

## Root Cause
Cloud.ru Foundation Models (LLM/STT) use a dedicated subdomain:
- **Wrong:** `https://api.cloud.ru/v1`
- **Correct:** `https://foundation-models.api.cloud.ru/v1`

The generic `api.cloud.ru` is for Cloud.ru platform management API, NOT for AI model inference.

Additionally, the Whisper model ID requires the `openai/` prefix:
- **Wrong:** `whisper-large-v3`
- **Correct:** `openai/whisper-large-v3`

## Solution
1. Update `packages/config/src/llm-providers.ts`: baseUrl and stt.model
2. Update `packages/config/src/env.ts`: CLOUDRU_BASE_URL default
3. Update `.env` and `.env.example`: CLOUDRU_BASE_URL value
4. Update all documentation referencing the old URL

## Additional Bug Found
Retry exhaustion check in `stt.ts` used `===` instead of `>=`:
```typescript
// BUG: job.attemptsMade === job.opts?.attempts
// FIX: job.attemptsMade >= (job.opts?.attempts ?? 0)
```
This caused videos to stay stuck in `transcribing` instead of being marked `failed`.

## Source
- Cloud.ru Foundation Models Quickstart: https://cloud.ru/docs/foundation-models/ug/topics/quickstart
- Example in docs: `url = "https://foundation-models.api.cloud.ru/v1"`

## Files Changed
- `packages/config/src/llm-providers.ts`
- `packages/config/src/env.ts`
- `.env.example`
- `apps/worker/workers/stt.ts`
- `apps/worker/workers/llm-analyze.ts`
- README files (6 files)
- `docs/LLM_Strategy.md`
- `docs/Pseudocode.md`
