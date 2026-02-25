export type VideoStatus =
  | 'uploading'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'generating_clips'
  | 'completed'
  | 'failed';

export type VideoSourceType = 'upload' | 'url';

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  confidence: number;
};
