import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ClassRegister } from '@/features/attendance/components/ClassRegister';
import { lastSessionDate } from '@/features/attendance/service';
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
  // Today's register in one tap (13 Nov 2026, fewer steps): open it right here, on today's date.
  const [registerId, setRegisterId] = useState<string | null>(null);
  const today = lastSessionDate(null);
  const todayDow = new Date(`${today}T12:00:00Z`).getUTCDay();

  const thead = (
    <thead>
      <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <th className="px-4 py-2 text-start">{t('pages.admin.overview.col_time', 'Time')}</th>
        <th className="px-4 py-2 text-start">{t('pages.admin.overview.col_name', 'Class')}</th>
        <th className="px-4 py-2 text-start">{t('pages.admin.overview.col_location', 'Location')}</th>
        <th className="px-4 py-2 text-start">{t('pages.admin.overview.col_occupancy', 'Occupancy')}</th>
        <th className="px-4 py-2 text-start">{t('pages.admin.overview.col_waitlist', 'Waitlist')}</th>
        <th className="px-4 py-2 text-start">
          <span className="sr-only">{t('attendance.register.button')}</span>
        </th>
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
                {Array.from({ length: 6 }).map((__, j) => (
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
            <Fragment key={cls.id}>
              <ClassTableRow
                class={cls}
                onClick={onClassClick}
                showWaitlist
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={registerId === cls.id}
                    onClick={() => setRegisterId(registerId === cls.id ? null : cls.id)}
                  >
                    {t('attendance.register.button')}
                  </Button>
                }
              />
              {registerId === cls.id && (
                <tr className="border-b">
                  <td colSpan={6} className="px-4 py-3">
                    <ClassRegister
                      offeringId={cls.id}
                      className={cls.name}
                      dayOfWeek={todayDow}
                      isAdmin
                      initialDate={today}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
