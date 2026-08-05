import { HDate } from '@hebcal/core';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Localised formatting for the Israeli market: NIS currency, 24-hour clock,
 * Hebrew calendar dates, Israeli phone numbers and business IDs.
 *
 * Relationship to existing helpers — `src/lib/utils.ts` already exports
 * `formatCurrency`, `formatDate`, `formatPhone` and `isValidPhone`, and
 * `@shared/format` exports a minor-unit `formatCurrency`. Those are intentionally
 * left untouched (they have live call sites). This module is the design-system
 * formatting layer used by the new Pipeline 2 components; the two should be
 * consolidated in a follow-up rather than during a design pass.
 */

export const DEFAULT_LOCALE = 'he-IL';
export const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

type DateInput = Date | string | number;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------------------------------------------ *
 * Currency
 * ------------------------------------------------------------------ */

export interface FormatNISOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Israeli new shekel. Takes a *major-unit* amount (12.5 = ₪12.50).
 * Fraction digits default to 0..2, so whole amounts read as "₪1,200"
 * rather than "₪1,200.00".
 */
export function formatNIS(amount: number, options: FormatNISOptions = {}): string {
  if (!Number.isFinite(amount)) return '';
  const {
    locale = DEFAULT_LOCALE,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

/* ------------------------------------------------------------------ *
 * Numbers & percentages
 * ------------------------------------------------------------------ */

export function formatNumber(value: number, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Percentage. `value` is a ratio by default (0.125 -> 12.5%); pass
 * `{ alreadyPercent: true }` when the caller holds 12.5 meaning 12.5%.
 *
 * NOTE: he-IL uses a comma thousands separator and a period decimal
 * separator, exactly like en-US — the draft's "Hebrew decimal separator" is a
 * misconception. Intl is left to decide, so this stays correct if that ever
 * changes in CLDR.
 */
export function formatPercent(
  value: number,
  options: { locale?: string; alreadyPercent?: boolean; maximumFractionDigits?: number } = {},
): string {
  if (!Number.isFinite(value)) return '';
  const { locale = DEFAULT_LOCALE, alreadyPercent = false, maximumFractionDigits = 1 } = options;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits,
  }).format(alreadyPercent ? value / 100 : value);
}

/**
 * Compact abbreviation ("1.2K" / "1.2 אלף"). Intl's compact notation carries
 * the correct Hebrew short forms, so no hand-maintained word list is needed.
 */
export function formatCompactNumber(value: number, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/* ------------------------------------------------------------------ *
 * Time & dates
 * ------------------------------------------------------------------ */

/**
 * 24-hour clock. `hourCycle: 'h23'` is set alongside `hour12: false` because
 * `hour12: false` alone yields the h24 cycle in some engines, printing
 * midnight as "24:00".
 */
export function formatTime24(
  date: DateInput,
  locale: string = DEFAULT_LOCALE,
  timeZone: string = ISRAEL_TIME_ZONE,
): string {
  const parsed = toDate(date);
  if (!parsed) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone,
  }).format(parsed);
}

export function formatGregorianDate(
  date: DateInput,
  locale: string = DEFAULT_LOCALE,
  timeZone: string = ISRAEL_TIME_ZONE,
): string {
  const parsed = toDate(date);
  if (!parsed) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(parsed);
}

/**
 * Hebrew calendar date.
 *
 * Uses `@hebcal/core` (already a dependency) rather than
 * `Intl.DateTimeFormat({ calendar: 'hebrew' })`: hebcal renders proper
 * gematriya numerals ("כ״ט בְּתַמּוּז תשפ״ו") and applies the correct
 * sunset-relative day boundary, neither of which Intl does. Intl remains the
 * fallback if hebcal throws for an out-of-range date.
 */
export function formatHebrewDate(date: DateInput = new Date(), locale: string = DEFAULT_LOCALE): string {
  const parsed = toDate(date);
  if (!parsed) return '';

  const wantsHebrew = locale.toLowerCase().startsWith('he');

  try {
    const hebrewDate = new HDate(parsed);
    return wantsHebrew ? hebrewDate.renderGematriya() : hebrewDate.render('en');
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, {
        calendar: 'hebrew',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(parsed);
    } catch {
      return formatGregorianDate(parsed, locale);
    }
  }
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
];

/**
 * Relative time ("לפני שעתיים", "בעוד 3 ימים").
 * `numeric: 'auto'` is what produces the idiomatic dual form "שעתיים"
 * instead of the literal "לפני 2 שעות".
 */
export function formatRelativeTime(
  date: DateInput,
  locale: string = DEFAULT_LOCALE,
  now: DateInput = new Date(),
): string {
  const parsed = toDate(date);
  const reference = toDate(now);
  if (!parsed || !reference) return '';

  const diffMs = parsed.getTime() - reference.getTime();
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= unitMs || unit === 'second') {
      return formatter.format(Math.round(diffMs / unitMs), unit);
    }
  }
  return formatter.format(0, 'second');
}

/* ------------------------------------------------------------------ *
 * Phone numbers
 * ------------------------------------------------------------------ */

/**
 * Display formatting for Israeli and international numbers. Israeli numbers
 * render nationally ("050-123-4567"); anything else renders in international
 * form so the country stays visible. Unparseable input is returned untouched
 * rather than mangled.
 */
export function formatPhone(
  phone: string | null | undefined,
  defaultCountry: 'IL' = 'IL',
): string {
  if (!phone) return '';
  try {
    const parsed = parsePhoneNumberFromString(phone, defaultCountry);
    if (!parsed) return phone;
    return parsed.country === defaultCountry ? parsed.formatNational() : parsed.formatInternational();
  } catch {
    return phone;
  }
}

/** Storage/transport form: +972501234567. */
export function formatPhoneE164(phone: string | null | undefined, defaultCountry: 'IL' = 'IL'): string {
  if (!phone) return '';
  try {
    return parsePhoneNumberFromString(phone, defaultCountry)?.format('E.164') ?? '';
  } catch {
    return '';
  }
}

export function isValidIsraeliPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  try {
    return parsePhoneNumberFromString(phone, 'IL')?.isValid() ?? false;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

export interface AddressParts {
  street?: string | null;
  houseNumber?: string | number | null;
  apartment?: string | number | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/**
 * Israeli address ordering. In Hebrew the house number follows the street
 * name ("הרצל 15"); in English it precedes it ("15 Herzl"). Everything else
 * (apartment, city, postal code, country) follows the same order in both.
 *
 * The result is a plain string — visual direction belongs to CSS. Render it in
 * an element with `unicode-bidi: plaintext` (or the `.numeric-cell` helper for
 * table cells) so mixed Hebrew/Latin content is not reordered.
 */
export function formatAddress(parts: AddressParts, locale: string = DEFAULT_LOCALE): string {
  const hebrew = locale.toLowerCase().startsWith('he');
  const { street, houseNumber, apartment, city, postalCode, country } = parts;

  const streetLine = [
    hebrew ? street : houseNumber,
    hebrew ? houseNumber : street,
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .join(' ');

  const apartmentLine =
    apartment === null || apartment === undefined || String(apartment).trim() === ''
      ? ''
      : hebrew
        ? `דירה ${apartment}`
        : `Apt ${apartment}`;

  return [streetLine, apartmentLine, city, postalCode, country]
    .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
    .filter(Boolean)
    .join(', ');
}

/* ------------------------------------------------------------------ *
 * Israeli business / company registration number
 * ------------------------------------------------------------------ */

/**
 * Validates a 9-digit Israeli business number (ח.פ. / ע.מ.) using the same
 * weighted check-digit algorithm as the national ID: alternate weights 1 and 2,
 * reduce two-digit products by 9, and require the sum to be divisible by 10.
 */
export function isValidBusinessID(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    const product = Number(digits[index]) * (index % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

/**
 * Display formatting for a business number, grouped 3-3-3 for legibility
 * ("512 345 678"). Input shorter than 9 digits is zero-padded, which is how
 * these numbers are printed on official documents. Invalid input is returned
 * unchanged so a user never sees their typo silently rewritten.
 */
export function formatBusinessID(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 9) return value;
  const padded = digits.padStart(9, '0');
  return `${padded.slice(0, 3)} ${padded.slice(3, 6)} ${padded.slice(6)}`;
}
