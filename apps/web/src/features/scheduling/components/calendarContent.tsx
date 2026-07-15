import type { DayCellContentArg, DayHeaderContentArg } from '@fullcalendar/core';
import { getDayShade } from '../lib/holidayShading';

// Hebrew (Jewish) calendar formatters. Reused across renders; created once.
const hebrewDayFmt = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric' });
const hebrewDayMonthFmt = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' });

/** Shabbat is always labelled in Hebrew, regardless of the active UI language. */
const SHABBAT_LABEL = 'שבת';

/**
 * Month day cell: show the Gregorian day number with the Hebrew calendar day
 * beneath it. Defined at module scope so the reference is stable (an unstable
 * content callback makes FullCalendar reprocess options on every render).
 */
/**
 * Builds the month day-cell renderer for the active language: Gregorian day number,
 * Hebrew calendar day, and (for Shabbat/holidays/eves) the holiday name — Hebrew
 * always, plus English when the UI language is English. Returned as a factory so
 * the callback is stable for a given language.
 */
export function makeDayCellContent(language: string) {
  const showEnglish = language === 'en';
  return function renderDayCellContent(arg: DayCellContentArg) {
    const hebrewDay = hebrewDayFmt.format(arg.date);
    const shade = getDayShade(arg.date);
    return (
      <div className="flex flex-col items-center leading-none">
        {/* Gregorian day + Hebrew day on one line to leave more room for events. */}
        <span className="flex items-baseline gap-1">
          <span>{arg.dayNumberText}</span>
          <span className="text-[10px] font-normal text-gray-400">{hebrewDay}</span>
        </span>
        {shade.he && (
          <span className="max-w-[7rem] truncate text-center text-[9px] font-normal text-gray-500">
            {shade.he}
          </span>
        )}
        {showEnglish && shade.en && (
          <span className="max-w-[7rem] truncate text-center text-[8px] font-normal text-gray-400">
            {shade.en}
          </span>
        )}
      </div>
    );
  };
}

/**
 * Adds a shading class to Shabbat/holiday/eve day cells. Stable module-scope
 * reference so FullCalendar doesn't reprocess options on every render.
 */
export function shadedDayClassNames(arg: DayCellContentArg): string[] {
  return getDayShade(arg.date).shaded ? ['fc-shaded-day'] : [];
}

/**
 * Column header. Weekday names follow the active locale (Hebrew in the Hebrew
 * UI), except Saturday which is always shown as "שבת". Week/day views also append
 * the Hebrew calendar date; month headers show only the weekday name.
 */
export function renderDayHeaderContent(arg: DayHeaderContentArg) {
  const isSaturday = arg.date.getDay() === 6;

  if (arg.view.type === 'dayGridMonth') {
    return isSaturday ? SHABBAT_LABEL : arg.text;
  }

  // Keep the Gregorian date; only swap the weekday word to Hebrew for Saturday.
  const weekday = isSaturday
    ? `${SHABBAT_LABEL} ${arg.text.replace(/^\S+\s*/, '')}`.trim()
    : arg.text;
  const hebrewDate = hebrewDayMonthFmt.format(arg.date);
  return (
    <div className="flex flex-col items-center leading-tight">
      <span>{weekday}</span>
      <span className="text-[10px] font-normal text-gray-400">{hebrewDate}</span>
    </div>
  );
}
