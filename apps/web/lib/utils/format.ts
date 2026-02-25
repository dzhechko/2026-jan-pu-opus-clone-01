/**
 * Format seconds into human-readable duration.
 * Examples: 65 -> "1:05", 3661 -> "1:01:01"
 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * Format a date into relative Russian string.
 * Examples: "только что", "5 мин назад", "2 часа назад", "вчера", "15 янв"
 */
export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн назад`;

  const day = new Date(date).getDate();
  const month = MONTHS[new Date(date).getMonth()];

  if (new Date(date).getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${new Date(date).getFullYear()}`;
}
