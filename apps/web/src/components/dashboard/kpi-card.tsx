import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNIS, formatNumber, formatPercent } from '@/utils/formatters';

export type KPIFormat = 'currency' | 'number' | 'percent';
export type KPITrend = 'up' | 'down' | 'stable';

export interface KPICardProps {
  title: string;
  /**
   * The raw metric. For `format: 'currency'` this is a major-unit NIS amount
   * (1200 -> ₪1,200); for `format: 'percent'` it is a percentage, not a ratio
   * (87.5 -> 87.5%), which is how occupancy/attendance rates are normally held.
   */
  value: number;
  /** Comparison basis. When supplied, the delta is computed and announced. */
  previousValue?: number;
  format: KPIFormat;
  /** Override the derived trend (e.g. when lower is better). */
  trend?: KPITrend;
  /** True when a *decrease* is the good outcome — cancellations, no-shows. */
  invertTrendColor?: boolean;
  subtitle?: string;
  /** Any icon component; rendered decoratively. */
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  loading?: boolean;
  className?: string;
}

/** Plain glyphs, not emoji: emoji get announced by name by screen readers. */
const TREND_GLYPH: Record<KPITrend, string> = {
  up: '↗',
  down: '↘',
  stable: '→',
};

const TREND_WORD: Record<KPITrend, string> = {
  up: 'increase',
  down: 'decrease',
  stable: 'no change',
};

/**
 * kpi-card: a single headline metric with an optional period-over-period delta.
 *
 * Design system
 * - `--surface-raised` on `--border-subtle`, `elevation-1` at rest, and a
 *   `--state-hover` wash on hover; focus is delegated to whatever the caller
 *   wraps the card in (the card itself is not a control).
 * - Trend colour is `--color-success` / `--color-error` / `--color-text-secondary`.
 *   `invertTrendColor` exists because "down" is good for metrics like
 *   cancellations, and colour must reflect *sentiment*, not arithmetic.
 * - Colour is never the only signal: the glyph and the sr-only text carry the
 *   same information, which keeps the card readable for colour-blind users.
 *
 * RTL
 * - The trend glyph carries `.icon-directional`, so it mirrors under
 *   `[dir='rtl']` (↗ reads as ↖) and keeps pointing "forward in time".
 * - The figure itself uses `.numeric-cell` (tabular numerals +
 *   `unicode-bidi: plaintext`), so a NIS amount stays internally LTR inside an
 *   otherwise RTL card — the Israeli convention.
 *
 * Accessibility
 * - Reading order is deliberate: title, then value, then trend, then subtitle.
 *   Each is a separate node, and the delta has an sr-only gloss
 *   ("12% increase compared with the previous period") so the arrow is never
 *   the only cue.
 * - Loading renders the Skeleton primitive, which is a polite live region and
 *   respects `prefers-reduced-motion`.
 */
export function KPICard({
  title,
  value,
  previousValue,
  format,
  trend,
  invertTrendColor = false,
  subtitle,
  icon: Icon,
  loading = false,
  className = '',
}: KPICardProps) {
  const formattedValue = useMemo(() => {
    if (format === 'currency') return formatNIS(value);
    if (format === 'percent') return formatPercent(value, { alreadyPercent: true });
    return formatNumber(value);
  }, [format, value]);

  const delta = useMemo(() => {
    if (previousValue === undefined || previousValue === 0) return null;
    const ratio = (value - previousValue) / Math.abs(previousValue);
    return {
      ratio,
      // formatPercent takes a ratio, so the raw ratio is passed straight in.
      label: formatPercent(Math.abs(ratio), { maximumFractionDigits: 1 }),
    };
  }, [previousValue, value]);

  const effectiveTrend: KPITrend | null = useMemo(() => {
    if (trend) return trend;
    if (!delta) return null;
    if (Math.abs(delta.ratio) < 0.0001) return 'stable';
    return delta.ratio > 0 ? 'up' : 'down';
  }, [trend, delta]);

  const trendColor = useMemo(() => {
    if (!effectiveTrend || effectiveTrend === 'stable') return 'text-[var(--color-text-secondary)]';
    const isGood = invertTrendColor ? effectiveTrend === 'down' : effectiveTrend === 'up';
    return isGood ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]';
  }, [effectiveTrend, invertTrendColor]);

  return (
    <div
      className={cn(
        'elevation-1 rounded-lg border border-[var(--border-subtle)]',
        'bg-[var(--surface-raised)] p-4 md:p-6',
        'motion-safe hover:bg-[var(--state-hover)]',
        className,
      )}
    >
      {/* Mobile stacks so the figure gets full width; desktop sits side by side. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="flex-shrink-0 text-[var(--color-text-secondary)]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )}
          <h3 className="text-body-sm min-w-0 truncate font-medium text-[var(--color-text-secondary)]">
            {title}
          </h3>
        </div>

        {effectiveTrend && (
          <p className={cn('text-body-sm flex flex-shrink-0 items-center gap-1', trendColor)}>
            <span className="icon-directional inline-block" aria-hidden="true">
              {TREND_GLYPH[effectiveTrend]}
            </span>
            {delta && <span className="numeric-cell">{delta.label}</span>}
            <span className="sr-only">
              {TREND_WORD[effectiveTrend]}
              {delta ? ` of ${delta.label}` : ''} compared with the previous period
            </span>
          </p>
        )}
      </div>

      <div className="mt-2">
        {loading ? (
          <Skeleton variant="text" width="60%" height="2.25rem" label={`Loading ${title}`} />
        ) : (
          <p className="numeric-cell text-h2 font-semibold text-[var(--color-text-primary)]">
            {formattedValue}
          </p>
        )}
      </div>

      {subtitle && !loading && (
        <p className="text-caption mt-1 text-[var(--color-text-secondary)]">{subtitle}</p>
      )}
    </div>
  );
}

export default KPICard;
