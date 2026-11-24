import { describe, expect, it } from 'vitest';
import { computeTermPrice, termClassDates, parseTermPriceSnapshot, type TermPricingRules } from '@shared/termPricing';

/** Creative Ballet, winter term 2026–27: Wednesdays 16 Dec – 14 Apr, no class on Shushan Purim. */
const CLOSED = new Set(['2027-03-24']);
const dates = (from = '2026-11-24') =>
  termClassDates({ dayOfWeek: 3, termStart: '2026-12-16', termEnd: '2027-04-14', from, isOff: (d) => CLOSED.has(d) });

const RULES: TermPricingRules = {
  upfront_discount_pct: 5,
  round_minor: 500,
  early_enrol_by: '2026-12-31',
  early_until: '2027-12-31',
  sibling_discount_pct: 10,
  sibling_from: 2,
};

const price = (over: Partial<Parameters<typeof computeTermPrice>[0]> = {}) =>
  computeTermPrice({
    rules: RULES,
    pricePerClassMinor: 7000,
    earlyPricePerClassMinor: 6000,
    classDates: dates(),
    familyFirstEnrolledOn: '2027-01-05',
    sisterPosition: 1,
    trialCreditMinor: 0,
    ...over,
  });

describe('term pricing', () => {
  it('counts the 17 Wednesdays of the term, without Shushan Purim, over 5 months', () => {
    const d = dates();
    expect(d).toHaveLength(17);
    expect(d[0]).toBe('2026-12-16');
    expect(d).not.toContain('2027-03-24');
    expect(d.at(-1)).toBe('2027-04-14');
  });

  it('1 hour at ₪70: 17 × ₪70 = ₪1,190; 5 × ₪240 (rounded to ₪5); up front 5% off ₪1,130', () => {
    const p = price()!;
    expect(p.termTotalMinor).toBe(119000);
    expect(p.months).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(p.monthlyMinor).toBe(24000);
    expect(p.upfrontMinor).toBe(113000);
    expect(p.early).toBe(false);
  });

  it('45 minutes at ₪60: 5 × ₪205, up front ₪965', () => {
    const p = price({ pricePerClassMinor: 6000, earlyPricePerClassMinor: 5000 })!;
    expect(p.monthlyMinor).toBe(20500);
    expect(p.upfrontMinor).toBe(96500);
  });

  it('Founding Families (enrolled by 31 Dec): the early price per class', () => {
    const p = price({ familyFirstEnrolledOn: '2026-12-31' })!;
    expect(p.early).toBe(true);
    expect(p.perClassMinor).toBe(6000);
    expect(p.monthlyMinor).toBe(20500);
    expect(p.upfrontMinor).toBe(96500);
    const small = price({ familyFirstEnrolledOn: '2026-12-02', pricePerClassMinor: 6000, earlyPricePerClassMinor: 5000 })!;
    expect(small.monthlyMinor).toBe(17000);
  });

  it('sisters: 10% off from the second girl, on top of the early price', () => {
    expect(price({ sisterPosition: 1 })!.sisterPct).toBe(0);
    const second = price({ sisterPosition: 2, familyFirstEnrolledOn: '2026-12-02' })!;
    expect(second.sisterPct).toBe(10);
    expect(second.perClassMinor).toBe(5400);
  });

  it('a paid trial class comes off the first payment only', () => {
    const p = price({ trialCreditMinor: 4000 })!;
    expect(p.firstPaymentMinor.monthly).toBe(20000);
    expect(p.firstPaymentMinor.upfront).toBe(109000);
    expect(p.monthlyMinor).toBe(24000);
  });

  it('joining mid-term pays only the classes left', () => {
    const p = price({ classDates: dates('2027-02-01') })!;
    expect(p.classCount).toBe(10);
    expect(p.months).toHaveLength(3);
  });

  it('no price per class: not term-priced', () => {
    expect(price({ pricePerClassMinor: 0 })).toBeNull();
  });

  it('reads back a saved snapshot', () => {
    const p = price()!;
    expect(parseTermPriceSnapshot({ ...p, plan: 'upfront', trialPaymentId: null })?.plan).toBe('upfront');
    expect(parseTermPriceSnapshot({ plan: 'x' })).toBeNull();
  });
});
