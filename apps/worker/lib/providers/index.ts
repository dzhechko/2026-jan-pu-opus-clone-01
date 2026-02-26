import type { PlatformProvider } from './base';
import { VKProvider } from './vk';
import { RutubeProvider } from './rutube';
import { DzenProvider } from './dzen';
import { TelegramProvider } from './telegram';

const providers: Record<string, PlatformProvider> = {
  vk: new VKProvider(),
  rutube: new RutubeProvider(),
  dzen: new DzenProvider(),
  telegram: new TelegramProvider(),
};

export function getPlatformProvider(platform: string): PlatformProvider {
  const provider = providers[platform];
  if (!provider) throw new Error(`Unknown platform: ${platform}`);
  return provider;
}

export { PlatformProvider } from './base';
export type {
  PlatformPublishParams,
  PlatformPublishResult,
  PlatformStats,
  TestConnectionResult,
} from './base';
