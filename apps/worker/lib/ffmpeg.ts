import { spawn } from 'child_process';
import { createLogger } from './logger';

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
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
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
