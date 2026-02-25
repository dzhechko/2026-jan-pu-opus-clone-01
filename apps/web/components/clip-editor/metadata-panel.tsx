'use client';

import type { ClipFormat, CTA, ViralityScore } from '@clipmaker/types';

type MetadataPanelProps = {
  title: string;
  description: string | null;
  format: ClipFormat;
  cta: CTA | null;
  viralityScore: ViralityScore;
  disabled: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onFormatChange: (format: ClipFormat) => void;
  onCtaChange: (cta: CTA | null) => void;
};

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1000;
const CTA_MAX_LENGTH = 100;

const FORMAT_OPTIONS: { value: ClipFormat; icon: string; dimensions: string }[] =
  [
    { value: 'portrait', icon: '9:16', dimensions: '1080x1920' },
    { value: 'square', icon: '1:1', dimensions: '1080x1080' },
    { value: 'landscape', icon: '16:9', dimensions: '1920x1080' },
  ];

export function MetadataPanel({
  title,
  description,
  format,
  cta,
  viralityScore,
  disabled,
  onTitleChange,
  onDescriptionChange,
  onFormatChange,
  onCtaChange,
}: MetadataPanelProps) {
  const handleCtaTextChange = (text: string) => {
    if (text === '') {
      onCtaChange(null);
      return;
    }
    onCtaChange({
      text,
      position: cta?.position ?? 'end',
      duration: cta?.duration ?? 5,
    });
  };

  const handleCtaPositionChange = (position: 'end' | 'overlay') => {
    if (!cta) return;
    onCtaChange({ ...cta, position });
  };

  const handleCtaDurationChange = (duration: number) => {
    if (!cta) return;
    onCtaChange({ ...cta, duration });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-foreground">
          Заголовок
        </label>
        <div className="relative">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={disabled}
            maxLength={TITLE_MAX_LENGTH}
            className="
              w-full px-3 py-2 pr-16 text-sm rounded border border-border
              bg-background text-foreground
              focus:outline-none focus:ring-1 focus:ring-primary
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {title.length}/{TITLE_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-foreground">
          Описание
        </label>
        <div className="relative">
          <textarea
            value={description ?? ''}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={disabled}
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={3}
            className="
              w-full px-3 py-2 pb-6 text-sm rounded border border-border
              bg-background text-foreground resize-none
              focus:outline-none focus:ring-1 focus:ring-primary
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            placeholder="Описание клипа..."
          />
          <span className="absolute right-2 bottom-2 text-xs text-muted-foreground">
            {(description ?? '').length}/{DESCRIPTION_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* Format Selector */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">Формат</span>
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onFormatChange(option.value)}
              disabled={disabled}
              className={`
                flex flex-col items-center gap-1 p-2 rounded border text-xs
                transition-colors
                ${
                  format === option.value
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <div
                className={`
                  border-2 rounded-sm
                  ${format === option.value ? 'border-primary' : 'border-muted-foreground/50'}
                `}
                style={{
                  width:
                    option.value === 'landscape'
                      ? 32
                      : option.value === 'square'
                        ? 24
                        : 18,
                  height:
                    option.value === 'portrait'
                      ? 32
                      : option.value === 'square'
                        ? 24
                        : 18,
                }}
              />
              <span>{option.icon}</span>
              <span>{option.dimensions}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CTA Editor */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">
          Призыв к действию (CTA)
        </span>

        <div className="relative">
          <input
            type="text"
            value={cta?.text ?? ''}
            onChange={(e) => handleCtaTextChange(e.target.value)}
            disabled={disabled}
            maxLength={CTA_MAX_LENGTH}
            className="
              w-full px-3 py-2 pr-16 text-sm rounded border border-border
              bg-background text-foreground
              focus:outline-none focus:ring-1 focus:ring-primary
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            placeholder="Например: Записаться на курс"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {(cta?.text ?? '').length}/{CTA_MAX_LENGTH}
          </span>
        </div>

        {!cta && (
          <p className="text-xs text-muted-foreground">CTA не задан</p>
        )}

        {cta && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => handleCtaPositionChange('end')}
                disabled={disabled}
                className={`
                  flex-1 py-1.5 text-xs rounded border transition-colors
                  ${
                    cta.position === 'end'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                В конце
              </button>
              <button
                onClick={() => handleCtaPositionChange('overlay')}
                disabled={disabled}
                className={`
                  flex-1 py-1.5 text-xs rounded border transition-colors
                  ${
                    cta.position === 'overlay'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                Наложение
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                Длительность:
              </label>
              <input
                type="range"
                min={3}
                max={10}
                step={1}
                value={cta.duration}
                onChange={(e) =>
                  handleCtaDurationChange(Number(e.target.value))
                }
                disabled={disabled}
                className="flex-1"
              />
              <span className="text-xs text-foreground font-mono w-8 text-right">
                {cta.duration} с
              </span>
            </div>
          </>
        )}
      </div>

      {/* Virality Score (read-only) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">
          Вирусность: {viralityScore.total}/100
        </span>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <ScoreRow label="Хук" value={viralityScore.hook} />
          <ScoreRow label="Вовлечённость" value={viralityScore.engagement} />
          <ScoreRow label="Динамика" value={viralityScore.flow} />
          <ScoreRow label="Тренд" value={viralityScore.trend} />
        </div>

        {viralityScore.tips.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1">
            <span className="text-xs font-medium text-muted-foreground">
              Советы:
            </span>
            <ul className="list-disc list-inside text-xs text-muted-foreground">
              {viralityScore.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="font-mono text-foreground w-6 text-right">
          {value}
        </span>
      </div>
    </div>
  );
}
