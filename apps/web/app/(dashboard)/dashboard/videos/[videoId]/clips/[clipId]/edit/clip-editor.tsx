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

type ClipEditorProps = {
  clip: ClipData;
  video: {
    id: string;
    title: string;
    durationSeconds: number | null;
  };
  videoSourceUrl: string;
  clipPreviewUrl: string | null;
};

export function ClipEditor({
  clip: initialClip,
  video,
  videoSourceUrl,
}: ClipEditorProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Create store once per mount with initial data
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
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      useStore.getState().setIsSaving(false);
      setSaveMessage({
        type: 'error',
        text: error.message || 'Ошибка сохранения. Попробуйте ещё раз.',
      });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  // ── Polling for render status ────────────────────────────

  trpc.clip.get.useQuery(
    { id: clip.id },
    {
      enabled: clip.status === 'rendering',
      refetchInterval: clip.status === 'rendering' ? 3000 : false,
    },
  );

  // Watch for render completion and refresh
  useEffect(() => {
    if (
      clip.status === 'rendering' &&
      updateFullMutation.data &&
      updateFullMutation.data.status !== 'rendering'
    ) {
      router.refresh();
    }
  }, [clip.status, updateFullMutation.data, router]);

  // ── Save handler ─────────────────────────────────────────

  const handleSave = useCallback(() => {
    const state = useStore.getState();
    if (!state.isDirty || state.isSaving) return;
    if (state.clip.status === 'rendering') return;

    state.setIsSaving(true);

    const input: Record<string, unknown> = { id: state.clip.id };
    const orig = state.originalClip;
    const curr = state.clip;

    if (curr.title !== orig.title) {
      input.title = curr.title;
    }
    if (curr.description !== orig.description) {
      input.description = curr.description;
    }
    if (curr.startTime !== orig.startTime) {
      input.startTime = curr.startTime;
    }
    if (curr.endTime !== orig.endTime) {
      input.endTime = curr.endTime;
    }
    if (curr.format !== orig.format) {
      input.format = curr.format;
    }
    if (
      JSON.stringify(curr.subtitleSegments) !==
      JSON.stringify(orig.subtitleSegments)
    ) {
      input.subtitleSegments = curr.subtitleSegments;
    }
    if (JSON.stringify(curr.cta) !== JSON.stringify(orig.cta)) {
      input.cta = curr.cta;
    }

    updateFullMutation.mutate(input as Parameters<typeof updateFullMutation.mutate>[0]);
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

  // ── Layout ───────────────────────────────────────────────

  const isRendering = clip.status === 'rendering';
  const isEditable = !isRendering && !isSaving;
  const videoDuration = video.durationSeconds ?? clip.endTime + 60;

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
          videoDuration={videoDuration}
          clipStartTime={clip.startTime}
          clipEndTime={clip.endTime}
          currentTime={currentTime}
          disabled={!isEditable}
          onStartTimeChange={useStore.getState().setStartTime}
          onEndTimeChange={useStore.getState().setEndTime}
          onSeek={(time) => {
            if (videoRef.current) {
              videoRef.current.currentTime = time;
            }
          }}
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
          onTitleChange={useStore.getState().setTitle}
          onDescriptionChange={useStore.getState().setDescription}
          onFormatChange={useStore.getState().setFormat}
          onCtaChange={useStore.getState().setCta}
        />
        <SubtitleEditor
          subtitleSegments={clip.subtitleSegments}
          activeIndex={useStore((s) => s.activeSubtitleIndex)}
          disabled={!isEditable}
          onTextChange={useStore.getState().updateSubtitleText}
          onSelect={(index) => {
            useStore.getState().setActiveSubtitleIndex(index);
            const segment = clip.subtitleSegments[index];
            if (segment && videoRef.current) {
              videoRef.current.currentTime = segment.start;
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
  );
}
