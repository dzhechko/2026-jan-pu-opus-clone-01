export type LLMStrategy = 'ru' | 'global';

export type LLMTask = 'transcription' | 'moment_selection' | 'virality_scoring' | 'title_generation' | 'cta_suggestion';

export type LLMTier = 0 | 1 | 2 | 3;

export type LLMModelConfig = {
  provider: string;
  model: string;
  costInput: number;
  costOutput: number;
};

export type LLMProviderConfig = {
  stt: { provider: string; model: string; costPerUnit: number };
  tier0: LLMModelConfig;
  tier1: LLMModelConfig;
  tier2: LLMModelConfig;
  tier3: LLMModelConfig;
  baseUrl: string;
  dataResidency: 'RU' | 'US/EU';
};
