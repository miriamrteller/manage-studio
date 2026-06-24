import { calculateVat, addVatToPretax } from '@shared/pricing';

export interface ExpenseAmountInput {
  amountMinor: number;
  vatRate: number;
  pricesIncludeVat: boolean;
  isVatEligible: boolean;
}

export interface ExpenseAmountBreakdown {
  pretaxAmountMinor: number;
  vatAmountMinor: number;
  totalAmountMinor: number;
}

/** Deterministic expense VAT — mirrors create_expense RPC and @shared/pricing. */
export function computeExpenseAmounts(input: ExpenseAmountInput): ExpenseAmountBreakdown {
  const vatRate = Number(input.vatRate ?? 0.17);

  if (!input.isVatEligible) {
    if (input.pricesIncludeVat) {
      return {
        pretaxAmountMinor: input.amountMinor,
        vatAmountMinor: 0,
        totalAmountMinor: input.amountMinor,
      };
    }
    return {
      pretaxAmountMinor: input.amountMinor,
      vatAmountMinor: 0,
      totalAmountMinor: input.amountMinor,
    };
  }

  if (input.pricesIncludeVat) {
    const { pretax, vat, total } = calculateVat(input.amountMinor, vatRate);
    return {
      pretaxAmountMinor: pretax,
      vatAmountMinor: vat,
      totalAmountMinor: total,
    };
  }

  const { pretax, vat, total } = addVatToPretax(input.amountMinor, vatRate);
  return {
    pretaxAmountMinor: pretax,
    vatAmountMinor: vat,
    totalAmountMinor: total,
  };
}
