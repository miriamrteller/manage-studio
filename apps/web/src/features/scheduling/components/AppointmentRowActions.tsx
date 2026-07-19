import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { AppointmentRow } from '@/features/scheduling/appointmentsService';
import type { AppointmentCloseAction } from '@/features/scheduling/lib/resolveAppointmentPenalty';

interface Props {
  row: AppointmentRow;
  penaltiesEnabled: boolean;
  googleCalendarEnabled: boolean;
  canAddToGoogleCalendar: boolean;
  calendarTitle?: string;
  closingId: string | null;
  syncingId: string | null;
  onClose: (row: AppointmentRow, action: AppointmentCloseAction) => void;
  onAddToGoogle: (row: AppointmentRow) => void;
}

export function AppointmentRowActions({
  row,
  penaltiesEnabled,
  googleCalendarEnabled,
  canAddToGoogleCalendar,
  calendarTitle,
  closingId,
  syncingId,
  onClose,
  onAddToGoogle,
}: Props) {
  const { t } = useTranslation();
  if (row.status === 'cancelled') return null;

  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
      {googleCalendarEnabled &&
        (row.google_event_id ? (
          <span
            className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-800"
            title={calendarTitle}
          >
            {t('scheduling.appointments.added_to_google_calendar')}
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            isLoading={syncingId === row.id}
            disabled={!canAddToGoogleCalendar}
            title={calendarTitle}
            onClick={() => onAddToGoogle(row)}
          >
            {t('scheduling.appointments.add_to_google_calendar')}
          </Button>
        ))}
      {penaltiesEnabled && (
        <Button
          variant="ghost"
          size="sm"
          isLoading={closingId === row.id}
          onClick={() => onClose(row, 'no_show')}
        >
          {t('scheduling.appointments.mark_no_show')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        isLoading={closingId === row.id}
        onClick={() => onClose(row, 'cancel')}
      >
        {t('scheduling.appointments.cancel')}
      </Button>
    </div>
  );
}
