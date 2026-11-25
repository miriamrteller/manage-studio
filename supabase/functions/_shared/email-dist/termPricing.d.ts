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
 * Owner rules (25 Nov 2026): discounts combine, but a class never costs less than the class's
 * lowest price per class (e.g. ₪50 / ₪60), checked after every discount and after rounding.
 * Founding Families can be limited to the first term; a family marked "keeps the early price
 * until" a date (the first families who signed up) keeps it for terms starting until then.
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
    /** A class never costs less than this after all discounts (null = no floor). */
    minPricePerClassMinor?: number | null;
    /** The family keeps the early price for terms starting on or before this date (null = studio rule only). */
    familyEarlyUntil?: string | null;
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
    /** The class's lowest price per class (null = none). */
    minPerClassMinor?: number | null;
    /** True when the lowest price per class stopped a discount (per class or up front). */
    atLowestPrice?: boolean;
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
/** Null when the class has no per-class price or no classes are left in the term. */
export declare function computeTermPrice(input: TermPriceInput): TermPrice | null;
/**
 * The class's dates from `from` to the term's end: every `dayOfWeek` (0 = Sunday) in
 * [max(from, termStart), termEnd], without days that are off (holidays, closed dates).
 */
export declare function termClassDates(input: {
    dayOfWeek: number;
    termStart: string;
    termEnd: string;
    from: string;
    isOff: (isoDate: string) => boolean;
}): string[];
/** The snapshot kept on the enrolment (engagements.term_price) once a plan is picked. */
export interface TermPriceSnapshot extends TermPrice {
    plan: PayPlan;
    /** The trial-class payment taken off, so it is only used once. */
    trialPaymentId: string | null;
}
/** Pure: read a stored snapshot back (null when missing or malformed). */
export declare function parseTermPriceSnapshot(raw: unknown): TermPriceSnapshot | null;
//# sourceMappingURL=termPricing.d.ts.map