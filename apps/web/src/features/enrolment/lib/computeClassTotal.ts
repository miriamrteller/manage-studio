import type { Tenant } from '@shared/schemas';

interface ClassPricing {
  price_minor: number;
  currency?: string | null;
  vat_rate?: number | null;
}

export interface ClassTotalBreakdown {
  pretaxMinor: number;
  vatMinor: number;
  totalMinor: number;
  vatRate: number;
  currency: string;
}

/** Match create-checkout edge function pricing logic. */
export function computeClassTotal(
  classRow: ClassPricing,
  tenant: Pick<Tenant, 'vat_rate' | 'currency'>,
): ClassTotalBreakdown {
  const pretaxMinor = classRow.price_minor;
  const vatRate = Number(classRow.vat_rate ?? tenant.vat_rate ?? 0.17);
  const vatMinor = Math.round(pretaxMinor * vatRate);
  return {
    pretaxMinor,
    vatMinor,
    totalMinor: pretaxMinor + vatMinor,
    vatRate,
    currency: (classRow.currency ?? tenant.currency ?? 'ILS').toUpperCase(),
  };
}
