# INS-012: Anthropic API Rejects response_format via OpenAI SDK

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-26

## Error Signature
`400 response_format.type: Input should be 'json_schema'`

## Context
LLM router uses OpenAI SDK to call Anthropic (Claude) models. Passing `response_format: { type: 'json_object' }` causes a 400 error.

## Root Cause
Anthropic's OpenAI-compatible endpoint does NOT support `response_format: { type: 'json_object' }`. It only accepts `json_schema` type, or no `response_format` at all.

## Solution
Skip `response_format` for Anthropic provider in `llm-router.ts`:
```typescript
const supportsJsonMode = modelConfig.provider !== 'anthropic';
...(options?.jsonMode && supportsJsonMode ? { response_format: { type: 'json_object' } } : {})
```
JSON output is still achievable via system prompt instructions.

## Prevention
When adding new LLM providers, test `response_format` support separately. Don't assume OpenAI SDK compatibility = full feature parity.
