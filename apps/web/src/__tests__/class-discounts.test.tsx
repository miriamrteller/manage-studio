/**
 * Class discounts (sibling, extra class, early bird, per client, coupon codes). The database works the
 * discount out at enrolment (supabase/tests/class-discounts); these check that every price
 * reader takes it off the class price, the Settings form, and the lines parents see.
 * Fakes only.
 * Run: pnpm -C apps/web test class-discounts.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { makeGrowFakeService } from './helpers/growFakeService';
import { pickMonthAmount, resolveMonthAmount } from '../../../../supabase/functions/_shared/payments/month-amount.ts';
import {
  engagementDiscountFromRow,
  firstPaymentDiscount,
  parseDiscountLines,
  priceAfterDiscount,
} from '../../../../supabase/functions/_shared/payments/class-discount.ts';
import { parseClassCouponResult } from '../../../../supabase/functions/_shared/payments/class-coupon.ts';
import {
  clientDiscountToRow,
  couponToRow,
  DEFAULT_CLASS_DISCOUNTS,
  DEFAULT_COUPON_INPUT,
  formToRow,
  rowToForm,
} from '@/features/settings/lib/classDiscounts';
import { ClassDiscountLines, discountLinesFromRow } from '@/features/enrolment/components/ClassDiscountLines';
import { CouponCodeBox } from '@/features/enrolment/components/ClassCouponBox';
import { quoteDiscountPreview } from '@/features/quotes/lib/quoteDiscount';
import { QuoteTotalsSummary } from '@/features/quotes/components/QuoteTotalsSummary';
import { ShopOrderTotal } from '@/features/shop/components/ShopOrderTotal';
import { openItemsFrom } from '@/features/finance/hooks/usePayableItems';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ENGAGEMENT = '11111111-1111-1111-1111-111111111111';
const SCHEDULE = '55555555-5555-5555-5555-555555555555';

describe('class discount on the enrolment', () => {
  it('reads only well-formed lines and never goes below zero', () => {
    expect(parseDiscountLines([{ kind: 'sibling', amount_minor: 2000 }, { kind: 'bogus', amount_minor: 5 }, null]))
      .toEqual([{ kind: 'sibling', amountMinor: 2000 }]);
    expect(engagementDiscountFromRow({ discount_minor: 0, discount_lines: [] }))
      .toEqual({ discountMinor: 0, firstDiscountMinor: 0, lines: [] });
    expect(engagementDiscountFromRow(null).discountMinor).toBe(0);
    expect(priceAfterDiscount(20000, 3000)).toBe(17000);
    expect(priceAfterDiscount(20000, null)).toBe(20000);
    expect(priceAfterDiscount(1000, 5000)).toBe(0);
  });
});

describe('monthly charges take the discount off the class price', () => {
  it('class price less discount; a hand-set amount replaces it', () => {
    expect(pickMonthAmount({ classPriceMinor: 35000, studentAmountMinor: null, classDiscountMinor: 3500 }))
      .toEqual({ amountMinor: 31500, source: 'class', note: null });
    expect(pickMonthAmount({ classPriceMinor: 35000, studentAmountMinor: 30000, classDiscountMinor: 3500 }).amountMinor)
      .toBe(30000);
  });

  it('reads the discount stored on the enrolment', async () => {
    const { service } = makeGrowFakeService({
      tables: {
        engagements: [{ id: ENGAGEMENT, tenant_id: TENANT, discount_minor: 3500, discount_lines: [{ kind: 'sibling', amount_minor: 3500 }] }],
        billing_schedules: [{ id: SCHEDULE, tenant_id: TENANT, engagement_id: ENGAGEMENT, amount_minor: null, amount_note: null }],
        billing_month_adjustments: [],
      },
    });
    const month = await resolveMonthAmount(service, { scheduleId: SCHEDULE, period: '2026-12', classPriceMinor: 35000 });
    expect(month.amountMinor).toBe(31500);
  });
});

describe('Record a payment suggests the discounted price', () => {
  it('first payment and monthly plan', () => {
    const items = openItemsFrom(
      [
        { id: 'a', status: 'pending_payment', discount_minor: 2000, offering: { id: 'o', name: 'Ballet', price_minor: 20000, billing_mode: 'one_time' } },
        { id: 'b', status: 'active', offering: { id: 'o2', name: 'Jazz', price_minor: 30000, billing_mode: 'recurring' } },
      ],
      [],
    );
    expect(items.map((i) => i.amountMinor)).toEqual([18000, 30000]);
  });
});

describe('Settings → Discounts form', () => {
  it('starts switched off with the suggested amounts', () => {
    const form = rowToForm(null);
    expect(form.sibling_enabled).toBe(false);
    expect(form.sibling_value).toBe('10');
    expect(form.sibling_more_value).toBe('15');
    expect(form.early_bird_days_before).toBe('30');
    const saved = formToRow(form);
    expect(saved).toEqual({ ok: true, row: DEFAULT_CLASS_DISCOUNTS });
  });

  it('keeps shekel amounts in agorot and refuses bad values', () => {
    const form = { ...rowToForm(null), sibling_unit: 'amount' as const, sibling_value: '50', sibling_more_value: '75.5' };
    const result = formToRow(form);
    expect(result.ok && result.row.sibling_value).toBe(5000);
    expect(result.ok && result.row.sibling_more_value).toBe(7550);
    expect(rowToForm(result.ok ? result.row : null).sibling_more_value).toBe('75.50');

    const bad = formToRow({ ...rowToForm(null), extra_class_value: '95', max_total_percent: '0', early_bird_days_before: '-1' });
    expect(bad).toEqual({ ok: false, invalid: ['max_total_percent', 'extra_class_value', 'early_bird_days_before'] });
  });
});

describe('the lines parents see before paying', () => {
  it('shows the class price and each discount', () => {
    render(
      <ClassDiscountLines
        listAmountMinor={20000}
        discounts={discountLinesFromRow([{ kind: 'sibling', amount_minor: 2000 }, { kind: 'early_bird', amount_minor: 1000 }])}
        currency="ILS"
        monthly
      />,
    );
    expect(screen.getByText('Class price')).toBeInTheDocument();
    expect(screen.getByText('Sibling discount')).toBeInTheDocument();
    expect(screen.getByText('Early bird discount')).toBeInTheDocument();
    expect(screen.getByText('The discount applies every month.')).toBeInTheDocument();
  });

  it('shows nothing without a discount', () => {
    const { container } = render(<ClassDiscountLines listAmountMinor={20000} discounts={[]} currency="ILS" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('client discounts and coupon codes', () => {
  it('a first-payment coupon comes off the first payment only', () => {
    const discount = engagementDiscountFromRow({
      discount_minor: 2000,
      first_discount_minor: 1000,
      discount_lines: [
        { kind: 'client', amount_minor: 2000 },
        { kind: 'coupon', amount_minor: 1000, first_only: true, code: 'WELCOME' },
      ],
    });
    expect(discount.lines).toEqual([
      { kind: 'client', amountMinor: 2000 },
      { kind: 'coupon', amountMinor: 1000, firstOnly: true, code: 'WELCOME' },
    ]);
    expect(firstPaymentDiscount(discount)).toBe(3000);
    expect(pickMonthAmount({ classPriceMinor: 20000, studentAmountMinor: null, classDiscountMinor: discount.discountMinor }).amountMinor)
      .toBe(18000);
  });

  it('Record a payment suggests the first payment less a first-payment coupon', () => {
    const items = openItemsFrom(
      [{ id: 'a', status: 'pending_payment', discount_minor: 2000, first_discount_minor: 1000, offering: { id: 'o', name: 'Ballet', price_minor: 20000, billing_mode: 'recurring' } }],
      [],
    );
    expect(items[0].amountMinor).toBe(17000);
  });

  it('reads the coupon answer from the database', () => {
    expect(parseClassCouponResult({ ok: true, amount_minor: 1000, first_only: true }))
      .toEqual({ ok: true, amountMinor: 1000, firstOnly: true });
    expect(parseClassCouponResult({ ok: false, reason: 'expired' })).toEqual({ ok: false, reason: 'expired' });
    expect(parseClassCouponResult({ ok: false, reason: 'weird' })).toEqual({ ok: false, reason: 'error' });
    expect(parseClassCouponResult(null)).toEqual({ ok: false, reason: 'error' });
  });

  it('client discount: email in lower case, amount checked', () => {
    expect(clientDiscountToRow({ email: ' Parent@Example.TEST ', unit: 'amount', value: '50', note: '' }))
      .toEqual({ ok: true, row: { email: 'parent@example.test', unit: 'amount', value: 5000, note: null } });
    expect(clientDiscountToRow({ email: 'nope', unit: 'percent', value: '95', note: '' }))
      .toEqual({ ok: false, invalid: ['email', 'value'] });
  });

  it('coupon: prefilled as 10% off every payment, code in capitals', () => {
    expect(DEFAULT_COUPON_INPUT.applies_to).toBe('every_month');
    expect(couponToRow({ ...DEFAULT_COUPON_INPUT, code: ' welcome ' }))
      .toEqual({ ok: true, row: { code: 'WELCOME', unit: 'percent', value: 10, applies_to: 'every_month', valid_until: null, max_uses: null, note: null } });
    expect(couponToRow({ ...DEFAULT_COUPON_INPUT, code: 'a b', max_uses: '0' }))
      .toEqual({ ok: false, invalid: ['code', 'max_uses'] });
  });

  it('parents see the coupon line and what later months cost', () => {
    render(
      <ClassDiscountLines
        listAmountMinor={20000}
        discounts={discountLinesFromRow([
          { kind: 'client', amount_minor: 2000 },
          { kind: 'coupon', amount_minor: 1000, first_only: true, code: 'WELCOME' },
        ])}
        currency="ILS"
        monthly
      />,
    );
    expect(screen.getByText('Your discount')).toBeInTheDocument();
    expect(screen.getByText('Coupon WELCOME (first payment)')).toBeInTheDocument();
    expect(screen.getByText(/After the first payment: .*180.* a month\./)).toBeInTheDocument();
  });
});

describe('discounts on every sale (pay page)', () => {
  it('a shoot or shop payment shows "Price" and the client discount', () => {
    render(
      <ClassDiscountLines
        listAmountMinor={20000}
        discounts={discountLinesFromRow([{ kind: 'client', amount_minor: 5000 }])}
        currency="ILS"
        priceLabelKey="class_discounts.price"
      />,
    );
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.queryByText('Class price')).toBeNull();
    expect(screen.getByText('Your discount')).toBeInTheDocument();
  });

  it('the coupon box sends the code and says why a code did not work', async () => {
    const onApply = vi.fn().mockResolvedValueOnce({ ok: false, reason: 'not_found' }).mockResolvedValueOnce({ ok: true, amountMinor: 1000, firstOnly: false });
    render(<CouponCodeBox onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Have a coupon code?' }));
    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/couldn't find that code/)).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith('nope');
    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'SHOOT10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Coupon applied. The price is updated.')).toBeInTheDocument();
  });
});

describe('the discount wherever the price shows', () => {
  it('quote page: a fixed client discount comes off the deposit once; a percentage off both', () => {
    const fixed = quoteDiscountPreview({ depositMinor: 20000, balanceMinor: 35000 }, { rules: [{ unit: 'amount', value: 5000 }], max_total_percent: 30 });
    expect(fixed).toEqual({ discountMinor: 5000, depositAfterMinor: 15000, balanceAfterMinor: 35000, totalAfterMinor: 50000 });
    const pct = quoteDiscountPreview({ depositMinor: 20000, balanceMinor: 35000 }, { rules: [{ unit: 'percent', value: 10 }], max_total_percent: 30 });
    expect(pct?.discountMinor).toBe(5500);
    // within the studio's maximum on each payment
    const capped = quoteDiscountPreview({ depositMinor: 10000, balanceMinor: 0 }, { rules: [{ unit: 'amount', value: 5000 }], max_total_percent: 30 });
    expect(capped?.depositAfterMinor).toBe(7000);
    expect(quoteDiscountPreview({ depositMinor: 100, balanceMinor: 100 }, null)).toBeNull();
  });

  it('quote totals show the discount and the deposit and balance after it', () => {
    render(
      <QuoteTotalsSummary
        totals={{ requiredMinor: 55000, optionalSelectedMinor: 0, totalMinor: 55000, depositMinor: 20000, balanceMinor: 35000, pretaxMinor: 47009, vatMinor: 7991, vatRate: 0.17 }}
        currency="ILS"
        depositPercent={30}
        discount={{ discountMinor: 5000, depositAfterMinor: 15000, balanceAfterMinor: 35000, totalAfterMinor: 50000 }}
      />,
    );
    expect(screen.getByText('Your discount')).toBeInTheDocument();
    expect(screen.getByText('Total after your discount')).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it('shop orders show what is paid, with the discount beside it', () => {
    render(<ShopOrderTotal order={{ total_minor: 10000, discount_minor: 3000, currency: 'ILS' }} />);
    expect(screen.getByText(/70/)).toBeInTheDocument();
    expect(screen.getByText(/30.*discount/)).toBeInTheDocument();
  });
});
