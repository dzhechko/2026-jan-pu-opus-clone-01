'use client';

import { useRef, useCallback, useState } from 'react';

type TimelineProps = {
  videoDuration: number;
  clipStartTime: number;
  clipEndTime: number;
  currentTime: number;
  disabled: boolean;
  onStartTimeChange: (time: number) => void;
  onEndTimeChange: (time: number) => void;
  onSeek: (time: number) => void;
};

const MIN_CLIP_DURATION = 5;
const MAX_CLIP_DURATION = 180;

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
  const barRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<'start' | 'end' | null>(null);
  const [tooltipText, setTooltipText] = useState<string | null>(null);

  const pixelToTime = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar) return 0;
      const rect = bar.getBoundingClientRect();
      const fraction = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return fraction * videoDuration;
    },
    [videoDuration],
  );

  const timeToPercent = (time: number): number => {
    return (time / videoDuration) * 100;
  };

  const handlePointerDown = useCallback(
    (target: 'start' | 'end') => (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragTarget(target);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragTarget) return;
      const time = pixelToTime(e.clientX);

      if (dragTarget === 'start') {
        const newDuration = clipEndTime - time;
        if (newDuration < MIN_CLIP_DURATION) {
          setTooltipText('Минимальная длительность: 5 сек');
          return;
        }
        if (newDuration > MAX_CLIP_DURATION) {
          setTooltipText('Максимальная длительность: 180 сек');
          return;
        }
        if (time < 0) return;
        setTooltipText(null);
        onStartTimeChange(time);
      }

      if (dragTarget === 'end') {
        const newDuration = time - clipStartTime;
        if (newDuration < MIN_CLIP_DURATION) {
          setTooltipText('Минимальная длительность: 5 сек');
          return;
        }
        if (newDuration > MAX_CLIP_DURATION) {
          setTooltipText('Максимальная длительность: 180 сек');
          return;
        }
        if (time > videoDuration) return;
        setTooltipText(null);
        onEndTimeChange(time);
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
    ],
  );

  const handlePointerUp = useCallback(() => {
    setDragTarget(null);
    setTooltipText(null);
  }, []);

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragTarget) return;
      const time = pixelToTime(e.clientX);
      onSeek(time);
    },
    [dragTarget, pixelToTime, onSeek],
  );

  const clipDuration = clipEndTime - clipStartTime;
  const startPercent = timeToPercent(clipStartTime);
  const endPercent = timeToPercent(clipEndTime);
  const currentPercent = timeToPercent(currentTime);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>{formatTimestamp(clipStartTime)}</span>
        <span className="font-medium text-foreground">
          Длительность: {Math.round(clipDuration)} сек
        </span>
        <span>{formatTimestamp(clipEndTime)}</span>
      </div>

      <div
        ref={barRef}
        className="relative h-10 bg-muted rounded cursor-pointer select-none"
        onClick={handleBarClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="absolute top-0 bottom-0 bg-primary/20 border-y-2 border-primary"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

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

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none"
          style={{ left: `${currentPercent}%` }}
        />

        {tooltipText && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow whitespace-nowrap">
            {tooltipText}
          </div>
        )}
      </div>
    </div>
  );
}
