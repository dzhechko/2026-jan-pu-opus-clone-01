# INS-011: OpenRouter Model IDs Have Version Suffixes

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-26

## Error Signature
`400 google/gemini-2.0-flash is not a valid model ID`

## Context
LLM router sends model name to OpenRouter API, gets 400 — model ID not recognized.

## Root Cause
OpenRouter deprecated bare model IDs. Current format requires version suffixes:
- `google/gemini-2.0-flash` → `google/gemini-2.0-flash-001`
- `google/gemini-2.0-flash-lite` → `google/gemini-2.0-flash-lite-001`
- `anthropic/claude-3.5-haiku` → `anthropic/claude-haiku-4.5`

## Solution
Update `OPENROUTER_MODEL_MAP` in `packages/config/src/llm-providers.ts` with current model IDs.
Verify available models: `curl https://openrouter.ai/api/v1/models -H "Authorization: Bearer $KEY" | jq '.data[].id' | grep gemini`

## Prevention
Periodically check OpenRouter model list. Consider querying `/models` endpoint at startup to validate configured model IDs.
