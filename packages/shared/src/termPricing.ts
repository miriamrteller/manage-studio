/**
 * Term pricing (owner decision, 24 Nov 2026): a class is priced per class, and a family pays for
 * the classes of the term, either up front (with the studio's up-front discount) or in equal
 * monthly payments, one for each calendar month that has a class. Holidays and the studio's
 * closed dates are left out, so the price always matches the classes that really happen.
 *
 * Automatic discounts, applied to the price of one class, in this order:
 *  - early enrolment ("Founding Families"): enrolled by the studio's date, the class's early
 *    price per class, until the studio's "early price until" date;
 *  - sisters: a percentage off from the Nth girl of the same family (default: the second);
 * then the up-front discount on the term total, and a paid trial class taken off the first payment.
 *
 * Pure: the caller loads the rows and passes the class dates (see termClassDates).
 */

export type PayPlan = 'monthly' | 'upfront';

export interface TermPricingRules {
  /** Percent off for paying the whole term at once (0 = none). */
  upfront_discount_pct: number;
  /** Monthly payments and the up-front total are rounded to this (minor units, e.g. 500 = ₪5). */
  round_minor: number;
  /** Enrolled on or before this date (YYYY-MM-DD, Israel): the early price per class. */
  early_enrol_by: string | null;
  /** The early price stays for terms starting on or before this date (YYYY-MM-DD). */
  early_until: string | null;
  /** Percent off for sisters (0 = none). */
  sibling_discount_pct: number;
  /** The sister discount starts with this girl of the family (2 = from the second). */
  sibling_from: number;
}

export interface TermPriceInput {
  rules: TermPricingRules;
  pricePerClassMinor: number;
  earlyPricePerClassMinor: number | null;
  /** The term's remaining class dates for this class (sorted YYYY-MM-DD). */
  classDates: string[];
  /** The family's earliest enrolment date (YYYY-MM-DD, Israel), for the early price. */
  familyFirstEnrolledOn: string | null;
  /** 1 = the family's first girl in this term, 2 = the second, ... */
  sisterPosition: number;
  /** A paid trial class to take off the first payment (minor units, 0 = none). */
  trialCreditMinor: number;
}

export interface TermPrice {
  classCount: number;
  /** The usual price of one class. */
  listPerClassMinor: number;
  /** One class after the early price and sister discount. */
  perClassMinor: number;
  early: boolean;
  sisterPct: number;
  /** classCount × perClassMinor. */
  termTotalMinor: number;
  /** Months with a class, YYYY-MM, in order: one monthly payment each. */
  months: string[];
  monthlyMinor: number;
  upfrontPct: number;
  upfrontMinor: number;
  trialCreditMinor: number;
  /** What is paid now, per plan (trial credit already taken off). */
  firstPaymentMinor: Record<PayPlan, number>;
}

function roundTo(value: number, step: number): number {
  const s = Math.max(1, Math.round(step));
  return Math.round(value / s) * s;
}

function floorTo(value: number, step: number): number {
  const s = Math.max(1, Math.round(step));
  return Math.floor(value / s) * s;
}

/** Null when the class has no per-class price or no classes are left in the term. */
export function computeTermPrice(input: TermPriceInput): TermPrice | null {
  const { rules } = input;
  if (!(input.pricePerClassMinor > 0) || input.classDates.length === 0) return null;
  const firstClass = input.classDates[0];

  const early =
    input.earlyPricePerClassMinor != null &&
    input.earlyPricePerClassMinor > 0 &&
    rules.early_enrol_by != null &&
    input.familyFirstEnrolledOn != null &&
    input.familyFirstEnrolledOn <= rules.early_enrol_by &&
    (rules.early_until == null || firstClass <= rules.early_until);

  const base = early ? (input.earlyPricePerClassMinor as number) : input.pricePerClassMinor;
  const sisterPct =
    rules.sibling_discount_pct > 0 && input.sisterPosition >= Math.max(2, rules.sibling_from)
      ? rules.sibling_discount_pct
      : 0;
  const perClassMinor = Math.round(base * (1 - sisterPct / 100));

  const classCount = input.classDates.length;
  const termTotalMinor = perClassMinor * classCount;
  const months = [...new Set(input.classDates.map((d) => d.slice(0, 7)))];
  const monthlyMinor = roundTo(termTotalMinor / months.length, rules.round_minor);
  const upfrontPct = Math.max(0, rules.upfront_discount_pct);
  const upfrontMinor = floorTo(termTotalMinor * (1 - upfrontPct / 100), rules.round_minor);

  const credit = Math.max(0, input.trialCreditMinor);
  const less = (amount: number) => Math.max(0, amount - credit);

  return {
    classCount,
    listPerClassMinor: input.pricePerClassMinor,
    perClassMinor,
    early,
    sisterPct,
    termTotalMinor,
    months,
    monthlyMinor,
    upfrontPct,
    upfrontMinor,
    trialCreditMinor: credit,
    firstPaymentMinor: { monthly: less(monthlyMinor), upfront: less(upfrontMinor) },
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The class's dates from `from` to the term's end: every `dayOfWeek` (0 = Sunday) in
 * [max(from, termStart), termEnd], without days that are off (holidays, closed dates).
 */
export function termClassDates(input: {
  dayOfWeek: number;
  termStart: string;
  termEnd: string;
  from: string;
  isOff: (isoDate: string) => boolean;
}): string[] {
  let date = input.from > input.termStart ? input.from : input.termStart;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  date = addDays(date, (input.dayOfWeek - weekday + 7) % 7);
  const dates: string[] = [];
  for (; date <= input.termEnd && dates.length < 400; date = addDays(date, 7)) {
    if (!input.isOff(date)) dates.push(date);
  }
  return dates;
}

/** The snapshot kept on the enrolment (engagements.term_price) once a plan is picked. */
export interface TermPriceSnapshot extends TermPrice {
  plan: PayPlan;
  /** The trial-class payment taken off, so it is only used once. */
  trialPaymentId: string | null;
}

/** Pure: read a stored snapshot back (null when missing or malformed). */
export function parseTermPriceSnapshot(raw: unknown): TermPriceSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const fp = o.firstPaymentMinor as Record<string, unknown> | undefined;
  if (
    (o.plan !== 'monthly' && o.plan !== 'upfront') ||
    typeof o.classCount !== 'number' ||
    typeof o.perClassMinor !== 'number' ||
    typeof o.monthlyMinor !== 'number' ||
    typeof o.upfrontMinor !== 'number' ||
    !Array.isArray(o.months) ||
    !fp ||
    typeof fp.monthly !== 'number' ||
    typeof fp.upfront !== 'number'
  ) {
    return null;
  }
  return raw as TermPriceSnapshot;
}
