import { TIMEZONE } from '@/lib/constants';
import type { FinancePeriodKey } from '@shared/schemas';

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

export function parseFinancePeriodKey(value: string | null): FinancePeriodKey {
  if (
    value === 'month_previous' ||
    value === 'season_active' ||
    value === 'year_current' ||
    value === 'year_previous'
  ) {
    return value;
  }
  return 'month_current';
}

export function resolvePeriodDateRange(
  period: FinancePeriodKey,
  activeSeason?: { start_date: string; end_date: string } | null,
): DateRange {
  if (period === 'month_previous') {
    return getJerusalemPreviousMonthRange();
  }
  if (period === 'season_active' && activeSeason) {
    return seasonToDateRange(activeSeason.start_date, activeSeason.end_date);
  }
  if (period === 'year_current' || period === 'year_previous') {
    const year = parseInt(jerusalemYmd().year, 10) - (period === 'year_previous' ? 1 : 0);
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  return getJerusalemMonthRange();
}

/** How often the studio reports VAT (tenants.vat_report_period). */
export type VatReportPeriod = 'bi_monthly' | 'monthly';

export function parseVatReportPeriod(value: unknown): VatReportPeriod {
  return value === 'monthly' ? 'monthly' : 'bi_monthly';
}

/** Accountant export period presets. */
export type AccountantPeriodKey =
  | 'vat_previous'
  | 'vat_current'
  | 'month_previous'
  | 'month_current'
  | 'quarter_previous'
  | 'year_previous'
  | 'year_current';

export const ACCOUNTANT_PERIOD_KEYS: readonly AccountantPeriodKey[] = [
  'vat_previous',
  'vat_current',
  'month_previous',
  'month_current',
  'quarter_previous',
  'year_previous',
  'year_current',
];

function monthsRange(year: number, firstMonth: number, months: number): DateRange {
  // firstMonth is 1-based; may be <= 0 (previous year), normalised by Date.
  const start = new Date(year, firstMonth - 1, 1);
  const end = new Date(year, firstMonth - 1 + months, 0);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: ymd(start), endDate: ymd(end) };
}

/**
 * Date range (Asia/Jerusalem calendar, inclusive) for an accountant export preset.
 * Bi-monthly VAT periods are Jan–Feb, Mar–Apr, May–Jun, Jul–Aug, Sep–Oct, Nov–Dec.
 */
export function accountantPeriodRange(
  key: AccountantPeriodKey,
  vatPeriod: VatReportPeriod,
  reference: Date = new Date(),
): DateRange {
  const { year, month } = jerusalemYmd(reference);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  switch (key) {
    case 'month_current':
      return monthsRange(y, m, 1);
    case 'month_previous':
      return monthsRange(y, m - 1, 1);
    case 'vat_current':
    case 'vat_previous': {
      const length = vatPeriod === 'monthly' ? 1 : 2;
      const first = Math.floor((m - 1) / length) * length + 1;
      return monthsRange(y, key === 'vat_current' ? first : first - length, length);
    }
    case 'quarter_previous': {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      return monthsRange(y, first - 3, 3);
    }
    case 'year_current':
      return monthsRange(y, 1, 12);
    case 'year_previous':
      return monthsRange(y - 1, 1, 12);
  }
}
