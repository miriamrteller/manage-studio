import { EnrolmentStatusAction } from '@/features/enrolment/components/EnrolmentStatusAction';
import type { EngagementWithOffering } from './useParentPortal';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatSchedule(day: number | null, startTime: string | null): string {
  if (day == null && !startTime) return '';
  const dayLabel = day != null ? DAY_NAMES[day] : '';
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
  const schedule = formatSchedule(enrolment.classDay, enrolment.classStartTime);

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
        returnTo="/dashboard/portal"
      />
    </li>
  );
}
