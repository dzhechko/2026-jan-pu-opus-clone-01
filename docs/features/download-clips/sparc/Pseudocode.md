# Download Clips — Pseudocode

## 1. useClipDownload — Reusable Download Hook

```typescript
// apps/web/lib/hooks/use-clip-download.ts
import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';

export function useClipDownload() {
  const [downloading, setDownloading] = useState<string | null>(null); // clipId
  const [error, setError] = useState<string | null>(null);

  const downloadMutation = trpc.clip.download.useMutation({
    onError: (err) => {
      setError(err.message || 'Ошибка скачивания. Попробуйте ещё раз');
      setDownloading(null);
    },
  });

  const download = useCallback(async (clipId: string, clipTitle?: string) => {
    try {
      setDownloading(clipId);
      setError(null);

      const { downloadUrl } = await downloadMutation.mutateAsync({ id: clipId });

      // Trigger browser download via hidden anchor
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = clipTitle ? `${clipTitle}.mp4` : '';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch {
      // Error already handled by onError
    } finally {
      setDownloading(null);
    }
  }, [downloadMutation]);

  const clearError = useCallback(() => setError(null), []);

  return { download, downloading, error, clearError };
}
```

## 2. ClipCard — Download Button + Watermark Badge

```tsx
// apps/web/components/clips/clip-card.tsx
// Additions to existing component

type ClipCardProps = {
  clip: ClipWithPublications;
  userPlan: 'free' | 'start' | 'pro';  // NEW: from server page
};

// Use the hook:
const { download, downloading, error, clearError } = useClipDownload();

// In JSX card footer — download button:
{clip.status === 'ready' ? (
  <button
    onClick={(e) => {
      e.stopPropagation(); // Don't navigate to editor
      download(clip.id, clip.title);
    }}
    disabled={downloading === clip.id}
    aria-label={`Скачать клип: ${clip.title}`}
    title={userPlan === 'free' ? 'Скачать с водяным знаком' : 'Скачать MP4'}
    className="download-button"
  >
    {downloading === clip.id ? 'Скачивание...' : 'Скачать'}
  </button>
) : (
  <button disabled title="Клип ещё не готов" className="download-button-disabled">
    Скачать
  </button>
)}

// Watermark badge (free tier only):
{userPlan === 'free' && (
  <Link
    href="/dashboard/billing"
    className="watermark-badge"
    title="Уберите водяной знак на тарифе Start (990₽/мес)"
    onClick={(e) => e.stopPropagation()}
  >
    Водяной знак
  </Link>
)}

// Error notification:
{error && (
  <div className="error-toast" role="alert">
    {error}
    <button onClick={clearError}>✕</button>
  </div>
)}
```

## 3. ActionBar — Download Button Addition

```tsx
// apps/web/components/clip-editor/action-bar.tsx
// Add new props and button

type ActionBarProps = {
  // ... existing props (isDirty, isSaving, isRendering, isFailed, onSave, onPreview, onReset)
  clipStatus: ClipStatus;   // NEW
  onDownload: () => void;   // NEW
  isDownloading: boolean;   // NEW
};

// In JSX, add as first button in the button row:
{clipStatus === 'ready' && (
  <button
    onClick={onDownload}
    disabled={isDownloading}
    aria-label="Скачать MP4"
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

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(videoId)) {
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

  // Deduplicate filenames
  const usedNames = new Set<string>();
  function uniqueFilename(title: string): string {
    let base = sanitizeFilename(title);
    let name = `${base}.mp4`;
    let i = 2;
    while (usedNames.has(name)) {
      name = `${base}_${i}.mp4`;
      i++;
    }
    usedNames.add(name);
    return name;
  }

  // Create ZIP stream
  const archive = archiver('zip', { zlib: { level: 1 } }); // Fast — video already compressed
  const sanitizedTitle = sanitizeFilename(video.title);

  // Stream ZIP to response via TransformStream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Pipe archive output to writer (async, don't await)
  (async () => {
    try {
      archive.on('data', (chunk: Buffer) => writer.write(chunk));
      archive.on('end', () => writer.close());
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        writer.abort(err);
      });

      // Add each clip to archive
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
      'Content-Disposition': `attachment; filename="${sanitizedTitle}-clips.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'clip';
}
```

## 5. Download All — Client Handler

```tsx
// In ClipList header or VideoDetailPage

function useDownloadAll() {
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadAll = useCallback(async (videoId: string) => {
    setDownloadingAll(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/download-all`);

      if (response.status === 429) {
        setError('Слишком много запросов. Подождите минуту.');
        return;
      }

      if (response.status === 404) {
        setError('Нет готовых клипов для скачивания');
        return;
      }

      if (!response.ok) {
        setError('Ошибка создания архива. Попробуйте ещё раз');
        return;
      }

      // Convert stream to blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'clips.zip';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setError('Ошибка создания архива. Попробуйте ещё раз');
    } finally {
      setDownloadingAll(false);
    }
  }, []);

  return { downloadAll, downloadingAll, error };
}

// In ClipList JSX header:
const readyCount = clips.filter(c => c.status === 'ready').length;
const totalCount = clips.length;

<div className="clip-list-header">
  <h3>Клипы ({totalCount})</h3>
  <button
    onClick={() => downloadAll(videoId)}
    disabled={downloadingAll || readyCount === 0}
    title={readyCount === 0 ? 'Нет готовых клипов для скачивания' : `Скачать ${readyCount} клипов`}
  >
    {downloadingAll ? 'Подготовка архива...' : `Скачать все (${readyCount})`}
  </button>
  {readyCount < totalCount && readyCount > 0 && (
    <span className="text-muted">
      {totalCount - readyCount} клипов ещё рендерятся
    </span>
  )}
</div>
```

## 6. ClipEditor — Wire Download to ActionBar

```tsx
// apps/web/app/.../edit/clip-editor.tsx
// Add download handler using the hook

const { download, downloading } = useClipDownload();

const handleDownload = useCallback(() => {
  const state = useStore.getState();
  download(state.clip.id, state.clip.title);
}, [download, useStore]);

// Pass to ActionBar:
<ActionBar
  // ... existing props
  clipStatus={clip.status}
  onDownload={handleDownload}
  isDownloading={downloading === clip.id}
/>
```

## 7. Data Flow Summary

```
Single Download:
  ClipCard/ActionBar
    → useClipDownload hook
    → trpc.clip.download.mutateAsync({ id })
    → Server: ownership check + status check → generateDownloadUrl(filePath)
    → Returns { downloadUrl } (presigned, 1hr expiry)
    → Client: anchor.click() → browser downloads MP4
    → Error path: onError → setError → toast notification

Batch Download:
  "Скачать все" button
    → useDownloadAll hook
    → fetch GET /api/videos/[videoId]/download-all
    → Server: auth check → rate limit → ownership → query ready clips
    → For each clip: getObjectStream(filePath) → archive.append()
    → archive.finalize() → stream to response
    → Client: response.blob() → URL.createObjectURL → anchor.click()
    → Error paths: 429 (rate limit), 404 (no clips), 5xx (server error)

Watermark Badge:
  Server page passes userPlan prop (from x-user-plan header)
    → ClipCard: if plan === 'free' → show badge with Link to /dashboard/billing
```
