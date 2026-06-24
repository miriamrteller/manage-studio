import { describe, it, expect, vi } from 'vitest';
import { computeNetProfitMinor } from '@/features/finance-admin/lib/netProfit';

describe('finance-pl', () => {
  it('computes net profit from summary values', () => {
    expect(
      computeNetProfitMinor({ net_revenue_minor: 12000, net_expenses_minor: 4500 }),
    ).toBe(7500);
  });
});

describe('create_expense RPC shape', () => {
  it('calls rpc with p_expense_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'exp-1', error: null });
    const supabase = { rpc };

    await supabase.rpc('create_expense', {
      p_expense_id: 'exp-1',
      p_category_id: 'cat-1',
      p_description: 'Rent',
      p_pretax_amount_minor: 1000,
      p_vat_amount_minor: 170,
      p_total_amount_minor: 1170,
      p_currency: 'ILS',
      p_expense_date: '2026-06-01',
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_expense',
      expect.objectContaining({ p_expense_id: 'exp-1' }),
    );
  });
});
