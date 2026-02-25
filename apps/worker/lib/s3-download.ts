import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { getObjectStream } from '@clipmaker/s3';
import { createLogger } from './logger';

const logger = createLogger('s3-download');

export async function downloadFromS3(s3Key: string, localPath: string): Promise<void> {
  logger.info({ event: 's3_download_start', key: s3Key });
  const readable = await getObjectStream(s3Key);
  const writable = createWriteStream(localPath);
  await pipeline(readable, writable);
  logger.info({ event: 's3_download_complete', key: s3Key, path: localPath });
}
