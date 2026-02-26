import { Worker } from 'bullmq';
import { createWriteStream } from 'fs';
import { open, readFile, stat, mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import type { VideoDownloadJobData } from '@clipmaker/types';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@clipmaker/queue';
import { createQueue, getRedisConnection } from '@clipmaker/queue/src/queues';
import { videoSourcePath, validateMagicBytes, putObject } from '@clipmaker/s3';
import { prisma } from '@clipmaker/db';
import { createLogger } from '../lib/logger';
import { safeFetch } from '../lib/ssrf-validator';

const logger = createLogger('worker-download');

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
  'video/x-matroska',
  'application/octet-stream', // Many servers serve video as octet-stream
]);

const CONTENT_TYPE_EXT_MAP: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mp4',
  'video/x-matroska': 'mp4',
  'application/octet-stream': 'mp4',
};

const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];

/**
 * Guesses the file extension from content-type header and URL path.
 * Falls back to 'mp4' when detection is ambiguous.
 */
function guessExtension(contentType: string | null, url: string): string {
  // Try content-type first
  if (contentType) {
    const baseType = contentType.split(';')[0]?.trim().toLowerCase();
    if (baseType && baseType in CONTENT_TYPE_EXT_MAP) {
      return CONTENT_TYPE_EXT_MAP[baseType]!;
    }
  }

  // Try URL path extension
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const lastSegment = pathname.split('/').pop() ?? '';
    const parts = lastSegment.split('.');
    if (parts.length >= 2) {
      const ext = (parts.pop() ?? '').toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        return ext;
      }
    }
  } catch {
    // Invalid URL, use default
  }

  return 'mp4';
}

/**
 * Uploads a file from disk to S3 using putObject.
 * Reads the file into memory. For the download worker's use case
 * (max 4GB, worker concurrency 2), this is acceptable.
 */
async function uploadFileToS3(
  localPath: string,
  s3Key: string,
  contentType: string,
): Promise<void> {
  const fileBuffer = await readFile(localPath);
  await putObject(s3Key, fileBuffer, contentType);
}

const worker = new Worker<VideoDownloadJobData>(
  QUEUE_NAMES.VIDEO_DOWNLOAD,
  async (job) => {
    const { videoId, url, userId, strategy } = job.data;
    let tmpDir: string | undefined;

    logger.info({ event: 'download_start', videoId, url: url.slice(0, 200) });

    try {
      // 1. Validate video exists and is in correct state
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.status !== 'downloading') {
        throw new Error(`Invalid video state: ${video?.status ?? 'not found'}`);
      }

      const user = await prisma.user.findUnique({ where: { id: video.userId } });
      if (!user) throw new Error('User not found');

      // 2. Fetch with SSRF protection (validates URL, resolves DNS, checks IPs)
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS);

      let response: Response;
      try {
        response = await safeFetch(url, abortController.signal);
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }

      if (!response.ok) {
        clearTimeout(timeout);
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      // 3. Validate Content-Type
      const contentType = response.headers.get('content-type');
      const baseContentType = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (contentType && !ALLOWED_CONTENT_TYPES.has(baseContentType)) {
        clearTimeout(timeout);
        throw new Error(`Invalid content type: ${baseContentType}`);
      }

      // 4. Check Content-Length if available
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > MAX_FILE_SIZE) {
          clearTimeout(timeout);
          throw new Error(`File too large: ${contentLength} bytes (max ${MAX_FILE_SIZE})`);
        }
      }

      // 5. Stream response body to temp file
      if (!response.body) {
        clearTimeout(timeout);
        throw new Error('Response body is empty');
      }

      const ext = guessExtension(contentType, url);
      tmpDir = await mkdtemp(path.join(os.tmpdir(), 'download-'));
      const tmpPath = path.join(tmpDir, `source.${ext}`);

      let bytesReceived = 0;
      const writeStream = createWriteStream(tmpPath);

      try {
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          bytesReceived += value.byteLength;
          if (bytesReceived > MAX_FILE_SIZE) {
            reader.cancel();
            writeStream.destroy();
            throw new Error(`Download exceeded ${MAX_FILE_SIZE} byte limit at ${bytesReceived} bytes`);
          }

          // Write chunk, handle backpressure
          const canContinue = writeStream.write(value);
          if (!canContinue) {
            await new Promise<void>((resolve) => writeStream.once('drain', resolve));
          }
        }

        // Finalize write stream
        await new Promise<void>((resolve, reject) => {
          writeStream.end(() => resolve());
          writeStream.once('error', reject);
        });
      } finally {
        clearTimeout(timeout);
      }

      logger.info({ event: 'download_received', videoId, bytesReceived });

      // 6. Validate magic bytes (first 16 bytes)
      const fh = await open(tmpPath, 'r');
      let first16: Uint8Array;
      try {
        const buf = Buffer.alloc(16);
        await fh.read(buf, 0, 16, 0);
        first16 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } finally {
        await fh.close();
      }

      const magicCheck = validateMagicBytes(first16);
      if (!magicCheck.valid) {
        throw new Error('Invalid video format (magic bytes check failed)');
      }

      logger.info({ event: 'download_validated', videoId, format: magicCheck.format });

      // 7. Get actual file size
      const fileStat = await stat(tmpPath);
      const fileSize = fileStat.size;

      // 8. Upload to S3
      const s3Key = videoSourcePath(userId, videoId, ext);
      logger.info({ event: 'download_s3_upload_start', videoId, s3Key, fileSize });

      await uploadFileToS3(tmpPath, s3Key, `video/${ext}`);

      logger.info({ event: 'download_s3_upload_complete', videoId, s3Key });

      // 9. Update DB record
      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'transcribing',
          filePath: s3Key,
          fileSize: BigInt(fileSize),
        },
      });

      // 10. Enqueue STT job (same as confirmUpload flow)
      const sttQueue = createQueue(QUEUE_NAMES.STT);
      await sttQueue.add('stt', {
        videoId,
        filePath: s3Key,
        strategy,
        language: 'ru',
      }, DEFAULT_JOB_OPTIONS);

      logger.info({
        event: 'download_complete',
        videoId,
        fileSize,
        s3Key,
        format: magicCheck.format,
      });
    } catch (error) {
      logger.error({
        event: 'download_error',
        videoId,
        error: error instanceof Error ? error.message : error,
      });
      throw error; // Let BullMQ retry
    } finally {
      // Always clean up temp files
      if (tmpDir) {
        try {
          await rm(tmpDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          logger.warn({ event: 'download_cleanup_failed', tmpDir, error: cleanupErr });
        }
      }
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker.on('failed', async (job, err) => {
  const videoId = job?.data?.videoId;
  logger.error({ event: 'download_job_failed', jobId: job?.id, error: err.message });

  // Mark video as failed only after all retries exhausted
  if (job && videoId && job.attemptsMade === job.opts?.attempts) {
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { status: 'failed' },
      });
      logger.info({ event: 'download_video_marked_failed', videoId });
    } catch (updateErr) {
      logger.warn({ event: 'download_status_update_failed', videoId, error: updateErr });
    }
  }
});

export default worker;
