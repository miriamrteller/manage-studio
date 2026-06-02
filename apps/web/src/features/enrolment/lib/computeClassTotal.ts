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

/** Resolve charge and VAT breakdown; matches create-checkout (SPEC §2.5.1). */
export function computeClassTotal(
  classRow: ClassPricing,
  tenant: Pick<Tenant, 'vat_rate' | 'currency' | 'prices_include_vat'>,
): ClassTotalBreakdown {
  const breakdown = resolveOfferingPrice(classRow, {
    vat_rate: tenant.vat_rate,
    prices_include_vat: tenant.prices_include_vat ?? true,
  });
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
