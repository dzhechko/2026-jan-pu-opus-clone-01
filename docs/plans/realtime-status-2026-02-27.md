# Plan: Real-time Video Status + Upload Redirect

**Date:** 2026-02-27
**Status:** draft
**Complexity:** medium

## Context

Два бага UX:
1. Страница видео — Server Component, фетчит статус один раз. Пока видео обрабатывается (transcribing → analyzing → completed), статус не обновляется без ручного рефреша.
2. После загрузки видео пользователь остаётся на /dashboard/upload вместо redirect на страницу видео.

## Changes (3 files)

### 1. `apps/web/app/(dashboard)/dashboard/videos/[videoId]/page.tsx` — клиентский polling
- Вынести основной контент в клиентский компонент `VideoDetail`
- Использовать `trpc.video.get.useQuery` с `refetchInterval` пока статус не terminal
- Terminal статусы: `completed`, `failed` — остановить polling
- Передавать свежие данные в TranscriptViewer, ClipList, VideoHeader

### 2. `apps/web/components/video/video-detail.tsx` — новый клиентский компонент
- Принимает videoId, userPlan
- `trpc.video.get.useQuery({ id: videoId }, { refetchInterval: ... })`
- refetchInterval: 3000ms пока статус не terminal, потом false
- Рендерит VideoHeader, TranscriptViewer, ClipList с актуальными данными
- Генерирует thumbnailUrl/videoUrl для клипов (proxy или presigned)

### 3. `apps/web/components/upload/video-uploader.tsx` — redirect после загрузки
- Добавить `useRouter` из next/navigation
- После confirmUpload → `router.push(/dashboard/videos/${videoId})`
- После createFromUrl onSuccess → аналогичный redirect
- Убрать состояние 'done' — пользователь сразу попадает на страницу видео

## Files WITHOUT changes
- `transcript-viewer.tsx` — уже получает videoStatus как prop, будет обновляться автоматически
- `clip-list.tsx` — аналогично, получает clips как prop

## Verification
1. Загрузить видео → автоматический redirect на /dashboard/videos/[id]
2. Статус меняется в реальном времени: transcribing → analyzing → completed
3. Клипы появляются по мере рендеринга
4. Polling останавливается после completed/failed
