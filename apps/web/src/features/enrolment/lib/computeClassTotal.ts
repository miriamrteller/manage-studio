import { resolveOfferingPrice, type OfferingPriceBreakdown } from '@shared/pricing';
import type { Tenant } from '@shared/schemas';

interface ClassPricing {
  price_minor: number;
  currency?: string | null;
}

export interface ClassTotalBreakdown {
  pretaxMinor: number;
  vatMinor: number;
  totalMinor: number;
  vatRate: number;
  currency: string;
  chargeMinor: number;
  listMinor: number;
  mode: OfferingPriceBreakdown['mode'];
}

/** Resolve gross charge amount for display and checkout (no local VAT split). */
export function computeClassTotal(
  classRow: ClassPricing,
  tenant: Pick<Tenant, 'currency'>,
): ClassTotalBreakdown {
  const breakdown = resolveOfferingPrice(classRow);
  return {
    pretaxMinor: breakdown.pretaxMinor,
    vatMinor: breakdown.vatMinor,
    totalMinor: breakdown.totalMinor,
    chargeMinor: breakdown.chargeMinor,
    listMinor: breakdown.listMinor,
    vatRate: breakdown.vatRate,
    mode: breakdown.mode,
    currency: (classRow.currency ?? tenant.currency ?? 'ILS').toUpperCase(),
  };
}
