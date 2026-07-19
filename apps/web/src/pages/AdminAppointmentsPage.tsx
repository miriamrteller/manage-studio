import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { AppointmentsService, type AppointmentRow } from '@/features/scheduling/appointmentsService';
import { BookingSettingsService } from '@/features/scheduling/bookingSettingsService';
import { AppointmentRowActions } from '@/features/scheduling/components/AppointmentRowActions';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';
import type { AppointmentCloseAction } from '@/features/scheduling/lib/resolveAppointmentPenalty';

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
  const [closingId, setClosingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const canView =
    hasFeature(FEATURES.scheduling.clientBooking) || hasFeature(FEATURES.scheduling.adminBooking);
  const googleCalendarEnabled = hasFeature(FEATURES.scheduling.googleCalendar);
  const penaltiesEnabled = hasFeature(FEATURES.scheduling.penalties);

  const { data: rows = [] } = useQuery<AppointmentRow[]>({
    queryKey: ['appointments', tenant?.id],
    queryFn: () => AppointmentsService.list(tenant as never),
    enabled: !!tenant?.id && canView,
  });

  const { data: bookingSettings } = useQuery({
    queryKey: ['bookingSettings', tenant?.id],
    queryFn: () => BookingSettingsService.getSettings(tenant as never),
    enabled: !!tenant?.id && penaltiesEnabled,
  });

  const { data: googleConnection } = useQuery({
    queryKey: ['googleCalendarConnection'],
    queryFn: () => GoogleCalendarService.getConnection(),
    enabled: googleCalendarEnabled,
  });

  const googleCalendarConnected = Boolean(googleConnection?.connected);

  async function closeAppointment(row: AppointmentRow, action: AppointmentCloseAction) {
    if (!tenant?.id) return;
    const label =
      action === 'no_show'
        ? t('scheduling.appointments.mark_no_show')
        : t('scheduling.appointments.cancel');
    if (!window.confirm(`${label}?`)) return;
    setClosingId(row.id);
    try {
      await AppointmentsService.close(tenant as never, row, action, {
        penaltiesEnabled,
        settings: bookingSettings ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    } finally {
      setClosingId(null);
    }
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {t(`scheduling.appointments.status_${row.status}`, {
                        defaultValue: row.status,
                      })}
                    </span>
                    {row.status === 'cancelled' && row.cancellation_reason && (
                      <div className="mt-1 text-xs text-gray-500">
                        {t(`scheduling.appointments.reason_${row.cancellation_reason}`, {
                          defaultValue: row.cancellation_reason,
                        })}
                        {row.penalty_applied_at
                          ? ` · ${t('scheduling.appointments.payment_retained')}`
                          : ''}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-end">
                    <AppointmentRowActions
                      row={row}
                      penaltiesEnabled={penaltiesEnabled}
                      googleCalendarEnabled={googleCalendarEnabled}
                      canAddToGoogleCalendar={
                        googleCalendarConnected &&
                        isSyncableAppointment(row.status) &&
                        !row.google_event_id
                      }
                      calendarTitle={calendarButtonTitle(row, googleCalendarConnected, t)}
                      closingId={closingId}
                      syncingId={syncingId}
                      onClose={closeAppointment}
                      onAddToGoogle={addToGoogleCalendar}
                    />
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
