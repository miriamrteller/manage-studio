/**
 * Automatic class discounts (sibling, extra class, early bird). The database works the
 * discount out at enrolment (supabase/tests/class-discounts); these check that every price
 * reader takes it off the class price, the Settings form, and the lines parents see.
 * Fakes only.
 * Run: pnpm -C apps/web test class-discounts.test.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeGrowFakeService } from './helpers/growFakeService';
import { pickMonthAmount, resolveMonthAmount } from '../../../../supabase/functions/_shared/payments/month-amount.ts';
import {
  engagementDiscountFromRow,
  parseDiscountLines,
  priceAfterDiscount,
} from '../../../../supabase/functions/_shared/payments/class-discount.ts';
import { DEFAULT_CLASS_DISCOUNTS, formToRow, rowToForm } from '@/features/settings/lib/classDiscounts';
import { ClassDiscountLines, discountLinesFromRow } from '@/features/enrolment/components/ClassDiscountLines';
import { openItemsFrom } from '@/features/finance/hooks/usePayableItems';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const ENGAGEMENT = '11111111-1111-1111-1111-111111111111';
const SCHEDULE = '55555555-5555-5555-5555-555555555555';

describe('class discount on the enrolment', () => {
  it('reads only well-formed lines and never goes below zero', () => {
    expect(parseDiscountLines([{ kind: 'sibling', amount_minor: 2000 }, { kind: 'bogus', amount_minor: 5 }, null]))
      .toEqual([{ kind: 'sibling', amountMinor: 2000 }]);
    expect(engagementDiscountFromRow({ discount_minor: 0, discount_lines: [] })).toEqual({ discountMinor: 0, lines: [] });
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
