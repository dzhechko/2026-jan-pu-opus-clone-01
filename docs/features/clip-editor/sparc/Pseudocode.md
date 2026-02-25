# Clip Editor — Pseudocode

## Overview

This document provides implementation-ready pseudocode for all components, state management, and backend mutations that compose the Clip Editor feature.

---

## 1. Clip Editor Page (Server Component)

**Route:** `/dashboard/videos/[videoId]/clips/[clipId]/edit`

**File:** `apps/web/app/(dashboard)/dashboard/videos/[videoId]/clips/[clipId]/edit/page.tsx`

```typescript
// Server Component — fetches data, delegates to client component
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { prisma } from '@clipmaker/db'
import { ClipEditor } from './clip-editor'

type PageProps = {
  params: Promise<{ videoId: string; clipId: string }>
}

export default async function ClipEditorPage({ params }: PageProps) {
  const { videoId, clipId } = await params
  const headerStore = await headers()
  const userId = headerStore.get('x-user-id')

  if (!userId) {
    redirect('/login')
  }

  const clip = await prisma.clip.findFirst({
    where: {
      id: clipId,
      videoId: videoId,
      userId,
    },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          filePath: true,
          durationSeconds: true,
          status: true,
        },
      },
    },
  })

  if (!clip) {
    notFound()
  }

  // Generate presigned URL for video source playback
  const videoSourceUrl = await generatePresignedUrl(clip.video.filePath, 3600)

  // Generate presigned URL for rendered clip (if ready)
  const clipPreviewUrl = clip.filePath
    ? await generatePresignedUrl(clip.filePath, 3600)
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumbs */}
      <nav className="px-6 py-3 text-sm text-muted-foreground">
        <a href="/dashboard">Дашборд</a>
        <span className="mx-2">/</span>
        <a href={`/dashboard/videos/${videoId}`}>{clip.video.title}</a>
        <span className="mx-2">/</span>
        <span>Редактор клипа</span>
      </nav>

      {/* Client-side editor receives serialized data */}
      <ClipEditor
        clip={{
          id: clip.id,
          videoId: clip.videoId,
          title: clip.title,
          description: clip.description,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.duration,
          format: clip.format,
          subtitleSegments: clip.subtitleSegments,
          cta: clip.cta,
          viralityScore: clip.viralityScore,
          status: clip.status,
          thumbnailPath: clip.thumbnailPath,
        }}
        video={{
          id: clip.video.id,
          title: clip.video.title,
          durationSeconds: clip.video.durationSeconds,
        }}
        videoSourceUrl={videoSourceUrl}
        clipPreviewUrl={clipPreviewUrl}
      />
    </div>
  )
}
```

---

## 2. Loading, Error, and Not-Found Pages

**File:** `apps/web/app/(dashboard)/dashboard/videos/[videoId]/clips/[clipId]/edit/loading.tsx`

```typescript
export default function Loading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <div className="px-6 py-3">
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
      <div className="flex flex-1 gap-4 p-6">
        {/* Video preview skeleton */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="aspect-[9/16] max-h-[60vh] bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded" /> {/* Timeline */}
        </div>
        {/* Side panel skeleton */}
        <div className="w-80 flex flex-col gap-4">
          <div className="h-10 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    </div>
  )
}
```

**File:** `apps/web/app/(dashboard)/dashboard/videos/[videoId]/clips/[clipId]/edit/not-found.tsx`

```typescript
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-bold">Клип не найден</h1>
      <p className="text-muted-foreground">
        Клип не существует или у вас нет доступа.
      </p>
      <Link
        href="/dashboard"
        className="text-primary underline"
      >
        Вернуться в дашборд
      </Link>
    </div>
  )
}
```

**File:** `apps/web/app/(dashboard)/dashboard/videos/[videoId]/clips/[clipId]/edit/error.tsx`

```typescript
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-bold">Ошибка загрузки</h1>
      <p className="text-muted-foreground">
        Не удалось загрузить редактор клипа.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded"
      >
        Попробовать снова
      </button>
    </div>
  )
}
```

---

## 3. useClipEditorStore (Zustand Store)

**File:** `apps/web/lib/stores/clip-editor-store.ts`

```typescript
'use client'

import { create } from 'zustand'

// ── Types ──────────────────────────────────────────────────────

type SubtitleSegment = {
  start: number
  end: number
  text: string
  style?: {
    fontFamily?: string
    fontSize?: number
    fontColor?: string
    backgroundColor?: string
    bold?: boolean
    shadow?: boolean
  }
}

type Cta = {
  text: string
  position: 'end' | 'overlay'
  duration: number
} | null

type ClipFormat = 'portrait' | 'square' | 'landscape'

type ClipStatus = 'pending' | 'rendering' | 'ready' | 'published' | 'failed'

type ViralityScore = {
  total: number
  hook: number
  engagement: number
  flow: number
  trend: number
  tips: string[]
}

type ClipData = {
  id: string
  videoId: string
  title: string
  description: string | null
  startTime: number
  endTime: number
  duration: number
  format: ClipFormat
  subtitleSegments: SubtitleSegment[]
  cta: Cta
  viralityScore: ViralityScore
  status: ClipStatus
  thumbnailPath: string | null
}

// ── Store Shape ────────────────────────────────────────────────

type ClipEditorState = {
  // Data
  clip: ClipData
  originalClip: ClipData

  // Playback state
  currentTime: number
  isPlaying: boolean

  // Editor state
  isDirty: boolean
  isSaving: boolean
  activeSubtitleIndex: number | null

  // Actions — metadata
  setTitle: (title: string) => void
  setDescription: (description: string) => void

  // Actions — timeline
  setStartTime: (startTime: number) => void
  setEndTime: (endTime: number) => void

  // Actions — format
  setFormat: (format: ClipFormat) => void

  // Actions — subtitles
  updateSubtitleText: (index: number, text: string) => void
  setActiveSubtitleIndex: (index: number | null) => void

  // Actions — CTA
  setCta: (cta: Cta) => void

  // Actions — playback
  setCurrentTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void

  // Actions — persistence
  setIsSaving: (saving: boolean) => void
  markSaved: (updatedClip: ClipData) => void
  reset: () => void

  // Derived
  needsReRender: () => boolean
}

// ── Constants ──────────────────────────────────────────────────

const MIN_CLIP_DURATION = 5
const MAX_CLIP_DURATION = 180

// ── Store Factory ──────────────────────────────────────────────

export function createClipEditorStore(initialClip: ClipData) {
  return create<ClipEditorState>((set, get) => ({
    clip: { ...initialClip },
    originalClip: { ...initialClip },
    currentTime: initialClip.startTime,
    isPlaying: false,
    isDirty: false,
    isSaving: false,
    activeSubtitleIndex: null,

    // ── Metadata ─────────────────────────────────────────────

    setTitle: (title) =>
      set((state) => ({
        clip: { ...state.clip, title },
        isDirty: true,
      })),

    setDescription: (description) =>
      set((state) => ({
        clip: { ...state.clip, description },
        isDirty: true,
      })),

    // ── Timeline ─────────────────────────────────────────────

    setStartTime: (startTime) =>
      set((state) => {
        const { endTime } = state.clip
        // Enforce minimum duration
        if (endTime - startTime < MIN_CLIP_DURATION) return state
        // Enforce maximum duration
        if (endTime - startTime > MAX_CLIP_DURATION) return state
        // Enforce non-negative
        if (startTime < 0) return state

        return {
          clip: {
            ...state.clip,
            startTime,
            duration: endTime - startTime,
          },
          isDirty: true,
        }
      }),

    setEndTime: (endTime) =>
      set((state) => {
        const { startTime } = state.clip
        // Enforce minimum duration
        if (endTime - startTime < MIN_CLIP_DURATION) return state
        // Enforce maximum duration
        if (endTime - startTime > MAX_CLIP_DURATION) return state

        return {
          clip: {
            ...state.clip,
            endTime,
            duration: endTime - startTime,
          },
          isDirty: true,
        }
      }),

    // ── Format ───────────────────────────────────────────────

    setFormat: (format) =>
      set((state) => ({
        clip: { ...state.clip, format },
        isDirty: true,
      })),

    // ── Subtitles ────────────────────────────────────────────

    updateSubtitleText: (index, text) =>
      set((state) => {
        const segments = [...state.clip.subtitleSegments]
        if (index < 0 || index >= segments.length) return state

        segments[index] = { ...segments[index], text }

        return {
          clip: { ...state.clip, subtitleSegments: segments },
          isDirty: true,
        }
      }),

    setActiveSubtitleIndex: (index) =>
      set({ activeSubtitleIndex: index }),

    // ── CTA ──────────────────────────────────────────────────

    setCta: (cta) =>
      set((state) => ({
        clip: { ...state.clip, cta },
        isDirty: true,
      })),

    // ── Playback ─────────────────────────────────────────────

    setCurrentTime: (time) =>
      set({ currentTime: time }),

    setIsPlaying: (playing) =>
      set({ isPlaying: playing }),

    // ── Persistence ──────────────────────────────────────────

    setIsSaving: (saving) =>
      set({ isSaving: saving }),

    markSaved: (updatedClip) =>
      set({
        clip: { ...updatedClip },
        originalClip: { ...updatedClip },
        isDirty: false,
        isSaving: false,
      }),

    reset: () =>
      set((state) => ({
        clip: { ...state.originalClip },
        isDirty: false,
        activeSubtitleIndex: null,
      })),

    // ── Derived ──────────────────────────────────────────────

    needsReRender: () => {
      const { clip, originalClip } = get()
      return (
        clip.startTime !== originalClip.startTime ||
        clip.endTime !== originalClip.endTime ||
        clip.format !== originalClip.format ||
        JSON.stringify(clip.subtitleSegments) !==
          JSON.stringify(originalClip.subtitleSegments) ||
        JSON.stringify(clip.cta) !== JSON.stringify(originalClip.cta)
      )
    },
  }))
}

// Type for the store instance (used by components via context)
export type ClipEditorStore = ReturnType<typeof createClipEditorStore>
```

---

## 4. ClipEditor (Client Component — Main Orchestrator)

**File:** `apps/web/app/(dashboard)/dashboard/videos/[videoId]/clips/[clipId]/edit/clip-editor.tsx`

```typescript
'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { createClipEditorStore } from '@/lib/stores/clip-editor-store'
import { VideoPreview } from '@/components/clip-editor/video-preview'
import { Timeline } from '@/components/clip-editor/timeline'
import { SubtitleEditor } from '@/components/clip-editor/subtitle-editor'
import { MetadataPanel } from '@/components/clip-editor/metadata-panel'
import { ActionBar } from '@/components/clip-editor/action-bar'

type ClipEditorProps = {
  clip: ClipData       // Serialized clip from server
  video: {
    id: string
    title: string
    durationSeconds: number
  }
  videoSourceUrl: string
  clipPreviewUrl: string | null
}

export function ClipEditor({
  clip: initialClip,
  video,
  videoSourceUrl,
  clipPreviewUrl,
}: ClipEditorProps) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)

  // Create store once per mount with initial data
  const useStore = useMemo(
    () => createClipEditorStore(initialClip),
    [] // Only on mount — initialClip is from server, stable
  )

  // Subscribe to store values
  const clip = useStore((s) => s.clip)
  const isDirty = useStore((s) => s.isDirty)
  const isSaving = useStore((s) => s.isSaving)
  const isPlaying = useStore((s) => s.isPlaying)
  const currentTime = useStore((s) => s.currentTime)

  // ── tRPC mutation ────────────────────────────────────────

  const updateFullMutation = trpc.clip.updateFull.useMutation({
    onSuccess: (updatedClip) => {
      useStore.getState().markSaved(updatedClip)

      if (updatedClip.status === 'rendering') {
        toast.success('Клип сохранён. Рендеринг запущен.')
      } else {
        toast.success('Клип сохранён')
      }
    },
    onError: (error) => {
      useStore.getState().setIsSaving(false)
      toast.error('Ошибка сохранения. Попробуйте ещё раз.')
      console.error('Save failed:', error)
    },
  })

  // ── Polling for render status ────────────────────────────

  const clipQuery = trpc.clip.get.useQuery(
    { id: clip.id },
    {
      enabled: clip.status === 'rendering',
      refetchInterval: clip.status === 'rendering' ? 3000 : false,
      onSuccess: (data) => {
        if (data.status !== 'rendering') {
          // Rendering complete — refresh the page to get new presigned URLs
          router.refresh()
        }
      },
    }
  )

  // ── Save handler ─────────────────────────────────────────

  const handleSave = useCallback(() => {
    const state = useStore.getState()
    if (!state.isDirty || state.isSaving) return
    if (state.clip.status === 'rendering') return

    state.setIsSaving(true)

    // Build mutation input — only include changed fields
    const input: Record<string, unknown> = { id: state.clip.id }
    const orig = state.originalClip
    const curr = state.clip

    if (curr.title !== orig.title) {
      input.title = curr.title
    }
    if (curr.startTime !== orig.startTime) {
      input.startTime = curr.startTime
    }
    if (curr.endTime !== orig.endTime) {
      input.endTime = curr.endTime
    }
    if (curr.format !== orig.format) {
      input.format = curr.format
    }
    if (
      JSON.stringify(curr.subtitleSegments) !==
      JSON.stringify(orig.subtitleSegments)
    ) {
      input.subtitleSegments = curr.subtitleSegments
    }
    if (JSON.stringify(curr.cta) !== JSON.stringify(orig.cta)) {
      input.cta = curr.cta
    }

    updateFullMutation.mutate(input)
  }, [useStore, updateFullMutation])

  // ── Preview handler ──────────────────────────────────────

  const handlePreview = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const state = useStore.getState()
    video.currentTime = state.clip.startTime
    video.play()
    state.setIsPlaying(true)
  }, [useStore])

  // ── Reset handler ────────────────────────────────────────

  const handleReset = useCallback(() => {
    useStore.getState().reset()

    const video = videoRef.current
    if (!video) return
    const state = useStore.getState()
    video.currentTime = state.clip.startTime
  }, [useStore])

  // ── Beforeunload warning ─────────────────────────────────

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (useStore.getState().isDirty) {
        e.preventDefault()
        // Modern browsers show a generic message; setting returnValue
        // is required for the prompt to appear.
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [useStore])

  // ── Video time sync ──────────────────────────────────────

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const state = useStore.getState()
    state.setCurrentTime(video.currentTime)

    // Auto-pause at clip endTime during preview
    if (state.isPlaying && video.currentTime >= state.clip.endTime) {
      video.pause()
      state.setIsPlaying(false)
    }
  }, [useStore])

  // ── Layout ───────────────────────────────────────────────

  const isRendering = clip.status === 'rendering'
  const isEditable = !isRendering && !isSaving

  return (
    <div className="flex flex-1 gap-6 p-6 overflow-hidden">
      {/* Left column: preview + timeline */}
      <div className="flex flex-col flex-1 gap-4 min-w-0">
        <VideoPreview
          videoRef={videoRef}
          videoSourceUrl={videoSourceUrl}
          format={clip.format}
          subtitleSegments={clip.subtitleSegments}
          cta={clip.cta}
          currentTime={currentTime}
          clipStartTime={clip.startTime}
          clipEndTime={clip.endTime}
          onTimeUpdate={handleTimeUpdate}
        />
        <Timeline
          videoDuration={video.durationSeconds}
          clipStartTime={clip.startTime}
          clipEndTime={clip.endTime}
          currentTime={currentTime}
          disabled={!isEditable}
          onStartTimeChange={useStore.getState().setStartTime}
          onEndTimeChange={useStore.getState().setEndTime}
          onSeek={(time) => {
            if (videoRef.current) {
              videoRef.current.currentTime = time
            }
          }}
        />
      </div>

      {/* Right column: metadata + subtitles + actions */}
      <div className="w-96 flex flex-col gap-4 overflow-y-auto">
        <MetadataPanel
          title={clip.title}
          format={clip.format}
          cta={clip.cta}
          viralityScore={clip.viralityScore}
          disabled={!isEditable}
          onTitleChange={useStore.getState().setTitle}
          onFormatChange={useStore.getState().setFormat}
          onCtaChange={useStore.getState().setCta}
        />
        <SubtitleEditor
          subtitleSegments={clip.subtitleSegments}
          activeIndex={useStore((s) => s.activeSubtitleIndex)}
          disabled={!isEditable}
          onTextChange={useStore.getState().updateSubtitleText}
          onSelect={(index) => {
            useStore.getState().setActiveSubtitleIndex(index)
            const segment = clip.subtitleSegments[index]
            if (segment && videoRef.current) {
              videoRef.current.currentTime = segment.start
            }
          }}
        />
        <ActionBar
          isDirty={isDirty}
          isSaving={isSaving}
          isRendering={isRendering}
          onSave={handleSave}
          onPreview={handlePreview}
          onReset={handleReset}
        />
      </div>
    </div>
  )
}
```

---

## 5. VideoPreview Component

**File:** `apps/web/components/clip-editor/video-preview.tsx`

```typescript
'use client'

import { type RefObject, useMemo } from 'react'

type SubtitleSegment = {
  start: number
  end: number
  text: string
  style?: Record<string, unknown>
}

type Cta = {
  text: string
  position: 'end' | 'overlay'
  duration: number
} | null

type VideoPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  videoSourceUrl: string
  format: 'portrait' | 'square' | 'landscape'
  subtitleSegments: SubtitleSegment[]
  cta: Cta
  currentTime: number
  clipStartTime: number
  clipEndTime: number
  onTimeUpdate: () => void
}

// Format → CSS aspect ratio
const FORMAT_ASPECT_RATIOS = {
  portrait: 'aspect-[9/16]',
  square: 'aspect-square',
  landscape: 'aspect-video',
} as const

// Format → max dimensions so the preview fits on screen
const FORMAT_MAX_DIMENSIONS = {
  portrait: 'max-h-[60vh] max-w-[340px]',
  square: 'max-h-[50vh] max-w-[50vh]',
  landscape: 'max-h-[50vh] max-w-[90%]',
} as const

export function VideoPreview({
  videoRef,
  videoSourceUrl,
  format,
  subtitleSegments,
  cta,
  currentTime,
  clipStartTime,
  clipEndTime,
  onTimeUpdate,
}: VideoPreviewProps) {
  // Find the active subtitle for the current time
  const activeSubtitle = useMemo(() => {
    return subtitleSegments.find(
      (seg) => currentTime >= seg.start && currentTime < seg.end
    )
  }, [subtitleSegments, currentTime])

  // Determine if CTA should be visible
  const showCta = useMemo(() => {
    if (!cta) return false

    if (cta.position === 'end') {
      // Show CTA in the last N seconds of the clip
      const ctaStart = clipEndTime - cta.duration
      return currentTime >= ctaStart && currentTime <= clipEndTime
    }

    if (cta.position === 'overlay') {
      // Overlay is visible for its duration starting from clip start
      // (or configurable — for now, last N seconds before end)
      const ctaStart = clipEndTime - cta.duration
      return currentTime >= ctaStart && currentTime <= clipEndTime
    }

    return false
  }, [cta, currentTime, clipEndTime])

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Aspect ratio container */}
      <div
        className={`
          relative bg-black rounded-lg overflow-hidden
          ${FORMAT_ASPECT_RATIOS[format]}
          ${FORMAT_MAX_DIMENSIONS[format]}
          w-full
        `}
      >
        {/* HTML5 Video element */}
        <video
          ref={videoRef}
          src={videoSourceUrl}
          className="absolute inset-0 w-full h-full object-contain"
          onTimeUpdate={onTimeUpdate}
          playsInline
          preload="metadata"
        />

        {/* Subtitle overlay */}
        {activeSubtitle && (
          <div className="absolute bottom-[10%] left-0 right-0 flex justify-center px-4 pointer-events-none">
            <span
              className="
                inline-block px-3 py-1.5
                bg-black/70 text-white text-lg font-medium
                rounded leading-tight text-center
                max-w-[90%]
              "
            >
              {activeSubtitle.text}
            </span>
          </div>
        )}

        {/* CTA overlay */}
        {showCta && cta && (
          <div
            className={`
              absolute inset-0 flex items-center justify-center
              pointer-events-none
              ${cta.position === 'end' ? 'bg-black/80' : 'bg-black/40'}
            `}
          >
            <p className="text-white text-xl font-bold text-center px-6 max-w-[80%]">
              {cta.text}
            </p>
          </div>
        )}
      </div>

      {/* Playback controls below the preview */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <button
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) {
              video.play()
            } else {
              video.pause()
            }
          }}
          className="px-3 py-1 rounded bg-secondary hover:bg-secondary/80"
        >
          {/* Play/Pause — simple text, replace with icon in implementation */}
          {videoRef.current?.paused !== false ? '▶ Воспроизвести' : '⏸ Пауза'}
        </button>
        <span>
          {formatTimestamp(currentTime)} / {formatTimestamp(clipEndTime - clipStartTime)}
        </span>
      </div>
    </div>
  )
}

// Helper: seconds → MM:SS
function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

---

## 6. Timeline Component

**File:** `apps/web/components/clip-editor/timeline.tsx`

```typescript
'use client'

import { useRef, useCallback, useState } from 'react'

type TimelineProps = {
  videoDuration: number   // Total source video duration in seconds
  clipStartTime: number   // Current clip start (seconds)
  clipEndTime: number     // Current clip end (seconds)
  currentTime: number     // Video playhead position (seconds)
  disabled: boolean
  onStartTimeChange: (time: number) => void
  onEndTimeChange: (time: number) => void
  onSeek: (time: number) => void
}

const MIN_CLIP_DURATION = 5
const MAX_CLIP_DURATION = 180

export function Timeline({
  videoDuration,
  clipStartTime,
  clipEndTime,
  currentTime,
  disabled,
  onStartTimeChange,
  onEndTimeChange,
  onSeek,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [dragTarget, setDragTarget] = useState<'start' | 'end' | null>(null)
  const [tooltipText, setTooltipText] = useState<string | null>(null)

  // Convert pixel position to time
  const pixelToTime = useCallback(
    (clientX: number): number => {
      const bar = barRef.current
      if (!bar) return 0
      const rect = bar.getBoundingClientRect()
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return fraction * videoDuration
    },
    [videoDuration]
  )

  // Convert time to percentage
  const timeToPercent = (time: number): number => {
    return (time / videoDuration) * 100
  }

  // ── Drag handling ──────────────────────────────────────────

  const handlePointerDown = useCallback(
    (target: 'start' | 'end') => (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      setDragTarget(target)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [disabled]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragTarget) return
      const time = pixelToTime(e.clientX)

      if (dragTarget === 'start') {
        const newDuration = clipEndTime - time
        if (newDuration < MIN_CLIP_DURATION) {
          setTooltipText('Минимальная длительность: 5 сек')
          return
        }
        if (newDuration > MAX_CLIP_DURATION) {
          setTooltipText('Максимальная длительность: 180 сек')
          return
        }
        if (time < 0) return
        setTooltipText(null)
        onStartTimeChange(time)
      }

      if (dragTarget === 'end') {
        const newDuration = time - clipStartTime
        if (newDuration < MIN_CLIP_DURATION) {
          setTooltipText('Минимальная длительность: 5 сек')
          return
        }
        if (newDuration > MAX_CLIP_DURATION) {
          setTooltipText('Максимальная длительность: 180 сек')
          return
        }
        if (time > videoDuration) return
        setTooltipText(null)
        onEndTimeChange(time)
      }
    },
    [
      dragTarget,
      pixelToTime,
      clipStartTime,
      clipEndTime,
      videoDuration,
      onStartTimeChange,
      onEndTimeChange,
    ]
  )

  const handlePointerUp = useCallback(() => {
    setDragTarget(null)
    setTooltipText(null)
  }, [])

  // ── Click to seek ──────────────────────────────────────────

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragTarget) return
      const time = pixelToTime(e.clientX)
      onSeek(time)
    },
    [dragTarget, pixelToTime, onSeek]
  )

  // ── Derived values ─────────────────────────────────────────

  const clipDuration = clipEndTime - clipStartTime
  const startPercent = timeToPercent(clipStartTime)
  const endPercent = timeToPercent(clipEndTime)
  const currentPercent = timeToPercent(currentTime)

  return (
    <div className="flex flex-col gap-1">
      {/* Duration display */}
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>{formatTimestamp(clipStartTime)}</span>
        <span className="font-medium text-foreground">
          Длительность: {Math.round(clipDuration)} сек
        </span>
        <span>{formatTimestamp(clipEndTime)}</span>
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-10 bg-muted rounded cursor-pointer select-none"
        onClick={handleBarClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Full video background (grey) — already the bar bg */}

        {/* Selected clip segment (highlighted) */}
        <div
          className="absolute top-0 bottom-0 bg-primary/20 border-y-2 border-primary"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Start handle */}
        <div
          className={`
            absolute top-0 bottom-0 w-3 -ml-1.5
            bg-primary rounded cursor-ew-resize
            hover:bg-primary/90 transition-colors
            ${disabled ? 'pointer-events-none opacity-50' : ''}
          `}
          style={{ left: `${startPercent}%` }}
          onPointerDown={handlePointerDown('start')}
        />

        {/* End handle */}
        <div
          className={`
            absolute top-0 bottom-0 w-3 -ml-1.5
            bg-primary rounded cursor-ew-resize
            hover:bg-primary/90 transition-colors
            ${disabled ? 'pointer-events-none opacity-50' : ''}
          `}
          style={{ left: `${endPercent}%` }}
          onPointerDown={handlePointerDown('end')}
        />

        {/* Playhead (current time indicator) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none"
          style={{ left: `${currentPercent}%` }}
        />

        {/* Tooltip */}
        {tooltipText && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow whitespace-nowrap">
            {tooltipText}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

---

## 7. SubtitleEditor Component

**File:** `apps/web/components/clip-editor/subtitle-editor.tsx`

```typescript
'use client'

import { useState, useCallback } from 'react'

type SubtitleSegment = {
  start: number
  end: number
  text: string
  style?: Record<string, unknown>
}

type SubtitleEditorProps = {
  subtitleSegments: SubtitleSegment[]
  activeIndex: number | null
  disabled: boolean
  onTextChange: (index: number, text: string) => void
  onSelect: (index: number) => void
}

export function SubtitleEditor({
  subtitleSegments,
  activeIndex,
  disabled,
  onTextChange,
  onSelect,
}: SubtitleEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleClick = useCallback(
    (index: number) => {
      onSelect(index)
      setEditingIndex(index)
      setValidationError(null)
    },
    [onSelect]
  )

  const handleTextChange = useCallback(
    (index: number, text: string) => {
      if (text.trim() === '') {
        setValidationError('Текст субтитра не может быть пустым')
      } else {
        setValidationError(null)
      }
      onTextChange(index, text)
    },
    [onTextChange]
  )

  const handleBlur = useCallback(
    (index: number) => {
      const segment = subtitleSegments[index]
      if (segment && segment.text.trim() === '') {
        // Keep editing state — don't allow saving empty
        return
      }
      setEditingIndex(null)
      setValidationError(null)
    },
    [subtitleSegments]
  )

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-foreground px-1">
        Субтитры ({subtitleSegments.length})
      </h3>

      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto rounded border border-border">
        {subtitleSegments.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground text-center">
            Субтитры отсутствуют
          </p>
        )}

        {subtitleSegments.map((segment, index) => {
          const isActive = activeIndex === index
          const isEditing = editingIndex === index

          return (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              className={`
                flex flex-col gap-1 p-2 cursor-pointer
                border-b border-border last:border-b-0
                transition-colors
                ${isActive ? 'bg-primary/10' : 'hover:bg-muted'}
              `}
              onClick={() => handleClick(index)}
            >
              {/* Timestamp */}
              <span className="text-xs text-muted-foreground font-mono">
                {formatTimestamp(segment.start)} — {formatTimestamp(segment.end)}
              </span>

              {/* Text — inline editable or static */}
              {isEditing && !disabled ? (
                <div className="flex flex-col gap-0.5">
                  <input
                    type="text"
                    value={segment.text}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                    onBlur={() => handleBlur(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleBlur(index)
                      }
                      if (e.key === 'Escape') {
                        setEditingIndex(null)
                        setValidationError(null)
                      }
                    }}
                    autoFocus
                    className="
                      w-full px-2 py-1 text-sm
                      border border-primary rounded
                      bg-background text-foreground
                      focus:outline-none focus:ring-1 focus:ring-primary
                    "
                  />
                  {validationError && (
                    <span className="text-xs text-destructive">
                      {validationError}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-foreground leading-snug">
                  {segment.text}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

---

## 8. MetadataPanel Component

**File:** `apps/web/components/clip-editor/metadata-panel.tsx`

```typescript
'use client'

import { useCallback } from 'react'

type ClipFormat = 'portrait' | 'square' | 'landscape'

type Cta = {
  text: string
  position: 'end' | 'overlay'
  duration: number
} | null

type ViralityScore = {
  total: number
  hook: number
  engagement: number
  flow: number
  trend: number
  tips: string[]
}

const DESCRIPTION_MAX_LENGTH = 500

type MetadataPanelProps = {
  title: string
  description: string
  format: ClipFormat
  cta: Cta
  viralityScore: ViralityScore
  disabled: boolean
  onTitleChange: (title: string) => void
  onDescriptionChange: (description: string) => void
  onFormatChange: (format: ClipFormat) => void
  onCtaChange: (cta: Cta) => void
}

const FORMAT_OPTIONS: { value: ClipFormat; label: string; dimensions: string; icon: string }[] = [
  { value: 'portrait', label: 'Вертикальный', dimensions: '1080×1920', icon: '9:16' },
  { value: 'square', label: 'Квадратный', dimensions: '1080×1080', icon: '1:1' },
  { value: 'landscape', label: 'Горизонтальный', dimensions: '1920×1080', icon: '16:9' },
]

const CTA_MAX_LENGTH = 100

export function MetadataPanel({
  title,
  description,
  format,
  cta,
  viralityScore,
  disabled,
  onTitleChange,
  onDescriptionChange,
  onFormatChange,
  onCtaChange,
}: MetadataPanelProps) {

  // ── CTA handlers ───────────────────────────────────────────

  const handleCtaTextChange = useCallback(
    (text: string) => {
      if (text.length > CTA_MAX_LENGTH) return

      if (text.trim() === '') {
        onCtaChange(null)
        return
      }

      onCtaChange({
        text,
        position: cta?.position ?? 'end',
        duration: cta?.duration ?? 5,
      })
    },
    [cta, onCtaChange]
  )

  const handleCtaPositionChange = useCallback(
    (position: 'end' | 'overlay') => {
      if (!cta) return
      onCtaChange({ ...cta, position })
    },
    [cta, onCtaChange]
  )

  const handleCtaDurationChange = useCallback(
    (duration: number) => {
      if (!cta) return
      onCtaChange({ ...cta, duration })
    },
    [cta, onCtaChange]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ── Title ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <label htmlFor="clip-title" className="text-sm font-semibold text-foreground">
          Заголовок
        </label>
        <input
          id="clip-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={disabled}
          className="
            w-full px-3 py-2 text-sm rounded border border-border
            bg-background text-foreground
            focus:outline-none focus:ring-1 focus:ring-primary
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          placeholder="Введите заголовок клипа"
        />
      </div>

      {/* ── Description ────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <label htmlFor="clip-description" className="text-sm font-semibold text-foreground">
          Описание
          <span className="ml-1 text-xs text-muted-foreground font-normal">(необязательно)</span>
        </label>
        <div className="relative">
          <textarea
            id="clip-description"
            value={description}
            onChange={(e) => {
              if (e.target.value.length <= DESCRIPTION_MAX_LENGTH) {
                onDescriptionChange(e.target.value)
              }
            }}
            disabled={disabled}
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={3}
            className="
              w-full px-3 py-2 text-sm rounded border border-border
              bg-background text-foreground resize-y
              focus:outline-none focus:ring-1 focus:ring-primary
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            placeholder="Краткое описание клипа для публикации"
          />
          <span className="absolute right-2 bottom-2 text-xs text-muted-foreground">
            {description.length}/{DESCRIPTION_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* ── Format Selector ───────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">Формат</span>
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onFormatChange(option.value)}
              disabled={disabled}
              className={`
                flex flex-col items-center gap-1 p-2 rounded border text-xs
                transition-colors
                ${
                  format === option.value
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {/* Aspect ratio visual indicator */}
              <div
                className={`
                  border-2 rounded-sm
                  ${format === option.value ? 'border-primary' : 'border-muted-foreground/50'}
                `}
                style={{
                  width: option.value === 'landscape' ? 32 : option.value === 'square' ? 24 : 18,
                  height: option.value === 'portrait' ? 32 : option.value === 'square' ? 24 : 18,
                }}
              />
              <span>{option.icon}</span>
              <span>{option.dimensions}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── CTA Editor ────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">Призыв к действию (CTA)</span>

        {/* CTA Text */}
        <div className="relative">
          <input
            type="text"
            value={cta?.text ?? ''}
            onChange={(e) => handleCtaTextChange(e.target.value)}
            disabled={disabled}
            maxLength={CTA_MAX_LENGTH}
            className="
              w-full px-3 py-2 pr-16 text-sm rounded border border-border
              bg-background text-foreground
              focus:outline-none focus:ring-1 focus:ring-primary
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            placeholder="Например: Записаться на курс"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {(cta?.text ?? '').length}/{CTA_MAX_LENGTH}
          </span>
        </div>

        {!cta && (
          <p className="text-xs text-muted-foreground">CTA не задан</p>
        )}

        {/* CTA Position toggle — only shown when CTA has text */}
        {cta && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => handleCtaPositionChange('end')}
                disabled={disabled}
                className={`
                  flex-1 py-1.5 text-xs rounded border transition-colors
                  ${
                    cta.position === 'end'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                В конце
              </button>
              <button
                onClick={() => handleCtaPositionChange('overlay')}
                disabled={disabled}
                className={`
                  flex-1 py-1.5 text-xs rounded border transition-colors
                  ${
                    cta.position === 'overlay'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                Наложение
              </button>
            </div>

            {/* CTA Duration slider */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                Длительность:
              </label>
              <input
                type="range"
                min={3}
                max={10}
                step={1}
                value={cta.duration}
                onChange={(e) => handleCtaDurationChange(Number(e.target.value))}
                disabled={disabled}
                className="flex-1"
              />
              <span className="text-xs text-foreground font-mono w-8 text-right">
                {cta.duration} с
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Virality Score (read-only) ────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">
          Вирусность: {viralityScore.total}/100
        </span>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <ScoreRow label="Хук" value={viralityScore.hook} />
          <ScoreRow label="Вовлечённость" value={viralityScore.engagement} />
          <ScoreRow label="Динамика" value={viralityScore.flow} />
          <ScoreRow label="Тренд" value={viralityScore.trend} />
        </div>

        {viralityScore.tips.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1">
            <span className="text-xs font-medium text-muted-foreground">Советы:</span>
            <ul className="list-disc list-inside text-xs text-muted-foreground">
              {viralityScore.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="font-mono text-foreground w-6 text-right">{value}</span>
      </div>
    </div>
  )
}
```

---

## 9. ActionBar Component

**File:** `apps/web/components/clip-editor/action-bar.tsx`

```typescript
'use client'

type ActionBarProps = {
  isDirty: boolean
  isSaving: boolean
  isRendering: boolean
  onSave: () => void
  onPreview: () => void
  onReset: () => void
}

export function ActionBar({
  isDirty,
  isSaving,
  isRendering,
  onSave,
  onPreview,
  onReset,
}: ActionBarProps) {
  const saveDisabled = !isDirty || isSaving || isRendering
  const resetDisabled = !isDirty || isSaving

  return (
    <div className="flex flex-col gap-2 pt-4 border-t border-border">
      {/* Rendering status indicator */}
      {isRendering && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-sm text-amber-700 dark:text-amber-400">
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Рендеринг...</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Preview button */}
        <button
          onClick={onPreview}
          className="
            flex-1 px-4 py-2 text-sm font-medium rounded
            border border-border
            bg-secondary text-secondary-foreground
            hover:bg-secondary/80
            transition-colors
          "
        >
          Предпросмотр
        </button>

        {/* Reset button */}
        <button
          onClick={onReset}
          disabled={resetDisabled}
          className="
            px-4 py-2 text-sm font-medium rounded
            border border-border
            text-muted-foreground
            hover:bg-muted
            transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Отмена
        </button>

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={saveDisabled}
          className="
            flex-1 px-4 py-2 text-sm font-medium rounded
            bg-primary text-primary-foreground
            hover:bg-primary/90
            transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
```

---

## 10. New tRPC Mutation: `clip.updateFull`

**File:** `apps/web/server/routers/clip.ts` (add to existing clip router)

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, router } from '../trpc'
import { prisma } from '@clipmaker/db'
import { clipRenderQueue } from '@clipmaker/queue'

// ── Zod Schemas ──────────────────────────────────────────────

const subtitleSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string().min(1, 'Текст субтитра не может быть пустым').max(500),
  style: z
    .object({
      fontFamily: z.string().optional(),
      fontSize: z.number().positive().optional(),
      fontColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      bold: z.boolean().optional(),
      shadow: z.boolean().optional(),
    })
    .optional(),
})

const ctaSchema = z.object({
  text: z.string().min(1).max(100),
  position: z.enum(['end', 'overlay']),
  duration: z.number().min(3).max(10),
})

const clipFormatSchema = z.enum(['portrait', 'square', 'landscape'])

const updateFullInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  startTime: z.number().nonnegative().optional(),
  endTime: z.number().positive().optional(),
  format: clipFormatSchema.optional(),
  subtitleSegments: z.array(subtitleSegmentSchema).max(500).optional(),
  cta: ctaSchema.nullable().optional(),
})

// ── Constants ────────────────────────────────────────────────

const MIN_CLIP_DURATION = 5
const MAX_CLIP_DURATION = 180

// ── Mutation ─────────────────────────────────────────────────

export const updateFull = protectedProcedure
  .input(updateFullInputSchema)
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.userId

    // 1. Fetch existing clip with ownership check
    const existingClip = await prisma.clip.findFirst({
      where: {
        id: input.id,
        userId,
      },
    })

    if (!existingClip) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Клип не найден',
      })
    }

    // 2. Prevent edits while rendering
    if (existingClip.status === 'rendering') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Клип в процессе рендеринга. Дождитесь завершения.',
      })
    }

    // 3. Validate time boundaries
    const newStartTime = input.startTime ?? existingClip.startTime
    const newEndTime = input.endTime ?? existingClip.endTime
    const newDuration = newEndTime - newStartTime

    if (newDuration < MIN_CLIP_DURATION) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Минимальная длительность клипа: ${MIN_CLIP_DURATION} сек`,
      })
    }

    if (newDuration > MAX_CLIP_DURATION) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Максимальная длительность клипа: ${MAX_CLIP_DURATION} сек`,
      })
    }

    if (newStartTime >= newEndTime) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Начало клипа должно быть раньше конца',
      })
    }

    // 4. Validate subtitle segment ordering
    if (input.subtitleSegments) {
      for (const seg of input.subtitleSegments) {
        if (seg.start >= seg.end) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Начало субтитра должно быть раньше конца',
          })
        }
      }
    }

    // 5. Determine if re-render is needed
    const needsReRender =
      input.startTime !== undefined && input.startTime !== existingClip.startTime ||
      input.endTime !== undefined && input.endTime !== existingClip.endTime ||
      input.format !== undefined && input.format !== existingClip.format ||
      input.subtitleSegments !== undefined &&
        JSON.stringify(input.subtitleSegments) !==
          JSON.stringify(existingClip.subtitleSegments) ||
      input.cta !== undefined &&
        JSON.stringify(input.cta) !== JSON.stringify(existingClip.cta)

    // 6. Build update payload
    const updateData: Record<string, unknown> = {}

    if (input.title !== undefined) {
      updateData.title = input.title
    }
    if (input.startTime !== undefined) {
      updateData.startTime = input.startTime
    }
    if (input.endTime !== undefined) {
      updateData.endTime = input.endTime
    }
    if (input.startTime !== undefined || input.endTime !== undefined) {
      updateData.duration = newDuration
    }
    if (input.format !== undefined) {
      updateData.format = input.format
    }
    if (input.subtitleSegments !== undefined) {
      updateData.subtitleSegments = input.subtitleSegments
    }
    if (input.cta !== undefined) {
      updateData.cta = input.cta
    }

    // Set status to rendering if re-render needed
    if (needsReRender) {
      updateData.status = 'rendering'
    }

    // 7. Update in database
    const updatedClip = await prisma.clip.update({
      where: { id: input.id },
      data: updateData,
    })

    // 8. Queue render job if needed
    if (needsReRender) {
      await clipRenderQueue.add(
        'render-clip',
        {
          clipId: updatedClip.id,
          videoId: updatedClip.videoId,
          userId,
          startTime: updatedClip.startTime,
          endTime: updatedClip.endTime,
          format: updatedClip.format,
          subtitleSegments: updatedClip.subtitleSegments,
          cta: updatedClip.cta,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }
      )
    }

    // 9. Return updated clip
    return {
      id: updatedClip.id,
      videoId: updatedClip.videoId,
      title: updatedClip.title,
      description: updatedClip.description,
      startTime: updatedClip.startTime,
      endTime: updatedClip.endTime,
      duration: updatedClip.duration,
      format: updatedClip.format,
      subtitleSegments: updatedClip.subtitleSegments,
      cta: updatedClip.cta,
      viralityScore: updatedClip.viralityScore,
      status: updatedClip.status,
      thumbnailPath: updatedClip.thumbnailPath,
    }
  })
```

---

## Component Tree Summary

```
/dashboard/videos/[videoId]/clips/[clipId]/edit
├── page.tsx                     (Server Component — data fetching)
├── loading.tsx                  (Suspense loading skeleton)
├── not-found.tsx                (404 page)
├── error.tsx                    (Error boundary)
├── clip-editor.tsx              (Client Component — orchestrator)
├── (store: lib/stores/clip-editor-store.ts — Zustand store factory)
└── (components: components/clip-editor/)
    ├── video-preview.tsx        (Video + subtitle/CTA overlays)
    ├── timeline.tsx             (Draggable clip boundary handles)
    ├── subtitle-editor.tsx      (Inline subtitle text editing)
    ├── metadata-panel.tsx       (Title + description + format + CTA + virality)
    └── action-bar.tsx           (Save/Preview/Reset buttons)
```

## Data Flow

```
Server Component (page.tsx)
  │
  ├── Prisma: clip + video data
  ├── S3: presigned URLs for video source + rendered clip
  │
  └── ClipEditor (client)
        │
        ├── useClipEditorStore (Zustand)
        │     ├── clip (mutable working copy)
        │     ├── originalClip (last saved state)
        │     ├── isDirty (derived from diff)
        │     └── actions: set*, save, reset
        │
        ├── tRPC mutation: clip.updateFull
        │     ├── Zod validation
        │     ├── Ownership check
        │     ├── needsReRender detection
        │     ├── Prisma update
        │     └── BullMQ render job (conditional)
        │
        ├── tRPC query: clip.get (polling when rendering)
        │     └── refetchInterval: 3000ms while status === 'rendering'
        │
        └── Components read/write store:
              VideoPreview  ← currentTime, subtitles, cta, format
              Timeline      ← startTime, endTime, videoDuration
              SubtitleEditor ← subtitleSegments, activeIndex
              MetadataPanel ← title, description, format, cta, viralityScore
              ActionBar     ← isDirty, isSaving, isRendering
```

## Key Implementation Notes

1. **Zustand store is created per-page via factory** (`createClipEditorStore`). This avoids stale state across navigations. The factory is called inside `useMemo` with an empty dependency array.

2. **Re-render detection** happens both client-side (in `needsReRender()` for UI messaging) and server-side (in the mutation, which is the authoritative check).

3. **Optimistic updates are NOT used** for save — the mutation response is the source of truth. This avoids complex rollback logic when the render queue or validation fails.

4. **Video playback** uses the raw source video URL (full webinar), not the rendered clip. The rendered clip is only available after rendering completes. The timeline and subtitle overlay simulate the final output.

5. **Polling for render status** uses tRPC's `refetchInterval` on `clip.get`. When the status changes from `rendering`, `router.refresh()` is called to get fresh presigned URLs from the server component.

6. **Beforeunload handler** is registered with the native browser event to warn about unsaved changes. Next.js App Router does not have a built-in equivalent for client-side route changes — consider adding `next/navigation` interception in a follow-up.

7. **Subtitle timing adjustment is out of scope** — only text editing is supported. The `start` and `end` values on subtitle segments are read-only in this iteration.

8. **CTA duration slider max** is 10 seconds for both `end` and `overlay` positions. A future iteration may allow overlay to span longer durations.
