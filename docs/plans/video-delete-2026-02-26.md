# Plan: Video Delete from UI

**Date:** 2026-02-26
**Status:** implemented
**Complexity:** low

## Context

Пользователю нужна возможность удалять видео, которые не нужны или зависли. Сейчас в UI нет ни одной кнопки "Удалить" — ни в списке, ни на странице видео. При этом `deleteObject` для S3 уже реализован, а Prisma cascade удалит связанные записи (Transcript, Clip, Publication).

## Changes (3 files)

### 1. `apps/web/lib/trpc/routers/video.ts` — tRPC mutation `video.delete`
- Добавить `delete` protectedProcedure
- Input: `{ id: z.string().uuid() }`
- Проверить ownership (userId)
- Собрать S3-ключи: video.filePath + все clip.filePath + clip.thumbnailPath
- Удалить файлы из S3 (loop deleteObject, ignore errors)
- Удалить видео из БД (cascade удалит transcript, clips, publications)
- Return `{ deleted: true }`

### 2. `apps/web/app/(dashboard)/dashboard/videos/[videoId]/page.tsx` — кнопка удаления
- Вынести header в клиентский компонент `VideoHeader`
- Кнопка "Удалить" (красная, справа от заголовка)
- Confirmation dialog: "Удалить видео и все клипы?"
- После удаления: redirect на /dashboard

### 3. Новый файл `apps/web/components/video/video-header.tsx` — клиентский компонент
- Принимает videoId, title, status, durationSeconds, sttModel
- Рендерит заголовок + кнопку "Удалить"
- useState для confirm dialog (inline, без модалки)
- trpc.video.delete.useMutation → onSuccess → router.push('/dashboard')

## Files WITHOUT changes
- `packages/s3/src/operations.ts` — deleteObject уже есть
- `packages/db/prisma/schema.prisma` — cascade уже настроен
- `apps/web/components/clips/clip-list.tsx` — не нужен, каскад

## Verification
1. Открыть страницу видео → кнопка "Удалить" видна
2. Клик → появляется подтверждение "Удалить видео?"
3. Подтвердить → видео удалено, redirect на /dashboard
4. S3: файлы удалены (source + clips + thumbnails)
