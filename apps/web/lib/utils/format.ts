/**
 * Format seconds into human-readable duration.
 * Examples: 65 -> "1:05", 3661 -> "1:01:01"
 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * Format a date into relative Russian string.
 * Examples: "только что", "5 мин назад", "2 ч назад", "вчера", "15 янв"
 */
export function formatRelativeDate(date: Date | string): string {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн назад`;

  const day = d.getDate();
  const month = MONTHS[d.getMonth()];

  if (d.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${d.getFullYear()}`;
}

/**
 * Russian pluralization for clip counts.
 * 1 клип, 2-4 клипа, 5-20 клипов, 21 клип, etc.
 */
export function pluralizeClips(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} клип`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} клипа`;
  return `${count} клипов`;
}
