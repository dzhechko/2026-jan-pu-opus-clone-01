import OpenAI from 'openai';
import type { LLMTask, LLMTier, LLMStrategy, LLMModelConfig, ByokKeys } from '@clipmaker/types';
import { LLM_PROVIDER_TO_BYOK } from '@clipmaker/types';
import { LLM_PROVIDERS } from '@clipmaker/config';
import { createLogger } from './logger';

const logger = createLogger('llm-router');

type RoutingContext = {
  task: LLMTask;
  strategy: LLMStrategy;
  tokenCount?: number;
  planId?: string;
  previousScore?: number;
};

type LLMResponse = {
  content: string;
  model: string;
  tier: LLMTier;
  inputTokens: number;
  outputTokens: number;
  costKopecks: number;
  durationMs: number;
  usedByokKey: boolean;
};

export class LLMRouter {
  private clients: Map<string, OpenAI> = new Map();

  constructor(
    private cloudruApiKey?: string,
    private globalKeys?: { gemini?: string; anthropic?: string; openai?: string },
  ) {}

  selectTier(context: RoutingContext): LLMTier {
    const { task, tokenCount, planId, previousScore } = context;

    // Tier 0: simple tasks (titles, CTAs)
    if (task === 'title_generation' || task === 'cta_suggestion') return 0;

    // Tier 3: long context (>100K tokens)
    if (tokenCount && tokenCount > 100_000) return 3;

    // Tier 2: business plan or quality retry
    if (planId === 'business' || (previousScore !== undefined && previousScore < 50)) return 2;

    // Tier 1: default
    return 1;
  }

  getModelConfig(strategy: LLMStrategy, tier: LLMTier): LLMModelConfig {
    const config = LLM_PROVIDERS[strategy];
    const tierKey = `tier${tier}` as 'tier0' | 'tier1' | 'tier2' | 'tier3';
    return config[tierKey];
  }

  /**
   * Get or create an OpenAI client for the given strategy/provider.
   * Cached clients use server keys. BYOK clients are ephemeral (not cached).
   */
  private getClient(strategy: LLMStrategy, provider: string, byokKey?: string): OpenAI {
    // BYOK: create ephemeral client (do NOT cache -- different key per user)
    if (byokKey) {
      return this.createProviderClient(strategy, provider, byokKey);
    }

    // Server key: cache client for reuse
    const cacheKey = `${strategy}-${provider}`;
    const existing = this.clients.get(cacheKey);
    if (existing) return existing;

    const client = this.createProviderClient(strategy, provider);
    this.clients.set(cacheKey, client);
    return client;
  }

  private createProviderClient(
    strategy: LLMStrategy,
    provider: string,
    overrideApiKey?: string,
  ): OpenAI {
    let apiKey: string | undefined = overrideApiKey;
    let baseURL: string | undefined;

    if (strategy === 'ru') {
      apiKey = apiKey || this.cloudruApiKey;
      baseURL = LLM_PROVIDERS.ru.baseUrl;
    } else {
      switch (provider) {
        case 'google':
          apiKey = apiKey || this.globalKeys?.gemini;
          baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
          break;
        case 'anthropic':
          apiKey = apiKey || this.globalKeys?.anthropic;
          baseURL = 'https://api.anthropic.com/v1/';
          break;
        case 'openai':
          apiKey = apiKey || this.globalKeys?.openai;
          break;
      }
    }

    return new OpenAI({ apiKey: apiKey || 'dummy', baseURL });
  }

  /**
   * Resolve the BYOK key for a specific LLM provider.
   * Maps LLM provider names (google, openai, anthropic) to BYOK provider keys.
   */
  private resolveByokKey(provider: string, byokKeys?: ByokKeys): string | undefined {
    if (!byokKeys) return undefined;
    const byokProvider = LLM_PROVIDER_TO_BYOK[provider];
    if (!byokProvider) return undefined;
    return byokKeys[byokProvider];
  }

  async complete(
    context: RoutingContext,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
    byokKeys?: ByokKeys,
  ): Promise<LLMResponse> {
    const tier = context.task === 'transcription' ? 1 : (context as RoutingContext & { forceTier?: LLMTier }).forceTier ?? this.selectTier(context);
    const modelConfig = this.getModelConfig(context.strategy, tier);

    const byokKey = this.resolveByokKey(modelConfig.provider, byokKeys);
    const client = this.getClient(context.strategy, modelConfig.provider, byokKey);
    const usedByokKey = !!byokKey;

    const startTime = Date.now();

    try {
      const response = await client.chat.completions.create({
        model: modelConfig.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        ...(options?.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      });

      const durationMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens ?? 0;
      const outputTokens = usage?.completion_tokens ?? 0;

      // Cost in kopecks (per 1M tokens) -- 0 if BYOK (user pays directly)
      const costKopecks = usedByokKey
        ? 0
        : Math.ceil(
            (inputTokens * modelConfig.costInput + outputTokens * modelConfig.costOutput) / 1_000_000,
          );

      logger.info({
        event: 'llm_complete',
        model: modelConfig.model,
        tier,
        strategy: context.strategy,
        task: context.task,
        inputTokens,
        outputTokens,
        costKopecks,
        durationMs,
        usedByokKey,
      });

      return {
        content: response.choices[0]?.message?.content || '',
        model: modelConfig.model,
        tier,
        inputTokens,
        outputTokens,
        costKopecks,
        durationMs,
        usedByokKey,
      };
    } catch (error) {
      const errInfo = error instanceof Error
        ? { message: error.message, code: (error as { status?: number }).status }
        : { message: String(error) };
      const errorCode = (error as { status?: number }).status;

      // BYOK key rejected (401/403) -- fallback to server key
      if (usedByokKey && (errorCode === 401 || errorCode === 403)) {
        logger.warn({
          event: 'byok_fallback_server_key',
          model: modelConfig.model,
          tier,
          reason: errorCode,
        });
        return this.complete(context, messages, options); // no byokKeys = server key
      }

      logger.error({ event: 'llm_error', model: modelConfig.model, tier, error: errInfo });

      // Fallback to tier2 if tier1 fails
      if (tier < 2) {
        logger.info({ event: 'llm_fallback', from: tier, to: 2 });
        return this.complete(
          { ...context, ...({ forceTier: 2 } as Record<string, unknown>) } as RoutingContext,
          messages,
          options,
          byokKeys,
        );
      }

      throw error;
    }
  }

  async transcribe(
    strategy: LLMStrategy,
    audioFile: File | Buffer,
    language: string = 'ru',
    byokOpenaiKey?: string,
  ): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }>; model: string }> {
    const sttConfig = LLM_PROVIDERS[strategy].stt;
    const client = this.getClient(strategy, sttConfig.provider, byokOpenaiKey);

    try {
      const response = await client.audio.transcriptions.create({
        model: sttConfig.model,
        file: audioFile as File,
        language,
        response_format: 'verbose_json',
      });

      return {
        text: response.text,
        segments: (response as unknown as { segments?: Array<{ start: number; end: number; text: string }> }).segments || [],
        model: sttConfig.model,
      };
    } catch (error) {
      // BYOK key rejected -- fallback to server key
      if (byokOpenaiKey) {
        const errorCode = (error as { status?: number }).status;
        if (errorCode === 401 || errorCode === 403) {
          logger.warn({ event: 'byok_stt_fallback', reason: errorCode });
          return this.transcribe(strategy, audioFile, language); // no BYOK key
        }
      }
      throw error;
    }
  }
}
