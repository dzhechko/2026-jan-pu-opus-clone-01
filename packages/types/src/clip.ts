export type ClipStatus = 'pending' | 'rendering' | 'ready' | 'published' | 'failed';

export type ClipFormat = 'portrait' | 'square' | 'landscape';

export const CLIP_FORMAT_RATIO: Record<ClipFormat, string> = {
  portrait: '9:16',
  square: '1:1',
  landscape: '16:9',
};

export type ViralityScore = {
  total: number;
  hook: number;
  engagement: number;
  flow: number;
  trend: number;
  tips: string[];
};

export type SubtitleSegment = {
  start: number;
  end: number;
  text: string;
  style?: SubtitleStyle;
};

export type SubtitleStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  bold?: boolean;
  shadow?: boolean;
};

export type CTA = {
  text: string;
  position: 'end' | 'overlay';
  duration: number;
};

export type ClipWithPublications = {
  id: string;
  videoId: string;
  userId: string;
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  duration: number;
  viralityScore: ViralityScore | null;
  format: ClipFormat;
  subtitleSegments: SubtitleSegment[];
  cta: CTA | null;
  status: ClipStatus;
  createdAt: Date;
  updatedAt: Date;
  publications: Array<{
    id: string;
    platform: string;
    status: string;
  }>;
};
