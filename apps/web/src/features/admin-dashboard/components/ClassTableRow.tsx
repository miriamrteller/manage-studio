import { useTranslation } from 'react-i18next';
import { OccupancyBar } from './OccupancyBar';
import type { AdminDashboardTodayClass } from '../types';

interface ClassTableRowProps {
  class: AdminDashboardTodayClass;
  onClick?: (classId: string) => void;
  /** Show waitlist badge when count > 0. Default: true */
  showWaitlist?: boolean;
  className?: string;
}

export const ClassTableRow = ({
  class: cls,
  onClick,
  showWaitlist = true,
  className = '',
}: ClassTableRowProps) => {
  const { t } = useTranslation();
  const handleClick = () => {
    onClick?.(cls.id);
  };

  // Display HH:MM (slice off seconds from HH:MM:SS Postgres time string)
  const displayTime = cls.start_time.slice(0, 5);

  return (
    <tr
      className={`border-b hover:bg-gray-50 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={handleClick}
    >
      <td className="px-4 py-3 text-sm font-medium">{displayTime}</td>
      <td className="px-4 py-3 text-sm">{cls.name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{cls.location ?? '—'}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span data-testid="enrolled-count" className="tabular-nums">
            {cls.enrolled_count}
          </span>
          <span className="text-gray-400">/</span>
          <span className="tabular-nums text-gray-600">{cls.max_capacity}</span>
          <OccupancyBar
            enrolled={cls.enrolled_count}
            capacity={cls.max_capacity}
            showPercentage={false}
            className="ml-1 w-16"
          />
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        {showWaitlist && cls.waitlist_count > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {t('pages.admin.overview.waitlist_count', { count: cls.waitlist_count })}
          </span>
        )}
      </td>
    </tr>
  );
};
