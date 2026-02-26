export const PLATFORM_LABELS: Record<string, string> = {
  vk: 'VK',
  rutube: 'Rutube',
  dzen: 'Дзен',
  telegram: 'Telegram',
};

export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function truncateText(text: string, maxLen: number = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

export function formatDateShort(date: Date | null): string {
  if (!date) return '\u2014';
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Validate that a URL is safe to render as an href (http/https only).
 */
export function isSafeUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
