import path from 'path';
import { execFFmpeg } from './ffmpeg';

export const CHUNK_DURATION = 180; // 3 minutes in seconds

export type AudioChunk = {
  path: string;
  offsetSeconds: number;
};

/**
 * Split audio into MP3 chunks for STT upload.
 * MP3 is ~10-15x smaller than WAV, reducing upload time and Cloud.ru timeouts.
 * Reference: https://github.com/dzhechko/stt-rag-app converts to MP3 before STT.
 */
export async function splitAudio(
  audioPath: string,
  tmpDir: string,
  totalDuration: number,
): Promise<AudioChunk[]> {
  if (totalDuration <= CHUNK_DURATION) {
    const mp3Path = path.join(tmpDir, 'chunk_0.mp3');
    await execFFmpeg(
      ['-i', audioPath, '-acodec', 'libmp3lame', '-q:a', '2', '-y', mp3Path],
      60_000,
    );
    return [{ path: mp3Path, offsetSeconds: 0 }];
  }

  const numChunks = Math.ceil(totalDuration / CHUNK_DURATION);
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < numChunks; i++) {
    const chunkPath = path.join(tmpDir, `chunk_${i}.mp3`);
    const startSec = i * CHUNK_DURATION;
    await execFFmpeg(
      ['-i', audioPath, '-ss', String(startSec), '-t', String(CHUNK_DURATION),
       '-acodec', 'libmp3lame', '-q:a', '2', '-y', chunkPath],
      60_000,
    );
    chunks.push({ path: chunkPath, offsetSeconds: startSec });
  }

  return chunks;
}
