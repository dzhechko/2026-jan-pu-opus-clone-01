import path from 'path';
import { execFFmpeg } from './ffmpeg';

export const CHUNK_DURATION = 600; // 10 minutes in seconds

export type AudioChunk = {
  path: string;
  offsetSeconds: number;
};

export async function splitAudio(
  audioPath: string,
  tmpDir: string,
  totalDuration: number,
): Promise<AudioChunk[]> {
  if (totalDuration <= CHUNK_DURATION) {
    return [{ path: audioPath, offsetSeconds: 0 }];
  }

  const numChunks = Math.ceil(totalDuration / CHUNK_DURATION);
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < numChunks; i++) {
    const chunkPath = path.join(tmpDir, `chunk_${i}.wav`);
    const startSec = i * CHUNK_DURATION;
    await execFFmpeg(
      ['-i', audioPath, '-ss', String(startSec), '-t', String(CHUNK_DURATION), '-c', 'copy', chunkPath],
      30_000,
    );
    chunks.push({ path: chunkPath, offsetSeconds: startSec });
  }

  return chunks;
}
