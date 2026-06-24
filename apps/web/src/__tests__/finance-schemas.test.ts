import { describe, it, expect } from 'vitest';
import {
  FinanceSummarySchema,
  ExpenseCreateInputSchema,
  PaymentLogRowSchema,
} from '@shared/schemas';
import { computeNetProfitMinor, sumPaymentTotalsMinor } from '@/features/finance-admin/lib/netProfit';

describe('finance schemas', () => {
  it('parses FinanceSummary RPC row', () => {
    const row = {
      net_revenue_minor: 10000,
      payment_count: 3,
      outstanding_engagements: 2,
      failed_payments_7d: 1,
      net_expenses_minor: 2500,
    };
    expect(FinanceSummarySchema.parse(row)).toEqual(row);
  });

  it('parses ExpenseCreateInput for RPC', () => {
    const input = {
      p_expense_id: '550e8400-e29b-41d4-a716-446655440000',
      p_category_id: '550e8400-e29b-41d4-a716-446655440001',
      p_description: 'Studio rent',
      p_pretax_amount_minor: 1000,
      p_vat_amount_minor: 170,
      p_total_amount_minor: 1170,
      p_currency: 'ILS',
      p_expense_date: '2026-06-01',
    };
    expect(() => ExpenseCreateInputSchema.parse(input)).not.toThrow();
  });

  it('parses PaymentLogRow with nested offering name', () => {
    const row = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      person_id: '550e8400-e29b-41d4-a716-446655440001',
      pretax_amount_minor: 1000,
      vat_amount_minor: 170,
      total_amount_minor: 1170,
      currency: 'ILS',
      status: 'succeeded',
      charge_type: 'initial',
      provider: 'mock',
      created_at: '2026-06-01T10:00:00Z',
      offering: { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Ballet 1' },
    };
    const parsed = PaymentLogRowSchema.parse(row);
    expect(parsed.offering?.name).toBe('Ballet 1');
  });
});

describe('net profit helpers', () => {
  it('computes net profit from summary', () => {
    expect(
      computeNetProfitMinor({ net_revenue_minor: 10000, net_expenses_minor: 2500 }),
    ).toBe(7500);
  });

  it('nets refund rows in payment sum', () => {
    expect(
      sumPaymentTotalsMinor([
        { total_amount_minor: 1000 },
        { total_amount_minor: -200 },
      ]),
    ).toBe(800);
  });
});
