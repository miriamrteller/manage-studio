import type { FinanceSummary } from '@shared/schemas';

export function computeNetProfitMinor(summary: Pick<FinanceSummary, 'net_revenue_minor' | 'net_expenses_minor'>): number {
  return summary.net_revenue_minor - summary.net_expenses_minor;
}

export function sumPaymentTotalsMinor(
  rows: Array<{ total_amount_minor: number }>,
): number {
  return rows.reduce((sum, row) => sum + row.total_amount_minor, 0);
}
