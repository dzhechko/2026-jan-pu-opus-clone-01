'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import {
  createClipEditorStore,
  type ClipData,
} from '@/lib/stores/clip-editor-store';
import { VideoPreview } from '@/components/clip-editor/video-preview';
import { Timeline } from '@/components/clip-editor/timeline';
import { SubtitleEditor } from '@/components/clip-editor/subtitle-editor';
import { MetadataPanel } from '@/components/clip-editor/metadata-panel';
import { ActionBar } from '@/components/clip-editor/action-bar';
import type { ClipFormat, SubtitleSegment, CTA } from '@clipmaker/types';

type ClipEditorProps = {
  clip: ClipData;
  video: {
    id: string;
    title: string;
    durationSeconds: number | null;
  };
  videoSourceUrl: string;
};

export function ClipEditor({
  clip: initialClip,
  video,
  videoSourceUrl: initialVideoSourceUrl,
}: ClipEditorProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [videoSrc, setVideoSrc] = useState(initialVideoSourceUrl);

  // Create store once per mount with initial data
  // Empty deps: store is intentionally created once; server re-renders
  // pass new props but the store updates via markSaved/polling instead
  const useStore = useMemo(
    () => createClipEditorStore(initialClip),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Subscribe to store values
  const clip = useStore((s) => s.clip);
  const isDirty = useStore((s) => s.isDirty);
  const isSaving = useStore((s) => s.isSaving);
  const currentTime = useStore((s) => s.currentTime);

  // Extract stable action references
  const setStartTime = useStore((s) => s.setStartTime);
  const setEndTime = useStore((s) => s.setEndTime);
  const setTitle = useStore((s) => s.setTitle);
  const setDescription = useStore((s) => s.setDescription);
  const setFormat = useStore((s) => s.setFormat);
  const setCta = useStore((s) => s.setCta);
  const updateSubtitleText = useStore((s) => s.updateSubtitleText);
  const setActiveSubtitleIndex = useStore((s) => s.setActiveSubtitleIndex);
  const activeSubtitleIndex = useStore((s) => s.activeSubtitleIndex);

  // ── tRPC mutation ────────────────────────────────────────

  const updateFullMutation = trpc.clip.updateFull.useMutation({
    onSuccess: (updatedClip) => {
      useStore.getState().markSaved(updatedClip as ClipData);

      if (updatedClip.status === 'rendering') {
        setSaveMessage({
          type: 'success',
          text: 'Клип сохранён. Рендеринг запущен.',
        });
      } else {
        setSaveMessage({ type: 'success', text: 'Клип сохранён' });
      }
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      useStore.getState().setIsSaving(false);
      setSaveMessage({
        type: 'error',
        text: error.message || 'Ошибка сохранения. Попробуйте ещё раз.',
      });
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  // Clean up save timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  // ── Polling for render status ────────────────────────────

  const { data: polledClip } = trpc.clip.get.useQuery(
    { id: clip.id },
    {
      enabled: clip.status === 'rendering',
      refetchInterval: clip.status === 'rendering' ? 3000 : false,
    },
  );

  // Watch polling result for render completion or failure
  useEffect(() => {
    if (!polledClip) return;
    const storeStatus = useStore.getState().clip.status;
    if (storeStatus !== 'rendering') return;

    if (polledClip.status === 'ready') {
      useStore.getState().markSaved({
        ...useStore.getState().clip,
        status: 'ready',
      } as ClipData);
      setSaveMessage({ type: 'success', text: 'Рендеринг завершён' });
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveMessage(null), 3000);
      router.refresh();
    } else if (polledClip.status === 'failed') {
      useStore.getState().markSaved({
        ...useStore.getState().clip,
        status: 'failed',
      } as ClipData);
      setSaveMessage({
        type: 'error',
        text: 'Рендеринг не удался. Попробуйте сохранить снова.',
      });
    }
  }, [polledClip, useStore, router]);

  // ── Save handler ─────────────────────────────────────────

  const handleSave = useCallback(() => {
    const state = useStore.getState();
    if (!state.isDirty || state.isSaving) return;
    if (state.clip.status === 'rendering') return;

    state.setIsSaving(true);

    const orig = state.originalClip;
    const curr = state.clip;

    const input: {
      id: string;
      title?: string;
      description?: string | null;
      startTime?: number;
      endTime?: number;
      format?: ClipFormat;
      subtitleSegments?: SubtitleSegment[];
      cta?: CTA | null;
    } = { id: curr.id };

    if (curr.title !== orig.title) input.title = curr.title;
    if (curr.description !== orig.description)
      input.description = curr.description;
    if (curr.startTime !== orig.startTime) input.startTime = curr.startTime;
    if (curr.endTime !== orig.endTime) input.endTime = curr.endTime;
    if (curr.format !== orig.format) input.format = curr.format;
    if (
      JSON.stringify(curr.subtitleSegments) !==
      JSON.stringify(orig.subtitleSegments)
    ) {
      input.subtitleSegments = curr.subtitleSegments;
    }
    if (JSON.stringify(curr.cta) !== JSON.stringify(orig.cta)) {
      input.cta = curr.cta;
    }

    updateFullMutation.mutate(input);
  }, [useStore, updateFullMutation]);

  // ── Preview handler ──────────────────────────────────────

  const handlePreview = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const state = useStore.getState();
    videoEl.currentTime = state.clip.startTime;
    videoEl.play();
    state.setIsPlaying(true);
  }, [useStore]);

  // ── Reset handler ────────────────────────────────────────

  const handleReset = useCallback(() => {
    useStore.getState().reset();

    const videoEl = videoRef.current;
    if (!videoEl) return;
    const state = useStore.getState();
    videoEl.currentTime = state.clip.startTime;
  }, [useStore]);

  // ── Beforeunload warning ─────────────────────────────────

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (useStore.getState().isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [useStore]);

  // ── Video time sync ──────────────────────────────────────

  const handleTimeUpdate = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const state = useStore.getState();
    state.setCurrentTime(videoEl.currentTime);

    // Auto-pause at clip endTime during preview
    if (state.isPlaying && videoEl.currentTime >= state.clip.endTime) {
      videoEl.pause();
      state.setIsPlaying(false);
    }
  }, [useStore]);

  // ── Video error handler (presigned URL expiry) ───────────

  const handleVideoError = useCallback(() => {
    // Try refreshing the page to get new presigned URLs
    router.refresh();
    // Update the src to force a reload after refresh
    setTimeout(() => {
      setVideoSrc((prev) => {
        // Append a cache-buster to force reload
        const url = new URL(prev, window.location.origin);
        url.searchParams.set('_t', Date.now().toString());
        return url.toString();
      });
    }, 1000);
  }, [router]);

  // ── Seek handler ─────────────────────────────────────────

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  // ── Subtitle select handler ──────────────────────────────

  const handleSubtitleSelect = useCallback(
    (index: number) => {
      setActiveSubtitleIndex(index);
      const segment = useStore.getState().clip.subtitleSegments[index];
      if (segment && videoRef.current) {
        videoRef.current.currentTime = segment.start;
      }
    },
    [setActiveSubtitleIndex, useStore],
  );

  // ── Layout ───────────────────────────────────────────────

  const isRendering = clip.status === 'rendering';
  const isFailed = clip.status === 'failed';
  const isEditable = !isRendering && !isSaving;
  const videoDuration = Math.max(
    video.durationSeconds ?? clip.endTime + 60,
    1,
  );

  return (
    <div className="flex flex-1 gap-6 p-6 overflow-hidden">
      {/* Save notification */}
      {saveMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-sm ${
            saveMessage.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-destructive text-destructive-foreground'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      {/* Left column: preview + timeline */}
      <div className="flex flex-col flex-1 gap-4 min-w-0">
        <VideoPreview
          videoRef={videoRef}
          videoSourceUrl={videoSrc}
          format={clip.format}
          subtitleSegments={clip.subtitleSegments}
          cta={clip.cta}
          currentTime={currentTime}
          clipStartTime={clip.startTime}
          clipEndTime={clip.endTime}
          onTimeUpdate={handleTimeUpdate}
          onVideoError={handleVideoError}
        />
        <Timeline
          videoDuration={videoDuration}
          clipStartTime={clip.startTime}
          clipEndTime={clip.endTime}
          currentTime={currentTime}
          disabled={!isEditable}
          onStartTimeChange={setStartTime}
          onEndTimeChange={setEndTime}
          onSeek={handleSeek}
        />
      </div>

      {/* Right column: metadata + subtitles + actions */}
      <div className="w-96 flex flex-col gap-4 overflow-y-auto">
        <MetadataPanel
          title={clip.title}
          description={clip.description}
          format={clip.format}
          cta={clip.cta}
          viralityScore={clip.viralityScore}
          disabled={!isEditable}
          onTitleChange={setTitle}
          onDescriptionChange={setDescription}
          onFormatChange={setFormat}
          onCtaChange={setCta}
        />
        <SubtitleEditor
          subtitleSegments={clip.subtitleSegments}
          activeIndex={activeSubtitleIndex}
          disabled={!isEditable}
          onTextChange={updateSubtitleText}
          onSelect={handleSubtitleSelect}
        />
        <ActionBar
          isDirty={isDirty}
          isSaving={isSaving}
          isRendering={isRendering}
          isFailed={isFailed}
          onSave={handleSave}
          onPreview={handlePreview}
          onReset={handleReset}
        />
      </div>
    </div>
  );
}
