import type { LLMProviderConfig } from '@clipmaker/types';

/** Maps native model IDs to OpenRouter model IDs */
export const OPENROUTER_MODEL_MAP: Record<string, string> = {
  'gemini-2.0-flash-lite': 'google/gemini-2.0-flash-lite-001',
  'gemini-2.0-flash': 'google/gemini-2.0-flash-001',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'claude-haiku-4.5': 'anthropic/claude-haiku-4.5',
};

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const LLM_PROVIDERS: Record<'ru' | 'global', LLMProviderConfig> = {
  ru: {
    stt: { provider: 'cloudru', model: 'openai/whisper-large-v3', costPerUnit: 0.005 },
    tier0: { provider: 'cloudru', model: 'GigaChat3-10B-A1.8B', costInput: 10, costOutput: 10 },
    tier1: { provider: 'cloudru', model: 't-tech/T-pro-it-2.1', costInput: 35, costOutput: 70 },
    tier2: { provider: 'cloudru', model: 'Qwen3-235B-A22B-Instruct-2507', costInput: 17, costOutput: 70 },
    tier3: { provider: 'cloudru', model: 'zai-org/GLM-4.6', costInput: 55, costOutput: 220 },
    baseUrl: 'https://foundation-models.api.cloud.ru/v1',
    dataResidency: 'RU',
  },
  global: {
    stt: { provider: 'openai', model: 'whisper-1', costPerUnit: 0.006 },
    tier0: { provider: 'google', model: 'gemini-2.0-flash-lite', costInput: 0.075, costOutput: 0.30 },
    tier1: { provider: 'google', model: 'gemini-2.0-flash', costInput: 0.10, costOutput: 0.40 },
    tier2: { provider: 'anthropic', model: 'claude-haiku-4.5', costInput: 0.80, costOutput: 4.00 },
    tier3: { provider: 'google', model: 'gemini-2.5-pro', costInput: 1.25, costOutput: 10.00 },
    baseUrl: '',
    dataResidency: 'US/EU',
  },
};
