import { calcOccupancyPercent } from '../types';

interface OccupancyBarProps {
  enrolled: number;
  capacity: number;
  /** Bar height in px. Default: 8 */
  height?: number;
  /** Show percentage label next to the bar. Default: true */
  showPercentage?: boolean;
  className?: string;
}

/**
 * Visual occupancy indicator.
 * Colour: green <70%, amber 70–89%, red ≥90%.
 * Display is capped at 100% even if enrolled > capacity.
 */
export const OccupancyBar = ({
  enrolled,
  capacity,
  height = 8,
  showPercentage = true,
  className = '',
}: OccupancyBarProps) => {
  const pct = calcOccupancyPercent(enrolled, capacity);

  let colorClass = 'bg-green-500';
  if (pct >= 90) {
    colorClass = 'bg-red-500';
  } else if (pct >= 70) {
    colorClass = 'bg-amber-500';
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex-1 rounded-full bg-gray-200 overflow-hidden"
        style={{ height }}
        data-testid="occupancy-bar"
      >
        <div
          className={`h-full transition-all ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showPercentage && (
        <span className="text-sm font-medium tabular-nums" data-testid="occupancy-percent">
          {pct}%
        </span>
      )}
    </div>
  );
};
