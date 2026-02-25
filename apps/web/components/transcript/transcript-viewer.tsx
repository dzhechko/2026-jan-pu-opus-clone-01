'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { SegmentEditor } from './segment-editor';

type TranscriptViewerProps = {
  videoId: string;
  videoStatus: string;
  currentTime?: number;
};

export function TranscriptViewer({ videoId, videoStatus, currentTime = 0 }: TranscriptViewerProps) {
  const [pendingEdits, setPendingEdits] = useState<Map<number, string>>(new Map());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    error,
  } = trpc.transcript.getSegments.useQuery(
    { videoId },
    { enabled: videoStatus === 'analyzing' || videoStatus === 'completed' },
  );

  const updateMutation = trpc.transcript.updateSegments.useMutation();
  const utils = trpc.useUtils();

  // Find active segment index based on currentTime
  const activeIndex = data?.segments.findIndex(
    (seg) => currentTime >= seg.start && currentTime < seg.end,
  ) ?? -1;

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-segment-index="${activeIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSegmentSave = useCallback((index: number, text: string) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      next.set(index, text);
      return next;
    });
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (pendingEdits.size === 0) return;

    setSaveStatus('saving');
    const edits = Array.from(pendingEdits.entries()).map(([index, text]) => ({
      index,
      text,
    }));

    try {
      await updateMutation.mutateAsync({ videoId, edits });
      setPendingEdits(new Map());
      setSaveStatus('success');
      await utils.transcript.getSegments.invalidate({ videoId });
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [pendingEdits, videoId, updateMutation, utils]);

  // Status-based UI
  if (videoStatus === 'uploading') {
    return (
      <TranscriptShell>
        <p className="text-gray-500">Транскрипт будет доступен после обработки</p>
      </TranscriptShell>
    );
  }

  if (videoStatus === 'transcribing') {
    return (
      <TranscriptShell>
        <div className="flex items-center gap-2">
          <Spinner />
          <p className="text-gray-500">Транскрибируем...</p>
        </div>
      </TranscriptShell>
    );
  }

  if (videoStatus === 'failed') {
    return (
      <TranscriptShell>
        <p className="text-red-500">Ошибка транскрибирования</p>
      </TranscriptShell>
    );
  }

  if (isLoading) {
    return (
      <TranscriptShell>
        <div className="flex items-center gap-2">
          <Spinner />
          <p className="text-gray-400">Загрузка транскрипта...</p>
        </div>
      </TranscriptShell>
    );
  }

  if (error || !data) {
    return (
      <TranscriptShell>
        <p className="text-gray-500">Транскрипт ещё не готов</p>
      </TranscriptShell>
    );
  }

  return (
    <div className="bg-white rounded-xl border">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Субтитры</h2>
          <span className="text-xs text-gray-400">
            {data.segments.length} сегментов &middot; {data.sttModel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingEdits.size > 0 && (
            <span className="text-xs text-amber-600">
              {pendingEdits.size} изменений
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={pendingEdits.size === 0 || saveStatus === 'saving'}
            className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveStatus === 'saving'
              ? 'Сохранение...'
              : saveStatus === 'success'
                ? 'Сохранено'
                : saveStatus === 'error'
                  ? 'Ошибка'
                  : 'Сохранить все'}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="max-h-[500px] overflow-y-auto divide-y">
        {data.segments.map((segment, i) => (
          <SegmentEditor
            key={`${segment.start}-${i}`}
            segment={segment}
            index={i}
            isActive={i === activeIndex}
            onSave={handleSegmentSave}
          />
        ))}
      </div>
    </div>
  );
}

function TranscriptShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold">Субтитры</h2>
      </div>
      <div className="flex items-center justify-center py-12">
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
