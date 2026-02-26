export type AuthProvider = 'email' | 'vk';

export type LLMProviderPreference = 'ru' | 'global';

export type PlanId = 'free' | 'start' | 'pro' | 'business';

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  minutesPerMonth: number;
  maxClipsPerVideo: number;
  watermark: boolean;
  autoPostPlatforms: string[];
  maxTeamSeats: number;
  llmTierMax: number;
};

/**
 * Extended plan metadata (UI features, team seats, LLM tiers).
 * Prices and core limits MUST match PLAN_CONFIG in billing.ts (single source of truth for billing).
 */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    minutesPerMonth: 30,
    maxClipsPerVideo: 3,
    watermark: true,
    autoPostPlatforms: [],
    maxTeamSeats: 1,
    llmTierMax: 1,
  },
  start: {
    id: 'start',
    name: 'Start',
    priceMonthly: 99000,
    minutesPerMonth: 120,
    maxClipsPerVideo: 10,
    watermark: false,
    autoPostPlatforms: ['vk'],
    maxTeamSeats: 1,
    llmTierMax: 1,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 299000,
    minutesPerMonth: 1000,
    maxClipsPerVideo: 100,
    watermark: false,
    autoPostPlatforms: ['vk', 'rutube', 'dzen', 'telegram'],
    maxTeamSeats: 3,
    llmTierMax: 2,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthly: 999000,
    minutesPerMonth: 99999,
    maxClipsPerVideo: 100,
    watermark: false,
    autoPostPlatforms: ['vk', 'rutube', 'dzen', 'telegram'],
    maxTeamSeats: 10,
    llmTierMax: 2,
  },
};
