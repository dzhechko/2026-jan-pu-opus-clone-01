import { spawn, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { createLogger } from './logger';

const execFileAsync = promisify(execFileCb);
const logger = createLogger('ffmpeg');

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export type ClipFormat = 'portrait' | 'square' | 'landscape';

export const FORMAT_DIMENSIONS: Record<ClipFormat, { width: number; height: number }> = {
  portrait:  { width: 1080, height: 1920 },
  square:    { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

const FFMPEG_TIMEOUT = 5 * 60 * 1000; // 5 min

export type SubtitleSegment = {
  start: number;
  end: number;
  text: string;
};

export type CTA = {
  text: string;
  position: 'end' | 'overlay';
  duration: number;
};

type RenderOptions = {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  format: ClipFormat;
  subtitleFile?: string;
  watermark?: boolean;
  watermarkText?: string;
  filterChain?: string;
};

// ---------------------------------------------------------------------------
// Text Escaping Helpers
// ---------------------------------------------------------------------------

/**
 * Escapes FFmpeg drawtext special characters.
 * Must escape: backslash, single quote, colon.
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

/**
 * Escapes a file path for use inside FFmpeg filter expressions.
 * Backslashes are quadrupled, colons and quotes escaped.
 */
export function escapeFFmpegPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

/**
 * Escapes ASS override block characters ({ and }).
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

// ---------------------------------------------------------------------------
// Scale & Filter Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the FFmpeg scale+pad filter string for a given clip format.
 * Scales to fit within target dimensions, pads with black letterbox.
 */
export function getScaleFilter(format: ClipFormat): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`
  );
}

/**
 * Builds a complete comma-joined linear filter chain for FFmpeg -vf.
 * Order: scale -> ASS subtitles -> CTA overlay -> watermark.
 */
export function buildFilterChain(
  format: ClipFormat,
  assFilePath: string | null,
  cta: CTA | null,
  watermark: boolean,
  clipDuration: number,
): string {
  const filters: string[] = [];
  const { width, height } = FORMAT_DIMENSIONS[format];

  // 1. Scale + pad
  filters.push(getScaleFilter(format));

  // 2. ASS subtitles (burn-in via ass filter)
  if (assFilePath !== null) {
    const escapedPath = escapeFFmpegPath(assFilePath);
    filters.push(`ass='${escapedPath}'`);
  }

  // 3. CTA overlay (only for position='overlay'; 'end' is handled via concat post-render)
  if (cta !== null && cta.position === 'overlay') {
    filters.push(buildCtaOverlayFilter(cta, clipDuration, width, height));
  }

  // 4. Watermark
  if (watermark) {
    filters.push(buildWatermarkDrawtext(width, height));
  }

  return filters.join(',');
}

// ---------------------------------------------------------------------------
// CTA Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a drawtext filter for CTA text overlaid during the last N seconds of the clip.
 * Font size is ~3.5% of width, white text with box background, centered horizontally,
 * positioned at 85% of frame height.
 */
export function buildCtaOverlayFilter(
  cta: CTA,
  clipDuration: number,
  width: number,
  height: number,
): string {
  const escapedText = escapeDrawtext(cta.text);

  const fontSize = Math.round(width * 0.035);
  const fontColor = 'white';
  const borderWidth = 2;
  const borderColor = 'black';
  const shadowColor = 'black@0.6';
  const boxColor = 'black@0.5';
  const boxBorderW = 16;

  const xPos = '(w-text_w)/2';
  const yPos = Math.round(height * 0.85);

  const enableStart = clipDuration - cta.duration;
  const enableExpr = `enable='between(t,${enableStart},${clipDuration})'`;

  return (
    `drawtext=text='${escapedText}':font=Montserrat:fontsize=${fontSize}:fontcolor=${fontColor}:` +
    `borderw=${borderWidth}:bordercolor=${borderColor}:` +
    `shadowcolor=${shadowColor}:shadowx=2:shadowy=2:` +
    `box=1:boxcolor=${boxColor}:boxborderw=${boxBorderW}:` +
    `x=${xPos}:y=${yPos}:${enableExpr}`
  );
}

/**
 * Generates a short MP4 video (black background + centered CTA text)
 * for concatenation as an end card. Uses lavfi color + anullsrc sources.
 * Codec settings match renderClip (libx264/aac) so concat demuxer can stream-copy.
 */
export async function generateCtaEndCard(
  cta: CTA,
  width: number,
  height: number,
  outputPath: string,
): Promise<void> {
  const escapedText = escapeDrawtext(cta.text);
  const fontSize = Math.round(width * 0.045);
  const fontColor = 'white';
  const boxColor = 'black@0.5';
  const boxBorderW = 20;

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=${width}x${height}:d=${cta.duration}:r=30`,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(cta.duration),
    '-vf',
    `drawtext=text='${escapedText}':font=Montserrat:fontsize=${fontSize}:fontcolor=${fontColor}:` +
    `box=1:boxcolor=${boxColor}:boxborderw=${boxBorderW}:` +
    `x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-profile:v', 'high', '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ];

  await execFFmpeg(args, 30_000);
}

/**
 * Concatenates the main clip and CTA end card using FFmpeg concat demuxer.
 * Uses stream copy (-c copy) for near-instant, lossless concatenation.
 * Writes a temporary concat list file, runs concat, then cleans up.
 */
export async function concatClipAndCta(
  clipPath: string,
  ctaPath: string,
  outputPath: string,
): Promise<void> {
  const concatListPath = clipPath.replace('.mp4', '-concat.txt');
  const concatContent = `file '${clipPath}'\nfile '${ctaPath}'\n`;
  await writeFile(concatListPath, concatContent, 'utf-8');

  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ];

  try {
    await execFFmpeg(args, 30_000);
  } finally {
    await unlink(concatListPath).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

/**
 * Builds a drawtext filter for the "КлипМейкер.ру" watermark.
 * Semi-transparent white text (0.4 opacity) at bottom-right with subtle shadow.
 * Font size is ~2.2% of video width.
 */
export function buildWatermarkDrawtext(width: number, height: number): string {
  const text = 'КлипМейкер.ру';
  const escapedText = escapeDrawtext(text);

  const fontSize = Math.round(width * 0.022);
  const fontColor = 'white@0.4';
  const shadowColor = 'black@0.3';

  const xPadding = Math.round(width * 0.02);
  const yPadding = Math.round(height * 0.02);
  const xPos = `w-text_w-${xPadding}`;
  const yPos = `h-text_h-${yPadding}`;

  return (
    `drawtext=text='${escapedText}':font=Montserrat:fontsize=${fontSize}:fontcolor=${fontColor}:` +
    `shadowcolor=${shadowColor}:shadowx=1:shadowy=1:` +
    `x=${xPos}:y=${yPos}`
  );
}

// ---------------------------------------------------------------------------
// ASS Subtitle Generation
// ---------------------------------------------------------------------------

/**
 * Converts seconds to ASS timecode format: H:MM:SS.CC (centiseconds).
 */
export function formatASSTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  let cs = Math.round((seconds % 1) * 100);
  if (cs >= 100) cs = 99; // Clamp rounding overflow
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Inserts ASS line breaks (\\N) at word boundaries for mobile readability.
 * maxCharsPerLine: 35 for portrait, 50 for square/landscape.
 */
export function wrapSubtitleText(text: string, maxChars: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine.length > 0 ? currentLine + ' ' + word : word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\\N');
}

/**
 * Generates a complete ASS subtitle file content with:
 * - Script Info with PlayResX/PlayResY from FORMAT_DIMENSIONS
 * - Montserrat Bold font, white text, black outline (3px)
 * - Bottom-center alignment (2), MarginV 60
 * - Dialogue events from segments, clamped to clipDuration
 */
export function generateSubtitleFile(
  segments: SubtitleSegment[],
  clipDuration: number,
  format: ClipFormat,
): string {
  const { width, height } = FORMAT_DIMENSIONS[format];
  const fontSize = format === 'portrait' ? 48 : 36;
  const maxCharsPerLine = format === 'portrait' ? 35 : 50;

  // ASS Header
  const header =
`[Script Info]
Title: КлипМейкер Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1.5,2,30,30,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  // Dialogue events
  const events: string[] = [];
  for (const segment of segments) {
    const start = Math.max(0, segment.start);
    const end = Math.min(clipDuration, segment.end);

    if (end <= start) continue; // Skip zero/negative-duration segments

    const startTimecode = formatASSTimecode(start);
    const endTimecode = formatASSTimecode(end);

    // Word wrap first (operates on raw text lengths), then sanitize
    let cleanText = wrapSubtitleText(segment.text, maxCharsPerLine);

    // Convert remaining literal newlines to ASS line breaks
    cleanText = cleanText.replace(/\r?\n/g, '\\N');

    // Escape ASS override block characters
    cleanText = escapeAssText(cleanText);

    events.push(`Dialogue: 0,${startTimecode},${endTimecode},Default,,0,0,0,,${cleanText}`);
  }

  return header + '\n' + events.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Thumbnail Generation
// ---------------------------------------------------------------------------

/**
 * Extracts a single frame from the video at the given time offset.
 * Scales to 360px wide (maintaining aspect ratio), JPEG quality 3.
 * 15-second timeout.
 */
export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timeOffset: number,
): Promise<void> {
  const args = [
    '-y',
    '-ss', String(timeOffset),
    '-i', videoPath,
    '-vframes', '1',
    '-vf', 'scale=360:-1',
    '-q:v', '3',
    outputPath,
  ];

  await execFFmpeg(args, 15_000);
}

// ---------------------------------------------------------------------------
// Core FFmpeg Execution
// ---------------------------------------------------------------------------

/**
 * Executes FFmpeg with the given arguments using execFile (not shell).
 * Suitable for short operations (thumbnail, CTA card, concat).
 */
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

/**
 * Gets the duration of a media file via ffprobe.
 */
export async function ffprobeGetDuration(filePath: string): Promise<number> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', filePath],
      { timeout: 10_000 },
    );
    stdout = result.stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`ffprobe failed: ${e.stderr || e.message}`);
  }
  const parsed = JSON.parse(stdout);
  const duration = parseFloat(parsed.format?.duration);
  if (isNaN(duration) || duration <= 0) {
    throw new Error('Could not determine video duration');
  }
  return duration;
}

/**
 * Extracts audio from a video file as 16kHz mono PCM WAV.
 * Timeout scales with file duration.
 */
export async function extractAudio(
  inputPath: string,
  outputPath: string,
  maxDurationSeconds?: number,
): Promise<void> {
  const args = ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le'];
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

/**
 * Renders a video clip using spawn (not exec) for long-running operations.
 * Supports an optional filterChain that replaces the default scale-only filter.
 * Uses bounded stderr buffer and configurable timeout.
 */
export function renderClip(options: RenderOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const vf = options.filterChain ?? getScaleFilter(options.format);

    const duration = options.endTime - options.startTime;
    const args: string[] = [
      '-y',
      '-ss', String(options.startTime),
      '-t', String(duration),
      '-i', options.inputPath,
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-profile:v', 'high',
      '-level', '4.1',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
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
