/* @ts-self-types="./termPricing.d.ts" */
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
function roundTo(value, step) {
    const s = Math.max(1, Math.round(step));
    return Math.round(value / s) * s;
}
function floorTo(value, step) {
    const s = Math.max(1, Math.round(step));
    return Math.floor(value / s) * s;
}
/** Null when the class has no per-class price or no classes are left in the term. */
export function computeTermPrice(input) {
    const { rules } = input;
    if (!(input.pricePerClassMinor > 0) || input.classDates.length === 0)
        return null;
    const firstClass = input.classDates[0];
    const early = input.earlyPricePerClassMinor != null &&
        input.earlyPricePerClassMinor > 0 &&
        rules.early_enrol_by != null &&
        input.familyFirstEnrolledOn != null &&
        input.familyFirstEnrolledOn <= rules.early_enrol_by &&
        (rules.early_until == null || firstClass <= rules.early_until);
    const base = early ? input.earlyPricePerClassMinor : input.pricePerClassMinor;
    const sisterPct = rules.sibling_discount_pct > 0 && input.sisterPosition >= Math.max(2, rules.sibling_from)
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
    const less = (amount) => Math.max(0, amount - credit);
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
function addDays(isoDate, days) {
    const d = new Date(`${isoDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/**
 * The class's dates from `from` to the term's end: every `dayOfWeek` (0 = Sunday) in
 * [max(from, termStart), termEnd], without days that are off (holidays, closed dates).
 */
export function termClassDates(input) {
    let date = input.from > input.termStart ? input.from : input.termStart;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    date = addDays(date, (input.dayOfWeek - weekday + 7) % 7);
    const dates = [];
    for (; date <= input.termEnd && dates.length < 400; date = addDays(date, 7)) {
        if (!input.isOff(date))
            dates.push(date);
    }
    return dates;
}
/** Pure: read a stored snapshot back (null when missing or malformed). */
export function parseTermPriceSnapshot(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const o = raw;
    const fp = o.firstPaymentMinor;
    if ((o.plan !== 'monthly' && o.plan !== 'upfront') ||
        typeof o.classCount !== 'number' ||
        typeof o.perClassMinor !== 'number' ||
        typeof o.monthlyMinor !== 'number' ||
        typeof o.upfrontMinor !== 'number' ||
        !Array.isArray(o.months) ||
        !fp ||
        typeof fp.monthly !== 'number' ||
        typeof fp.upfront !== 'number') {
        return null;
    }
    return raw;
}
