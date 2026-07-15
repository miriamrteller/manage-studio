import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  buildGoogleCalendarEventUrl,
  downloadIcsEvent,
  type CalendarEventInput,
} from '@/features/scheduling/lib/calendarLinks';

interface AddToCalendarActionsProps {
  event: CalendarEventInput;
}

/** Guest-safe: opens Google Calendar or downloads .ics — no tenant OAuth required. */
export function AddToCalendarActions({ event }: AddToCalendarActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          window.open(buildGoogleCalendarEventUrl(event), '_blank', 'noopener,noreferrer');
        }}
      >
        {t('scheduling.booking.add_to_google_calendar')}
      </Button>
      <Button
        variant="ghost"
        className="w-full text-sm"
        onClick={() => downloadIcsEvent(event)}
      >
        {t('scheduling.booking.download_calendar_file')}
      </Button>
    </div>
  );
}
