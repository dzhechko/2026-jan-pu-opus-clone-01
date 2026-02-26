import type { PlanId } from './user';

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired';

export type PaymentMethod = 'card' | 'sbp';

export type PaymentStatus = 'pending' | 'succeeded' | 'cancelled' | 'refunded';

export type PaymentType = 'subscription' | 'extra_minutes';

export type PublicationPlatform = 'vk' | 'rutube' | 'dzen' | 'telegram';

export type PublicationStatus = 'scheduled' | 'publishing' | 'published' | 'failed';

export type PlanDefinition = {
  price: number; // kopecks
  minutesLimit: number;
  maxClips: number;
  watermark: boolean;
  storageDays: number;
};

/** Sentinel for "unlimited" minutes on Business plan. */
export const UNLIMITED_MINUTES = 99999;

export const PLAN_CONFIG: Record<PlanId, PlanDefinition> = {
  free: { price: 0, minutesLimit: 30, maxClips: 3, watermark: true, storageDays: 3 },
  start: { price: 99000, minutesLimit: 120, maxClips: 10, watermark: false, storageDays: 30 },
  pro: { price: 299000, minutesLimit: 1000, maxClips: 100, watermark: false, storageDays: 90 },
  business: { price: 999000, minutesLimit: UNLIMITED_MINUTES, maxClips: 100, watermark: false, storageDays: 90 },
} as const;

export const EXTRA_MINUTES_PRICE_KOPECKS = 1500; // 15₽/min

export const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: 'Бесплатный',
  start: 'Стартовый',
  pro: 'Профессионал',
  business: 'Бизнес',
} as const;
