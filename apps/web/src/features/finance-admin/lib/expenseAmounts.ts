export interface ExpenseAmountInput {
  amountMinor: number;
}

export interface ExpenseAmountBreakdown {
  pretaxAmountMinor: number;
  vatAmountMinor: number;
  totalAmountMinor: number;
}

/** Store expense as a single gross total — no local VAT split. */
export function computeExpenseAmounts(input: ExpenseAmountInput): ExpenseAmountBreakdown {
  return {
    pretaxAmountMinor: input.amountMinor,
    vatAmountMinor: 0,
    totalAmountMinor: input.amountMinor,
  };
}
