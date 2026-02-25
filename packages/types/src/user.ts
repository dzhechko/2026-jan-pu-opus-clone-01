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
    priceMonthly: 199000,
    minutesPerMonth: 300,
    maxClipsPerVideo: 999,
    watermark: false,
    autoPostPlatforms: ['vk', 'rutube', 'dzen', 'telegram'],
    maxTeamSeats: 3,
    llmTierMax: 2,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthly: 499000,
    minutesPerMonth: 1000,
    maxClipsPerVideo: 999,
    watermark: false,
    autoPostPlatforms: ['vk', 'rutube', 'dzen', 'telegram'],
    maxTeamSeats: 10,
    llmTierMax: 2,
  },
};
