import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { prisma } from '@clipmaker/db';
import { getObjectStream } from '@clipmaker/s3';
import { checkRateLimit } from '@/lib/auth/rate-limit';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilename(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex -- intentional: strip control chars for security
      .replace(/[<>:"/\\|?*;\x00-\x1F]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100) || 'clip'
  );
}

function rfc5987Encode(value: string): string {
  return (
    "UTF-8''" +
    [...value]
      .map((ch) => {
        const code = ch.codePointAt(0)!;
        // RFC 5987 attr-char: ALPHA / DIGIT / safe subset
        if (
          (code >= 0x30 && code <= 0x39) || // 0-9
          (code >= 0x41 && code <= 0x5a) || // A-Z
          (code >= 0x61 && code <= 0x7a) || // a-z
          '-._~!$&+'.includes(ch)
        ) {
          return ch;
        }
        return [...new TextEncoder().encode(ch)]
          .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
          .join('');
      })
      .join('')
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await params;
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!UUID_REGEX.test(videoId)) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // Rate limit: 5 batch downloads per 60s
  try {
    await checkRateLimit('clip:download-all', userId, 5, 60);
  } catch {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  // Verify video ownership
  const video = await prisma.video.findFirst({
    where: { id: videoId, userId },
    select: { title: true },
  });

  if (!video) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Get all ready clips with file paths
  const clips = await prisma.clip.findMany({
    where: { videoId, userId, status: 'ready', filePath: { not: null } },
    select: { id: true, title: true, filePath: true },
    take: 50,
  });

  if (clips.length === 0) {
    return new NextResponse('No ready clips', { status: 404 });
  }

  // Deduplicate filenames
  const usedNames = new Set<string>();
  function uniqueFilename(title: string): string {
    const base = sanitizeFilename(title);
    let name = `${base}.mp4`;
    let i = 2;
    while (usedNames.has(name)) {
      name = `${base}_${i}.mp4`;
      i++;
    }
    usedNames.add(name);
    return name;
  }

  // Create ZIP stream — level 1 (fast, video is already compressed)
  const archive = archiver('zip', { zlib: { level: 1 } });
  const sanitizedTitle = sanitizeFilename(video.title);
  const zipFilename = `${sanitizedTitle}-clips.zip`;

  // Stream ZIP to response via TransformStream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Pipe archive output to writer (fire and forget — runs in background)
  void (async () => {
    try {
      archive.on('data', async (chunk: Buffer) => {
        await writer.ready;
        await writer.write(chunk);
      });
      archive.on('end', () => writer.close());
      archive.on('warning', (err) => {
        console.warn('Archive warning:', err);
      });
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        writer.abort(err);
      });

      for (const clip of clips) {
        try {
          const stream = await getObjectStream(clip.filePath!);
          const filename = uniqueFilename(clip.title);
          archive.append(stream, { name: filename });
        } catch (err) {
          console.error(`Failed to stream clip ${clip.id}:`, err);
          // Skip failed clip, continue with rest
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error('ZIP generation failed:', err);
      writer.abort(err as Error);
    }
  })();

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"; filename*=${rfc5987Encode(zipFilename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
