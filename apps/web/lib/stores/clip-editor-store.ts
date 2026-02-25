'use client';

import { create } from 'zustand';
import type {
  ClipFormat,
  ClipStatus,
  ViralityScore,
  SubtitleSegment,
  CTA,
} from '@clipmaker/types';

// ── Types ──────────────────────────────────────────────────────

export type ClipData = {
  id: string;
  videoId: string;
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  duration: number;
  format: ClipFormat;
  subtitleSegments: SubtitleSegment[];
  cta: CTA | null;
  viralityScore: ViralityScore;
  status: ClipStatus;
  thumbnailPath: string | null;
};

// ── Store Shape ────────────────────────────────────────────────

type ClipEditorState = {
  // Data
  clip: ClipData;
  originalClip: ClipData;

  // Playback state
  currentTime: number;
  isPlaying: boolean;

  // Editor state
  isDirty: boolean;
  isSaving: boolean;
  activeSubtitleIndex: number | null;

  // Actions — metadata
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;

  // Actions — timeline
  setStartTime: (startTime: number) => void;
  setEndTime: (endTime: number) => void;

  // Actions — format
  setFormat: (format: ClipFormat) => void;

  // Actions — subtitles
  updateSubtitleText: (index: number, text: string) => void;
  setActiveSubtitleIndex: (index: number | null) => void;

  // Actions — CTA
  setCta: (cta: CTA | null) => void;

  // Actions — playback
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // Actions — persistence
  setIsSaving: (saving: boolean) => void;
  markSaved: (updatedClip: ClipData) => void;
  reset: () => void;

  // Derived
  needsReRender: () => boolean;
};

// ── Constants ──────────────────────────────────────────────────

const MIN_CLIP_DURATION = 5;
const MAX_CLIP_DURATION = 180;

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
        const { endTime } = state.clip;
        if (endTime - startTime < MIN_CLIP_DURATION) return state;
        if (endTime - startTime > MAX_CLIP_DURATION) return state;
        if (startTime < 0) return state;

        return {
          clip: {
            ...state.clip,
            startTime,
            duration: endTime - startTime,
          },
          isDirty: true,
        };
      }),

    setEndTime: (endTime) =>
      set((state) => {
        const { startTime } = state.clip;
        if (endTime - startTime < MIN_CLIP_DURATION) return state;
        if (endTime - startTime > MAX_CLIP_DURATION) return state;

        return {
          clip: {
            ...state.clip,
            endTime,
            duration: endTime - startTime,
          },
          isDirty: true,
        };
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
        const segments = [...state.clip.subtitleSegments];
        if (index < 0 || index >= segments.length) return state;

        const existing = segments[index];
        if (!existing) return state;
        segments[index] = { ...existing, text };

        return {
          clip: { ...state.clip, subtitleSegments: segments },
          isDirty: true,
        };
      }),

    setActiveSubtitleIndex: (index) => set({ activeSubtitleIndex: index }),

    // ── CTA ──────────────────────────────────────────────────

    setCta: (cta) =>
      set((state) => ({
        clip: { ...state.clip, cta },
        isDirty: true,
      })),

    // ── Playback ─────────────────────────────────────────────

    setCurrentTime: (time) => set({ currentTime: time }),

    setIsPlaying: (playing) => set({ isPlaying: playing }),

    // ── Persistence ──────────────────────────────────────────

    setIsSaving: (saving) => set({ isSaving: saving }),

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
      const { clip, originalClip } = get();
      return (
        clip.startTime !== originalClip.startTime ||
        clip.endTime !== originalClip.endTime ||
        clip.format !== originalClip.format ||
        JSON.stringify(clip.subtitleSegments) !==
          JSON.stringify(originalClip.subtitleSegments) ||
        JSON.stringify(clip.cta) !== JSON.stringify(originalClip.cta)
      );
    },
  }));
}

export type ClipEditorStore = ReturnType<typeof createClipEditorStore>;
