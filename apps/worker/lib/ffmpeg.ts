import { spawn, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { createLogger } from './logger';

const execFileAsync = promisify(execFileCb);
const logger = createLogger('ffmpeg');
const FFMPEG_TIMEOUT = 5 * 60 * 1000; // 5 min

type RenderOptions = {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  format: '9:16' | '1:1' | '16:9';
  subtitleFile?: string;
  watermark?: boolean;
  watermarkText?: string;
};

function getScaleFilter(format: '9:16' | '1:1' | '16:9'): string {
  switch (format) {
    case '9:16':
      return 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
    case '1:1':
      return 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2';
    case '16:9':
      return 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
  }
}

export async function execFFmpeg(args: string[], timeoutMs = 30_000): Promise<void> {
  logger.debug({ event: 'ffmpeg_exec', args: args.slice(0, 6) });
  try {
    await execFileAsync('ffmpeg', args, { timeout: timeoutMs });
  } catch (error) {
    const err = error as { stderr?: string; code?: number };
    logger.error({ event: 'ffmpeg_exec_error', stderr: (err.stderr ?? '').slice(-500) });
    throw new Error(`FFmpeg failed: ${(err.stderr ?? '').slice(-200)}`);
  }
}

export async function ffprobeGetDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
    { timeout: 10_000 },
  );
  const parsed = JSON.parse(stdout);
  const duration = parseFloat(parsed.format?.duration);
  if (isNaN(duration) || duration <= 0) {
    throw new Error('Could not determine video duration');
  }
  return duration;
}

export async function extractAudio(
  inputPath: string,
  outputPath: string,
  maxDurationSeconds?: number,
): Promise<void> {
  const args = ['-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le'];
  if (maxDurationSeconds !== undefined) {
    args.push('-t', String(maxDurationSeconds));
  }
  args.push(outputPath);
  // Scale timeout: 120s minimum, +200ms per second of audio for large files
  const timeoutMs = maxDurationSeconds
    ? Math.max(120_000, maxDurationSeconds * 200)
    : 120_000;
  await execFFmpeg(args, timeoutMs);
}

export function renderClip(options: RenderOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      '-y',
      '-ss', String(options.startTime),
      '-to', String(options.endTime),
      '-i', options.inputPath,
      '-vf', getScaleFilter(options.format),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      options.outputPath,
    ];

    logger.info({
      event: 'ffmpeg_start',
      input: options.inputPath,
      output: options.outputPath,
      format: options.format,
      duration: options.endTime - options.startTime,
    });

    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('FFmpeg timeout exceeded'));
    }, FFMPEG_TIMEOUT);

    let stderr = '';
    const STDERR_MAX = 65536; // 64KB max — only need last ~500 chars for logging
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > STDERR_MAX) {
        stderr = stderr.slice(-STDERR_MAX);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        logger.info({ event: 'ffmpeg_complete', output: options.outputPath });
        resolve();
      } else {
        logger.error({ event: 'ffmpeg_error', code, stderr: stderr.slice(-500) });
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
