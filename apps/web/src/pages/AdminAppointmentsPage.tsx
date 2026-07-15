import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { Button } from '@/components/ui/button';
import { AppointmentsService, type AppointmentRow } from '@/features/scheduling/appointmentsService';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending_payment: 'bg-amber-100 text-amber-800',
  pending_waiver: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

function isSyncableAppointment(status: string): boolean {
  return status === 'active' || status === 'pending_waiver';
}

function calendarButtonTitle(
  row: AppointmentRow,
  connected: boolean,
  t: (key: string) => string,
): string | undefined {
  if (!connected) return t('scheduling.appointments.google_calendar_not_connected');
  if (row.google_event_id) return t('scheduling.appointments.already_in_google_calendar');
  if (!isSyncableAppointment(row.status)) {
    return t('scheduling.appointments.google_calendar_status_required');
  }
  return undefined;
}

export default function AdminAppointmentsPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { hasFeature, isLoading: gateLoading } = useFeatureGate();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const canView = hasFeature(FEATURES.scheduling.clientBooking) || hasFeature(FEATURES.scheduling.adminBooking);
  const googleCalendarEnabled = hasFeature(FEATURES.scheduling.googleCalendar);

  const { data: rows = [] } = useQuery<AppointmentRow[]>({
    queryKey: ['appointments', tenant?.id],
    queryFn: () => AppointmentsService.list(tenant as never),
    enabled: !!tenant?.id && canView,
  });

  const { data: googleConnection } = useQuery({
    queryKey: ['googleCalendarConnection'],
    queryFn: () => GoogleCalendarService.getConnection(),
    enabled: googleCalendarEnabled,
  });

  const googleCalendarConnected = Boolean(googleConnection?.connected);

  async function cancel(id: string) {
    if (!tenant?.id) return;
    if (!window.confirm(t('scheduling.appointments.cancel') + '?')) return;
    await AppointmentsService.cancel(tenant as never, id);
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
  }

  async function addToGoogleCalendar(row: AppointmentRow) {
    if (!googleCalendarConnected || row.google_event_id) return;
    setSyncingId(row.id);
    try {
      await GoogleCalendarService.syncAppointment(row.id, 'insert');
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingId(null);
    }
  }

  function canAddToGoogleCalendar(row: AppointmentRow): boolean {
    return googleCalendarConnected && isSyncableAppointment(row.status) && !row.google_event_id;
  }

  if (!gateLoading && !canView) {
    return (
      <div className="max-w-4xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{t('scheduling.appointments.title')}</h1>
        <p className="text-gray-600">{t('scheduling.booking.not_available')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 p-2">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('scheduling.appointments.title')}</h1>
        <p className="text-gray-600">{t('scheduling.appointments.subtitle')}</p>
      </header>

      {rows.length === 0 ? (
        <p className="text-gray-500">{t('scheduling.appointments.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-start text-gray-500">
                <th className="p-2 text-start">{t('scheduling.appointments.when')}</th>
                <th className="p-2 text-start">{t('scheduling.appointments.service')}</th>
                <th className="p-2 text-start">{t('scheduling.appointments.client')}</th>
                <th className="p-2 text-start">{t('scheduling.appointments.status')}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="p-2">
                    {formatAppointmentWhen(row.booked_starts_at, i18n.language)}
                  </td>
                  <td className="p-2">{row.offering_name ?? '—'}</td>
                  <td className="p-2">
                    <div>{row.client_name ?? '—'}</div>
                    <div className="text-gray-500">{row.client_email}</div>
                  </td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t(`scheduling.appointments.status_${row.status}`, { defaultValue: row.status })}
                    </span>
                  </td>
                  <td className="p-2 text-end">
                    <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                      {googleCalendarEnabled && row.status !== 'cancelled' && (
                        row.google_event_id ? (
                          <span
                            className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-800"
                            title={calendarButtonTitle(row, googleCalendarConnected, t)}
                          >
                            {t('scheduling.appointments.added_to_google_calendar')}
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={syncingId === row.id}
                            disabled={!canAddToGoogleCalendar(row)}
                            title={calendarButtonTitle(row, googleCalendarConnected, t)}
                            onClick={() => addToGoogleCalendar(row)}
                          >
                            {t('scheduling.appointments.add_to_google_calendar')}
                          </Button>
                        )
                      )}
                      {row.status !== 'cancelled' && (
                        <Button variant="ghost" size="sm" onClick={() => cancel(row.id)}>
                          {t('scheduling.appointments.cancel')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
