'use client';

import { useState, useRef, useEffect, memo } from 'react';
import type { TranscriptSegment } from '@clipmaker/types';

type SegmentEditorProps = {
  segment: TranscriptSegment;
  index: number;
  isActive: boolean;
  onSave: (index: number, text: string) => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const SegmentEditor = memo(function SegmentEditor({ segment, index, isActive, onSave }: SegmentEditorProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(segment.text);
  const [originalText, setOriginalText] = useState(segment.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(segment.text);
    setOriginalText(segment.text);
  }, [segment.text]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleStartEdit() {
    setOriginalText(text);
    setEditing(true);
  }

  function handleSave() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > 1000) return;
    setEditing(false);
    if (trimmed !== segment.text) {
      onSave(index, trimmed);
    }
  }

  function handleUndo() {
    setText(originalText);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      handleUndo();
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleUndo();
    }
  }

  return (
    <div
      className={`flex gap-3 px-3 py-2 rounded-lg transition-colors ${
        isActive ? 'bg-blue-50 border-l-2 border-blue-500 active' : 'hover:bg-gray-50'
      }`}
      data-segment-index={index}
    >
      <span className="text-xs text-gray-400 font-mono whitespace-nowrap pt-1 select-none">
        {formatTime(segment.start)}
      </span>

      {editing ? (
        <div className="flex-1 flex flex-col gap-1">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="w-full text-sm border rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={2}
            maxLength={1000}
          />
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={handleSave}
              className="text-blue-600 hover:underline"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={handleUndo}
              className="text-gray-500 hover:underline"
            >
              Отменить
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleStartEdit}
          className="flex-1 text-left text-sm cursor-text hover:bg-gray-100 rounded px-1 -mx-1"
        >
          {text}
        </button>
      )}
    </div>
  );
});
