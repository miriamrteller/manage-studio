import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  exportHolidayIcal,
  exportHolidayList,
  exportScheduleIcal,
} from '@/features/scheduling/lib/exportSchedule';
import type { ScheduleEvent } from '@/features/scheduling/types';

interface ScheduleExportProps {
  /** Holiday-filtered timetable events currently in view. */
  events: ScheduleEvent[];
  /** Range the exports cover — normally the visible calendar window or term. */
  range: { start: Date; end: Date };
  /** Tenant subdomain, used for file names. */
  tenantSlug: string;
  /** Optional calendar name written into the .ics file. */
  calendarName?: string;
}

/**
 * Download buttons for the admin schedule toolbar (DL-HOLIDAY-001, spec §8).
 * Labels are inlined per language so no new i18n keys are required; RTL is handled
 * by the surrounding layout (`flex-wrap` + logical margins).
 *
 * PDF export is intentionally absent — it needs `@react-pdf/renderer`, which is a
 * dependency-approval gate (spec §12.7). See exportSchedule.ts.
 */
export function ScheduleExport({ events, range, tenantSlug, calendarName }: ScheduleExportProps) {
  const { i18n } = useTranslation();
  const he = i18n.language?.startsWith('he') ?? false;

  const labels = he
    ? {
        schedule: 'הורדת לוח זמנים (iCal)',
        holidaysCsv: 'הורדת תאריכי חגים (CSV)',
        holidaysIcal: 'הורדת חגים ליומן (iCal)',
        note: 'חגים אינם כלולים בלוח הזמנים',
      }
    : {
        schedule: 'Download schedule (iCal)',
        holidaysCsv: 'Download holiday dates (CSV)',
        holidaysIcal: 'Download holidays (iCal)',
        note: 'Holidays excluded from the schedule',
      };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => exportScheduleIcal(events, tenantSlug, calendarName ?? 'Schedule')}
        >
          {labels.schedule}
        </Button>
        <Button variant="outline" onClick={() => exportHolidayList(range.start, range.end, tenantSlug)}>
          {labels.holidaysCsv}
        </Button>
        <Button
          variant="ghost"
          className="text-sm"
          onClick={() => exportHolidayIcal(range.start, range.end, tenantSlug)}
        >
          {labels.holidaysIcal}
        </Button>
      </div>
      <p className="text-xs text-gray-500">{labels.note}</p>
    </div>
  );
}
