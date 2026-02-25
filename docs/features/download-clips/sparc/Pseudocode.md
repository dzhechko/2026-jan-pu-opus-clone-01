# Download Clips — Pseudocode

## 1. Single Download — Client Handler

```typescript
// In ClipCard or ActionBar
function handleDownload(clipId: string) {
  // 1. Show loading state on button
  setDownloading(true);

  // 2. Call existing tRPC mutation
  const { downloadUrl } = await trpc.clip.download.mutate({ id: clipId });

  // 3. Trigger browser download via hidden anchor
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = ''; // Let server Content-Disposition set filename
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // 4. Reset state
  setDownloading(false);
}
```

## 2. ClipCard — Download Button Addition

```tsx
// apps/web/components/clips/clip-card.tsx
// Add to existing ClipCard component

type ClipCardProps = {
  clip: ClipWithPublications;
  userPlan: 'free' | 'start' | 'pro';  // NEW: for watermark badge
};

// In JSX, add to card footer:
{clip.status === 'ready' && (
  <button
    onClick={(e) => {
      e.stopPropagation(); // Don't navigate to editor
      handleDownload(clip.id);
    }}
    disabled={downloading}
    className="download-button"
  >
    {downloading ? 'Скачивание...' : 'Скачать'}
  </button>
)}

// Watermark badge (free tier only):
{userPlan === 'free' && (
  <span className="watermark-badge">Водяной знак</span>
)}
```

## 3. ActionBar — Download Button Addition

```tsx
// apps/web/components/clip-editor/action-bar.tsx
// Add new prop and button

type ActionBarProps = {
  // ... existing props
  clipStatus: ClipStatus;   // NEW
  onDownload: () => void;   // NEW
  isDownloading: boolean;   // NEW
};

// In JSX, add before Preview button:
{clipStatus === 'ready' && (
  <button
    onClick={onDownload}
    disabled={isDownloading}
    className="download-button"
  >
    {isDownloading ? 'Скачивание...' : 'Скачать MP4'}
  </button>
)}
```

## 4. Batch Download — API Route

```typescript
// apps/web/app/api/videos/[videoId]/download-all/route.ts
import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { prisma } from '@clipmaker/db';
import { getObjectStream } from '@clipmaker/s3';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  const userId = request.headers.get('x-user-id');
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  // Rate limit: 5 batch downloads per 60s
  await checkRateLimit('clip:download-all', userId, 5, 60);

  // Verify video ownership
  const video = await prisma.video.findFirst({
    where: { id: videoId, userId },
    select: { title: true },
  });
  if (!video) return new NextResponse('Not Found', { status: 404 });

  // Get all ready clips with file paths
  const clips = await prisma.clip.findMany({
    where: { videoId, userId, status: 'ready', filePath: { not: null } },
    select: { id: true, title: true, filePath: true },
    take: 50,
  });

  if (clips.length === 0) {
    return new NextResponse('No ready clips', { status: 404 });
  }

  // Create ZIP stream
  const archive = archiver('zip', { zlib: { level: 1 } }); // Fast compression
  const sanitizedTitle = sanitizeFilename(video.title);

  // Stream ZIP to response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Pipe archive to writer
  archive.on('data', (chunk) => writer.write(chunk));
  archive.on('end', () => writer.close());
  archive.on('error', () => writer.abort());

  // Add each clip to archive
  for (const clip of clips) {
    const stream = await getObjectStream(clip.filePath!);
    const filename = `${sanitizeFilename(clip.title)}.mp4`;
    archive.append(stream, { name: filename });
  }

  archive.finalize();

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${sanitizedTitle}-clips.zip"`,
    },
  });
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}
```

## 5. Download All — Client Handler

```tsx
// In VideoDetailPage or ClipList header

function handleDownloadAll(videoId: string) {
  setDownloadingAll(true);

  // Use fetch to trigger API route (streaming response)
  const response = await fetch(`/api/videos/${videoId}/download-all`);

  if (!response.ok) {
    showError('Ошибка скачивания');
    setDownloadingAll(false);
    return;
  }

  // Convert stream to blob and trigger download
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'clips.zip';
  anchor.click();
  URL.revokeObjectURL(url);

  setDownloadingAll(false);
}
```

## 6. Watermark Detection (Client-Side)

```typescript
// Derive from user session, no new API needed
function useUserPlan(): 'free' | 'start' | 'pro' {
  // Read from x-user-plan header (set by auth middleware)
  // or from session/store
  // Free plan → watermark badge shown
}
```

## 7. Data Flow Summary

```
Single Download:
  ClipCard/ActionBar → trpc.clip.download → presigned URL → browser download

Batch Download:
  "Скачать все" button → fetch /api/videos/[id]/download-all
    → Server: query ready clips → stream S3 objects → archiver ZIP → response
    → Client: blob → object URL → anchor click → browser download

Watermark Badge:
  User plan (from session/headers) → ClipCard badge display
```
