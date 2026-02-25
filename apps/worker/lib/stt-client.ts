import OpenAI from 'openai';
import { LLM_PROVIDERS } from '@clipmaker/config';
import type { LLMStrategy } from '@clipmaker/types';

const clients = new Map<string, OpenAI>();

export function createSTTClient(strategy: LLMStrategy): OpenAI {
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
