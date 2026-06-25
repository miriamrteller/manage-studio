import { useTranslation } from 'react-i18next';
import { ClassTableRow } from './ClassTableRow';
import type { AdminDashboardTodayClass } from '../types';

interface TodaysClassesTableProps {
  classes: AdminDashboardTodayClass[];
  isLoading: boolean;
  onClassClick?: (classId: string) => void;
  className?: string;
}

export const TodaysClassesTable = ({
  classes,
  isLoading,
  onClassClick,
  className = '',
}: TodaysClassesTableProps) => {
  const { t } = useTranslation();

  const thead = (
    <thead>
      <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <th className="px-4 py-2 text-left">{t('pages.admin.overview.col_time', 'Time')}</th>
        <th className="px-4 py-2 text-left">{t('pages.admin.overview.col_name', 'Class')}</th>
        <th className="px-4 py-2 text-left">{t('pages.admin.overview.col_location', 'Location')}</th>
        <th className="px-4 py-2 text-left">{t('pages.admin.overview.col_occupancy', 'Occupancy')}</th>
        <th className="px-4 py-2 text-left">{t('pages.admin.overview.col_waitlist', 'Waitlist')}</th>
      </tr>
    </thead>
  );

  if (isLoading) {
    return (
      <div className={className}>
        <table className="w-full border-collapse">
          {thead}
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} data-testid="skeleton" className="border-b">
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-gray-200" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className={`rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-gray-500 ${className}`}>
        {t('pages.admin.overview.no_classes_today')}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-gray-200 ${className}`}>
      <table className="w-full border-collapse">
        {thead}
        <tbody>
          {classes.map((cls) => (
            <ClassTableRow
              key={cls.id}
              class={cls}
              onClick={onClassClick}
              showWaitlist
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
