import OpenAI from 'openai';
import https from 'https';
import { LLM_PROVIDERS } from '@clipmaker/config';
import type { LLMStrategy } from '@clipmaker/types';

const clients = new Map<string, OpenAI>();

// Cloud.ru certs are not always trusted in non-Russian environments (Codespace).
// Reference: https://github.com/dzhechko/stt-rag-app (verify=False, timeout=120s)
const cloudruHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 10,
});

function cloudruOptions(apiKey: string): ConstructorParameters<typeof OpenAI>[0] {
  return {
    apiKey,
    baseURL: LLM_PROVIDERS.ru.baseUrl,
    httpAgent: cloudruHttpsAgent,
    timeout: 120_000,  // 120s total (matches reference impl)
    maxRetries: 2,
  };
}

/**
 * Create an OpenAI client for STT transcription.
 * If byokApiKey is provided, creates an ephemeral (non-cached) client.
 */
export function createSTTClient(strategy: LLMStrategy, byokApiKey?: string): OpenAI {
  // BYOK: create ephemeral client (do NOT cache -- different key per user)
  if (byokApiKey) {
    if (strategy === 'ru') {
      return new OpenAI(cloudruOptions(byokApiKey));
    }
    return new OpenAI({ apiKey: byokApiKey });
  }

  // Server key: cache client for reuse
  const existing = clients.get(strategy);
  if (existing) return existing;

  let apiKey: string | undefined;

  if (strategy === 'ru') {
    apiKey = process.env.CLOUDRU_API_KEY;
    if (!apiKey) throw new Error('Missing API key for STT strategy: ru');
    const client = new OpenAI(cloudruOptions(apiKey));
    clients.set(strategy, client);
    return client;
  }

  apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing API key for STT strategy: global');

  const client = new OpenAI({ apiKey });
  clients.set(strategy, client);
  return client;
}

export function getSTTConfig(strategy: LLMStrategy) {
  return LLM_PROVIDERS[strategy].stt;
}
