import { describe, expect, it } from 'vitest';
import { resolveOfferingPrice } from '@shared/pricing';

describe('resolveOfferingPrice', () => {
  it('returns gross amount without local VAT split', () => {
    const result = resolveOfferingPrice({ price_minor: 24000 });
    expect(result).toEqual({
      listMinor: 24000,
      chargeMinor: 24000,
      pretaxMinor: 0,
      vatMinor: 0,
      totalMinor: 24000,
      vatRate: 0,
      mode: 'gross',
    });
  });
});
