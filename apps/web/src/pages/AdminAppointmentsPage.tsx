import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { personPagePath } from '@/features/people/lib/personPagePath';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useHasFeature } from '@/hooks/useHasFeature';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useLeads } from '@/features/crm/hooks/useLeads';
import { isShootRequest } from '@/features/crm/components/LeadsList';
import { BlockedTimesEditor } from '@/features/scheduling/components/BlockedTimesEditor';
import { GoogleCalendarSettings } from '@/features/scheduling/components/GoogleCalendarSettings';
import { BookingHoursSection } from '@/features/scheduling/components/BookingHoursSection';
import { BookForClientPanel } from '@/features/scheduling/components/BookForClientPanel';
import { AppointmentsService, type AppointmentRow } from '@/features/scheduling/appointmentsService';
import { BookingSettingsService } from '@/features/scheduling/bookingSettingsService';
import { AppointmentRowActions } from '@/features/scheduling/components/AppointmentRowActions';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import { GoogleCalendarService } from '@/features/scheduling/googleCalendarService';
import type { AppointmentCloseAction } from '@/features/scheduling/lib/resolveAppointmentPenalty';
import { Button } from '@/components/ui/button';
import { RecordPaymentModal } from '@/features/finance/components/RecordPaymentModal';

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

/**
 * Bookings → Diary (owner, 13 Nov 2026): everything with a date on one page. Requests waiting to
 * be confirmed, what is coming up (shoots and appointments), days off and Google Calendar, and,
 * for Appointments businesses only, the booking hours folded at the bottom.
 */
export default function AdminAppointmentsPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { hasFeature, hasAnyFeature, isLoading: gateLoading } = useHasFeature();
  const { profile, vertical } = useEntityLabels();
  const { leads } = useLeads();
  const [closingId, setClosingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  // "Record a payment" on a booking waiting for payment (paid directly: cash / transfer / Bit).
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // The same check as the Diary tab in the menu (navigationConfig), so it never dead-ends.
  const canView = hasAnyFeature([
    FEATURES.billing.quotes,
    FEATURES.scheduling.clientBooking,
    FEATURES.scheduling.adminBooking,
  ]);
  // Booking hours only for Appointments businesses (clients pick a time slot).
  const showHours = profile.clientBooking && vertical !== 'photographer';
  const googleCalendarEnabled = hasFeature(FEATURES.scheduling.googleCalendar);
  const penaltiesEnabled = hasFeature(FEATURES.scheduling.penalties);

  const { data: rows = [] } = useQuery<AppointmentRow[]>({
    queryKey: ['appointments', tenant?.id],
    queryFn: () => AppointmentsService.list(tenant as never),
    enabled: !!tenant?.id && canView,
  });

  const requests = leads.filter((lead) => isShootRequest(lead) && lead.stage !== 'lost');
  // Coming up: from today on, soonest first. Past: newest first (as listed), folded.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isUpcoming = (row: AppointmentRow) => new Date(row.booked_starts_at) >= startOfToday;
  const upcoming = rows
    .filter(isUpcoming)
    .sort((a, b) => a.booked_starts_at.localeCompare(b.booked_starts_at));
  const past = rows.filter((row) => !isUpcoming(row));

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
    // Reached only by an old link: the Diary tab is hidden for this studio.
    return (
      <div className="max-w-4xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{t('scheduling.diary.title')}</h1>
        <p className="text-gray-600">{t('scheduling.diary.not_used')}</p>
      </div>
    );
  }

  const dayFormat = new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Jerusalem',
  });

  function renderRows(list: AppointmentRow[]) {
    return (
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
            {list.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-gray-100">
                  <td className="p-2">
                    {formatAppointmentWhen(row.booked_starts_at, i18n.language)}
                  </td>
                  <td className="p-2">{row.offering_name ?? '—'}</td>
                  <td className="p-2">
                    <div>
                      {row.person_id && row.client_name ? (
                        <Link to={personPagePath(row.person_id)} className="underline">
                          {row.client_name}
                        </Link>
                      ) : (
                        (row.client_name ?? '—')
                      )}
                    </div>
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
                    {row.status === 'pending_payment' && recordingId !== row.id && (
                      <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => setRecordingId(row.id)}>
                        {t('finance.record_payment.open')}
                      </Button>
                    )}
                  </td>
                </tr>
                {recordingId === row.id && (
                  <tr className="border-b border-gray-100">
                    <td colSpan={5} className="p-2">
                      <RecordPaymentModal
                        engagementId={row.id}
                        defaultAmountMinor={row.price_minor ?? undefined}
                        currency={row.currency ?? tenant?.currency ?? 'ILS'}
                        onRecorded={() => {
                          setRecordingId(null);
                          void queryClient.invalidateQueries({ queryKey: ['appointments'] });
                        }}
                      />
                      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setRecordingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 p-2">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('scheduling.diary.title')}</h1>
        <p className="text-gray-600">{t('scheduling.diary.subtitle')}</p>
      </header>

      {showHours && (
        <BookForClientPanel onBooked={() => void queryClient.invalidateQueries({ queryKey: ['appointments'] })} />
      )}

      {requests.length > 0 && (
        <section className="space-y-3" aria-labelledby="diary-requests">
          <h2 id="diary-requests" className="text-lg font-semibold">
            {t('scheduling.diary.requests_title')}
          </h2>
          <ul className="space-y-2">
            {requests.map((lead) => (
              <li
                key={lead.id}
                className="card flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 p-3"
              >
                <span className="text-sm">
                  <span className="font-medium">
                    {lead.event_date ? dayFormat.format(new Date(`${lead.event_date}T12:00:00Z`)) : ''}
                  </span>
                  {' · '}
                  {lead.name}
                </span>
                <Link
                  to={`/admin/leads?lead=${lead.id}&confirm=1`}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  {t('scheduling.diary.confirm')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="diary-upcoming">
        <h2 id="diary-upcoming" className="text-lg font-semibold">
          {t('scheduling.diary.upcoming_title')}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-gray-500">{t('scheduling.diary.none_upcoming')}</p>
        ) : (
          renderRows(upcoming)
        )}
      </section>

      {past.length > 0 && (
        <details className="rounded-md border border-gray-200 p-4">
          <summary className="cursor-pointer font-medium">
            {t('scheduling.diary.past_title', { count: past.length })}
          </summary>
          <div className="mt-4">{renderRows(past)}</div>
        </details>
      )}

      {tenant?.id && <BlockedTimesEditor tenant={tenant as never} />}

      <GoogleCalendarSettings />

      {showHours && (
        <details className="rounded-md border border-gray-200 p-4">
          <summary className="cursor-pointer font-medium">{t('scheduling.diary.hours_title')}</summary>
          <p className="mt-2 text-sm text-gray-500">{t('scheduling.diary.hours_hint')}</p>
          <div className="mt-4 space-y-8">
            <BookingHoursSection />
          </div>
        </details>
      )}
    </div>
  );
}
