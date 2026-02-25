import OpenAI from 'openai';
import type { LLMTask, LLMTier, LLMStrategy, LLMModelConfig } from '@clipmaker/types';
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

  private getClient(strategy: LLMStrategy, provider: string): OpenAI {
    const key = `${strategy}-${provider}`;
    const existing = this.clients.get(key);
    if (existing) return existing;

    let apiKey: string | undefined;
    let baseURL: string | undefined;

    if (strategy === 'ru') {
      apiKey = this.cloudruApiKey;
      baseURL = LLM_PROVIDERS.ru.baseUrl;
    } else {
      switch (provider) {
        case 'google':
          apiKey = this.globalKeys?.gemini;
          baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
          break;
        case 'anthropic':
          apiKey = this.globalKeys?.anthropic;
          baseURL = 'https://api.anthropic.com/v1/';
          break;
        case 'openai':
          apiKey = this.globalKeys?.openai;
          break;
      }
    }

    const client = new OpenAI({ apiKey: apiKey || 'dummy', baseURL });
    this.clients.set(key, client);
    return client;
  }

  async complete(
    context: RoutingContext,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
  ): Promise<LLMResponse> {
    const tier = context.task === 'transcription' ? 1 : (context as RoutingContext & { forceTier?: LLMTier }).forceTier ?? this.selectTier(context);
    const modelConfig = this.getModelConfig(context.strategy, tier);
    const client = this.getClient(context.strategy, modelConfig.provider);

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

      // Cost in kopecks (per 1M tokens)
      const costKopecks = Math.ceil(
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
      });

      return {
        content: response.choices[0]?.message?.content || '',
        model: modelConfig.model,
        tier,
        inputTokens,
        outputTokens,
        costKopecks,
        durationMs,
      };
    } catch (error) {
      const errInfo = error instanceof Error
        ? { message: error.message, code: (error as { status?: number }).status }
        : { message: String(error) };
      logger.error({ event: 'llm_error', model: modelConfig.model, tier, error: errInfo });

      // Fallback to tier2 if tier1 fails
      if (tier < 2) {
        logger.info({ event: 'llm_fallback', from: tier, to: 2 });
        return this.complete(
          { ...context, ...({ forceTier: 2 } as Record<string, unknown>) } as RoutingContext,
          messages,
          options,
        );
      }

      throw error;
    }
  }

  async transcribe(
    strategy: LLMStrategy,
    audioFile: File | Buffer,
    language: string = 'ru',
  ): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }>; model: string }> {
    const sttConfig = LLM_PROVIDERS[strategy].stt;
    const client = this.getClient(strategy, sttConfig.provider);

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
  }
}
