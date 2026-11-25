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

  describe('owner rules 25 Nov 2026: 10% founding this term only, floor ₪50 / ₪60', () => {
    const THIS_TERM: TermPricingRules = { ...RULES, early_until: '2027-04-14' };
    const nextTerm = termClassDates({ dayOfWeek: 3, termStart: '2027-05-26', termEnd: '2027-07-21', from: '2026-11-24', isOff: () => false });
    const p45 = (over: Partial<Parameters<typeof computeTermPrice>[0]> = {}) =>
      price({ rules: THIS_TERM, pricePerClassMinor: 6000, earlyPricePerClassMinor: 5400, minPricePerClassMinor: 5000, ...over });
    const p60 = (over: Partial<Parameters<typeof computeTermPrice>[0]> = {}) =>
      price({ rules: THIS_TERM, pricePerClassMinor: 7000, earlyPricePerClassMinor: 6300, minPricePerClassMinor: 6000, ...over });

    it('founding: ₪54 / ₪63 a class this term', () => {
      expect(p45({ familyFirstEnrolledOn: '2026-12-02' })!.perClassMinor).toBe(5400);
      expect(p60({ familyFirstEnrolledOn: '2026-12-02' })!.perClassMinor).toBe(6300);
    });

    it('founding + sister stops at the floor (₪48.60 -> ₪50, ₪56.70 -> ₪60)', () => {
      const a = p45({ familyFirstEnrolledOn: '2026-12-02', sisterPosition: 2 })!;
      expect(a.perClassMinor).toBe(5000);
      expect(a.atLowestPrice).toBe(true);
      expect(a.monthlyMinor * a.months.length).toBeGreaterThanOrEqual(5000 * 17);
      expect(a.upfrontMinor).toBe(85000);
      const b = p60({ familyFirstEnrolledOn: '2026-12-02', sisterPosition: 2 })!;
      expect(b.perClassMinor).toBe(6000);
      expect(b.upfrontMinor).toBe(102000);
      expect(b.monthlyMinor * b.months.length).toBeGreaterThanOrEqual(6000 * 17);
    });

    it('founding + up front: never below the floor', () => {
      const a = p45({ familyFirstEnrolledOn: '2026-12-02' })!;
      expect(a.upfrontMinor).toBeGreaterThanOrEqual(5000 * 17);
      expect(a.upfrontMinor).toBeLessThan(a.termTotalMinor);
      const b = p60({ familyFirstEnrolledOn: '2026-12-02' })!;
      expect(b.upfrontMinor).toBe(102000);
      expect(b.atLowestPrice).toBe(true);
    });

    it('no discounts: unchanged ₪205 / ₪965', () => {
      const a = p45()!;
      expect(a.monthlyMinor).toBe(20500);
      expect(a.upfrontMinor).toBe(96500);
      expect(a.atLowestPrice).toBe(false);
    });

    it('founding ends after this term, except a family kept for the year', () => {
      expect(p45({ familyFirstEnrolledOn: '2026-12-02', classDates: nextTerm })!.early).toBe(false);
      const kept = p45({ familyFirstEnrolledOn: '2026-12-02', classDates: nextTerm, familyEarlyUntil: '2027-12-31' })!;
      expect(kept.early).toBe(true);
      expect(kept.perClassMinor).toBe(5400);
    });

    it('a kept family gets the early price even when enrolling after 31 Dec', () => {
      expect(p45({ familyFirstEnrolledOn: '2027-01-10', familyEarlyUntil: '2027-12-31' })!.early).toBe(true);
    });
  });
});
