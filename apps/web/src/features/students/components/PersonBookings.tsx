import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { AppointmentsService } from '@/features/scheduling/appointmentsService';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';

/**
 * A person's bookings (appointments), newest first, each linking to the calendar.
 * `excludeIds`: engagements shown elsewhere on the page (their projects), so nothing shows twice.
 */
export function PersonBookings({ personId, excludeIds }: { personId: string; excludeIds?: ReadonlySet<string> }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ['person-bookings', tenant?.id, personId],
    queryFn: () => AppointmentsService.list(tenant as never, personId),
    enabled: !!tenant?.id,
  });
  const rows = excludeIds ? allRows.filter((row) => !excludeIds.has(row.id)) : allRows;

  return (
    <section className="space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">{t('pages.people.bookings_section')}</h3>
        <Link to="/admin/bookings/diary" className="text-sm underline">
          {t('pages.people.open_calendar')}
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">{t('pages.people.no_bookings')}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between gap-2 py-1.5">
              <span>{formatAppointmentWhen(row.booked_starts_at, i18n.language)}</span>
              <span className="text-gray-600">{row.offering_name ?? '—'}</span>
              <span className="text-gray-500">
                {t(`scheduling.appointments.status_${row.status}`, { defaultValue: row.status })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
