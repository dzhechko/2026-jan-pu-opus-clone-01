export type ClipStatus = 'pending' | 'rendering' | 'ready' | 'published' | 'failed';

export type ClipFormat = '9:16' | '1:1' | '16:9';

export type ViralityScore = {
  total: number;
  hook: number;
  engagement: number;
  flow: number;
  trend: number;
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
  url: string | null;
  position: 'end' | 'overlay';
  duration: number;
};
