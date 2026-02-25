'use client';

import { useState, useCallback } from 'react';
import type { SubtitleSegment } from '@clipmaker/types';
import { formatDuration } from '@/lib/utils/format';

type SubtitleEditorProps = {
  subtitleSegments: SubtitleSegment[];
  activeIndex: number | null;
  disabled: boolean;
  onTextChange: (index: number, text: string) => void;
  onSelect: (index: number) => void;
};

export function SubtitleEditor({
  subtitleSegments,
  activeIndex,
  disabled,
  onTextChange,
  onSelect,
}: SubtitleEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleClick = useCallback(
    (index: number) => {
      onSelect(index);
      setEditingIndex(index);
      setValidationError(null);
    },
    [onSelect],
  );

  const handleTextChange = useCallback(
    (index: number, text: string) => {
      if (text.trim() === '') {
        setValidationError('Текст субтитра не может быть пустым');
      } else {
        setValidationError(null);
      }
      onTextChange(index, text);
    },
    [onTextChange],
  );

  const handleBlur = useCallback(
    () => {
      setEditingIndex(null);
      setValidationError(null);
    },
    [],
  );

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
          const isActive = activeIndex === index;
          const isEditing = editingIndex === index;

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
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">
                  {formatDuration(segment.start)} —{' '}
                  {formatDuration(segment.end)}
                </span>
                {segment.text.trim() === '' && (
                  <span className="text-xs text-amber-500">пусто</span>
                )}
              </div>

              {isEditing && !disabled ? (
                <div className="flex flex-col gap-0.5">
                  <textarea
                    value={segment.text}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                    onBlur={handleBlur}
                    autoFocus
                    rows={2}
                    maxLength={500}
                    className="
                      w-full px-2 py-1 text-sm rounded border border-border
                      bg-background text-foreground resize-none
                      focus:outline-none focus:ring-1 focus:ring-primary
                    "
                  />
                  {validationError && editingIndex === index && (
                    <span className="text-xs text-destructive">
                      {validationError}
                    </span>
                  )}
                </div>
              ) : (
                <p
                  className={`text-sm ${segment.text.trim() === '' ? 'text-muted-foreground/50 italic' : 'text-foreground'}`}
                >
                  {segment.text || '(пустой субтитр)'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
