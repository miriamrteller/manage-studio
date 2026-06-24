import { TIMEZONE } from '@/lib/constants';

export type DateRange = { startDate: string; endDate: string };

function jerusalemYmd(reference: Date = new Date()): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return { year, month, day };
}

/** Calendar month bounds in Asia/Jerusalem as YYYY-MM-DD (inclusive). */
export function getJerusalemMonthRange(reference: Date = new Date()): DateRange {
  const { year, month } = jerusalemYmd(reference);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Prior calendar month in Asia/Jerusalem. */
export function getJerusalemPreviousMonthRange(reference: Date = new Date()): DateRange {
  const { year, month } = jerusalemYmd(reference);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const prev = new Date(y, m - 2, 1);
  return getJerusalemMonthRange(prev);
}

export function seasonToDateRange(
  startDate: string,
  endDate: string,
): DateRange {
  return { startDate, endDate };
}
