export function videoSourcePath(userId: string, videoId: string, ext: string): string {
  return `videos/${userId}/${videoId}/source.${ext}`;
}

export function clipPath(userId: string, videoId: string, clipId: string): string {
  return `clips/${userId}/${videoId}/${clipId}.mp4`;
}

export function thumbnailPath(userId: string, videoId: string, clipId: string): string {
  return `thumbnails/${userId}/${videoId}/${clipId}.jpg`;
}
