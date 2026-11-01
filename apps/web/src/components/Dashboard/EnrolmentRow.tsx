import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { shortWeekdayName } from '@/lib/weekdayName';
import { EnrolmentStatusAction } from '@/features/enrolment/components/EnrolmentStatusAction';
import type { EngagementWithOffering } from './useParentPortal';

function formatSchedule(day: number | null, startTime: string | null, language: string): string {
  if (day == null && !startTime) return '';
  const dayLabel = day != null ? shortWeekdayName(day, language) : '';
  const timeLabel = startTime ? startTime.slice(0, 5) : '';
  if (dayLabel && timeLabel) return `${dayLabel} · ${timeLabel}`;
  return dayLabel || timeLabel;
}

export function EnrolmentRow({
  enrolment,
  highlighted,
}: {
  enrolment: EngagementWithOffering;
  highlighted?: boolean;
}) {
  const location = useLocation();
  const { i18n } = useTranslation();
  const schedule = formatSchedule(enrolment.classDay, enrolment.classStartTime, i18n.language);

  return (
    <li
      id={highlighted ? `portal-enrolment-${enrolment.id}` : undefined}
      className={[
        'flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0',
        highlighted ? 'rounded-md bg-green-50 ring-2 ring-green-400 px-2 -mx-2' : '',
      ].join(' ')}
    >
      <div>
        <p className="font-medium text-gray-900">{enrolment.className ?? enrolment.offering_id}</p>
        {schedule && <p className="text-sm text-gray-500">{schedule}</p>}
        {enrolment.classLocation && (
          <p className="text-sm text-gray-500">{enrolment.classLocation}</p>
        )}
      </div>
      <EnrolmentStatusAction
        status={enrolment.status}
        engagementId={enrolment.id}
        returnTo={location.pathname}
      />
    </li>
  );
}
