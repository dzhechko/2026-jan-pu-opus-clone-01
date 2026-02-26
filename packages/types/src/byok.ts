export type ByokProvider = 'gemini' | 'openai' | 'anthropic';

export type ByokKeyStatus = 'connected' | 'not_connected' | 'invalid';

export type EncryptedByokKey = {
  provider: ByokProvider;
  encryptedData: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
  createdAt: number;
  keyPreview: string;
};

export type ByokProviderInfo = {
  id: ByokProvider;
  name: string;
  description: string;
  helpUrl: string;
  keyPrefix: string;
};

export type ByokKeys = Partial<Record<ByokProvider, string>>;

export const BYOK_PROVIDERS: Record<ByokProvider, ByokProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google AI Studio -- Gemini Flash, Flash Lite, 2.5 Pro',
    helpUrl: 'https://aistudio.google.com/apikey',
    keyPrefix: 'AIza',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI -- Whisper STT (Global)',
    helpUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic -- Claude Haiku (Tier 2 fallback)',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
};

/** Maps LLM provider strings (from LLMModelConfig.provider) to ByokProvider */
export const LLM_PROVIDER_TO_BYOK: Record<string, ByokProvider> = {
  google: 'gemini',
  openai: 'openai',
  anthropic: 'anthropic',
};
