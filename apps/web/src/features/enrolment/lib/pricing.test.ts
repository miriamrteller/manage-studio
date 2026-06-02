import { describe, expect, it } from 'vitest';
import { calculateVat, resolveOfferingPrice } from '@shared/pricing';

describe('calculateVat', () => {
  it('calculates 17% VAT correctly from inclusive gross', () => {
    const { pretax, vat, total } = calculateVat(1000, 0.17);
    expect(pretax).toBe(855);
    expect(vat).toBe(145);
    expect(total).toBe(1000);
  });
});

describe('resolveOfferingPrice', () => {
  const tenant = { vat_rate: 0.17, prices_include_vat: true };

  it('inclusive: charge equals list price_minor', () => {
    const r = resolveOfferingPrice({ price_minor: 24000 }, tenant);
    expect(r.chargeMinor).toBe(24000);
    expect(r.pretaxMinor + r.vatMinor).toBe(24000);
    expect(r.mode).toBe('inclusive');
  });

  it('exclusive: charge adds VAT to list', () => {
    const r = resolveOfferingPrice(
      { price_minor: 24000 },
      { vat_rate: 0.17, prices_include_vat: false },
    );
    expect(r.chargeMinor).toBe(28080);
    expect(r.mode).toBe('exclusive');
  });
});
