const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
const SAFE_EXT = /^[a-z0-9]{1,10}$/;

function assertSafeSegment(value: string, name: string): void {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Invalid ${name}: must be alphanumeric, dash, or underscore`);
  }
}

function assertSafeExt(value: string): void {
  if (!SAFE_EXT.test(value)) {
    throw new Error('Invalid extension: must be lowercase alphanumeric, max 10 chars');
  }
}

export function videoSourcePath(userId: string, videoId: string, ext: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(videoId, 'videoId');
  assertSafeExt(ext);
  return `videos/${userId}/${videoId}/source.${ext}`;
}

export function clipPath(userId: string, videoId: string, clipId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(videoId, 'videoId');
  assertSafeSegment(clipId, 'clipId');
  return `clips/${userId}/${videoId}/${clipId}.mp4`;
}

export function thumbnailPath(userId: string, videoId: string, clipId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(videoId, 'videoId');
  assertSafeSegment(clipId, 'clipId');
  return `thumbnails/${userId}/${videoId}/${clipId}.jpg`;
}
