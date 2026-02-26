import OpenAI from 'openai';
import { LLM_PROVIDERS } from '@clipmaker/config';
import type { LLMStrategy } from '@clipmaker/types';

const clients = new Map<string, OpenAI>();

/**
 * Create an OpenAI client for STT transcription.
 * If byokApiKey is provided, creates an ephemeral (non-cached) client.
 */
export function createSTTClient(strategy: LLMStrategy, byokApiKey?: string): OpenAI {
  // BYOK: create ephemeral client (do NOT cache -- different key per user)
  if (byokApiKey) {
    let baseURL: string | undefined;
    if (strategy === 'ru') {
      baseURL = LLM_PROVIDERS.ru.baseUrl;
    }
    return new OpenAI({ apiKey: byokApiKey, baseURL });
  }

  // Server key: cache client for reuse
  const existing = clients.get(strategy);
  if (existing) return existing;

  let apiKey: string | undefined;
  let baseURL: string | undefined;

  if (strategy === 'ru') {
    apiKey = process.env.CLOUDRU_API_KEY;
    baseURL = LLM_PROVIDERS.ru.baseUrl;
  } else {
    apiKey = process.env.OPENAI_API_KEY;
    // OpenAI default baseURL
  }

  if (!apiKey) {
    throw new Error(`Missing API key for STT strategy: ${strategy}`);
  }

  const client = new OpenAI({ apiKey, baseURL });
  clients.set(strategy, client);
  return client;
}

export function getSTTConfig(strategy: LLMStrategy) {
  return LLM_PROVIDERS[strategy].stt;
}
